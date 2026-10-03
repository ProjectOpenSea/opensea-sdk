// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { EventType, LogLevel, OpenSeaStreamClient } from "../../src/stream"
import { collectionTopic } from "../../src/stream/helpers"
import { PhoenixChannelsTransport } from "../../src/stream/transport/phoenix"
import { encode, encodeReply, getTopics, mockEvent } from "./helpers"
import { MockWS } from "./mock-ws"

/**
 * Coverage for the reconnect, heartbeat, and reply-correlation behavior that
 * the `phoenix` dependency used to own. None of this was exercised by the
 * original stream-js suite, and it is the code most likely to fail on a
 * long-lived consumer.
 */

let server: MockWS

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  server = new MockWS("ws://localhost:1234")
})

afterEach(() => {
  server.close()
  vi.useRealTimers()
})

const makeTransport = (
  overrides: Partial<
    ConstructorParameters<typeof PhoenixChannelsTransport>[0]
  > = {},
) =>
  new PhoenixChannelsTransport({
    endpoint: "ws://localhost:1234",
    params: { token: "test" },
    ...overrides,
  })

describe("connection", () => {
  test("connect is idempotent", async () => {
    const transport = makeTransport()
    transport.connect()
    transport.connect()
    transport.connect()
    await flushMicrotasks()

    expect(server.connectionCount).toBe(1)
    expect(transport.isConnected()).toBe(true)
    transport.disconnect()
  })

  test("strips trailing slashes from the endpoint", () => {
    const transport = makeTransport({ endpoint: "ws://localhost:1234//" })
    expect(transport.endpointUrl()).toBe(
      "ws://localhost:1234/websocket?token=test&vsn=2.0.0",
    )
  })

  test("reports wss for secure endpoints", () => {
    const transport = makeTransport({
      endpoint: "wss://stream-api.opensea.io/socket",
    })
    expect(transport.protocol()).toBe("wss")
  })

  test("throws a directive error when no WebSocket is available", () => {
    const original = globalThis.WebSocket
    // @ts-expect-error deliberately removing the global for this assertion
    globalThis.WebSocket = undefined
    try {
      expect(() => makeTransport()).toThrow(/No WebSocket implementation/)
    } finally {
      globalThis.WebSocket = original
    }
  })
})

describe("heartbeat", () => {
  test("sends a heartbeat on the interval", async () => {
    vi.useFakeTimers()
    const transport = makeTransport({ heartbeatIntervalMs: 1000 })
    transport.connect()
    await flushMicrotasks()

    expect(server.framesOfType("heartbeat")).toHaveLength(0)

    vi.advanceTimersByTime(1000)
    const beats = server.framesOfType("heartbeat")
    expect(beats).toHaveLength(1)
    expect(beats[0][2]).toBe("phoenix")

    transport.disconnect()
  })

  test("an answered heartbeat keeps the connection alive", async () => {
    vi.useFakeTimers()
    const transport = makeTransport({ heartbeatIntervalMs: 1000 })
    transport.connect()
    await flushMicrotasks()

    vi.advanceTimersByTime(1000)
    const [, ref] = server.framesOfType("heartbeat")[0]
    server.send(
      JSON.stringify([
        null,
        ref,
        "phoenix",
        "phx_reply",
        { status: "ok", response: {} },
      ]),
    )

    // A second interval elapses; because the first beat was answered the
    // connection is not torn down.
    vi.advanceTimersByTime(1000)
    expect(server.connectionCount).toBe(1)
    expect(server.framesOfType("heartbeat")).toHaveLength(2)

    transport.disconnect()
  })

  test("an unanswered heartbeat tears down and reconnects", async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const transport = makeTransport({
      heartbeatIntervalMs: 1000,
      reconnectAfterMs: () => 10,
    })
    transport.onError(onError)
    transport.connect()
    await flushMicrotasks()

    // First beat goes out and is never answered.
    vi.advanceTimersByTime(1000)
    expect(server.framesOfType("heartbeat")).toHaveLength(1)

    // Second interval detects the missing reply.
    vi.advanceTimersByTime(1000)
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect(onError.mock.calls[0][0].message).toMatch(/Heartbeat timeout/)

    // And the backoff schedules a fresh connection.
    vi.advanceTimersByTime(10)
    await flushMicrotasks()
    expect(server.connectionCount).toBe(2)

    transport.disconnect()
  })
})

