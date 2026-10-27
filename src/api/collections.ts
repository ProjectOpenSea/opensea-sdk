import type { Chain, OpenSeaCollection, OpenSeaCollectionStats } from "../types"
import {
  getBatchCollectionsPath,
  getCollectionFloorPricesPath,
  getCollectionHoldersPath,
  getCollectionOfferAggregatesPath,
  getCollectionPath,
  getCollectionPfpProfilesPath,
  getCollectionStatsPath,
  getCollectionsPath,
  getCollectionTraitFloorsPath,
  getCreatorFeeEnforcementPath,
  getTopCollectionsPath,
  getTopPfpCollectionsPath,
  getTraitsPath,
  getTrendingCollectionsPath,
} from "./apiPaths"
import type { Fetcher } from "./fetcher"
import {
  type BatchCollectionsRequest,
  type CollectionBatchResponse,
  type CollectionFloorPricesArgs,
  type CollectionHoldersArgs,
  type CollectionHoldersPaginatedResponse,
  type CollectionOfferAggregatesPaginatedResponse,
  CollectionOrderByOption,
  type CollectionPfpProfilesResponse,
  type CreatorFeeEnforcementStatusResponse,
  type FloorPriceHistoryResponse,
  type GetCollectionPfpProfilesArgs,
  type GetCollectionResponse,
  type GetCollectionsArgs,
  type GetCollectionsPaginatedResponse,
  type GetCollectionsResponse,
  type GetTopCollectionsArgs,
  type GetTopPfpCollectionsArgs,
  type GetTraitsResponse,
  type GetTrendingCollectionsArgs,
  type PaginatedAnalyticsArgs,
  type TopPfpCollectionsResponse,
  type TraitFloorsResponse,
} from "./types"

/**
 * Collection-related API operations
 */
export class CollectionsAPI {
  constructor(private fetcher: Fetcher) {}

  /**
   * Fetch an OpenSea collection.
   */
  async getCollection(slug: string): Promise<OpenSeaCollection> {
    const path = getCollectionPath(slug)
    return this.fetcher.get<GetCollectionResponse>(path)
  }

  /**
   * Fetch floor prices per trait value for a collection.
   *
   * Covers text traits that have at least one active listing, ordered by trait type, then value,
   * then price. Numeric traits are not enumerated here; use {@link getTraits} for their min/max
   * range. Every floor in the response is denominated on the collection's own chain, identified by
   * `chain` plus each entry's `paymentTokenSymbol`.
   */
  async getCollectionTraitFloors(slug: string): Promise<TraitFloorsResponse> {
    return this.fetcher.get<TraitFloorsResponse>(
      getCollectionTraitFloorsPath(slug),
    )
  }

  /**
   * Fetch a list of OpenSea collections.
   */
  async getCollections(
    orderBy: CollectionOrderByOption = CollectionOrderByOption.CREATED_DATE,
    chain?: Chain,
    creatorUsername?: string,
    includeHidden: boolean = false,
    limit?: number,
    next?: string,
  ): Promise<GetCollectionsResponse> {
    const path = getCollectionsPath()
    const args: GetCollectionsArgs = {
      orderBy,
      chain,
      creatorUsername,
      includeHidden,
      limit,
      next,
    }
    return this.fetcher.get<GetCollectionsResponse>(path, args)
  }

  /**
   * Fetch stats for an OpenSea collection.
   */
  async getCollectionStats(slug: string): Promise<OpenSeaCollectionStats> {
    const path = getCollectionStatsPath(slug)
    const response = await this.fetcher.get<OpenSeaCollectionStats>(path)
    return response as OpenSeaCollectionStats
  }

  /**
   * Fetch all traits for a collection with their possible values and counts.
   *
   * Opts out of response camelization: this payload is keyed by
   * collection-authored trait names and trait values rather than by field
   * names, so the default rewrite reports a `dark_brown` trait as `darkBrown`
   * and silently merges two traits that differ only in casing. The response's
   * own field names (`categories`, `counts`) are single words with nothing to
   * convert, so opting out is complete rather than a partial workaround.
   */
  async getTraits(collectionSlug: string): Promise<GetTraitsResponse> {
    const path = getTraitsPath(collectionSlug)
    const response = await this.fetcher.get<GetTraitsResponse>(
      path,
      undefined,
      {
        camelizeResponse: false,
      },
    )
    return response
  }

