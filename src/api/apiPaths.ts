import type { OrderProtocol } from "../orders/types"
import type { Chain } from "../types"

/** Base path prefix for all OpenSea API v2 endpoints. */
export const API_V2_PREFIX = "/api/v2"

/**
 * Encodes a single path segment.
 *
 * Every builder below interpolates caller-supplied values into a URL path. Without encoding, a
 * value containing `/` re-targets the request at a different endpoint once the URL is normalized,
 * and a consumer that caches by path collides with the endpoint it lands on. Encoding is a no-op
 * for every legitimate value: collection slugs, hex addresses, base58 addresses, token ids and
 * transaction hashes all survive `encodeURIComponent` unchanged.
 *
 * `.` and `..` are rejected rather than encoded, because encoding cannot neutralize them. The
 * WHATWG URL parser decodes percent-escapes before it removes dot segments, so `%2E%2E` collapses
 * exactly as `..` does, and there is no spelling of a bare dot segment that survives as a literal.
 * No collection slug, address, token id or transaction hash is `.` or `..`, so a caller reaching
 * this is passing through unvalidated input and should hear about it rather than silently request
 * a different endpoint.
 */
export const segment = (value: string | number) => {
  const raw = String(value)
  if (raw === "." || raw === "..") {
    throw new RangeError(
      `Invalid path segment: ${JSON.stringify(raw)} would traverse to a different endpoint`,
    )
  }
  return encodeURIComponent(raw)
}

export const getPostListingPath = (chain: Chain, protocol: OrderProtocol) => {
  return `${API_V2_PREFIX}/orders/${segment(chain)}/${segment(protocol)}/listings`
}

export const getPostOfferPath = (chain: Chain, protocol: OrderProtocol) => {
  return `${API_V2_PREFIX}/orders/${segment(chain)}/${segment(protocol)}/offers`
}

export const getAllOffersAPIPath = (collectionSlug: string) => {
  return `${API_V2_PREFIX}/offers/collection/${segment(collectionSlug)}/all`
}

export const getAllListingsAPIPath = (collectionSlug: string) => {
  return `${API_V2_PREFIX}/listings/collection/${segment(collectionSlug)}/all`
}

export const getBestOfferAPIPath = (
  collectionSlug: string,
  tokenId: string | number,
) => {
  return `${API_V2_PREFIX}/offers/collection/${segment(collectionSlug)}/nfts/${segment(tokenId)}/best`
}

export const getBestListingAPIPath = (
  collectionSlug: string,
  tokenId: string | number,
) => {
  return `${API_V2_PREFIX}/listings/collection/${segment(collectionSlug)}/nfts/${segment(tokenId)}/best`
}

export const getBestListingsAPIPath = (collectionSlug: string) => {
  return `${API_V2_PREFIX}/listings/collection/${segment(collectionSlug)}/best`
}

export const getCollectionPath = (slug: string) => {
  return `${API_V2_PREFIX}/collections/${segment(slug)}`
}

export const getCollectionsPath = () => {
  return `${API_V2_PREFIX}/collections`
}

export const getCollectionStatsPath = (slug: string) => {
  return `${API_V2_PREFIX}/collections/${segment(slug)}/stats`
}

export const getPaymentTokenPath = (chain: Chain, address: string) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/payment_token/${segment(address)}`
}

export const getAccountPath = (address: string) => {
  return `${API_V2_PREFIX}/accounts/${segment(address)}`
}

export const getAgentProfileRelationshipsPath = (addressOrUsername: string) => {
  return `${API_V2_PREFIX}/accounts/${segment(addressOrUsername)}/agent-relationships`
}

export const getBuildOfferPath = () => {
  return `${API_V2_PREFIX}/offers/build`
}

export const getPostCollectionOfferPath = () => {
  return `${API_V2_PREFIX}/offers`
}

export const getCollectionOffersPath = (slug: string) => {
  return `${API_V2_PREFIX}/offers/collection/${segment(slug)}`
}

export const getListNFTsByCollectionPath = (slug: string) => {
  return `${API_V2_PREFIX}/collection/${segment(slug)}/nfts`
}

export const getListNFTsByGroupPath = (group: string) => {
  return `${API_V2_PREFIX}/nfts/group/${segment(group)}`
}

export const getNFTGroupFacetsPath = (group: string) => {
  return `${API_V2_PREFIX}/nfts/group/${segment(group)}/facets`
}

export const getListNFTsByContractPath = (chain: Chain, address: string) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/contract/${segment(address)}/nfts`
}