describe("reconnect", () => {
  test("reconnects after an unexpected close, with backoff", async () => {
    vi.useFakeTimers()
    const delays: number[] = []
    const transport = makeTransport({
      reconnectAfterMs: tries => {
        delays.push(tries)
        return 50
      },
    })
    transport.connect()
    await flushMicrotasks()
    expect(server.connectionCount).toBe(1)

    server.dropConnection()
    expect(delays).toEqual([1])

    vi.advanceTimersByTime(50)
    await flushMicrotasks()
    expect(server.connectionCount).toBe(2)

    transport.disconnect()
  })

  test("backoff attempt count grows while the socket cannot open", async () => {
    vi.useFakeTimers()
    const delays: number[] = []
    const transport = makeTransport({
      reconnectAfterMs: tries => {
        delays.push(tries)
        return 50
      },
    })
    transport.connect()
    await flushMicrotasks()

    // The next three connection attempts are refused, as during an outage.
    server.refuseConnections(3)
    server.dropConnection()
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(50)
      await flushMicrotasks()
    }

    // Each failure increments the attempt counter handed to the backoff
    // function, so the delay grows rather than hammering at a fixed interval.
    expect(delays).toEqual([1, 2, 3, 4])
    transport.disconnect()
  })

  test("resets the backoff once the server answers", async () => {
    vi.useFakeTimers()
    const delays: number[] = []
    const transport = makeTransport({
      reconnectAfterMs: tries => {
        delays.push(tries)
        return 50
      },
    })
    transport.connect()
    await flushMicrotasks()

    // Three separate blips, each recovering into a connection that proves
    // itself with a reply. The counter must start over every time, otherwise a
    // long-lived consumer's reconnect delay creeps up over days until it is
    // always the ceiling.
    for (let i = 0; i < 3; i++) {
      server.dropConnection()
      vi.advanceTimersByTime(50)
      await flushMicrotasks()
      transport.subscribe(`collection:c${i}`)
      const joins = server.framesOfType("phx_join")
      const [, ref, topic] = joins[joins.length - 1]
      server.send(encodeReply({ ref: ref as string, topic }))
    }

    expect(delays).toEqual([1, 1, 1])
    transport.disconnect()
  })

  test("keeps backing off when the socket opens but never answers", async () => {
    vi.useFakeTimers()
    const delays: number[] = []
    const transport = makeTransport({
      heartbeatIntervalMs: 1000,
      reconnectAfterMs: tries => {
        delays.push(tries)
        return 50
      },
    })
    transport.connect()
    await flushMicrotasks()

    // A server that accepts the handshake and then goes silent. Each cycle is
    // heartbeat sent, no reply, teardown at the next interval, reconnect.
    // Resetting the backoff on open alone would pin this at attempt 1 forever
    // and hammer an already-unhealthy server.
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1000) // heartbeat goes out
      vi.advanceTimersByTime(1000) // no reply, tear down
      vi.advanceTimersByTime(50) // backoff elapses, reconnect
      await flushMicrotasks()
    }

    expect(delays).toEqual([1, 2, 3])
    transport.disconnect()
  })

  test("does not reconnect after an intentional disconnect", async () => {
    vi.useFakeTimers()
    const transport = makeTransport({ reconnectAfterMs: () => 10 })
    transport.connect()
    await flushMicrotasks()

    transport.disconnect()
    vi.advanceTimersByTime(1000)
    await flushMicrotasks()

    expect(server.connectionCount).toBe(1)
  })

  test("resubscribes to every live topic after a reconnect", async () => {
    vi.useFakeTimers()
    const transport = makeTransport({ reconnectAfterMs: () => 10 })
    transport.connect()
    await flushMicrotasks()

    transport.subscribe("collection:c1")
    transport.subscribe("collection:c2")
    expect(server.framesOfType("phx_join")).toHaveLength(2)

    server.dropConnection()
    vi.advanceTimersByTime(10)
    await flushMicrotasks()

    // The new connection re-joins both topics without the caller doing
    // anything. `sent` reads from the current client, so these are new frames.
    expect(server.connectionCount).toBe(2)
    const joins = server.framesOfType("phx_join")
    expect(joins.map(frame => frame[2]).sort()).toEqual([
      "collection:c1",
      "collection:c2",
    ])

    transport.disconnect()
  })

  test("events still reach handlers after a reconnect", async () => {
    vi.useFakeTimers()
    const transport = makeTransport({ reconnectAfterMs: () => 10 })
    transport.connect()
    await flushMicrotasks()

    const handler = vi.fn()
    transport.subscribe("collection:c1").on(EventType.ITEM_SOLD, handler)

    server.dropConnection()
    vi.advanceTimersByTime(10)
    await flushMicrotasks()

    server.send(
      encode({
        topic: "collection:c1",
        event: EventType.ITEM_SOLD,
        payload: { hello: "world" },
      }),
    )
    expect(handler).toHaveBeenCalledWith({ hello: "world" })

    transport.disconnect()
  })
})

