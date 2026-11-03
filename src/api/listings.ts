import {
  getAllListingsAPIPath,
  getBestListingAPIPath,
  getBestListingsAPIPath,
  getCreateListingActionsPath,
  getCreateListingFulfillmentActionsPath,
  getCrossChainFulfillmentDataPath,
  getSweepListingsPath,
} from "./apiPaths"
import type { Fetcher } from "./fetcher"
import {
  type CreateListingActionsRequest,
  type CreateListingActionsResponse,
  type CreateListingFulfillmentActionsRequest,
  type CreateListingFulfillmentActionsResponse,
  type CrossChainFulfillmentRequest,
  type CrossChainFulfillmentResponse,
  encodeTraitsParam,
  type GetBestListingResponse,
  type GetListingsResponse,
  type SweepCollectionRequest,
  type SweepCollectionResponse,
  type TraitFilter,
} from "./types"

/**
 * Listing-related API operations
 */
export class ListingsAPI {
  constructor(private fetcher: Fetcher) {}

  /**
   * Gets all listings for a given collection.
   * @param collectionSlug The collection slug
   * @param limit The number of listings to return
   * @param next The cursor for pagination
   * @param includePrivateListings Whether to include private listings (default: false)
   * @param maker Only return listings made by this wallet address
   */
  async getAllListings(
    collectionSlug: string,
    limit?: number,
    next?: string,
    includePrivateListings?: boolean,
    maker?: string,
  ): Promise<GetListingsResponse> {
    const response = await this.fetcher.get<GetListingsResponse>(
      getAllListingsAPIPath(collectionSlug),
      {
        limit,
        next,
        ...(includePrivateListings !== undefined && {
          includePrivateListings,
        }),
        ...(maker !== undefined && { maker }),
      },
    )
    return response
  }

  /**
   * Gets the best listing for a given token.
   * @param collectionSlug The collection slug
   * @param tokenId The token ID
   * @param includePrivateListings Whether to include private listings (default: false)
   */
  async getBestListing(
    collectionSlug: string,
    tokenId: string | number,
    includePrivateListings?: boolean,
  ): Promise<GetBestListingResponse> {
    const response = await this.fetcher.get<GetBestListingResponse>(
      getBestListingAPIPath(collectionSlug, tokenId),
      includePrivateListings !== undefined
        ? { includePrivateListings }
        : undefined,
    )
    return response
  }

  /**
   * Gets the best listings for a given collection. Pass `traits` to filter
   * server-side by item traits (multiple entries are AND-combined).
   */
  async getBestListings(
    collectionSlug: string,
    limit?: number,
    next?: string,
    includePrivateListings?: boolean,
    traits?: TraitFilter[],
  ): Promise<GetListingsResponse> {
    const response = await this.fetcher.get<GetListingsResponse>(
      getBestListingsAPIPath(collectionSlug),
      {
        limit,
        next,
        ...(includePrivateListings !== undefined && {
          includePrivateListings,
        }),
        traits: encodeTraitsParam(traits),
      },
    )
    return response
  }

  /**
   * Get cross-chain fulfillment data for one or more listings.
   * Supports same-chain, cross-token, and cross-chain purchases.
   * @param request The cross-chain fulfillment request
   */
  async getCrossChainFulfillmentData(
    request: CrossChainFulfillmentRequest,
  ): Promise<CrossChainFulfillmentResponse> {
    return this.fetcher.post<CrossChainFulfillmentResponse>(
      getCrossChainFulfillmentDataPath(),
      request,
    )
  }

  /**
   * Bulk-buy items from a collection.
   * If a requested item becomes unavailable, the system can automatically
   * substitute it with the next cheapest listing from the same collection
   * (enabled by default). Returns an ordered list of transactions to execute.
   */
  async sweepCollection(
    request: SweepCollectionRequest,
  ): Promise<SweepCollectionResponse> {
    return this.fetcher.post<SweepCollectionResponse>(
      getSweepListingsPath(),
      request,
    )
  }

  /**
   * Get an ordered list of blockchain actions required to create one or more
   * listings — token approvals + a final action containing the Seaport order
   * to sign. Useful for clients that prefer the server to compute the
   * approval graph.
   */
  async createListingActions(
    request: CreateListingActionsRequest,
  ): Promise<CreateListingActionsResponse> {
    return this.fetcher.post<CreateListingActionsResponse>(
      getCreateListingActionsPath(),
      request,
    )
  }

  /**
   * Get the ordered actions required to fulfill a listing.
   */
  async createListingFulfillmentActions(
    request: CreateListingFulfillmentActionsRequest,
  ): Promise<CreateListingFulfillmentActionsResponse> {
    return this.fetcher.post<CreateListingFulfillmentActionsResponse>(
      getCreateListingFulfillmentActionsPath(),
      request,
    )
  }
}
