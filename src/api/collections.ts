import type { Chain, OpenSeaCollection, OpenSeaCollectionStats } from "../types"
import {
  getBatchCollectionsPath,
  getCollectionFloorPricesPath,
  getCollectionHoldersPath,
  getCollectionOfferAggregatesPath,
  getCollectionPath,
  getCollectionStatsPath,
  getCollectionsPath,
  getTopCollectionsPath,
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
  type FloorPriceHistoryResponse,
  type GetCollectionResponse,
  type GetCollectionsArgs,
  type GetCollectionsPaginatedResponse,
  type GetCollectionsResponse,
  type GetTopCollectionsArgs,
  type GetTraitsResponse,
  type GetTrendingCollectionsArgs,
  type PaginatedAnalyticsArgs,
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
   * and merges two traits that differ only in casing. The response's own field
   * names (`categories`, `counts`) are single words with nothing to convert.
   */
  async getTraits(collectionSlug: string): Promise<GetTraitsResponse> {
    const path = getTraitsPath(collectionSlug)
    const response = await this.fetcher.get<GetTraitsResponse>(
      path,
      undefined,
      { camelizeResponse: false },
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
}