describe("subscribe acknowledgement", () => {
  test("reports success when the server replies ok", async () => {
    const transport = makeTransport()
    transport.connect()
    await flushMicrotasks()

    const onSubscribed = vi.fn()
    transport.subscribe("collection:c1", undefined, { onSubscribed })

    const [, ref, topic] = server.framesOfType("phx_join")[0]
    server.send(encodeReply({ ref: ref as string, topic }))

    expect(onSubscribed).toHaveBeenCalledTimes(1)
    transport.disconnect()
  })

  test("reports failure when the server rejects the join", async () => {
    const transport = makeTransport()
    transport.connect()
    await flushMicrotasks()

    const onSubscribeError = vi.fn()
    transport.subscribe("collection:c1", undefined, { onSubscribeError })

    const [, ref, topic] = server.framesOfType("phx_join")[0]
    server.send(encodeReply({ ref: ref as string, topic, status: "error" }))

    expect(onSubscribeError).toHaveBeenCalledWith(expect.any(Error))
    transport.disconnect()
  })

  test("times out when the server never acknowledges", async () => {
    vi.useFakeTimers()
    const transport = makeTransport({ timeout: 500 })
    transport.connect()
    await flushMicrotasks()

    const onSubscribeError = vi.fn()
    transport.subscribe("collection:c1", undefined, { onSubscribeError })

    expect(onSubscribeError).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(onSubscribeError).toHaveBeenCalledWith(expect.any(Error))
    expect(onSubscribeError.mock.calls[0][0].message).toMatch(/Timed out/)

    transport.disconnect()
  })

  test("a second subscriber to a joining topic still hears the outcome", async () => {
    const transport = makeTransport()
    transport.connect()
    await flushMicrotasks()

    const first = vi.fn()
    const second = vi.fn()
    // Both callers subscribe before the join is acknowledged. The topic is
    // shared, but each caller must still be told whether it succeeded.
    transport.subscribe("collection:c1", undefined, { onSubscribed: first })
    transport.subscribe("collection:c1", undefined, { onSubscribed: second })

    const [, ref, topic] = server.framesOfType("phx_join")[0]
    server.send(encodeReply({ ref: ref as string, topic }))

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    transport.disconnect()
  })

  test("a second subscriber to a joined topic is told immediately", async () => {
    const transport = makeTransport()
    transport.connect()
    await flushMicrotasks()

    transport.subscribe("collection:c1", undefined, {})
    const [, ref, topic] = server.framesOfType("phx_join")[0]
    server.send(encodeReply({ ref: ref as string, topic }))

    const late = vi.fn()
    transport.subscribe("collection:c1", undefined, { onSubscribed: late })

    // There is no reply left to wait for, so the callback fires right away.
    expect(late).toHaveBeenCalledTimes(1)
    expect(server.framesOfType("phx_join")).toHaveLength(1)
    transport.disconnect()
  })

  test("every subscriber is notified again after a rejoin", async () => {
    vi.useFakeTimers()
    const transport = makeTransport({ reconnectAfterMs: () => 10 })
    transport.connect()
    await flushMicrotasks()

    const first = vi.fn()
    const second = vi.fn()
    transport.subscribe("collection:c1", undefined, { onSubscribed: first })
    transport.subscribe("collection:c1", undefined, { onSubscribed: second })

    server.dropConnection()
    vi.advanceTimersByTime(10)
    await flushMicrotasks()

    const [, ref, topic] = server.framesOfType("phx_join")[0]
    server.send(encodeReply({ ref: ref as string, topic }))

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    transport.disconnect()
  })

  test("a reply for one topic does not settle another", async () => {
    const transport = makeTransport()
    transport.connect()
    await flushMicrotasks()

    const first = vi.fn()
    const second = vi.fn()
    transport.subscribe("collection:c1", undefined, { onSubscribed: first })
    transport.subscribe("collection:c2", undefined, { onSubscribed: second })

    const joins = server.framesOfType("phx_join")
    const c1 = joins.find(frame => frame[2] === "collection:c1")
    server.send(encodeReply({ ref: c1?.[1] as string, topic: "collection:c1" }))

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    transport.disconnect()
  })
})

