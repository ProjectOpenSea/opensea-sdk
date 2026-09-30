import type {
  StreamMessageHandler,
  StreamSubscription,
  StreamTransport,
  StreamWebSocket,
  StreamWebSocketConstructor,
  SubscribeCallbacks,
  SubscribeOptions,
} from "./types"

/**
 * Phoenix Channels v2 transport.
 *
 * Implements the subset of the protocol that `wss://stream-api.opensea.io/socket`
 * requires. The stream is receive-only: apart from join, leave, and heartbeat
 * control frames, the client never pushes to the server, so none of the
 * general Phoenix client's push, presence, binary serializer, or longpoll
 * machinery is included.
 *
 * Wire format is a JSON array: `[join_ref, ref, topic, event, payload]`.
 * Control events are `phx_join`, `phx_leave`, `phx_reply`, `phx_error`, and
 * `phx_close`. Heartbeats go to the `phoenix` topic and must be answered
 * before the next interval elapses or the connection is considered dead.
 */

const VSN = "2.0.0"
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000
const WS_CLOSE_NORMAL = 1000
const WS_OPEN = 1

const PHX_JOIN = "phx_join"
const PHX_LEAVE = "phx_leave"
const PHX_REPLY = "phx_reply"
const PHX_ERROR = "phx_error"
const PHX_CLOSE = "phx_close"
const HEARTBEAT_TOPIC = "phoenix"
const HEARTBEAT_EVENT = "heartbeat"

/** Backoff schedule in ms, indexed by attempt number. Tail is reused. */
const DEFAULT_RECONNECT_BACKOFF_MS = [
  10, 50, 100, 150, 200, 250, 500, 1000, 2000,
]
const MAX_RECONNECT_BACKOFF_MS = 5000

const defaultReconnectAfterMs = (tries: number): number =>
  DEFAULT_RECONNECT_BACKOFF_MS[tries - 1] ?? MAX_RECONNECT_BACKOFF_MS

/** A decoded Phoenix frame. */
type Frame = {
  joinRef: string | null
  ref: string | null
  topic: string
  event: string
  payload: unknown
}

export interface PhoenixTransportOptions {
  /** Base socket URL, e.g. `wss://stream-api.opensea.io/socket`. */
  endpoint: string
  /** Query parameters appended to the socket URL, e.g. the API key. */
  params?: Record<string, string>
  /** WebSocket implementation. Defaults to the global `WebSocket`. */
  transport?: StreamWebSocketConstructor
  /** Milliseconds to wait for a subscribe acknowledgement. Default 10000. */
  timeout?: number
  /** Milliseconds between heartbeats. Default 30000. */
  heartbeatIntervalMs?: number
  /** Backoff for reconnect attempt `tries` (1-indexed). */
  reconnectAfterMs?: (tries: number) => number
  /** Optional debug logger. */
  logger?: (message: string) => void
}

type ReplyHandler = (payload: unknown, status: string) => void

class PhoenixSubscription implements StreamSubscription {
  public readonly topic: string
  /** Handlers by event name. */
  public readonly handlers = new Map<string, Set<StreamMessageHandler>>()
  /**
   * Server-side event filter sent in the join payload. Widened in place when a
   * later subscriber to the same topic needs events outside the current filter.
   */
  public eventTypes?: string[]
  /** Ref of the in-flight or completed join, used to correlate replies. */
  public joinRef: string | null = null
  public joined = false
  /**
   * Callbacks from every caller that subscribed to this topic. A topic is
   * joined once and shared, so a second subscriber must still be told whether
   * the join succeeded, and every subscriber is notified again after a rejoin.
   */
  public readonly callbackList: SubscribeCallbacks[] = []
  /** Backoff state for rejoining after a server-side channel error. */
  public rejoinTries = 0
  public rejoinTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    topic: string,
    eventTypes: string[] | undefined,
    private readonly transport: PhoenixChannelsTransport,
  ) {
    this.topic = topic
    this.eventTypes = eventTypes
  }

  on(event: string, handler: StreamMessageHandler): () => void {
    let handlers = this.handlers.get(event)
    if (!handlers) {
      handlers = new Set()
      this.handlers.set(event, handlers)
    }
    handlers.add(handler)
    return () => this.transport.removeHandler(this.topic, event, handler)
  }

  /**
   * Remove one handler, reporting whether the topic has gone quiet. Unlike
   * the original stream-js client, removing a handler does not tear down the
   * whole topic while sibling handlers are still listening; the transport
   * unsubscribes only once the last handler is gone.
   */
  off(event: string, handler: StreamMessageHandler): boolean {
    const handlers = this.handlers.get(event)
    if (!handlers) {
      return this.handlers.size === 0
    }
    handlers.delete(handler)
    if (handlers.size === 0) {
      this.handlers.delete(event)
    }
    return this.handlers.size === 0
  }

  unsubscribe(onUnsubscribed?: () => void): void {
    this.transport.unsubscribeTopic(this.topic, onUnsubscribed)
  }

  dispatch(event: string, message: unknown): void {
    const handlers = this.handlers.get(event)
    if (!handlers) {
      return
    }
    for (const handler of handlers) {
      try {
        handler(message)
      } catch (error) {
        // A consumer callback that throws must not take down the socket. This
        // runs inside `WebSocket.onmessage`, so an escaping error becomes an
        // unhandled exception and skips every sibling handler for this event.
        this.transport.reportError(error)
      }
    }
  }
}

