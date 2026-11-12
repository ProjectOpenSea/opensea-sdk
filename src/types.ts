import type {
  AccountResponse,
  Fee as ApiFee,
  PricingCurrencies as ApiPricingCurrencies,
  Rarity as ApiRarity,
  SocialMediaAccount as ApiSocialMediaAccount,
  ChainIdentifier,
  CollectionDetailedResponse,
  CollectionStatsResponse,
  PaymentToken,
} from "@opensea/api-types"
import type { Listing, Offer } from "./api/types"
import type { OrderV2 } from "./orders/types"
import type { Camelize } from "./utils/case"
import type { FetchImpl } from "./utils/fetchTransport"

export type { FetchImpl } from "./utils/fetchTransport"

/**
 * Numeric type for amounts (replaces ethers BigNumberish).
 * Prefer `string` for decimal amounts (e.g. "1.5") to avoid floating point
 * errors: `number` math like `0.1 + 0.2` gives `0.30000000000000004`.
 */
export type Amount = string | number | bigint

/**
 * Events emitted by the SDK which can be used by frontend applications
 * to update state or show useful messages to users.
 * @category Events
 */
export enum EventType {
  /**
   * Emitted when the transaction is sent to the network and the application
   * is waiting for the transaction to be mined.
   */
  TransactionCreated = "TransactionCreated",
  /**
   * Emitted when the transaction is mined and confirmed.
   */
  TransactionConfirmed = "TransactionConfirmed",
  /**
   * Emitted when the transaction has failed to be submitted.
   */
  TransactionDenied = "TransactionDenied",
  /**
   * Emitted when the transaction has failed to be mined.
   */
  TransactionFailed = "TransactionFailed",
  /**
   * Emitted when the {@link OpenSeaSDK.wrapEth} method is called.
   */
  WrapEth = "WrapEth",
  /**
   * Emitted when the {@link OpenSeaSDK.unwrapWeth} method is called.
   */
  UnwrapWeth = "UnwrapWeth",
  /**
   * Emitted when fulfilling a public or private order.
   */
  MatchOrders = "MatchOrders",
  /**
   * Emitted when the {@link OpenSeaSDK.cancelOrder} method is called.
   */
  CancelOrder = "CancelOrder",
  /**
   * Emitted when the {@link OpenSeaSDK.approveOrder} method is called.
   */
  ApproveOrder = "ApproveOrder",
  /**
   * Emitted when the {@link OpenSeaSDK.transfer} method is called.
   */
  Transfer = "Transfer",
  /**
   * Emitted when the {@link OpenSeaSDK.batchApproveAssets} method is called.
   */
  ApproveAllAssets = "ApproveAllAssets",
}

/**
 * Data that gets sent with each {@link EventType}
 * @category Events
 */
export interface EventData {
  /**
   * Wallet address of the user who initiated the event.
   */
  accountAddress?: string
  /**
   * Amount of ETH sent when wrapping or unwrapping.
   */
  amount?: Amount
  /**
   * The transaction hash of the event.
   */
  transactionHash?: string
  /**
   * The {@link EventType} of the event.
   */
  event?: EventType
  /**
   * Error which occurred when transaction was denied or failed.
   */
  error?: unknown
  /**
   * The {@link OrderV2} object.
   */
  orderV2?: OrderV2
  /**
   * The order as returned by the API ({@link Offer} or {@link Listing}).
   */
  order?: Offer | Listing
  /**
   * Array of assets for bulk transfer and batch approval operations.
   */
  assets?: Array<{
    asset: AssetWithTokenStandard
    toAddress?: string
    amount?: Amount
  }>
}

/**
 * OpenSea API configuration object
 * @param chain `Chain` to use. Defaults to Ethereum Mainnet (`Chain.Mainnet`)
 * @param apiKey API key to use
 * @param apiBaseUrl Optional base URL to use for the API
 * @param authToken Scoped JWT token for wallet-authenticated endpoints
 */