describe("server-side filter widening", () => {
  test("widens to unfiltered when a later subscriber wants everything", async () => {
    const transport = makeTransport()
    transport.connect()
    await flushMicrotasks()

    transport.subscribe("collection:c1", { eventTypes: [EventType.ITEM_SOLD] })
    expect(server.framesOfType("phx_join")[0][4]).toEqual({
      event_types: [EventType.ITEM_SOLD],
    })

    // An individual on* call passes no eventTypes, meaning "everything". The
    // server would otherwise keep filtering to item_sold and the new handler
    // would never fire.
    transport.subscribe("collection:c1")

    expect(server.framesOfType("phx_leave")).toHaveLength(1)
    const joins = server.framesOfType("phx_join")
    expect(joins).toHaveLength(2)
    expect(joins[1][4]).toEqual({})

    transport.disconnect()
  })

  test("widens to the union when a later subscriber wants another type", async () => {
    const transport = makeTransport()
    transport.connect()
    await flushMicrotasks()

    transport.subscribe("collection:c1", { eventTypes: [EventType.ITEM_SOLD] })
    transport.subscribe("collection:c1", {
      eventTypes: [EventType.ITEM_LISTED],
    })

    const joins = server.framesOfType("phx_join")
    expect(joins).toHaveLength(2)
    expect(joins[1][4]).toEqual({
      event_types: [EventType.ITEM_SOLD, EventType.ITEM_LISTED],
    })

    transport.disconnect()
  })

  test("does not re-join when the filter already covers the request", async () => {
    const transport = makeTransport()
    transport.connect()
    await flushMicrotasks()

    transport.subscribe("collection:c1", {
      eventTypes: [EventType.ITEM_SOLD, EventType.ITEM_LISTED],
    })
    transport.subscribe("collection:c1", { eventTypes: [EventType.ITEM_SOLD] })

    expect(server.framesOfType("phx_join")).toHaveLength(1)
    expect(server.framesOfType("phx_leave")).toHaveLength(0)

    transport.disconnect()
  })

  test("an unfiltered subscription is never narrowed", async () => {
    const transport = makeTransport()
    transport.connect()
    await flushMicrotasks()

    transport.subscribe("collection:c1")
    transport.subscribe("collection:c1", { eventTypes: [EventType.ITEM_SOLD] })

    // Narrowing would starve the first subscriber, so the join stands.
    expect(server.framesOfType("phx_join")).toHaveLength(1)
    expect(server.framesOfType("phx_join")[0][4]).toEqual({})

    transport.disconnect()
  })

  test("widening while disconnected defers to the next join", async () => {
    const transport = makeTransport()

    // Both subscribes happen before the socket opens, so there is nothing to
    // re-issue: the single join that handleOpen sends must carry the union.
    transport.subscribe("collection:c1", { eventTypes: [EventType.ITEM_SOLD] })
    transport.subscribe("collection:c1", {
      eventTypes: [EventType.ITEM_LISTED],
    })
    expect(server.sent).toHaveLength(0)

    await flushMicrotasks()

    expect(server.framesOfType("phx_leave")).toHaveLength(0)
    const joins = server.framesOfType("phx_join")
    expect(joins).toHaveLength(1)
    expect(joins[0][4]).toEqual({
      event_types: [EventType.ITEM_SOLD, EventType.ITEM_LISTED],
    })

    transport.disconnect()
  })

  test("a widened filter survives a reconnect", async () => {
    vi.useFakeTimers()
    const transport = makeTransport({ reconnectAfterMs: () => 10 })
    transport.connect()
    await flushMicrotasks()

    transport.subscribe("collection:c1", { eventTypes: [EventType.ITEM_SOLD] })
    transport.subscribe("collection:c1", {
      eventTypes: [EventType.ITEM_LISTED],
    })

    server.dropConnection()
    vi.advanceTimersByTime(10)
    await flushMicrotasks()

    const joins = server.framesOfType("phx_join")
    expect(joins).toHaveLength(1)
    expect(joins[0][4]).toEqual({
      event_types: [EventType.ITEM_SOLD, EventType.ITEM_LISTED],
    })

    transport.disconnect()
  })

  test("a late reply for the join a widen replaced does not fire onSubscribed again", async () => {
    const transport = makeTransport()
    transport.connect()
    await flushMicrotasks()

    const onSubscribedSold = vi.fn()
    const onSubscribedListed = vi.fn()
    transport.subscribe(
      "collection:c1",
      { eventTypes: [EventType.ITEM_SOLD] },
      { onSubscribed: onSubscribedSold },
    )
    transport.subscribe(
      "collection:c1",
      { eventTypes: [EventType.ITEM_LISTED] },
      { onSubscribed: onSubscribedListed },
    )
    const [replacedJoin, currentJoin] = server.framesOfType("phx_join")

    server.send(
      encodeReply({ ref: currentJoin[1] as string, topic: "collection:c1" }),
    )
    server.send(
      encodeReply({ ref: replacedJoin[1] as string, topic: "collection:c1" }),
    )

    expect(onSubscribedSold).toHaveBeenCalledTimes(1)
    expect(onSubscribedListed).toHaveBeenCalledTimes(1)
    transport.disconnect()
  })

  test("a late subscriber that widens is told once, after the widened join", async () => {
    const transport = makeTransport()
    const onError = vi.fn()
    transport.onError(onError)
    transport.connect()
    await flushMicrotasks()

    transport.subscribe("collection:c1", { eventTypes: [EventType.ITEM_SOLD] })
    const [, firstRef, topic] = server.framesOfType("phx_join")[0]
    server.send(encodeReply({ ref: firstRef as string, topic }))

    const failure = new Error("late subscriber blew up")
    const late = vi.fn(() => {
      throw failure
    })
    expect(() =>
      transport.subscribe(
        "collection:c1",
        { eventTypes: [EventType.ITEM_LISTED] },
        { onSubscribed: late },
      ),
    ).not.toThrow()

    const joins = server.framesOfType("phx_join")
    expect(joins).toHaveLength(2)
    expect(joins[1][4]).toEqual({
      event_types: [EventType.ITEM_SOLD, EventType.ITEM_LISTED],
    })
    expect(late).not.toHaveBeenCalled()

    server.send(encodeReply({ ref: joins[1][1] as string, topic }))

    expect(late).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(failure)
    transport.disconnect()
  })
})

