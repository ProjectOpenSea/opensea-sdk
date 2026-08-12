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

/**
 * Numeric type for amounts (replaces ethers BigNumberish).
 * Prefer `string` for decimal amounts (e.g. "1.5") to avoid floating point
 * precision issues — `number` values like `0.1 + 0.2` produce `0.30000000000000004`.
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
}

/**
 * Each of the possible chains that OpenSea supports.
 * ⚠️NOTE: When adding to this list, also update:
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
}

// Compile-time check: every ChainIdentifier from the API spec must be assignable to Chain.
// If the API adds a new chain, this will error — add it to the Chain enum above.
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
 * OpenSea Collection Stats — sourced from api-types `CollectionStatsResponse`.
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
 * Enhanced Error type for rate limit errors that includes retry-after information
 * @category API Models
 */
export interface OpenSeaRateLimitError extends Error {
  /** The HTTP status code of the error response */
  statusCode?: number
  /** The number of seconds to wait before retrying the request */
  retryAfter?: number
  /** The response body from the API */
  responseBody?: unknown
}

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
   * Set to `false` for endpoints whose response keys are data rather than
   * field names. `getTraits` returns objects keyed by collection-authored
   * trait names and trait values, so the default rewrite reports a
   * `dark_brown` trait as `darkBrown` and merges two traits that differ only
   * in casing. The caller is then responsible for passing a `T` that already
   * matches the wire shape.
   */
  camelizeResponse?: boolean
}
