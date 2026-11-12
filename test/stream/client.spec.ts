// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  type ClientConfig,
  EventType,
  LogLevel,
  type OnClientEvent,
  OpenSeaStreamClient,
} from "../../src/stream"
import { collectionTopic } from "../../src/stream/helpers"
import { encode, getTopics, getTransport, mockEvent } from "./helpers"
import { MockWS } from "./mock-ws"

let server: MockWS
let streamClient: OpenSeaStreamClient

const clientOpts = {
  apiKey: "test",
  apiUrl: "ws://localhost:1234",
  logLevel: LogLevel.WARN,
}

beforeEach(() => {
  server = new MockWS("ws://localhost:1234")
})

afterEach(() => {
  streamClient?.disconnect()
  server.close()
})

describe("constructor", () => {
  test("builds the socket url", () => {
    streamClient = new OpenSeaStreamClient(clientOpts)

    const transport = getTransport(streamClient)
    expect(transport.protocol()).toBe("ws")
    expect(transport.endpointUrl()).toBe(
      "ws://localhost:1234/websocket?token=test&vsn=2.0.0",
    )
    expect(transport.isConnected()).toBe(false)
  })

  test("does not read the removed `token` option", () => {
    // Cast stands in for an unmigrated JavaScript call site.
    const legacyConfig = {
      token: "legacy",
      apiUrl: "ws://localhost:1234",
    } as unknown as ClientConfig

    expect(() => new OpenSeaStreamClient(legacyConfig)).toThrow(
      /API key is required/,
    )
  })

  test("throws when no api key is supplied", () => {
    expect(
      () =>
        new OpenSeaStreamClient({
          apiUrl: "ws://localhost:1234",
        }),
    ).toThrow(/API key is required/)
  })

  test("ignores connectOptions that @opensea/stream-js accepted", () => {
    // developerDocs/stream-migration.md promises that a call site copied from
    // the old package still runs: the removed options are a TypeScript error
    // but are ignored at runtime rather than crashing.
    const legacyOptions = {
      transport: globalThis.WebSocket,
      sessionStorage: { getItem: () => null, setItem: () => {} },
      longPollFallbackMs: 5000,
      binaryType: "arraybuffer",
      vsn: "2.0.0",
    }

    streamClient = new OpenSeaStreamClient({
      apiKey: "legacy",
      apiUrl: "ws://localhost:1234",
      logLevel: LogLevel.WARN,
      // Cast stands in for the unmigrated JavaScript call site this protects.
      connectOptions:
        legacyOptions as unknown as ClientConfig["connectOptions"],
    })

    // The dropped options must not leak into the socket URL either.
    expect(getTransport(streamClient).endpointUrl()).toBe(
      "ws://localhost:1234/websocket?token=legacy&vsn=2.0.0",
    )
  })
})

describe("unsubscribe", () => {
  test("channel", () => {
    streamClient = new OpenSeaStreamClient(clientOpts)

    const unsubscribec1 = streamClient.onItemListed("c1", vi.fn())
    const unsubscribec2 = streamClient.onItemListed("c2", vi.fn())

    expect(getTopics(streamClient)).toEqual(["collection:c1", "collection:c2"])

    unsubscribec1()
    expect(getTopics(streamClient)).toEqual(["collection:c2"])

    unsubscribec2()
    expect(getTopics(streamClient)).toEqual([])
  })

  test("socket", () => {
    streamClient = new OpenSeaStreamClient(clientOpts)

    streamClient.onItemListed("c1", vi.fn())
    streamClient.onItemListed("c2", vi.fn())

    streamClient.disconnect()
    expect(getTopics(streamClient)).toEqual([])
  })

  test("keeps sibling subscriptions on the same collection alive", async () => {
    streamClient = new OpenSeaStreamClient(clientOpts)

    const onListed = vi.fn()
    const onSold = vi.fn()
    const unsubscribeListed = streamClient.onItemListed("c1", onListed)
    streamClient.onItemSold("c1", onSold)

    // Dropping the listing handler must not tear down the shared topic, which
    // is what the original stream-js client did.
    unsubscribeListed()
    expect(getTopics(streamClient)).toEqual(["collection:c1"])

    await Promise.resolve()
    const soldEvent = mockEvent(EventType.ITEM_SOLD, {})
    server.send(
      encode({
        topic: collectionTopic("c1"),
        event: EventType.ITEM_SOLD,
        payload: soldEvent,
      }),
    )

    expect(onSold).toHaveBeenCalledWith(soldEvent)
    expect(onListed).not.toHaveBeenCalled()
  })
})