describe("unsubscribe acknowledgement", () => {
  test("fires on the server's reply", async () => {
    const transport = makeTransport()
    transport.connect()
    await flushMicrotasks()

    const subscription = transport.subscribe("collection:c1")
    const onUnsubscribed = vi.fn()
    subscription.unsubscribe(onUnsubscribed)

    expect(onUnsubscribed).not.toHaveBeenCalled()
    const [, ref, topic] = server.framesOfType("phx_leave")[0]
    server.send(encodeReply({ ref: ref as string, topic }))

    expect(onUnsubscribed).toHaveBeenCalledTimes(1)
    transport.disconnect()
  })

  test("a join answered after the unsubscribe does not fire onSubscribed", async () => {
    const transport = makeTransport()
    transport.connect()
    await flushMicrotasks()

    const onSubscribed = vi.fn()
    const subscription = transport.subscribe("collection:c1", undefined, {
      onSubscribed,
    })
    subscription.unsubscribe()
    const [, joinRef, topic] = server.framesOfType("phx_join")[0]
    server.send(encodeReply({ ref: joinRef as string, topic }))

    expect(onSubscribed).not.toHaveBeenCalled()
    transport.disconnect()
  })

  test("fires on disconnect rather than hanging", async () => {
    const transport = makeTransport()
    transport.connect()
    await flushMicrotasks()

    const subscription = transport.subscribe("collection:c1")
    const onUnsubscribed = vi.fn()
    // Leave, then disconnect before the server acknowledges. disconnect closes
    // the socket without a round trip, so the reply never arrives; the callback
    // must still settle instead of waiting forever.
    subscription.unsubscribe(onUnsubscribed)
    expect(onUnsubscribed).not.toHaveBeenCalled()

    transport.disconnect()
    expect(onUnsubscribed).toHaveBeenCalledTimes(1)
  })

  test("fires when the socket drops before the reply arrives", async () => {
    vi.useFakeTimers()
    const transport = makeTransport({ reconnectAfterMs: () => 10 })
    transport.connect()
    await flushMicrotasks()

    const subscription = transport.subscribe("collection:c1")
    const onUnsubscribed = vi.fn()
    subscription.unsubscribe(onUnsubscribed)

    // An unexpected drop, not a disconnect. The topic stays left across the
    // reconnect, so its acknowledgement is never coming.
    server.dropConnection()
    expect(onUnsubscribed).toHaveBeenCalledTimes(1)

    transport.disconnect()
  })

  test("fires when a heartbeat timeout tears the socket down", async () => {
    vi.useFakeTimers()
    const transport = makeTransport({
      heartbeatIntervalMs: 1000,
      reconnectAfterMs: () => 10,
    })
    transport.connect()
    await flushMicrotasks()

    const subscription = transport.subscribe("collection:c1")
    const onUnsubscribed = vi.fn()
    subscription.unsubscribe(onUnsubscribed)

    // Heartbeat goes out, is never answered, and the next interval tears the
    // connection down through teardownForReconnect rather than disconnect.
    vi.advanceTimersByTime(1000)
    vi.advanceTimersByTime(1000)

    expect(onUnsubscribed).toHaveBeenCalledTimes(1)
    transport.disconnect()
  })

  test("fires exactly once when a reply and a disconnect race", async () => {
    const transport = makeTransport()
    transport.connect()
    await flushMicrotasks()

    const subscription = transport.subscribe("collection:c1")
    const onUnsubscribed = vi.fn()
    subscription.unsubscribe(onUnsubscribed)

    const [, ref, topic] = server.framesOfType("phx_leave")[0]
    server.send(encodeReply({ ref: ref as string, topic }))
    transport.disconnect()

    expect(onUnsubscribed).toHaveBeenCalledTimes(1)
  })
})