export const getListNFTsByAccountPath = (chain: Chain, address: string) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/account/${segment(address)}/nfts`
}

export const getNFTPath = (
  chain: Chain,
  address: string,
  identifier: string,
) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/contract/${segment(address)}/nfts/${segment(identifier)}`
}

export const getRefreshMetadataPath = (
  chain: Chain,
  address: string,
  identifier: string,
) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/contract/${segment(address)}/nfts/${segment(identifier)}/refresh`
}

export const getOrderByHashPath = (
  chain: Chain,
  protocolAddress: string,
  orderHash: string,
) => {
  return `${API_V2_PREFIX}/orders/chain/${segment(chain)}/protocol/${segment(protocolAddress)}/${segment(orderHash)}`
}

export const getCancelOrderPath = (
  chain: Chain,
  protocolAddress: string,
  orderHash: string,
) => {
  return `${API_V2_PREFIX}/orders/chain/${segment(chain)}/protocol/${segment(protocolAddress)}/${segment(orderHash)}/cancel`
}

export const getCreateCancelOrderActionsPath = (
  chain: Chain,
  protocolAddress: string,
  orderIdentifier: string,
) => {
  return `${API_V2_PREFIX}/orders/chain/${segment(chain)}/protocol/${segment(protocolAddress)}/${segment(orderIdentifier)}/cancel/actions`
}

export const getCreateListingFulfillmentActionsPath = () => {
  return `${API_V2_PREFIX}/listings/fulfillment/actions`
}

export const getCreateOfferActionsPath = () => {
  return `${API_V2_PREFIX}/offers/actions`
}

export const getCreateOfferFulfillmentActionsPath = () => {
  return `${API_V2_PREFIX}/offers/fulfillment/actions`
}

export const getTraitOffersPath = (collectionSlug: string) => {
  return `${API_V2_PREFIX}/offers/collection/${segment(collectionSlug)}/traits`
}

export const getOffersByNFTPath = (
  collectionSlug: string,
  identifier: string | number,
) => {
  return `${API_V2_PREFIX}/offers/collection/${segment(collectionSlug)}/nfts/${segment(identifier)}`
}

export const getSweepListingsPath = () => {
  return `${API_V2_PREFIX}/listings/sweep`
}

export const getSwapExecutePath = () => {
  return `${API_V2_PREFIX}/swap/execute`
}

export const getTransactionReceiptPath = () => {
  return `${API_V2_PREFIX}/transactions/receipt`
}

export const getEventsAPIPath = () => {
  return `${API_V2_PREFIX}/events`
}

export const getEventsByAccountAPIPath = (address: string) => {
  return `${API_V2_PREFIX}/events/accounts/${segment(address)}`
}

export const getEventsByCollectionAPIPath = (collectionSlug: string) => {
  return `${API_V2_PREFIX}/events/collection/${segment(collectionSlug)}`
}

export const getEventsByNFTAPIPath = (
  chain: Chain,
  address: string,
  identifier: string,
) => {
  return `${API_V2_PREFIX}/events/chain/${segment(chain)}/contract/${segment(address)}/nfts/${segment(identifier)}`
}

export const getContractPath = (chain: Chain, address: string) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/contract/${segment(address)}`
}

export const getTraitsPath = (collectionSlug: string) => {
  return `${API_V2_PREFIX}/traits/${segment(collectionSlug)}`
}

export const getCollectionTraitFloorsPath = (collectionSlug: string) => {
  return `${API_V2_PREFIX}/traits/${segment(collectionSlug)}/floors`
}

export const getTrendingTokensPath = () => {
  return `${API_V2_PREFIX}/tokens/trending`
}

export const getTopTokensPath = () => {
  return `${API_V2_PREFIX}/tokens/top`
}

export const getSwapQuotePath = () => {
  return `${API_V2_PREFIX}/swap/quote`
}