describe("event streams", () => {
  for (const eventType of Object.values(EventType)) {
    test(`${eventType}`, async () => {
      const collectionSlug = "c1"
      streamClient = new OpenSeaStreamClient(clientOpts)

      const onItemListed = vi.fn()
      const unsubscribe = streamClient.onEvents(
        collectionSlug,
        [eventType],
        event => onItemListed(event),
      )

      const payload = mockEvent(eventType, {})
      const frame = encode({
        topic: collectionTopic(collectionSlug),
        event: eventType,
        payload,
      })

      server.send(frame)
      expect(onItemListed).toBeCalledWith(payload)

      server.send(frame)
      expect(onItemListed).toBeCalledTimes(2)

      unsubscribe()

      server.send(frame)
      expect(onItemListed).toBeCalledTimes(2)
    })
  }
})

describe("version", () => {
  test("passes custom version to callback", () => {
    const collectionSlug = "c1"
    streamClient = new OpenSeaStreamClient(clientOpts)

    const onEvent = vi.fn()
    streamClient.onEvents(collectionSlug, [EventType.ITEM_LISTED], event =>
      onEvent(event),
    )

    const payload = mockEvent(
      EventType.ITEM_LISTED,
      {},
      { version: 1713300042000 },
    )

    server.send(
      encode({
        topic: collectionTopic(collectionSlug),
        event: EventType.ITEM_LISTED,
        payload,
      }),
    )

    expect(onEvent).toHaveBeenCalledWith(payload)
    expect(onEvent.mock.calls[0][0].version).toBe(1713300042000)
  })

  test("includes default version in all events", () => {
    const collectionSlug = "c1"
    streamClient = new OpenSeaStreamClient(clientOpts)

    const onEvent = vi.fn()
    streamClient.onEvents(collectionSlug, [EventType.ITEM_LISTED], event =>
      onEvent(event),
    )

    const payload = mockEvent(EventType.ITEM_LISTED, {})

    server.send(
      encode({
        topic: collectionTopic(collectionSlug),
        event: EventType.ITEM_LISTED,
        payload,
      }),
    )

    expect(onEvent).toHaveBeenCalledWith(payload)
    expect(onEvent.mock.calls[0][0].version).toBe(1713300000000)
  })
})