export interface OpenSeaAPIConfig {
  chain?: Chain
  apiKey?: string
  apiBaseUrl?: string
  /** Scoped JWT token for wallet-authenticated endpoints. */
  authToken?: string
  /**
   * Transport used for every request, defaulting to the global `fetch`.
   *
   * The seam for a cache, a shared rate limiter, retries or request-level instrumentation.
   * Without it the only way to wrap requests is to subclass {@link OpenSeaAPI} and override a
   * public method, which ties the wrapper to that method's signature and cannot carry extra
   * per-request context.
   *
   * It receives the fully built URL and init, including the API key and auth headers, so treat
   * anything it logs or caches as sensitive. It is called for the instance's own requests; the
   * static `OpenSeaAPI.requestInstantApiKey` has no instance to read it from and takes its own
   * transport as an argument.
   *
   * A cache built on this must key on the credentials as well as the URL, and must not cache
   * anything but GET. Two callers with different API keys or auth tokens can see different
   * responses for the same URL, and a POST response is not a cacheable representation of one.
   *
   * @example
   * ```ts
   * // One cache per credential: the simplest way to avoid serving one caller's authenticated
   * // response to another is to never share the cache between them.
   * const cache = new Map<string, Response>()
   *
   * const api = new OpenSeaAPI({
   *   apiKey,
   *   fetch: async (url, init) => {
   *     if ((init?.method ?? "GET").toUpperCase() !== "GET") {
   *       return globalThis.fetch(url, init)
   *     }
   *     const cached = cache.get(String(url))
   *     if (cached) return cached.clone()
   *     const response = await globalThis.fetch(url, init)
   *     if (response.ok) cache.set(String(url), response.clone())
   *     return response
   *   },
   * })
   * ```
   */
  fetch?: FetchImpl
}

/**
 * Each of the possible chains that OpenSea supports.
 * When adding a chain, also update:
 * - `scripts/chain-data.json` + run `pnpm sync-chains` (generates `getChainId` mapping)
 * - `getListingPaymentToken`
 * - `getOfferPaymentToken`
 * - `getNativeWrapTokenAddress` (if getOfferPaymentToken isn't the wrapped native asset)
 */
export enum Chain {
  Mainnet = "ethereum",
  Polygon = "polygon",
  Base = "base",
  Blast = "blast",
  Arbitrum = "arbitrum",
  Avalanche = "avalanche",
  Optimism = "optimism",
  Solana = "solana",
  Zora = "zora",
  Sei = "sei",
  B3 = "b3",
  BeraChain = "bera_chain",
  ApeChain = "ape_chain",
  Flow = "flow",
  Ronin = "ronin",
  Abstract = "abstract",
  Shape = "shape",
  Unichain = "unichain",
  Gunzilla = "gunzilla",
  HyperEVM = "hyperevm",
  Somnia = "somnia",
  Monad = "monad",
  MegaETH = "megaeth",
  Soneium = "soneium",
  Hyperliquid = "hyperliquid",
  AnimeChain = "animechain",
  Ink = "ink",
  Robinhood = "robinhood",
  StableChain = "stablechain",
  Arc = "arc",
}

// Compile-time check: every ChainIdentifier from the API spec must be assignable to Chain.
// If the API adds a new chain, this errors: add it to the Chain enum above.
// The SDK may have chains not yet in the API spec (e.g. testnets, upcoming chains).
type _AssertAPIChainsCovered = ChainIdentifier extends `${Chain}` ? true : never

const _assertAPIChainsCovered: _AssertAPIChainsCovered = true

/**
 * Order side: listing or offer
 */
export enum OrderSide {
  LISTING = "listing",
  OFFER = "offer",
}

/**
 * Token standards
 */
export enum TokenStandard {
  ERC20 = "ERC20",
  ERC721 = "ERC721",
  ERC1155 = "ERC1155",
}

/**
 * The collection's approval status within OpenSea.
 * Can be one of:
 * - not_requested: brand new collections
 * - requested: collections that requested safelisting on our site
 * - approved: collections that are approved on our site and can be found in search results
 * - verified: verified collections
 */
export enum SafelistStatus {
  NOT_REQUESTED = "not_requested",
  REQUESTED = "requested",
  APPROVED = "approved",
  VERIFIED = "verified",
  DISABLED_TOP_TRENDING = "disabled_top_trending",
}

/**
 * Collection fees
 * @category API Models
 */
export type Fee = Camelize<ApiFee>

/**
 * Generic Blockchain Asset.
 * @category API Models
 */
export interface Asset {
  /** The asset's token ID, or null if ERC-20 */
  tokenId: string | null
  /** The asset's contract address */
  tokenAddress: string
  /** The token standard (e.g. "ERC721") for this asset */
  tokenStandard?: TokenStandard
  /** Optional for ENS names */
  name?: string
  /** Optional for fungible items */
  decimals?: number
}

/**
 * Generic Blockchain Asset, with tokenId required.
 * @category API Models
 */
export interface AssetWithTokenId extends Asset {
  /** The asset's token ID */
  tokenId: string
}

/**
 * Generic Blockchain Asset, with tokenStandard required.
 * @category API Models
 */
export interface AssetWithTokenStandard extends Asset {
  /** The token standard (e.g. "ERC721") for this asset */
  tokenStandard: TokenStandard
}

