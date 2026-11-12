import type { Chain, OpenSeaCollection } from "../types"
import {
  getBatchNFTsPath,
  getContractPath,
  getListNFTsByAccountPath,
  getListNFTsByCollectionPath,
  getListNFTsByContractPath,
  getListNFTsByGroupPath,
  getNFTAnalyticsPath,
  getNFTCollectionPath,
  getNFTGroupFacetsPath,
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
  type GetNFTGroupFacetsArgs,
  type GetNFTGroupFacetsResponse,
  type GetNFTMetadataResponse,
  type GetNFTResponse,
  type GetNFTsByAccountOptions,
  type GetNFTsByGroupArgs,
  type GetNFTsByGroupResponse,
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
    hasAgentBinding: boolean | undefined = undefined,
  ): Promise<ListNFTsResponse> {
    const response = await this.fetcher.get<ListNFTsResponse>(
      getListNFTsByCollectionPath(slug),
      { limit, next, traits: encodeTraitsParam(traits), hasAgentBinding },
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
   * Search NFTs across every collection in a group, such as `trading_cards`,
   * by normalized attributes that are consistent across issuers. Facet
   * filters match any of their values and are AND-combined with each other.
   * Use {@link getNFTGroupFacets} to discover the values and their counts.
   */
  async getNFTsByGroup(
    group: string,
    args: GetNFTsByGroupArgs = {},
  ): Promise<GetNFTsByGroupResponse> {
    return this.fetcher.get<GetNFTsByGroupResponse>(
      getListNFTsByGroupPath(group),
      args,
    )
  }

  /**
   * Fetch the values of each normalized attribute in a collection group with
   * the number of matching NFTs. Each facet is narrowed by the filters of the
   * other types, so a facet keeps listing all of its own values.
   */
  async getNFTGroupFacets(
    group: string,
    args: GetNFTGroupFacetsArgs = {},
  ): Promise<GetNFTGroupFacetsResponse> {
    return this.fetcher.get<GetNFTGroupFacetsResponse>(
      getNFTGroupFacetsPath(group),
      args,
    )
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
   */
  async validateMetadata(
    address: string,
    identifier: string,
    chain: Chain = this.chain,
    ignoreCachedItemUrls?: boolean,
  ): Promise<ValidateMetadataResponse> {
    let path = getValidateMetadataPath(chain, address, identifier)
    if (ignoreCachedItemUrls !== undefined) {
      path += `?ignoreCachedItemUrls=${ignoreCachedItemUrls}`
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
   * Fetch analytics for an NFT: historical sale points for charting.
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