describe("consumer callbacks cannot break the state machine", () => {
  test("a throwing unsubscribe callback still lets the client reconnect", async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const transport = makeTransport({ reconnectAfterMs: () => 10 })
    transport.onError(onError)
    transport.connect()
    await flushMicrotasks()

    transport.subscribe("collection:c1").unsubscribe(() => {
      throw new Error("unsubscribe callback blew up")
    })

    // The drain runs inside handleClose, immediately before scheduleReconnect.
    // An escaping exception would leave the client permanently disconnected.
    server.dropConnection()
    expect(onError).toHaveBeenCalledWith(expect.any(Error))

    vi.advanceTimersByTime(10)
    await flushMicrotasks()
    expect(server.connectionCount).toBe(2)

    transport.disconnect()
  })

  test("a throwing unsubscribe callback does not starve its siblings", async () => {
    const transport = makeTransport()
    transport.onError(vi.fn())
    transport.connect()
    await flushMicrotasks()

    const second = vi.fn()
    transport.subscribe("collection:c1").unsubscribe(() => {
      throw new Error("first callback blew up")
    })
    transport.subscribe("collection:c2").unsubscribe(second)

    transport.disconnect()
    expect(second).toHaveBeenCalledTimes(1)
  })

  test("a throwing onSubscribed does not starve later subscribers", async () => {
    const transport = makeTransport()
    const onError = vi.fn()
    transport.onError(onError)
    transport.connect()
    await flushMicrotasks()

    const second = vi.fn()
    transport.subscribe("collection:c1", undefined, {
      onSubscribed: () => {
        throw new Error("first subscriber blew up")
      },
    })
    transport.subscribe("collection:c1", undefined, { onSubscribed: second })

    const [, ref, topic] = server.framesOfType("phx_join")[0]
    expect(() =>
      server.send(encodeReply({ ref: ref as string, topic })),
    ).not.toThrow()

    expect(second).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.any(Error))

    transport.disconnect()
  })

  test("a throwing onSubscribed on an already-joined topic is reported, not thrown", async () => {
    const transport = makeTransport()
    const onError = vi.fn()
    transport.onError(onError)
    transport.connect()
    await flushMicrotasks()

    transport.subscribe("collection:c1")
    const [, ref, topic] = server.framesOfType("phx_join")[0]
    server.send(encodeReply({ ref: ref as string, topic }))

    const failure = new Error("late subscriber blew up")
    expect(() =>
      transport.subscribe("collection:c1", undefined, {
        onSubscribed: () => {
          throw failure
        },
      }),
    ).not.toThrow()

    expect(onError).toHaveBeenCalledWith(failure)
    transport.disconnect()
  })
})