/**
 * OpenSea collection stats, from api-types `CollectionStatsResponse`.
 * @category API Models
 */
export type OpenSeaCollectionStats = Camelize<CollectionStatsResponse>

/**
 * Rarity strategy for a collection. Camelized from api-types `Rarity`.
 * @category API Models
 */
export type RarityStrategy = Camelize<ApiRarity>

/**
 * OpenSea collection metadata. Camelized from api-types `CollectionDetailedResponse`.
 * @category API Models
 */
export type OpenSeaCollection = Camelize<CollectionDetailedResponse>

/**
 * Full annotated Fungible Token spec with OpenSea metadata.
 * Sourced from api-types `PaymentToken`.
 * @category API Models
 */
export type OpenSeaPaymentToken = Camelize<PaymentToken>

/**
 * Pricing currencies for a collection, defining default currencies for listings and offers.
 * Sourced from api-types `PricingCurrencies`.
 * @category API Models
 */
export type PricingCurrencies = Camelize<ApiPricingCurrencies>

/**
 * OpenSea Account. Sourced from api-types `AccountResponse`.
 * @category API Models
 */
export type OpenSeaAccount = Camelize<AccountResponse>

/**
 * Social media account. Sourced from api-types `SocialMediaAccount`.
 * @category API Models
 */
export type SocialMediaAccount = Camelize<ApiSocialMediaAccount>

/**
 * Error thrown for any non-OK API response. `statusCode` is always set, so a caller can separate
 * a retryable failure from a permanent one without parsing the message. That matters for clients
 * that scrub remote error text before surfacing it, which have no other way to recover the status.
 * @category API Models
 */
export interface OpenSeaApiError extends Error {
  /** The HTTP status code of the error response */
  statusCode?: number
  /** The number of seconds to wait before retrying the request, on rate limit responses */
  retryAfter?: number
  /** The response body from the API */
  responseBody?: unknown
}

/**
 * @deprecated Use {@link OpenSeaApiError}. Retained as an alias: the shape is identical and
 * `retryAfter` was always optional, so existing rate-limit handling is unaffected.
 * @category API Models
 */
export type OpenSeaRateLimitError = OpenSeaApiError

/**
 * Options for controlling HTTP request behavior.
 * @category API Models
 */
export interface RequestOptions {
  /**
   * Request timeout in milliseconds.
   * If the request takes longer than this, it will be aborted.
   */
  timeout?: number
  /**
   * An AbortSignal to cancel the request.
   * Useful for implementing custom cancellation logic or timeouts.
   * @example
   * const controller = new AbortController();
   * setTimeout(() => controller.abort(), 5000);
   * await api.post('/path', body, headers, { signal: controller.signal });
   */
  signal?: AbortSignal
  /**
   * Whether to recursively rewrite the response's keys from snake_case to
   * camelCase. Defaults to `true`.
   *
   * Set to `false` only for endpoints whose response keys are data rather than
   * field names. `getTraits` returns objects keyed by collection-authored trait
   * names and trait values, so the default rewrite reports a `dark_brown` trait
   * as `darkBrown` and merges two traits that differ only in casing.
   *
   * Write it as the literal `false` at the call site. `get`, `post` and
   * `request` overload on that literal and return the raw `T` instead of
   * `Camelize<T>`, so a snake_case `T` stays snake_case in the type as well as
   * at runtime. A `boolean` whose value the compiler cannot see (a variable, or
   * a property widened by a `const` declaration without `as const`) selects the
   * camelized signature. That is accurate when the value turns out to be
   * `true`, and wrong when it is `false`, because the runtime skips the rewrite
   * and the declared type still claims camelCase properties the response does
   * not have. See {@link RawResponseOptions}.
   */
  camelizeResponse?: boolean
}

/**
 * The options shape that selects the un-camelized overload of `get`, `post`
 * and `request`.
 *
 * `camelizeResponse` is the literal `false` rather than `boolean`, which is
 * what lets the overload fire: TypeScript keeps the literal when the property
 * is written inline at the call site or the object is declared `as const`, and
 * widens it to `boolean` otherwise.
 *
 * @example
 * ```ts
 * type UploadPolicy = { upload_url: string; success_action_status: string }
 *
 * // Selects the raw overload. `policy.success_action_status` is typed and
 * // present; `policy.successActionStatus` is a compile error.
 * const policy = await api.get<UploadPolicy>(path, undefined, {
 *   camelizeResponse: false,
 * })
 * ```
 *
 * @category API Models
 */
export type RawResponseOptions<O extends RequestOptions = RequestOptions> =
  O & {
    camelizeResponse: false
  }
