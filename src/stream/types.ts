import type { StreamWebSocketConstructor } from "./transport/types"

export type OnClientEvent = <Payload>(
  collection: string,
  eventType: EventType,
  event: BaseStreamMessage<Payload>,
) => boolean

/**
 * Connection tuning for the stream socket.
 *
 * Replaces the `Partial<SocketConnectOption>` type that `@opensea/stream-js`
 * borrowed from `@types/phoenix`. The options that only ever fed phoenix's
 * longpoll fallback and binary serializer (`sessionStorage`,
 * `longPollFallbackMs`, `binaryType`, `vsn`, `encode`, `decode`) are gone,
 * because neither path is used against the OpenSea stream.
 */
export type StreamConnectOptions = {
  /**
   * WebSocket implementation. Defaults to the global `WebSocket`, which every
   * browser and Node 22+ provides. Only set this on older runtimes, passing
   * something like the `ws` package.
   */
  transport?: StreamWebSocketConstructor
  /** Extra query parameters to append to the socket URL. */
  params?: Record<string, string>
  /** Milliseconds to wait for a subscription acknowledgement. Default 10000. */
  timeout?: number
  /** Milliseconds between heartbeats. Default 30000. */
  heartbeatIntervalMs?: number
  /** Backoff before reconnect attempt `tries` (1-indexed). */
  reconnectAfterMs?: (tries: number) => number
}

/**
 * OpenSea Stream API configuration object.
 *
 * @param apiKey OpenSea API key, named to match `OpenSeaAPIConfig.apiKey`
 *   used elsewhere in the SDK.
 * @param network `Network` to use. Defaults to `Network.MAINNET`.
 * @param apiUrl Optional base URL override for the socket.
 * @param connectOptions connection tuning, see `StreamConnectOptions`.
 * @param onError a callback invoked whenever a transport error occurs.
 * @param logLevel `LogLevel` controlling how much the client logs.
 * @param onEvent a callback invoked whenever an event is emitted, useful for
 *   metrics or logging. Returning false filters the event so the subscription
 *   callback is not invoked.
 */
export type ClientConfig = {
  network?: Network
  apiUrl?: string
  /** OpenSea API key. */
  apiKey?: string
  connectOptions?: StreamConnectOptions
  onError?: (error: unknown) => void
  logLevel?: LogLevel
  onEvent?: OnClientEvent
}

export enum Network {
  MAINNET = "mainnet",
}

export enum EventType {
  ITEM_METADATA_UPDATED = "item_metadata_updated",
  ITEM_LISTED = "item_listed",
  ITEM_SOLD = "item_sold",
  ITEM_TRANSFERRED = "item_transferred",
  ITEM_RECEIVED_BID = "item_received_bid",
  ITEM_CANCELLED = "item_cancelled",
  COLLECTION_OFFER = "collection_offer",
  TRAIT_OFFER = "trait_offer",
  ORDER_INVALIDATE = "order_invalidate",
  ORDER_REVALIDATE = "order_revalidate",
}

interface BaseItemMetadataType {
  name: string | null
  image_url: string | null
  animation_url: string | null
  metadata_url: string | null
}

export type BaseItemType<Metadata = BaseItemMetadataType> = {
  nft_id: string
  permalink: string
  metadata: Metadata
  chain: {
    name: string
  }
}

export type Payload = {
  item: BaseItemType
  collection: {
    slug: string
  }
  chain: string
}

export type BaseStreamMessage<Payload> = {
  event_type: string
  version: number
  sent_at: string
  payload: Payload
}

export type Trait = {
  trait_type: string
  value: string | null
  display_type: string | null
  max_value: number | null
  trait_count: number | null
  order: number | null
}

interface ExtendedItemMetadataType extends BaseItemMetadataType {
  description: string | null
  background_color: string | null
  traits: Trait[]
}

export type ItemMetadataUpdatePayload = {
  collection: { slug: string }
  item: BaseItemType<ExtendedItemMetadataType>
}

export type ItemMetadataUpdate = BaseStreamMessage<ItemMetadataUpdatePayload>

export type Account = {
  address: string
}

export type PaymentToken = {
  address: string
  decimals: number
  eth_price: string
  name: string
  symbol: string
  usd_price: string
}

export type AssetContractCriteria = {
  address: string
}

export type CollectionIdentifier = {
  slug: string
}

// Shared fields for order events with maker, taker, payment, and timestamps.
interface BaseOrderEventPayload extends Payload {
  quantity: number
  maker: Account
  taker: Account
  order_hash: string
  payment_token: PaymentToken
  event_timestamp: string
}

// Shared price and expiry fields for priced order events.
interface BasePricedOrderEventPayload extends BaseOrderEventPayload {
  base_price: string
  expiration_date: string
}

export interface ItemListedEventPayload extends BasePricedOrderEventPayload {
  listing_type: string
  listing_date: string
  is_private: boolean
}

export type ItemListedEvent = BaseStreamMessage<ItemListedEventPayload>

export type Transaction = {
  hash: string
  timestamp: string
}

export interface ItemSoldEventPayload extends BaseOrderEventPayload {
  listing_type: string
  closing_date: string
  transaction: Transaction
  sale_price: string
  is_private: boolean
}

export type ItemSoldEvent = BaseStreamMessage<ItemSoldEventPayload>

export interface ItemTransferredEventPayload extends Payload {
  from_account: Account
  quantity: number
  to_account: Account
  transaction: Transaction
  event_timestamp: string
}

export type ItemTransferredEvent =
  BaseStreamMessage<ItemTransferredEventPayload>

export interface ItemReceivedBidEventPayload
  extends BasePricedOrderEventPayload {
  created_date: string
}

export type ItemReceivedBidEvent =
  BaseStreamMessage<ItemReceivedBidEventPayload>

export interface ItemCancelledEventPayload extends BasePricedOrderEventPayload {
  listing_type: string
  listing_date: string
  transaction: Transaction
  is_private: boolean
}

export type ItemCancelledEvent = BaseStreamMessage<ItemCancelledEventPayload>

export interface CollectionOfferEventPayload
  extends BasePricedOrderEventPayload {
  created_date: string
  collection_criteria: CollectionIdentifier
  asset_contract_criteria: AssetContractCriteria
}

export type CollectionOfferEvent =
  BaseStreamMessage<CollectionOfferEventPayload>

export type TraitCriteria = {
  trait_type: string
  trait_name: string
}

export interface TraitOfferEventPayload extends CollectionOfferEventPayload {
  trait_criteria?: TraitCriteria
  trait_criteria_list?: TraitCriteria[]
}

export type TraitOfferEvent = BaseStreamMessage<TraitOfferEventPayload>

export interface OrderValidationEventPayload {
  event_timestamp: string
  order_hash: string
  protocol_address: string
  chain: {
    name: string
  }
  collection: {
    slug: string
  }
  item: BaseItemType
}

export type OrderValidationEvent =
  BaseStreamMessage<OrderValidationEventPayload>

export type Callback<Event> = (event: Event) => unknown

export enum LogLevel {
  DEBUG = 20,
  INFO = 30,
  WARN = 40,
  ERROR = 50,
}