export class PhoenixChannelsTransport implements StreamTransport {
  private readonly endpoint: string
  private readonly params: Record<string, string>
  private readonly webSocketCtor: StreamWebSocketConstructor
  private readonly timeout: number
  private readonly heartbeatIntervalMs: number
  private readonly reconnectAfterMs: (tries: number) => number
  private readonly logger?: (message: string) => void

  private socket: StreamWebSocket | null = null
  private readonly subscriptions = new Map<string, PhoenixSubscription>()
  private readonly pendingReplies = new Map<
    string,
    { handler: ReplyHandler; timer: ReturnType<typeof setTimeout> }
  >()
  private errorHandlers: ((error: unknown) => void)[] = []
  /**
   * Unsubscribe callbacks still waiting for a `phx_leave` reply. `disconnect()`
   * closes the socket without a round trip, so these are drained there instead;
   * otherwise a caller awaiting unsubscribe confirmation waits forever.
   */
  private readonly pendingUnsubscribes = new Set<() => void>()

  private refCounter = 0
  private reconnectTries = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private pendingHeartbeatRef: string | null = null
  private disconnectedIntentionally = false
  /**
   * Whether the current socket has ever answered us. An open socket is not
   * proof of a working connection: a server that accepts the TCP/WS handshake
   * but never replies would otherwise reset the backoff on every attempt and
   * be hammered at the shortest delay forever.
   */
  private connectionProven = false

  constructor(options: PhoenixTransportOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, "")
    this.params = options.params ?? {}
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS
    this.reconnectAfterMs = options.reconnectAfterMs ?? defaultReconnectAfterMs
    this.logger = options.logger

