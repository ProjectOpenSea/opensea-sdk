import type { Chain } from "../types"
import {
  getEventsAPIPath,
  getEventsByAccountAPIPath,
  getEventsByCollectionAPIPath,
  getEventsByNFTAPIPath,
} from "./apiPaths"
import type { Fetcher } from "./fetcher"
import {
  encodeTraitsParam,
  type GetEventsArgs,
  type GetEventsByCollectionArgs,
  type GetEventsResponse,
} from "./types"

/**
 * Events-related API operations
 */
/**
 * Drops `chain` for the general, collection, and NFT event endpoints, which do not document it.
 * The NFT endpoint carries the chain in its path. Account events document and preserve `chain`.
 */
function withoutIgnoredChain<T extends GetEventsArgs>(
  args?: T,
): Omit<T, "chain"> | undefined {
  if (!args || args.chain === undefined) {
    return args
  }
  const { chain: _ignored, ...rest } = args
  return rest
}

export class EventsAPI {
  constructor(private fetcher: Fetcher) {}

  /**
   * Gets a list of events based on query parameters.
   */
  async getEvents(args?: GetEventsArgs): Promise<GetEventsResponse> {
    const response = await this.fetcher.get<GetEventsResponse>(
      getEventsAPIPath(),
      withoutIgnoredChain(args),
    )
    return response
  }

  /**
   * Gets a list of events for a specific account.
   */
  async getEventsByAccount(
    address: string,
    args?: GetEventsArgs,
  ): Promise<GetEventsResponse> {
    const response = await this.fetcher.get<GetEventsResponse>(
      getEventsByAccountAPIPath(address),
      args,
    )
    return response
  }

  /**
   * Gets a list of events for a specific collection. Pass `args.traits` to
   * filter server-side; the SDK JSON-encodes the trait array for the request.
   */
  async getEventsByCollection(
    collectionSlug: string,
    args?: GetEventsByCollectionArgs,
  ): Promise<GetEventsResponse> {
    const response = await this.fetcher.get<GetEventsResponse>(
      getEventsByCollectionAPIPath(collectionSlug),
      encodeArgs(withoutIgnoredChain(args)),
    )
    return response
  }

  /**
   * Gets a list of events for a specific NFT.
   */
  async getEventsByNFT(
    chain: Chain,
    address: string,
    identifier: string,
    args?: GetEventsArgs,
  ): Promise<GetEventsResponse> {
    const response = await this.fetcher.get<GetEventsResponse>(
      getEventsByNFTAPIPath(chain, address, identifier),
      withoutIgnoredChain(args),
    )
    return response
  }
}

// Returns `undefined` (not `{}`) when no args were passed so the fetcher
// receives the same shape as before `traits` existed, keeping the
// pre-feature query string for callers that don't set any args.
function encodeArgs(args?: GetEventsByCollectionArgs) {
  if (!args) return args
  const { traits, ...rest } = args
  const encoded = encodeTraitsParam(traits)
  return encoded === undefined ? rest : { ...rest, traits: encoded }
}