  /**
   * Fetch trending collections sorted by sales activity.
   */
  async getTrendingCollections(
    args?: GetTrendingCollectionsArgs,
  ): Promise<GetCollectionsPaginatedResponse> {
    return this.fetcher.get<GetCollectionsPaginatedResponse>(
      getTrendingCollectionsPath(),
      {
        ...args,
        chains: args?.chains?.join(","),
      },
    )
  }

  /**
   * Fetch top collections ranked by various stats.
   */
  async getTopCollections(
    args?: GetTopCollectionsArgs,
  ): Promise<GetCollectionsPaginatedResponse> {
    return this.fetcher.get<GetCollectionsPaginatedResponse>(
      getTopCollectionsPath(),
      {
        ...args,
        chains: args?.chains?.join(","),
      },
    )
  }

  /**
   * Fetch multiple collections in a single request by slug.
   */
  async getCollectionsBatch(
    request: BatchCollectionsRequest,
  ): Promise<CollectionBatchResponse> {
    return this.fetcher.post<CollectionBatchResponse>(
      getBatchCollectionsPath(),
      request,
    )
  }

  /**
   * Fetch aggregated offer information for a collection — top offers grouped
   * by price level. Useful for displaying offer-book depth.
   */
  async getCollectionOfferAggregates(
    slug: string,
    args?: PaginatedAnalyticsArgs,
  ): Promise<CollectionOfferAggregatesPaginatedResponse> {
    return this.fetcher.get<CollectionOfferAggregatesPaginatedResponse>(
      getCollectionOfferAggregatesPath(slug),
      args,
    )
  }

  /**
   * Fetch holders of a collection, ranked by quantity owned. Optionally
   * filter to a single owner via `args.owned_by`.
   */
  async getCollectionHolders(
    slug: string,
    args?: CollectionHoldersArgs,
  ): Promise<CollectionHoldersPaginatedResponse> {
    return this.fetcher.get<CollectionHoldersPaginatedResponse>(
      getCollectionHoldersPath(slug),
      args,
    )
  }

  /**
   * Fetch the floor-price history of a collection.
   */
  async getCollectionFloorPrices(
    slug: string,
    args?: CollectionFloorPricesArgs,
  ): Promise<FloorPriceHistoryResponse> {
    return this.fetcher.get<FloorPriceHistoryResponse>(
      getCollectionFloorPricesPath(slug),
      args,
    )
  }

  /**
   * Fetch whether creator fees are enforced onchain for a collection, and whether its contract
   * supports turning enforcement on with `walletAuth.buildCreatorFeeEnforcementTransactions`.
   */
  async getCreatorFeeEnforcement(
    slug: string,
  ): Promise<CreatorFeeEnforcementStatusResponse> {
    return this.fetcher.get<CreatorFeeEnforcementStatusResponse>(
      getCreatorFeeEnforcementPath(slug),
    )
  }

  /**
   * Fetch profiles wearing a verified NFT from the collection as their profile picture. Page with
   * the response's `next` passed back as `args.cursor`.
   */
  async getCollectionPfpProfiles(
    slug: string,
    args?: GetCollectionPfpProfilesArgs,
  ): Promise<CollectionPfpProfilesResponse> {
    return this.fetcher.get<CollectionPfpProfilesResponse>(
      getCollectionPfpProfilesPath(slug),
      args,
    )
  }

  /**
   * Fetch collections ranked by how many accounts wear one of their verified NFTs as a profile
   * picture. Pass `args.chains` to count wearers on those chains only, or omit it to rank across
   * every chain. `args.chain` is deprecated: use `chains`.
   */
  async getTopPfpCollections(
    args: GetTopPfpCollectionsArgs,
  ): Promise<TopPfpCollectionsResponse> {
    return this.fetcher.get<TopPfpCollectionsResponse>(
      getTopPfpCollectionsPath(),
      args,
    )
  }
}