describe("frame handling", () => {
  test("dispatches only to the matching topic", async () => {
    const transport = makeTransport()
    transport.connect()
    await flushMicrotasks()

    const c1Handler = vi.fn()
    const c2Handler = vi.fn()
    transport.subscribe("collection:c1").on(EventType.ITEM_SOLD, c1Handler)
    transport.subscribe("collection:c2").on(EventType.ITEM_SOLD, c2Handler)

    server.send(
      encode({
        topic: "collection:c1",
        event: EventType.ITEM_SOLD,
        payload: { which: "c1" },
      }),
    )

    expect(c1Handler).toHaveBeenCalledWith({ which: "c1" })
    expect(c2Handler).not.toHaveBeenCalled()
    transport.disconnect()
  })

  test("ignores frames from a channel instance we already left", async () => {
    const transport = makeTransport()
    const onError = vi.fn()
    transport.onError(onError)
    transport.connect()
    await flushMicrotasks()

    // Subscribe, leave, then subscribe again. The topic now has a new join
    // ref, while the server's in-flight frames still carry the old one.
    const first = transport.subscribe("collection:c1")
    const staleJoinRef = server.framesOfType("phx_join")[0][0] as string
    first.unsubscribe()

    const handler = vi.fn()
    transport.subscribe("collection:c1").on(EventType.ITEM_SOLD, handler)
    const joins = server.framesOfType("phx_join")
    const freshJoinRef = joins[joins.length - 1][0] as string
    expect(freshJoinRef).not.toBe(staleJoinRef)

    // A late phx_close for the old channel must not tear down the new one.
    server.send(
      encode({
        join_ref: staleJoinRef,
        topic: "collection:c1",
        event: "phx_close",
        payload: {},
      }),
    )
    expect(onError).not.toHaveBeenCalled()

    // A stale event must not reach the new handlers either.
    server.send(
      encode({
        join_ref: staleJoinRef,
        topic: "collection:c1",
        event: EventType.ITEM_SOLD,
        payload: { stale: true },
      }),
    )
    expect(handler).not.toHaveBeenCalled()

    // The current channel still delivers.
    server.send(
      encode({
        join_ref: freshJoinRef,
        topic: "collection:c1",
        event: EventType.ITEM_SOLD,
        payload: { fresh: true },
      }),
    )
    expect(handler).toHaveBeenCalledWith({ fresh: true })

    transport.disconnect()
  })

  test("a throwing handler does not kill the socket or its siblings", async () => {
    const transport = makeTransport()
    const onError = vi.fn()
    transport.onError(onError)
    transport.connect()
    await flushMicrotasks()

    const sibling = vi.fn()
    const subscription = transport.subscribe("collection:c1")
    subscription.on(EventType.ITEM_SOLD, () => {
      throw new Error("consumer callback blew up")
    })
    subscription.on(EventType.ITEM_SOLD, sibling)

    // dispatch runs inside WebSocket.onmessage, so an escaping error would be
    // an unhandled exception and would skip every later handler.
    expect(() =>
      server.send(
        encode({
          topic: "collection:c1",
          event: EventType.ITEM_SOLD,
          payload: { still: "delivered" },
        }),
      ),
    ).not.toThrow()

    expect(sibling).toHaveBeenCalledWith({ still: "delivered" })
    expect(onError).toHaveBeenCalledWith(expect.any(Error))

    // And the subscription keeps working afterwards.
    server.send(
      encode({
        topic: "collection:c1",
        event: EventType.ITEM_SOLD,
        payload: { second: "event" },
      }),
    )
    expect(sibling).toHaveBeenCalledTimes(2)

    transport.disconnect()
  })

  test("surfaces malformed frames as errors instead of throwing", async () => {
    const transport = makeTransport()
    const onError = vi.fn()
    transport.onError(onError)
    transport.connect()
    await flushMicrotasks()

    expect(() => server.send("not json at all")).not.toThrow()
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect(onError.mock.calls[0][0].message).toMatch(/malformed JSON/)

    onError.mockClear()
    expect(() => server.send(JSON.stringify({ not: "an array" }))).not.toThrow()
    expect(onError.mock.calls[0][0].message).toMatch(/unexpected frame shape/)

    transport.disconnect()
  })

  test("rejoins a channel that errored while the socket stayed up", async () => {
    vi.useFakeTimers()
    const transport = makeTransport({ reconnectAfterMs: () => 20 })
    transport.connect()
    await flushMicrotasks()

    const handler = vi.fn()
    transport.subscribe("collection:c1").on(EventType.ITEM_SOLD, handler)
    expect(server.framesOfType("phx_join")).toHaveLength(1)

    // The channel dies server-side. The socket is untouched, so no reconnect
    // will fire and nothing else would ever re-establish this topic.
    server.send(
      encode({ topic: "collection:c1", event: "phx_error", payload: {} }),
    )
    expect(server.connectionCount).toBe(1)

    vi.advanceTimersByTime(20)
    expect(server.framesOfType("phx_join")).toHaveLength(2)

    // And events flow again on the re-established topic.
    server.send(
      encode({
        topic: "collection:c1",
        event: EventType.ITEM_SOLD,
        payload: { back: "online" },
      }),
    )
    expect(handler).toHaveBeenCalledWith({ back: "online" })

    transport.disconnect()
  })

  test("does not rejoin a topic the caller already left", async () => {
    vi.useFakeTimers()
    const transport = makeTransport({ reconnectAfterMs: () => 20 })
    transport.connect()
    await flushMicrotasks()

    const onError = vi.fn()
    transport.onError(onError)
    const subscription = transport.subscribe("collection:c1")
    subscription.unsubscribe()

    // A phx_close arriving after our own leave is the server acknowledging it,
    // not a failure, and must not resurrect the subscription.
    server.send(
      encode({ topic: "collection:c1", event: "phx_close", payload: {} }),
    )
    vi.advanceTimersByTime(100)

    expect(onError).not.toHaveBeenCalled()
    expect(server.framesOfType("phx_join")).toHaveLength(1)

    transport.disconnect()
  })

  test("backs off when a channel keeps erroring", async () => {
    vi.useFakeTimers()
    const tries: number[] = []
    const transport = makeTransport({
      reconnectAfterMs: attempt => {
        tries.push(attempt)
        return 20
      },
    })
    transport.connect()
    await flushMicrotasks()
    transport.subscribe("collection:c1")

    for (let i = 0; i < 3; i++) {
      server.send(
        encode({ topic: "collection:c1", event: "phx_error", payload: {} }),
      )
      vi.advanceTimersByTime(20)
    }

    // A channel crash-looping must not turn into an unthrottled join loop.
    expect(tries).toEqual([1, 2, 3])
    transport.disconnect()
  })

  test("reports a channel error frame", async () => {
    const transport = makeTransport()
    const onError = vi.fn()
    transport.onError(onError)
    transport.connect()
    await flushMicrotasks()

    transport.subscribe("collection:c1")
    server.send(
      encode({ topic: "collection:c1", event: "phx_error", payload: {} }),
    )

    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect(onError.mock.calls[0][0].message).toMatch(/phx_error/)
    transport.disconnect()
  })
})