describe("middleware", () => {
  test("single", () => {
    const collectionSlug = "c1"

    const onClientEvent = vi
      .fn()
      .mockImplementation(() => true) as unknown as OnClientEvent

    streamClient = new OpenSeaStreamClient({
      ...clientOpts,
      onEvent: onClientEvent,
    })

    const onEvent = vi.fn()
    const listingEvent = mockEvent(EventType.ITEM_LISTED, {})
    const saleEvent = mockEvent(EventType.ITEM_SOLD, {})

    streamClient.onEvents(
      collectionSlug,
      [EventType.ITEM_LISTED, EventType.ITEM_SOLD],
      event => onEvent(event),
    )

    server.send(
      encode({
        topic: collectionTopic(collectionSlug),
        event: EventType.ITEM_LISTED,
        payload: listingEvent,
      }),
    )
    server.send(
      encode({
        topic: collectionTopic(collectionSlug),
        event: EventType.ITEM_SOLD,
        payload: saleEvent,
      }),
    )

    expect(onClientEvent).nthCalledWith(
      1,
      collectionSlug,
      EventType.ITEM_LISTED,
      listingEvent,
    )
    expect(onClientEvent).nthCalledWith(
      2,
      collectionSlug,
      EventType.ITEM_SOLD,
      saleEvent,
    )
    expect(onEvent).nthCalledWith(1, listingEvent)
    expect(onEvent).nthCalledWith(2, saleEvent)
  })

  test("filter out events", () => {
    const collectionSlug = "c1"

    const onClientEvent = vi
      .fn()
      .mockImplementation(
        (
          _collection: string,
          _eventType: EventType,
          event: { payload: { chain: { name: string } } },
        ) => event.payload.chain.name === "ethereum",
      ) as unknown as OnClientEvent

    streamClient = new OpenSeaStreamClient({
      ...clientOpts,
      onEvent: onClientEvent,
    })

    const onEvent = vi.fn()
    const ethereumListing = mockEvent(EventType.ITEM_LISTED, {
      chain: { name: "ethereum" },
    })
    const polygonListing = mockEvent(EventType.ITEM_LISTED, {
      chain: { name: "polygon" },
    })

    streamClient.onEvents(
      collectionSlug,
      [EventType.ITEM_LISTED, EventType.ITEM_SOLD],
      event => onEvent(event),
    )

    server.send(
      encode({
        topic: collectionTopic(collectionSlug),
        event: EventType.ITEM_LISTED,
        payload: ethereumListing,
      }),
    )
    server.send(
      encode({
        topic: collectionTopic(collectionSlug),
        event: EventType.ITEM_SOLD,
        payload: polygonListing,
      }),
    )

    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith(ethereumListing)
  })
})

describe("server-side event type filtering", () => {
  test("onEvents passes event_types in the join payload", async () => {
    streamClient = new OpenSeaStreamClient(clientOpts)

    streamClient.onEvents(
      "c1",
      [EventType.ITEM_LISTED, EventType.ITEM_SOLD],
      vi.fn(),
    )

    // Let the socket open so the buffered join frame flushes.
    await Promise.resolve()
    await Promise.resolve()

    const joins = server.framesOfType("phx_join")
    expect(joins).toHaveLength(1)
    expect(joins[0][2]).toBe("collection:c1")
    expect(joins[0][4]).toEqual({
      event_types: [EventType.ITEM_LISTED, EventType.ITEM_SOLD],
    })
  })

  test("an on* method after onEvents still receives its events", async () => {
    streamClient = new OpenSeaStreamClient(clientOpts)

    const onSold = vi.fn()
    const onListed = vi.fn()
    // onEvents pins a server-side filter to item_sold. Without widening, the
    // server never sends item_listed and onListed is a dead handler.
    streamClient.onEvents("c1", [EventType.ITEM_SOLD], onSold)
    streamClient.onItemListed("c1", onListed)

    await Promise.resolve()
    await Promise.resolve()

    const joins = server.framesOfType("phx_join")
    expect(joins[joins.length - 1][4]).toEqual({})

    const listedEvent = mockEvent(EventType.ITEM_LISTED, {})
    server.send(
      encode({
        join_ref: joins[joins.length - 1][0],
        topic: collectionTopic("c1"),
        event: EventType.ITEM_LISTED,
        payload: listedEvent,
      }),
    )

    expect(onListed).toHaveBeenCalledWith(listedEvent)
    expect(onSold).not.toHaveBeenCalled()
  })

  test("individual on* methods do not pass event_types", async () => {
    streamClient = new OpenSeaStreamClient(clientOpts)

    streamClient.onItemListed("c1", vi.fn())

    await Promise.resolve()
    await Promise.resolve()

    const joins = server.framesOfType("phx_join")
    expect(joins).toHaveLength(1)
    expect(joins[0][2]).toBe("collection:c1")
    expect(joins[0][4]).toEqual({})
  })
})
