import { OpenSeaAPI } from "../../src/api/api"

/**
 * The contract between the sub-clients and `OpenSeaAPI`, shared by the tests that enforce it.
 *
 * Each sub-client is now a public property, so `api.collections.getCollectionTraitFloors(slug)` is
 * the supported call and a new sub-client method is reachable the moment it exists. That removes
 * the gap behind [opensea-sdk#2007](https://github.com/ProjectOpenSea/opensea-sdk/issues/2007) by
 * construction rather than by testing for it.
 *
 * The 88 flat methods that used to be the only way in are deprecated and stay until the next
 * major, so what needs guarding has changed: not "does every method have a forwarder", which would
 * now demand a deprecated forwarder for every new method, but "has the deprecated surface lost
 * anything", which would be a break.
 */

/**
 * Sub-clients exposed as a public property, mapped to the field that exposes them.
 *
 * `search` is deliberately absent. `SearchAPI` holds one method also called `search`, so the
 * property and the existing `api.search()` method want the same name, and adding the property
 * would have to displace a working call. Whether the next major renames it to `api.search.query()`
 * is open; until then `api.search(args)` is the call and `searchAPI` stays private.
 */
export const NAMESPACED: Record<string, string> = {
  AccountsAPI: "accounts",
  AssetsAPI: "assets",
  ChainsAPI: "chains",
  CollectionsAPI: "collections",
  DropsAPI: "drops",
  EventsAPI: "events",
  ListingsAPI: "listings",
  NFTsAPI: "nfts",
  OffersAPI: "offers",
  OrdersAPI: "orders",
  SignalsAPI: "signals",
  TokensAPI: "tokens",
  ToolsAPI: "tools",
  TransactionsAPI: "transactions",
  WalletAuthAPI: "walletAuth",
}

/** Sub-clients with no namespace property, and why. */
export const NOT_NAMESPACED: Record<string, string> = {
  SearchAPI:
    "its only method is `search`, which collides with the `api.search()` method",
}

/**
 * Sub-clients that never had flat forwarders, so the signature check has nothing to compare.
 *
 * `WalletAuthAPI` has always been reached as `api.walletAuth.<method>()`. It is the shape the other
 * twelve just moved to, not an exception to it.
 */
export const NO_FLAT_SURFACE: Record<string, string> = {
  SignalsAPI: "added after the flat surface was frozen, so namespace-only",
  ToolsAPI: "added after the flat surface was frozen, so namespace-only",
  WalletAuthAPI: "always namespace-only, never had flat forwarders",
}

/**
 * Sub-client methods whose flat forwarder is public under a different name, with that name.
 *
 * Keyed `<SubClient>.<method>`. Each needed the sub-client's noun on the flat surface, where
 * nothing else supplied it. Under a namespace the sub-client's own name reads correctly, so the
 * deprecation notes point at `api.drops.buildMintTransaction()` rather than at these.
 */
export const FORWARDED_AS = {
  "DropsAPI.buildMintTransaction": "buildDropMintTransaction",
  "DropsAPI.buildCrossChainMintTransactions":
    "buildCrossChainDropMintTransactions",
  "DropsAPI.getDeployReceipt": "getDeployContractReceipt",
  "NFTsAPI.validateMetadata": "validateNFTMetadata",
} as const

export type ForwardedAs = typeof FORWARDED_AS

/**
 * Every deprecated flat method on `OpenSeaAPI`, frozen at the commit that deprecated them.
 *
 * This list only ever shrinks, in the major that removes them. A name disappearing before then is
 * a silent break for anyone still on the flat surface, and nothing else would catch it: the
 * namespaces would still work and every other test would still pass. Do not add to it. A new
 * method belongs on its sub-client and is reached through the namespace.
 */