    // The global `WebSocket` is structurally compatible but its DOM handler
    // signatures do not assign cleanly to our narrower shape, so resolve it
    // through a single explicit cast rather than widening the interface.
    const resolved =
      options.transport ??
      (globalThis as { WebSocket?: unknown }).WebSocket ??
      undefined
    if (!resolved) {
      throw new Error(
        "No WebSocket implementation found. Node 22+ and all browsers provide one globally; " +
          "on older runtimes pass `connectOptions.transport` (for example the `ws` package).",
      )
    }
    this.webSocketCtor = resolved as StreamWebSocketConstructor
  }

  // ── URL ────────────────────────────────────────────────────────────

  endpointUrl(): string {
    const query = new URLSearchParams({ ...this.params, vsn: VSN })
    return `${this.endpoint}/websocket?${query.toString()}`
  }

  protocol(): string {
    return this.endpoint.startsWith("wss:") ||
      this.endpoint.startsWith("https:")
      ? "wss"
      : "ws"
  }

  // ── Connection lifecycle ───────────────────────────────────────────

  connect(): void {
    if (this.socket) {
      return
    }
    this.disconnectedIntentionally = false
    this.connectionProven = false
    this.log(`connecting to ${this.endpoint}`)

    const socket = new this.webSocketCtor(this.endpointUrl())
    this.socket = socket

    socket.onopen = () => this.handleOpen()
    socket.onmessage = event => this.handleMessage(event.data)
    socket.onerror = error => this.emitError(error)
    socket.onclose = event => this.handleClose(event)
  }

  isConnected(): boolean {
    return this.socket?.readyState === WS_OPEN
  }

  disconnect(onDisconnect?: () => void): void {
    this.disconnectedIntentionally = true
    this.clearReconnectTimer()
    this.stopHeartbeat()
    // clearPendingReplies also settles pending unsubscribe acknowledgements.
    this.clearPendingReplies()
    for (const subscription of this.subscriptions.values()) {
      this.clearRejoinTimer(subscription)
    }
    this.subscriptions.clear()

    const socket = this.socket
    this.socket = null
    if (socket) {
      socket.onclose = null
      socket.onerror = null
      socket.onmessage = null
      socket.onopen = null
      socket.close(WS_CLOSE_NORMAL, "client disconnect")
    }
    onDisconnect?.()
  }

  onError(handler: (error: unknown) => void): void {
    this.errorHandlers.push(handler)
  }

  /** Surface an error raised by consumer code, used by subscriptions. */
  reportError(error: unknown): void {
    this.emitError(error)
  }

  /**
   * Run a consumer callback without letting it escape into our state machine.
   *
   * These fire from inside teardown and reply handling, where an escaping
   * exception would skip the work that follows: a throwing unsubscribe
   * callback would abort `handleClose` before `scheduleReconnect`, leaving the
   * client permanently disconnected, and a throwing subscribe callback would
   * starve every later subscriber to the same topic.
   */
  private safeInvoke(callback: () => void): void {
    try {
      callback()
    } catch (error) {
      this.reportError(error)
    }
  }

  private handleOpen(): void {
    this.log("socket open")
    // Deliberately not resetting `reconnectTries` here. The backoff resets in
    // `handleReply`, once the server has actually answered something.
    this.startHeartbeat()
    // A fresh socket re-joins everything below, so any per-channel rejoin
    // timer left over from the previous connection is redundant.
    for (const subscription of this.subscriptions.values()) {
      this.clearRejoinTimer(subscription)
    }
    // Establish every topic: the ones subscribed to before the socket opened,
    // and the ones that were live before a drop. Joins are never sent while
    // disconnected, so this is the single place they get written.
    for (const subscription of this.subscriptions.values()) {
      subscription.joined = false
      this.sendJoin(subscription)
    }
  }

  private handleClose(event: { code?: number; reason?: string }): void {
    this.log(`socket closed (code ${event?.code ?? "unknown"})`)
    this.connectionProven = false
    this.stopHeartbeat()
    this.clearPendingReplies()
    this.socket = null
    if (!this.disconnectedIntentionally) {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer()
    this.reconnectTries += 1
    const delay = this.reconnectAfterMs(this.reconnectTries)
    this.log(`reconnecting in ${delay}ms (attempt ${this.reconnectTries})`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  // ── Heartbeat ──────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.pendingHeartbeatRef = null
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      this.heartbeatIntervalMs,
    )
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.pendingHeartbeatRef = null
  }

  private sendHeartbeat(): void {
    if (!this.isConnected()) {
      return
    }
    // The previous heartbeat was never answered, so the connection is dead
    // even though the socket still looks open. Tear it down and reconnect.
    if (this.pendingHeartbeatRef !== null) {
      this.log("heartbeat timeout, tearing down connection")
      this.pendingHeartbeatRef = null
      this.emitError(new Error("Heartbeat timeout"))
      this.teardownForReconnect()
      return
    }
    const ref = this.nextRef()
    this.pendingHeartbeatRef = ref
    this.push(null, ref, HEARTBEAT_TOPIC, HEARTBEAT_EVENT, {})
  }

  /** Close the socket without marking the disconnect intentional. */
  private teardownForReconnect(): void {
    const socket = this.socket
    this.stopHeartbeat()
    this.socket = null
    if (socket) {
      socket.onclose = null
      socket.onerror = null
      socket.onmessage = null
      socket.onopen = null
      socket.close(WS_CLOSE_NORMAL, "heartbeat timeout")
    }
    this.clearPendingReplies()
    this.scheduleReconnect()
  }

  // ── Subscriptions ──────────────────────────────────────────────────

  subscribe(
    topic: string,
    options?: SubscribeOptions,
    callbacks?: SubscribeCallbacks,
  ): StreamSubscription {
    this.connect()

    const existing = this.subscriptions.get(topic)
    if (existing) {
      // The topic is already joined or joining. Register this caller's
      // callbacks too, otherwise a second subscriber never learns the outcome.
      if (callbacks) {
        existing.callbackList.push(callbacks)
        // A settled subscription has no reply left to fire, so report now.
        if (existing.joined) {
          callbacks.onSubscribed?.()
        }
      }
      this.widenFilterIfNeeded(existing, options?.eventTypes)
      return existing
    }

    const subscription = new PhoenixSubscription(
      topic,
      options?.eventTypes,
      this,
    )
    if (callbacks) {
      subscription.callbackList.push(callbacks)
    }
    this.subscriptions.set(topic, subscription)
    // If the socket is not open yet, `handleOpen` sends the join. Writing it
    // here as well would join the topic twice.
    if (this.isConnected()) {
      this.sendJoin(subscription)
    }
    return subscription
  }

  private sendJoin(subscription: PhoenixSubscription): void {
    // A new join overwrites this subscription's joinRef, but the previous
    // join's reply may still be in flight (a filter widen or a rejoin can
    // both fire before the server has answered the join they're replacing).
    // Cancel that pending reply first: left in `pendingReplies`, it is still
    // keyed by its own ref, so when the server eventually answers it,
    // `handleReply` finds it, invokes its (stale) success/error handler, and
    // every subscriber's onSubscribed or onSubscribeError fires a second
    // time for what is, from the caller's side, one subscription.
    if (subscription.joinRef !== null) {
      this.cancelPendingReply(subscription.joinRef)
    }
    const ref = this.nextRef()
    subscription.joinRef = ref
    const payload = subscription.eventTypes
      ? { event_types: subscription.eventTypes }
      : {}

    this.awaitReply(
      ref,
      (_response, status) => {
        if (status === "ok") {
          subscription.joined = true
          subscription.rejoinTries = 0
          this.log(`subscribed to "${subscription.topic}"`)
          for (const callbacks of subscription.callbackList) {
            this.safeInvoke(() => callbacks.onSubscribed?.())
          }
        } else {
          this.log(`failed to subscribe to "${subscription.topic}"`)
          const error = new Error(
            `Subscribe to "${subscription.topic}" failed: ${status}`,
          )
          for (const callbacks of subscription.callbackList) {
            this.safeInvoke(() => callbacks.onSubscribeError?.(error))
          }
        }
      },
      reason => {
        for (const callbacks of subscription.callbackList) {
          this.safeInvoke(() => callbacks.onSubscribeError?.(reason))
        }
      },
    )

    this.push(ref, ref, subscription.topic, PHX_JOIN, payload)
  }

  /**
   * Rejoin a topic whose channel died while the socket stayed open. Uses the
   * same backoff schedule as reconnects, so a channel that keeps crashing does
   * not turn into a join loop.
   */
  private scheduleRejoin(subscription: PhoenixSubscription): void {
    this.clearRejoinTimer(subscription)
    subscription.rejoinTries += 1
    const delay = this.reconnectAfterMs(subscription.rejoinTries)
    this.log(
      `rejoining "${subscription.topic}" in ${delay}ms (attempt ${subscription.rejoinTries})`,
    )
    subscription.rejoinTimer = setTimeout(() => {
      subscription.rejoinTimer = null
      // The caller may have unsubscribed, or the socket may have dropped, in
      // which case `handleOpen` owns the rejoin instead.
      if (!this.subscriptions.has(subscription.topic) || !this.isConnected()) {
        return
      }
      this.sendJoin(subscription)
    }, delay)
  }

  private clearRejoinTimer(subscription: PhoenixSubscription): void {
    if (subscription.rejoinTimer) {
      clearTimeout(subscription.rejoinTimer)
      subscription.rejoinTimer = null
    }
  }

  /**
   * A topic is joined once and shared, and the join payload carries the
   * server-side `event_types` filter. A later subscriber asking for an event
   * outside that filter would otherwise register a handler the server never
   * feeds, which fails silently. Widen the filter and re-join instead.
   *
   * `undefined` means no filter, so it is the widest value rather than the
   * narrowest: an individual `on*` call subscribes to everything.
   */
  private widenFilterIfNeeded(
    subscription: PhoenixSubscription,
    requested: string[] | undefined,
  ): void {
    const current = subscription.eventTypes
    // Already unfiltered, so every event already arrives.
    if (current === undefined) {
      return
    }

    let widened: string[] | undefined
    if (requested === undefined) {
      // The new subscriber wants everything, so drop the filter entirely.
      widened = undefined
    } else {
      const missing = requested.filter(type => !current.includes(type))
      if (missing.length === 0) {
        return
      }
      widened = [...current, ...missing]
    }

    subscription.eventTypes = widened
    this.log(
      `widening the filter on "${subscription.topic}" to ${widened ? widened.join(", ") : "all events"}`,
    )

    // While disconnected there is nothing to re-issue: `handleOpen` sends the
    // join, and it will use the widened filter.
    if (!this.isConnected()) {
      return
    }

    // Re-establish the channel so the server applies the new filter. Frames
    // still in flight for the old join ref are dropped by the guard in
    // `handleMessage`, so no stale events reach the widened subscription.
    if (subscription.joinRef !== null) {
      this.push(
        subscription.joinRef,
        this.nextRef(),
        subscription.topic,
        PHX_LEAVE,
        {},
      )
    }
    subscription.joined = false
    this.sendJoin(subscription)
  }

  private drainPendingUnsubscribes(): void {
    const pending = Array.from(this.pendingUnsubscribes)
    this.pendingUnsubscribes.clear()
    for (const callback of pending) {
      this.safeInvoke(callback)
    }
  }

  /** Called by a subscription, and directly by the client. */
  unsubscribeTopic(topic: string, onUnsubscribed?: () => void): void {
    const subscription = this.subscriptions.get(topic)
    if (!subscription) {
      onUnsubscribed?.()
      return
    }
    this.clearRejoinTimer(subscription)
    this.subscriptions.delete(topic)

    if (!this.isConnected()) {
      onUnsubscribed?.()
      return
    }

    // `joinRef` is assigned synchronously by `sendJoin`, and `sendJoin` runs
    // for every subscription either at subscribe time (when connected) or in
    // `handleOpen`. Reaching here with a null ref would mean that invariant
    // broke, and a leave frame with a null join_ref cannot be correlated by
    // the server, so drop it rather than send a malformed frame.
    if (subscription.joinRef === null) {
      onUnsubscribed?.()
      return
    }

    // Fire at most once, whichever of reply, timeout, or disconnect wins.
    let settled = false
    const settle = () => {
      if (settled) {
        return
      }
      settled = true
      this.pendingUnsubscribes.delete(settle)
      onUnsubscribed?.()
    }
    this.pendingUnsubscribes.add(settle)

    const ref = this.nextRef()
    this.awaitReply(
      ref,
      () => {
        this.log(`unsubscribed from "${topic}"`)
        settle()
      },
      // A leave that is never acknowledged still means we have stopped
      // dispatching locally, so treat a timeout as done rather than an error.
      settle,
    )
    this.push(subscription.joinRef, ref, topic, PHX_LEAVE, {})
  }

  /** Remove a single handler, unsubscribing only when the topic goes quiet. */
  removeHandler(
    topic: string,
    event: string,
    handler: StreamMessageHandler,
    onUnsubscribed?: () => void,
  ): void {
    const subscription = this.subscriptions.get(topic)
    if (!subscription) {
      return
    }
    const isEmpty = subscription.off(event, handler)
    if (isEmpty) {
      this.unsubscribeTopic(topic, onUnsubscribed)
    }
  }

  // ── Messaging ──────────────────────────────────────────────────────

  private handleMessage(data: unknown): void {
    const frame = this.decode(data)
    if (!frame) {
      return
    }

    if (frame.event === PHX_REPLY) {
      this.handleReply(frame)
      return
    }

    const subscription = this.subscriptions.get(frame.topic)

    // Drop frames from a previous instance of this channel. Leaving a topic
    // and re-subscribing to it produces a new join ref, and the server's
    // in-flight frames for the old one are still arriving. Without this, a
    // late `phx_close` for the channel we already left tears down the new
    // subscription, and stale events leak to the new handlers.
    if (
      subscription &&
      frame.joinRef !== null &&
      subscription.joinRef !== null &&
      frame.joinRef !== subscription.joinRef
    ) {
      this.log(`dropping stale frame for "${frame.topic}"`)
      return
    }

    if (frame.event === PHX_ERROR || frame.event === PHX_CLOSE) {
      // No subscription means we already left this topic, and the server is
      // acknowledging that. Not an error worth reporting.
      if (!subscription) {
        return
      }
      // The channel died server-side while the socket stayed up, so a
      // reconnect will never fire. Without an explicit rejoin the topic is
      // silently dead for the rest of the process's life.
      subscription.joined = false
      this.emitError(
        new Error(`Channel "${frame.topic}" received ${frame.event}`),
      )
      this.scheduleRejoin(subscription)
      return
    }

    subscription?.dispatch(frame.event, frame.payload)
  }

  private handleReply(frame: Frame): void {
    if (frame.ref === null) {
      return
    }
    // The server answered, so this connection works. Anything before this is
    // an unproven connection and must not clear the reconnect backoff.
    if (!this.connectionProven) {
      this.connectionProven = true
      this.reconnectTries = 0
    }
    if (frame.ref === this.pendingHeartbeatRef) {
      this.pendingHeartbeatRef = null
      return
    }
    const pending = this.pendingReplies.get(frame.ref)
    if (!pending) {
      return
    }
    this.pendingReplies.delete(frame.ref)
    clearTimeout(pending.timer)

    const payload = frame.payload as
      | { status?: string; response?: unknown }
      | undefined
    pending.handler(payload?.response, payload?.status ?? "error")
  }

  private awaitReply(
    ref: string,
    handler: ReplyHandler,
    onTimeout: (reason: unknown) => void,
  ): void {
    const timer = setTimeout(() => {
      this.pendingReplies.delete(ref)
      onTimeout(
        new Error(`Timed out after ${this.timeout}ms waiting for reply`),
      )
    }, this.timeout)
    this.pendingReplies.set(ref, { handler, timer })
  }

  /**
   * Discard a single pending reply without invoking its handler or the
   * timeout it would otherwise fire. Used when a new join is about to make
   * an older, still-unanswered one moot.
   */
  private cancelPendingReply(ref: string): void {
    const pending = this.pendingReplies.get(ref)
    if (!pending) {
      return
    }
    clearTimeout(pending.timer)
    this.pendingReplies.delete(ref)
  }

  /**
   * Drop every in-flight reply without invoking its handler. The socket going
   * away is not a rejection: a join whose ack never arrives is re-sent by
   * `handleOpen` after the reconnect, so reporting it as a subscribe failure
   * here would be both wrong and noisy.
   *
   * Unsubscribes are the exception and are settled rather than dropped. A left
   * topic stays left across a reconnect, so its acknowledgement is never coming
   * and a caller waiting on one would hang. Draining here covers every teardown
   * path: `disconnect`, `handleClose`, and `teardownForReconnect`.
   */
  private clearPendingReplies(): void {
    for (const [, pending] of this.pendingReplies) {
      clearTimeout(pending.timer)
    }
    this.pendingReplies.clear()
    this.drainPendingUnsubscribes()
  }

  private push(
    joinRef: string | null,
    ref: string | null,
    topic: string,
    event: string,
    payload: unknown,
  ): void {
    // Every caller either checks `isConnected()` first or runs from
    // `handleOpen`, so there is nothing to buffer: a frame written while the
    // socket is down would be a bug, not a queued write.
    if (!this.isConnected()) {
      return
    }
    this.socket?.send(JSON.stringify([joinRef, ref, topic, event, payload]))
  }

  private decode(data: unknown): Frame | null {
    if (typeof data !== "string") {
      this.emitError(new Error("Received non-text frame from stream"))
      return null
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      this.emitError(new Error("Received malformed JSON frame from stream"))
      return null
    }
    if (!Array.isArray(parsed) || parsed.length < 5) {
      this.emitError(new Error("Received unexpected frame shape from stream"))
      return null
    }
    const [joinRef, ref, topic, event, payload] = parsed as [
      string | null,
      string | null,
      string,
      string,
      unknown,
    ]
    return { joinRef, ref, topic, event, payload }
  }

  private nextRef(): string {
    this.refCounter += 1
    return String(this.refCounter)
  }

  private emitError(error: unknown): void {
    for (const handler of this.errorHandlers) {
      handler(error)
    }
  }

  private log(message: string): void {
    this.logger?.(message)
  }
}