describe("client integration", () => {
  test("resubscribes and keeps delivering across a reconnect", async () => {
    vi.useFakeTimers()
    const client = new OpenSeaStreamClient({
      apiKey: "test",
      apiUrl: "ws://localhost:1234",
      logLevel: LogLevel.ERROR,
      connectOptions: { reconnectAfterMs: () => 10 },
    })

    const onSold = vi.fn()
    client.onItemSold("c1", onSold)
    await flushMicrotasks()

    server.dropConnection()
    vi.advanceTimersByTime(10)
    await flushMicrotasks()

    expect(getTopics(client)).toEqual(["collection:c1"])

    const event = mockEvent(EventType.ITEM_SOLD, {})
    server.send(
      encode({
        topic: collectionTopic("c1"),
        event: EventType.ITEM_SOLD,
        payload: event,
      }),
    )

    expect(onSold).toHaveBeenCalledWith(event)
    client.disconnect()
  })

  test("a leave frame is sent when the last handler goes away", async () => {
    const client = new OpenSeaStreamClient({
      apiKey: "test",
      apiUrl: "ws://localhost:1234",
      logLevel: LogLevel.ERROR,
    })

    const unsubscribe = client.onItemSold("c1", vi.fn())
    await flushMicrotasks()
    expect(server.framesOfType("phx_leave")).toHaveLength(0)

    unsubscribe()
    const leaves = server.framesOfType("phx_leave")
    expect(leaves).toHaveLength(1)
    expect(leaves[0][2]).toBe("collection:c1")

    client.disconnect()
  })
})