export const DEPRECATED_FLAT_SURFACE: readonly string[] = [
  "buildCrossChainDropMintTransactions",
  "buildDropMintTransaction",
  "buildOffer",
  "createCancelOrderActions",
  "createListingActions",
  "createListingFulfillmentActions",
  "createOfferActions",
  "createOfferFulfillmentActions",
  "deployDropContract",
  "executeSwap",
  "generateFulfillmentData",
  "getAccount",
  "getAccountTokenActivity",
  "getAccountTokens",
  "getAgentProfileRelationships",
  "getAllListings",
  "getAllOffers",
  "getBestListing",
  "getBestListings",
  "getBestOffer",
  "getChains",
  "getCollection",
  "getCollectionFloorPrices",
  "getCollectionHolders",
  "getCollectionOfferAggregates",
  "getCollectionOffers",
  "getCollectionStats",
  "getCollectionTraitFloors",
  "getCollections",
  "getCollectionsBatch",
  "getContract",
  "getCrossChainFulfillmentData",
  "getDeployContractReceipt",
  "getDrop",
  "getDrops",
  "getEvents",
  "getEventsByAccount",
  "getEventsByCollection",
  "getEventsByNFT",
  "getNFT",
  "getNFTAnalytics",
  "getNFTCollection",
  "getNFTMetadata",
  "getNFTOwners",
  "getNFTsBatch",
  "getNFTsByAccount",
  "getNFTsByCollection",
  "getNFTsByContract",
  "getOffersByNFT",
  "getOrderByHash",
  "getPaymentToken",
  "getPortfolioHistory",
  "getPortfolioStats",
  "getProfileCollections",
  "getProfileFavorites",
  "getProfileListings",
  "getProfileOffers",
  "getProfileOffersReceived",
  "getSwapQuote",
  "getToken",
  "getTokenActivity",
  "getTokenActivityStats",
  "getTokenGroup",
  "getTokenGroups",
  "getTokenHolders",
  "getTokenLiquidityPools",
  "getTokenOhlcv",
  "getTokenPriceHistory",
  "getTokensBatch",
  "getTopCollections",
  "getTopTokens",
  "getTraitOffers",
  "getTraits",
  "getTransactionReceipt",
  "getTrendingCollections",
  "getTrendingTokens",
  "getWalletClosedPositions",
  "getWalletPnl",
  "getWalletTokenTransfers",
  "offchainCancelOrder",
  "postCollectionOffer",
  "postListing",
  "postOffer",
  "refreshNFTMetadata",
  "resolveAccount",
  "sweepCollection",
  "transferAssets",
  "validateNFTMetadata",
]

export const isMethodOn = (prototype: object, name: string) =>
  typeof (prototype as Record<string, unknown>)[name] === "function"

export const methodNames = (prototype: object) =>
  Object.getOwnPropertyNames(prototype).filter(
    name => name !== "constructor" && isMethodOn(prototype, name),
  )

/**
 * Every sub-client the `OpenSeaAPI` constructor installs, by class name, mapped to its prototype.
 *
 * Read off a live instance rather than a list, so a sub-client added and forgotten is still
 * covered. TypeScript's `private` is erased at runtime, so the constructor's assignments are
 * ordinary own properties here whether public or not.
 */
export const subClientPrototypes = (): Map<string, object> => {
  const api = new OpenSeaAPI({ apiKey: "key" })
  const found = new Map<string, object>()

  for (const value of Object.values(api)) {
    const name = value?.constructor?.name
    if (
      value &&
      typeof value === "object" &&
      typeof name === "string" &&
      name.endsWith("API")
    ) {
      found.set(name, Object.getPrototypeOf(value))
    }
  }

  return found
}

/** The field each sub-client instance is assigned to, by class name. */
export const subClientFields = (): Map<string, string> => {
  const api = new OpenSeaAPI({ apiKey: "key" })
  const found = new Map<string, string>()

  for (const [field, value] of Object.entries(api)) {
    const name = value?.constructor?.name
    if (
      value &&
      typeof value === "object" &&
      typeof name === "string" &&
      name.endsWith("API")
    ) {
      found.set(name, field)
    }
  }

  return found
}