export const getTokenPath = (chain: string, address: string) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/token/${segment(address)}`
}

export const getSearchPath = () => {
  return `${API_V2_PREFIX}/search`
}

export const getChainsPath = () => {
  return `${API_V2_PREFIX}/chains`
}

export const getAccountTokensPath = (address: string) => {
  return `${API_V2_PREFIX}/account/${segment(address)}/tokens`
}

export const getValidateMetadataPath = (
  chain: Chain,
  address: string,
  identifier: string,
) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/contract/${segment(address)}/nfts/${segment(identifier)}/validate-metadata`
}

export const getDropsPath = () => {
  return `${API_V2_PREFIX}/drops`
}

export const getDropPath = (slug: string) => {
  return `${API_V2_PREFIX}/drops/${segment(slug)}`
}

export const getDropMintPath = (slug: string) => {
  return `${API_V2_PREFIX}/drops/${segment(slug)}/mint`
}

export const getCrossChainDropMintPath = (slug: string) => {
  return `${API_V2_PREFIX}/drops/${segment(slug)}/cross_chain_mint`
}

export const getTrendingCollectionsPath = () => {
  return `${API_V2_PREFIX}/collections/trending`
}

export const getTopCollectionsPath = () => {
  return `${API_V2_PREFIX}/collections/top`
}

export const getResolveAccountPath = (identifier: string) => {
  return `${API_V2_PREFIX}/accounts/resolve/${segment(identifier)}`
}

export const getNFTCollectionPath = (
  chain: Chain,
  address: string,
  identifier: string,
) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/contract/${segment(address)}/nfts/${segment(identifier)}/collection`
}

export const getNFTMetadataPath = (
  chain: Chain,
  contractAddress: string,
  tokenId: string,
) => {
  return `${API_V2_PREFIX}/metadata/${segment(chain)}/${segment(contractAddress)}/${segment(tokenId)}`
}

export const getTokenGroupsPath = () => {
  return `${API_V2_PREFIX}/token-groups`
}

export const getTokenGroupPath = (slug: string) => {
  return `${API_V2_PREFIX}/token-groups/${segment(slug)}`
}

export const getCrossChainFulfillmentDataPath = () => {
  return `${API_V2_PREFIX}/listings/cross_chain_fulfillment_data`
}

export const getInstantApiKeyPath = () => {
  return `${API_V2_PREFIX}/auth/keys`
}

// ── Batch lookups ───────────────────────────────────────────────────

export const getBatchTokensPath = () => {
  return `${API_V2_PREFIX}/tokens/batch`
}

export const getBatchNFTsPath = () => {
  return `${API_V2_PREFIX}/nfts/batch`
}

export const getBatchCollectionsPath = () => {
  return `${API_V2_PREFIX}/collections/batch`
}

// ── Listings actions ────────────────────────────────────────────────

export const getCreateListingActionsPath = () => {
  return `${API_V2_PREFIX}/listings/actions`
}

// ── Drops deploy ────────────────────────────────────────────────────

export const getDeployDropPath = () => {
  return `${API_V2_PREFIX}/drops/deploy`
}

export const getDeployDropReceiptPath = (chain: Chain, txHash: string) => {
  return `${API_V2_PREFIX}/drops/deploy/${segment(chain)}/${segment(txHash)}/receipt`
}

// ── Assets transfer ─────────────────────────────────────────────────

export const getTransferAssetsPath = () => {
  return `${API_V2_PREFIX}/assets/transfer`
}

// ── Collection analytics ────────────────────────────────────────────

export const getCollectionOfferAggregatesPath = (slug: string) => {
  return `${API_V2_PREFIX}/collections/${segment(slug)}/offer_aggregates`
}

export const getCollectionHoldersPath = (slug: string) => {
  return `${API_V2_PREFIX}/collections/${segment(slug)}/holders`
}

export const getCollectionFloorPricesPath = (slug: string) => {
  return `${API_V2_PREFIX}/collections/${segment(slug)}/floor_prices`
}

export const getCreatorFeeEnforcementPath = (slug: string) => {
  return `${API_V2_PREFIX}/collections/${segment(slug)}/creator_fee_enforcement`
}

export const getCollectionPfpProfilesPath = (slug: string) => {
  return `${API_V2_PREFIX}/collections/${segment(slug)}/pfp-profiles`
}

export const getTopPfpCollectionsPath = () => {
  return `${API_V2_PREFIX}/pfp/top-collections`
}

// ── Token analytics ─────────────────────────────────────────────────

export const getTokenPriceHistoryPath = (chain: Chain, address: string) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/token/${segment(address)}/price_history`
}

