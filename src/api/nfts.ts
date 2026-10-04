import type { Chain, OpenSeaCollection } from "../types"
import {
  getBatchNFTsPath,
  getContractPath,
  getListNFTsByAccountPath,
  getListNFTsByCollectionPath,
  getListNFTsByContractPath,
  getNFTAnalyticsPath,
  getNFTCollectionPath,
  getNFTMetadataPath,
  getNFTOwnersPath,
  getNFTPath,
  getRefreshMetadataPath,
  getValidateMetadataPath,
} from "./apiPaths"
import type { Fetcher } from "./fetcher"
import {
  type BatchNftsRequest,
  encodeTraitsParam,
  type GetCollectionResponse,
  type GetContractResponse,
  type GetNFTMetadataResponse,
  type GetNFTResponse,
  type GetNFTsByAccountOptions,
  type ListNFTsResponse,
  type NFTOwnersArgs,
  type NftAnalyticsResponse,
  type NftBatchResponse,
  type OwnersPaginatedResponse,
  type TraitFilter,
  type ValidateMetadataResponse,
} from "./types"

/**
 * NFT-related API operations
 */
export class NFTsAPI {
  constructor(
    private fetcher: Fetcher,
    private chain: Chain,
  ) {}

  /**
   * Fetch multiple NFTs for a collection. Pass `traits` to filter server-side
   * by item traits (multiple entries are AND-combined).
   */
  async getNFTsByCollection(
    slug: string,
    limit: number | undefined = undefined,
    next: string | undefined = undefined,
    traits: TraitFilter[] | undefined = undefined,
  ): Promise<ListNFTsResponse> {
    const response = await this.fetcher.get<ListNFTsResponse>(
      getListNFTsByCollectionPath(slug),
      { limit, next, traits: encodeTraitsParam(traits) },
    )
    return response
  }

  /**
   * Fetch multiple NFTs for a contract.
   */
  async getNFTsByContract(
    address: string,
    limit: number | undefined = undefined,
    next: string | undefined = undefined,
    chain: Chain = this.chain,
  ): Promise<ListNFTsResponse> {
    const response = await this.fetcher.get<ListNFTsResponse>(
      getListNFTsByContractPath(chain, address),
      {
        limit,
        next,
      },
    )
    return response
  }

  /**
   * Fetch NFTs owned by an account.
   *
   * Pass `options.includeAutoHidden` to also return NFTs that were hidden
   * automatically because a third party minted or sent them to this account.
   * NFTs the account holder hid themselves stay out of the response either
   * way, and this does not surface NFTs removed for policy violations.
   */
  async getNFTsByAccount(
    address: string,
    limit: number | undefined = undefined,
    next: string | undefined = undefined,
    chain = this.chain,
    options?: GetNFTsByAccountOptions,
  ): Promise<ListNFTsResponse> {
    const response = await this.fetcher.get<ListNFTsResponse>(
      getListNFTsByAccountPath(chain, address),
      {
        limit,
        next,
        // Snakeized to `include_auto_hidden` by the fetcher. Left undefined
        // when the caller sets nothing, so the parameter is absent from the
        // URL rather than sent as an explicit false.
        includeAutoHidden: options?.includeAutoHidden,
      },
    )

    return response
  }

  /**
   * Fetch metadata, traits, ownership information, and rarity for a single NFT.
   */
  async getNFT(
    address: string,
    identifier: string,
    chain = this.chain,
  ): Promise<GetNFTResponse> {
    const response = await this.fetcher.get<GetNFTResponse>(
      getNFTPath(chain, address, identifier),
    )
    return response
  }

  /**
   * Force refresh the metadata for an NFT.
   */
  async refreshNFTMetadata(
    address: string,
    identifier: string,
    chain: Chain = this.chain,
  ): Promise<Record<string, unknown>> {
    return this.fetcher.post<Record<string, unknown>>(
      getRefreshMetadataPath(chain, address, identifier),
      {},
    )
  }

  /**
   * Fetch smart contract information for a given chain and address.
   */
  async getContract(
    address: string,
    chain: Chain = this.chain,
  ): Promise<GetContractResponse> {
    const response = await this.fetcher.get<GetContractResponse>(
      getContractPath(chain, address),
    )
    return response
  }

  /**
   * Validate NFT metadata by fetching and parsing it.
   *
   * `ignoreCachedItemUrls` is `ignore_cached_item_urls` on the wire. This is the
   * one query string in the SDK built by hand — `post` takes a body, not a query
   * object, so nothing snakeizes it — and every parameter the API documents is
   * snake_case. Sending the camelCase spelling put an undocumented parameter on
   * the URL, which the server accepts and ignores, so a caller asking for a
   * re-fetch from source got the cached item URLs back with no error to notice.
   * Same silent-failure mode as the deprecated `next` in place of `cursor` that
   * `test/api/queryArgsDrift.spec.ts` was written for.
   */
  async validateMetadata(
    address: string,
    identifier: string,
    chain: Chain = this.chain,
    ignoreCachedItemUrls?: boolean,
  ): Promise<ValidateMetadataResponse> {
    let path = getValidateMetadataPath(chain, address, identifier)
    if (ignoreCachedItemUrls !== undefined) {
      // Built with URLSearchParams, like every other hand-assembled query string
      // in the package, so `false` is sent rather than dropped.
      const query = new URLSearchParams({
        ignore_cached_item_urls: String(ignoreCachedItemUrls),
      })
      path += `?${query}`
    }
    const response = await this.fetcher.post<ValidateMetadataResponse>(path)
    return response
  }

  /**
   * Get the collection that an NFT belongs to.
   * Useful for multi-contract collections where the token ID disambiguates
   * which collection the NFT belongs to.
   */
  async getNFTCollection(
    address: string,
    identifier: string,
    chain: Chain = this.chain,
  ): Promise<OpenSeaCollection> {
    return this.fetcher.get<GetCollectionResponse>(
      getNFTCollectionPath(chain, address, identifier),
    )
  }

  /**
   * Get detailed metadata for an NFT including name, description, image, traits,
   * and external links.
   */
  async getNFTMetadata(
    address: string,
    tokenId: string,
    chain: Chain = this.chain,
  ): Promise<GetNFTMetadataResponse> {
    const response = await this.fetcher.get<GetNFTMetadataResponse>(
      getNFTMetadataPath(chain, address, tokenId),
    )
    return response
  }

  /**
   * Fetch multiple NFTs in a single request by chain + contract + token id.
   */
  async getNFTsBatch(request: BatchNftsRequest): Promise<NftBatchResponse> {
    return this.fetcher.post<NftBatchResponse>(getBatchNFTsPath(), request)
  }

  /**
   * Fetch owners of an NFT. For ERC-721s this is a single owner; for
   * ERC-1155s it can be a paginated list with per-owner quantities.
   */
  async getNFTOwners(
    address: string,
    identifier: string,
    chain: Chain = this.chain,
    args?: NFTOwnersArgs,
  ): Promise<OwnersPaginatedResponse> {
    return this.fetcher.get<OwnersPaginatedResponse>(
      getNFTOwnersPath(chain, address, identifier),
      args,
    )
  }

  /**
   * Fetch analytics for an NFT — historical sale points used for charting.
   */
  async getNFTAnalytics(
    address: string,
    identifier: string,
    chain: Chain = this.chain,
  ): Promise<NftAnalyticsResponse> {
    return this.fetcher.get<NftAnalyticsResponse>(
      getNFTAnalyticsPath(chain, address, identifier),
    )
  }
}