export const getTokenOhlcvPath = (chain: Chain, address: string) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/token/${segment(address)}/ohlcv`
}

export const getTokenActivityPath = (chain: Chain, address: string) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/token/${segment(address)}/activity`
}

export const getTokenActivityStatsPath = (chain: Chain, address: string) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/token/${segment(address)}/activity/stats`
}

export const getAccountTokenActivityPath = (address: string) => {
  return `${API_V2_PREFIX}/account/${segment(address)}/token-activity`
}

export const getTokenHoldersPath = (chain: Chain, address: string) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/token/${segment(address)}/holders`
}

export const getTokenLiquidityPoolsPath = (chain: Chain, address: string) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/token/${segment(address)}/liquidity-pools`
}

// ── NFT analytics ───────────────────────────────────────────────────

export const getNFTOwnersPath = (
  chain: Chain,
  address: string,
  identifier: string,
) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/contract/${segment(address)}/nfts/${segment(identifier)}/owners`
}

export const getNFTAnalyticsPath = (
  chain: Chain,
  address: string,
  identifier: string,
) => {
  return `${API_V2_PREFIX}/chain/${segment(chain)}/contract/${segment(address)}/nfts/${segment(identifier)}/analytics`
}

// ── Account portfolio / profile ─────────────────────────────────────

export const getPortfolioStatsPath = (address: string) => {
  return `${API_V2_PREFIX}/account/${segment(address)}/portfolio`
}

export const getPortfolioHistoryPath = (address: string) => {
  return `${API_V2_PREFIX}/account/${segment(address)}/portfolio/history`
}

export const getProfileOffersReceivedPath = (address: string) => {
  return `${API_V2_PREFIX}/account/${segment(address)}/offers_received`
}

export const getProfileOffersPath = (address: string) => {
  return `${API_V2_PREFIX}/account/${segment(address)}/offers`
}

export const getProfileListingsPath = (address: string) => {
  return `${API_V2_PREFIX}/account/${segment(address)}/listings`
}

export const getProfileFavoritesPath = (address: string) => {
  return `${API_V2_PREFIX}/account/${segment(address)}/favorites`
}

export const getWalletPnlPath = (address: string) => {
  return `${API_V2_PREFIX}/account/${segment(address)}/pnl`
}

export const getWalletClosedPositionsPath = (address: string) => {
  return `${API_V2_PREFIX}/account/${segment(address)}/pnl/closed-positions`
}

export const getWalletTokenTransfersPath = (address: string) => {
  return `${API_V2_PREFIX}/account/${segment(address)}/pnl/token-transfers`
}

export const getProfileCollectionsPath = (address: string) => {
  return `${API_V2_PREFIX}/account/${segment(address)}/collections`
}

export const getToolsPath = () => {
  return `${API_V2_PREFIX}/tools`
}

export const getToolsSearchPath = () => {
  return `${API_V2_PREFIX}/tools/search`
}

export const getToolPath = (
  registryChain: string | number,
  registryAddr: string,
  toolId: string | number,
) => {
  return `${API_V2_PREFIX}/tools/${segment(registryChain)}/${segment(registryAddr)}/${segment(toolId)}`
}

export const getToolActivityPath = (
  registryChain: string | number,
  registryAddr: string,
  toolId: string | number,
) => {
  return `${API_V2_PREFIX}/tools/${segment(registryChain)}/${segment(registryAddr)}/${segment(toolId)}/activity`
}

export const getToolUsagePath = () => {
  return `${API_V2_PREFIX}/tools/usage`
}

export const getSignalsPath = () => {
  return `${API_V2_PREFIX}/signals`
}

export const getSignalPath = (signalId: string) => {
  return `${API_V2_PREFIX}/signals/${segment(signalId)}`
}
