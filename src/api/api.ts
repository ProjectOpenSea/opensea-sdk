import { API_BASE_MAINNET } from "../constants"
import type { FulfillmentDataResponse, ProtocolData } from "../orders/types"
import {
  Chain,
  type OpenSeaAccount,
  type OpenSeaAPIConfig,
  type OpenSeaCollection,
  type OpenSeaCollectionStats,
  type OpenSeaPaymentToken,
  type OpenSeaRateLimitError,
  type OrderSide,
  type RequestOptions,
} from "../types"
import {
  type Camelize,
  camelizeKeysDeep,
  snakeizeKeysDeep,
} from "../utils/case"
import { executeWithRateLimit } from "../utils/rateLimit"
import { AccountsAPI } from "./accounts"
import { getInstantApiKeyPath } from "./apiPaths"
import { AssetsAPI } from "./assets"
import { ChainsAPI } from "./chains"
import { CollectionsAPI } from "./collections"
import { DropsAPI } from "./drops"
import { EventsAPI } from "./events"
import type { HttpMethod, PostOptions } from "./fetcher"
import { ListingsAPI } from "./listings"
import { NFTsAPI } from "./nfts"
import { OffersAPI } from "./offers"
import { OrdersAPI } from "./orders"
import { SearchAPI } from "./search"
import { TokensAPI } from "./tokens"
import { TransactionsAPI } from "./transactions"
import {
  type AgentProfileRelationshipsResponse,
  type BatchCollectionsRequest,
  type BatchNftsRequest,
  type BatchTokensRequest,
  type BuildOfferResponse,
  type CancelOrderResponse,
  type ClosedPositionsResponse,
  type CollectionBatchResponse,
  type CollectionFloorPricesArgs,
  type CollectionHoldersArgs,
  type CollectionHoldersPaginatedResponse,
  type CollectionOffer,
  type CollectionOfferAggregatesPaginatedResponse,
  CollectionOrderByOption,
  type CreateListingActionsRequest,
  type CreateListingActionsResponse,
  type CrossChainDropMintRequest,
  type CrossChainDropMintResponse,
  type CrossChainFulfillmentRequest,
  type CrossChainFulfillmentResponse,
  type DropDeployReceiptResponse,
  type DropDeployRequest,
  type DropDeployResponse,
  type DropMintRequest,
  type DropMintResponse,
  type FloorPriceHistoryResponse,
  type GetAccountTokenActivityArgs,
  type GetAccountTokenActivityResponse,
  type GetAccountTokensArgs,
  type GetAccountTokensResponse,
  type GetBestListingResponse,
  type GetBestOfferResponse,
  type GetChainsResponse,
  type GetCollectionsPaginatedResponse,
  type GetCollectionsResponse,
  type GetContractResponse,
  type GetDropResponse,
  type GetDropsArgs,
  type GetDropsResponse,
  type GetEventsArgs,
  type GetEventsByCollectionArgs,
  type GetEventsResponse,
  type GetListingsResponse,
  type GetNFTMetadataResponse,
  type GetNFTResponse,
  type GetOffersResponse,
  type GetOrderByHashResponse,
  type GetSwapQuoteArgs,
  type GetSwapQuoteResponse,
  type GetTokenGroupResponse,
  type GetTokenGroupsArgs,
  type GetTokenGroupsResponse,
  type GetTokenResponse,
  type GetTokensArgs,
  type GetTopCollectionsArgs,
  type GetTopTokensResponse,
  type GetTraitsResponse,
  type GetTrendingCollectionsArgs,
  type GetTrendingTokensResponse,
  type Listing,
  type ListNFTsResponse,
  type NFTOwnersArgs,
  type NftAnalyticsResponse,
  type NftBatchResponse,
  type Offer,
  type OhlcvResponse,
  type OwnersPaginatedResponse,
  type PaginatedAnalyticsArgs,
  type PortfolioArgs,
  type PortfolioHistoryResponse,
  type PortfolioStatsResponse,
  type PositionTokenTransfersResponse,
  type PriceHistoryResponse,
  type ProfileCollectionsArgs,
  type ProfileCollectionsResponse,
  type ProfileFavoritesArgs,
  type ProfileFavoritesResponse,
  type ProfileListingsResponse,
  type ProfileOffersResponse,
  type ProfileOrdersArgs,
  type RequestInstantApiKeyResponse,
  type ResolveAccountResponse,
  type SearchArgs,
  type SearchResponse,
  type SwapExecuteRequest,
  type SwapExecuteResponse,
  type SweepCollectionRequest,
  type SweepCollectionResponse,
  type TokenActivityArgs,
  type TokenActivityStatsArgs,
  type TokenActivityStatsResponse,
  type TokenBatchResponse,
  type TokenHoldersArgs,
  type TokenHoldersResponse,
  type TokenLiquidityPoolsArgs,
  type TokenLiquidityPoolsResponse,
  type TokenSwapActivityPaginatedResponse,
  type TokenTimeSeriesArgs,
  type TraitFilter,
  type TransactionReceiptRequest,
  type TransactionReceiptResponse,
  type TransferRequest,
  type TransferResponse,
  type ValidateMetadataResponse,
  type WalletClosedPositionsArgs,
  type WalletPnlResponse,
  type WalletTokenTransfersArgs,
} from "./types"
import { WalletAuthAPI } from "./walletAuth"

/**
 * The API class for the OpenSea SDK.
 * @category Main Classes
 */
export class OpenSeaAPI {
  /**
   * Base url for the API
   */
  public readonly apiBaseUrl: string
  /**
   * Default size to use for fetching orders
   */
  public pageSize = 20
  /**
   * Logger function to use when debugging
   */
  public logger: (arg: string) => void

  private apiKey: string | undefined
  private authToken: string | undefined
  private chain: Chain

  // Specialized API clients
  private ordersAPI: OrdersAPI
  private offersAPI: OffersAPI
  private listingsAPI: ListingsAPI
  private collectionsAPI: CollectionsAPI
  private nftsAPI: NFTsAPI
  private accountsAPI: AccountsAPI
  private eventsAPI: EventsAPI
  private searchAPI: SearchAPI
  private tokensAPI: TokensAPI
  private chainsAPI: ChainsAPI
  private dropsAPI: DropsAPI
  private transactionsAPI: TransactionsAPI
  private assetsAPI: AssetsAPI
  /** Wallet-authenticated scoped REST helpers. */
  public readonly walletAuth: WalletAuthAPI

  /**
   * Create an instance of the OpenSeaAPI
   * @param config OpenSeaAPIConfig for setting up the API, including an optional API key, Chain name, and base URL
   * @param logger Optional function for logging debug strings before and after requests are made. Defaults to no logging
   */
  constructor(config: OpenSeaAPIConfig, logger?: (arg: string) => void) {
    this.apiKey = config.apiKey
    this.authToken = config.authToken
    this.chain = config.chain ?? Chain.Mainnet

    if (config.apiBaseUrl) {
      this.apiBaseUrl = config.apiBaseUrl
    } else {
      this.apiBaseUrl = API_BASE_MAINNET
    }

    // Debugging: default to nothing
    this.logger = logger ?? ((arg: string) => arg)

    // Create fetcher context
    const fetcher = {
      get: this.get.bind(this),
      post: this.post.bind(this),
      request: this.request.bind(this),
    }

    // Initialize specialized API clients
    this.ordersAPI = new OrdersAPI(fetcher, this.chain)
    this.offersAPI = new OffersAPI(fetcher, this.chain)
    this.listingsAPI = new ListingsAPI(fetcher)
    this.collectionsAPI = new CollectionsAPI(fetcher)
    this.nftsAPI = new NFTsAPI(fetcher, this.chain)
    this.accountsAPI = new AccountsAPI(fetcher, this.chain)
    this.eventsAPI = new EventsAPI(fetcher)
    this.searchAPI = new SearchAPI(fetcher)
    this.tokensAPI = new TokensAPI(fetcher)
    this.chainsAPI = new ChainsAPI(fetcher)
    this.dropsAPI = new DropsAPI(fetcher)
    this.transactionsAPI = new TransactionsAPI(fetcher)
    this.assetsAPI = new AssetsAPI(fetcher)
    this.walletAuth = new WalletAuthAPI(fetcher)
  }

  /**
   * Gets a single order by its order hash.
   * @param orderHash The hash of the order to fetch
   * @param protocolAddress The address of the seaport contract
   * @param chain The chain where the order is located. Defaults to the chain set in the constructor.
   * @returns The {@link GetOrderByHashResponse} returned by the API (can be Offer or Listing)
   * @throws An error if the order is not found
   */
  public async getOrderByHash(
    orderHash: string,
    protocolAddress: string,
    chain: Chain = this.chain,
  ): Promise<GetOrderByHashResponse> {
    return this.ordersAPI.getOrderByHash(orderHash, protocolAddress, chain)
  }

  /**
   * Gets all offers for a given collection.
   * @param collectionSlug The slug of the collection.
   * @param limit The number of offers to return. Must be between 1 and 100. Default: 100
   * @param next The cursor for the next page of results. This is returned from a previous request.
   * @returns The {@link GetOffersResponse} returned by the API.
   */
  public async getAllOffers(
    collectionSlug: string,
    limit?: number,
    next?: string,
  ): Promise<GetOffersResponse> {
    return this.offersAPI.getAllOffers(collectionSlug, limit, next)
  }

  /**
   * Gets all listings for a given collection.
   * @param collectionSlug The slug of the collection.
   * @param limit The number of listings to return. Must be between 1 and 100. Default: 100
   * @param next The cursor for the next page of results. This is returned from a previous request.
   * @param includePrivateListings Whether to include private listings (default: false)
   * @returns The {@link GetListingsResponse} returned by the API.
   */
  public async getAllListings(
    collectionSlug: string,
    limit?: number,
    next?: string,
    includePrivateListings?: boolean,
  ): Promise<GetListingsResponse> {
    return this.listingsAPI.getAllListings(
      collectionSlug,
      limit,
      next,
      includePrivateListings,
    )
  }

  /**
   * Gets trait offers for a given collection.
   * @param collectionSlug The slug of the collection.
   * @param type The name of the trait (e.g. 'Background').
   * @param value The value of the trait (e.g. 'Red').
   * @param limit The number of offers to return. Must be between 1 and 100. Default: 100
   * @param next The cursor for the next page of results. This is returned from a previous request.
   * @param floatValue The value of the trait for decimal-based numeric traits.
   * @param intValue The value of the trait for integer-based numeric traits.
   * @returns The {@link GetOffersResponse} returned by the API.
   */
  public async getTraitOffers(
    collectionSlug: string,
    type: string,
    value: string,
    limit?: number,
    next?: string,
    floatValue?: number,
    intValue?: number,
  ): Promise<GetOffersResponse> {
    return this.offersAPI.getTraitOffers(
      collectionSlug,
      type,
      value,
      limit,
      next,
      floatValue,
      intValue,
    )
  }

  /**
   * Gets the best offer for a given token.
   * @param collectionSlug The slug of the collection.
   * @param tokenId The token identifier.
   * @returns The {@link GetBestOfferResponse} returned by the API.
   */
  public async getBestOffer(
    collectionSlug: string,
    tokenId: string | number,
  ): Promise<GetBestOfferResponse> {
    return this.offersAPI.getBestOffer(collectionSlug, tokenId)
  }

  /**
   * Gets the best listing for a given token.
   * @param collectionSlug The slug of the collection.
   * @param tokenId The token identifier.
   * @param includePrivateListings Whether to include private listings (default: false)
   * @returns The {@link GetBestListingResponse} returned by the API.
   */
  public async getBestListing(
    collectionSlug: string,
    tokenId: string | number,
    includePrivateListings?: boolean,
  ): Promise<GetBestListingResponse> {
    return this.listingsAPI.getBestListing(
      collectionSlug,
      tokenId,
      includePrivateListings,
    )
  }

  /**
   * Gets the best listings for a given collection.
   * @param collectionSlug The slug of the collection.
   * @param limit The number of listings to return. Must be between 1 and 100. Default: 100
   * @param next The cursor for the next page of results. This is returned from a previous request.
   * @param includePrivateListings Whether to include private listings (default: false)
   * @param traits Optional {@link TraitFilter} array. Returns 400 if a single trait matches more than 1000 items.
   * @returns The {@link GetListingsResponse} returned by the API.
   */
  public async getBestListings(
    collectionSlug: string,
    limit?: number,
    next?: string,
    includePrivateListings?: boolean,
    traits?: TraitFilter[],
  ): Promise<GetListingsResponse> {
    return this.listingsAPI.getBestListings(
      collectionSlug,
      limit,
      next,
      includePrivateListings,
      traits,
    )
  }

  /**
   * Get cross-chain fulfillment data for one or more listings.
   * Supports same-chain, cross-token, and cross-chain purchases (up to 50 listings).
   * All listings must be EVM (Seaport orders). Payment can be from any chain (EVM or SVM).
   * @param request The cross-chain fulfillment request containing listings, fulfiller, payment, and optional recipient
   * @returns The {@link CrossChainFulfillmentResponse} with ordered transactions to sign and submit
   */
  public async getCrossChainFulfillmentData(
    request: CrossChainFulfillmentRequest,
  ): Promise<CrossChainFulfillmentResponse> {
    return this.listingsAPI.getCrossChainFulfillmentData(request)
  }

  /**
   * Generate the data needed to fulfill a listing or an offer onchain.
   * @param fulfillerAddress The wallet address which will be used to fulfill the order
   * @param orderHash The hash of the order to fulfill
   * @param protocolAddress The address of the seaport contract
   * @param side The side of the order (buy or sell)
   * @param assetContractAddress Optional address of the NFT contract for criteria offers (e.g., collection offers)
   * @param tokenId Optional token ID for criteria offers (e.g., collection offers)
   * @param unitsToFill Optional number of units to fill. Defaults to 1 for both listings and offers.
   * @param recipientAddress Optional recipient address for the NFT when fulfilling a listing. Not applicable for offers.
   * @param includeOptionalCreatorFees Whether to include optional creator fees in the fulfillment. If creator fees are already required, this is a no-op. Defaults to false.
   * @returns The {@link FulfillmentDataResponse}
   */
  public async generateFulfillmentData(
    fulfillerAddress: string,
    orderHash: string,
    protocolAddress: string,
    side: OrderSide,
    assetContractAddress?: string,
    tokenId?: string,
    unitsToFill?: string,
    recipientAddress?: string,
    includeOptionalCreatorFees: boolean = false,
  ): Promise<Camelize<FulfillmentDataResponse>> {
    return this.ordersAPI.generateFulfillmentData(
      fulfillerAddress,
      orderHash,
      protocolAddress,
      side,
      assetContractAddress,
      tokenId,
      unitsToFill,
      recipientAddress,
      includeOptionalCreatorFees,
    )
  }

  /**
   * Post a listing to OpenSea. Returns the new v2 Listing response format.
   * @param order The order to post
   * @param protocolAddress The contract address of the seaport protocol
   * @returns The {@link Listing} posted to the API.
   */
  public async postListing(
    order: ProtocolData,
    protocolAddress: string,
  ): Promise<Listing> {
    return this.ordersAPI.postListing(order, protocolAddress)
  }

  /**
   * Post an offer to OpenSea. Returns the new v2 Offer response format.
   * @param order The order to post
   * @param protocolAddress The contract address of the seaport protocol
   * @returns The {@link Offer} posted to the API.
   */
  public async postOffer(
    order: ProtocolData,
    protocolAddress: string,
  ): Promise<Offer> {
    return this.ordersAPI.postOffer(order, protocolAddress)
  }

  /**
   * Build a OpenSea collection offer.
   * @param offererAddress The wallet address which is creating the offer.
   * @param quantity The number of NFTs requested in the offer.
   * @param collectionSlug The slug (identifier) of the collection to build the offer for.
   * @param offerProtectionEnabled Build the offer on OpenSea's signed zone to provide offer protections from receiving an item which is disabled from trading.
   * @param traitType If defined, the trait name to create the collection offer for.
   * @param traitValue If defined, the trait value to create the collection offer for.
   * @param traits If defined, an array of traits to create the multi-trait collection offer for.
   * @param numericTraits If defined, an array of numeric trait criteria with min/max ranges.
   * @returns The {@link BuildOfferResponse} returned by the API.
   */
  public async buildOffer(
    offererAddress: string,
    quantity: number,
    collectionSlug: string,
    offerProtectionEnabled = true,
    traitType?: string,
    traitValue?: string,
    traits?: Array<{ type: string; value: string }>,
    numericTraits?: Array<{ type: string; min?: number; max?: number }>,
  ): Promise<BuildOfferResponse> {
    return this.offersAPI.buildOffer(
      offererAddress,
      quantity,
      collectionSlug,
      offerProtectionEnabled,
      traitType,
      traitValue,
      traits,
      numericTraits,
    )
  }

  /**
   * Get a list collection offers for a given slug.
   * @param slug The slug (identifier) of the collection to list offers for
   * @param limit Optional limit for number of results.
   * @param next Optional cursor for pagination.
   * @returns The {@link GetOffersResponse} returned by the API.
   */
  public async getCollectionOffers(
    slug: string,
    limit?: number,
    next?: string,
  ): Promise<GetOffersResponse> {
    return this.offersAPI.getCollectionOffers(slug, limit, next)
  }

  /**
   * Post a collection offer to OpenSea.
   * @param order The collection offer to post.
   * @param slug The slug (identifier) of the collection to post the offer for.
   * @param traitType If defined, the trait name to create the collection offer for.
   * @param traitValue If defined, the trait value to create the collection offer for.
   * @param traits If defined, an array of traits to create the multi-trait collection offer for.
   * @param numericTraits If defined, an array of numeric trait criteria with min/max ranges.
   * @returns The {@link Offer} returned to the API.
   */
  public async postCollectionOffer(
    order: ProtocolData,
    slug: string,
    traitType?: string,
    traitValue?: string,
    traits?: Array<{ type: string; value: string }>,
    numericTraits?: Array<{ type: string; min?: number; max?: number }>,
  ): Promise<CollectionOffer | null> {
    return this.offersAPI.postCollectionOffer(
      order,
      slug,
      traitType,
      traitValue,
      traits,
      numericTraits,
    )
  }

  /**
   * Fetch multiple NFTs for a collection.
   * @param slug The slug (identifier) of the collection
   * @param limit The number of NFTs to retrieve. Must be greater than 0 and less than 51.
   * @param next Cursor to retrieve the next page of NFTs
   * @param traits Optional {@link TraitFilter} array. Returns 400 if a single trait matches more than 1000 items.
   * @returns The {@link ListNFTsResponse} returned by the API.
   */
  public async getNFTsByCollection(
    slug: string,
    limit: number | undefined = undefined,
    next: string | undefined = undefined,
    traits: TraitFilter[] | undefined = undefined,
  ): Promise<ListNFTsResponse> {
    return this.nftsAPI.getNFTsByCollection(slug, limit, next, traits)
  }

  /**
   * Fetch multiple NFTs for a contract.
   * @param address The NFT's contract address.
   * @param limit The number of NFTs to retrieve. Must be greater than 0 and less than 51.
   * @param next Cursor to retrieve the next page of NFTs.
   * @param chain The NFT's chain.
   * @returns The {@link ListNFTsResponse} returned by the API.
   */
  public async getNFTsByContract(
    address: string,
    limit: number | undefined = undefined,
    next: string | undefined = undefined,
    chain: Chain = this.chain,
  ): Promise<ListNFTsResponse> {
    return this.nftsAPI.getNFTsByContract(address, limit, next, chain)
  }

  /**
   * Fetch NFTs owned by an account.
   * @param address The address of the account
   * @param limit The number of NFTs to retrieve. Must be greater than 0 and less than 51.
   * @param next Cursor to retrieve the next page of NFTs
   * @param chain The chain to query. Defaults to the chain set in the constructor.
   * @returns The {@link ListNFTsResponse} returned by the API.
   */
  public async getNFTsByAccount(
    address: string,
    limit: number | undefined = undefined,
    next: string | undefined = undefined,
    chain = this.chain,
  ): Promise<ListNFTsResponse> {
    return this.nftsAPI.getNFTsByAccount(address, limit, next, chain)
  }

  /**
   * Fetch metadata, traits, ownership information, and rarity for a single NFT.
   * @param address The NFT's contract address.
   * @param identifier the identifier of the NFT (i.e. Token ID)
   * @param chain The NFT's chain.
   * @returns The {@link GetNFTResponse} returned by the API.
   */
  public async getNFT(
    address: string,
    identifier: string,
    chain = this.chain,
  ): Promise<GetNFTResponse> {
    return this.nftsAPI.getNFT(address, identifier, chain)
  }

  /**
   * Fetch an OpenSea collection.
   * @param slug The slug (identifier) of the collection.
   * @returns The {@link OpenSeaCollection} returned by the API.
   */
  public async getCollection(slug: string): Promise<OpenSeaCollection> {
    return this.collectionsAPI.getCollection(slug)
  }

  /**
   * Fetch a list of OpenSea collections.
   * @param orderBy The order to return the collections in. Default: CREATED_DATE
   * @param chain The chain to filter the collections on. Default: all chains
   * @param creatorUsername The creator's OpenSea username to filter the collections on.
   * @param includeHidden If hidden collections should be returned. Default: false
   * @param limit The limit of collections to return.
   * @param next The cursor for the next page of results. This is returned from a previous request.
   * @returns List of {@link OpenSeaCollection} returned by the API.
   */
  public async getCollections(
    orderBy: CollectionOrderByOption = CollectionOrderByOption.CREATED_DATE,
    chain?: Chain,
    creatorUsername?: string,
    includeHidden: boolean = false,
    limit?: number,
    next?: string,
  ): Promise<GetCollectionsResponse> {
    return this.collectionsAPI.getCollections(
      orderBy,
      chain,
      creatorUsername,
      includeHidden,
      limit,
      next,
    )
  }

  /**
   * Fetch stats for an OpenSea collection.
   * @param slug The slug (identifier) of the collection.
   * @returns The {@link OpenSeaCollection} returned by the API.
   */
  public async getCollectionStats(
    slug: string,
  ): Promise<OpenSeaCollectionStats> {
    return this.collectionsAPI.getCollectionStats(slug)
  }

  /**
   * Fetch a payment token.
   * @param address The address of the payment token
   * @param chain The chain of the payment token
   * @returns The {@link OpenSeaPaymentToken} returned by the API.
   */
  public async getPaymentToken(
    address: string,
    chain = this.chain,
  ): Promise<OpenSeaPaymentToken> {
    return this.accountsAPI.getPaymentToken(address, chain)
  }

  /**
   * Fetch account for an address.
   * @param address The address to fetch the account for
   * @returns The {@link OpenSeaAccount} returned by the API.
   */
  public async getAccount(address: string): Promise<OpenSeaAccount> {
    return this.accountsAPI.getAccount(address)
  }

  /**
   * Force refresh the metadata for an NFT.
   * @param address The address of the NFT's contract.
   * @param identifier The identifier of the NFT.
   * @param chain The chain where the NFT is located.
   * @returns The response from the API.
   */
  public async refreshNFTMetadata(
    address: string,
    identifier: string,
    chain: Chain = this.chain,
  ): Promise<Record<string, unknown>> {
    return this.nftsAPI.refreshNFTMetadata(address, identifier, chain)
  }

  /**
   * Offchain cancel an order, offer or listing, by its order hash when protected by the SignedZone.
   * Protocol and Chain are required to prevent hash collisions.
   * Please note cancellation is only assured if a fulfillment signature was not vended prior to cancellation.
   * @param protocolAddress The Seaport address for the order.
   * @param orderHash The order hash, or external identifier, of the order.
   * @param chain The chain where the order is located.
   * @param offererSignature An EIP-712 signature from the offerer of the order.
   *                         If this is not provided, the user associated with the API Key will be checked instead.
   *                         The signature must be a EIP-712 signature consisting of the order's Seaport contract's
   *                         name, version, address, and chain. The struct to sign is `OrderHash` containing a
   *                         single bytes32 field.
   * @returns The response from the API.
   */
  public async offchainCancelOrder(
    protocolAddress: string,
    orderHash: string,
    chain: Chain = this.chain,
    offererSignature?: string,
  ): Promise<CancelOrderResponse> {
    return this.ordersAPI.offchainCancelOrder(
      protocolAddress,
      orderHash,
      chain,
      offererSignature,
    )
  }

  /**
   * Gets a list of events based on query parameters.
   * @param args Query parameters for filtering events.
   * @returns The {@link GetEventsResponse} returned by the API.
   */
  public async getEvents(args?: GetEventsArgs): Promise<GetEventsResponse> {
    return this.eventsAPI.getEvents(args)
  }

  /**
   * Gets a list of events for a specific account.
   * @param address The account address.
   * @param args Query parameters for filtering events.
   * @returns The {@link GetEventsResponse} returned by the API.
   */
  public async getEventsByAccount(
    address: string,
    args?: GetEventsArgs,
  ): Promise<GetEventsResponse> {
    return this.eventsAPI.getEventsByAccount(address, args)
  }

  /**
   * Gets a list of events for a specific collection. Pass `args.traits` to
   * filter server-side by item traits (multiple entries are AND-combined).
   * @param collectionSlug The slug (identifier) of the collection.
   * @param args Query parameters; see {@link GetEventsByCollectionArgs}.
   * @returns The {@link GetEventsResponse} returned by the API.
   */
  public async getEventsByCollection(
    collectionSlug: string,
    args?: GetEventsByCollectionArgs,
  ): Promise<GetEventsResponse> {
    return this.eventsAPI.getEventsByCollection(collectionSlug, args)
  }

  /**
   * Gets a list of events for a specific NFT.
   * @param chain The chain where the NFT is located.
   * @param address The contract address of the NFT.
   * @param identifier The token identifier.
   * @param args Query parameters for filtering events.
   * @returns The {@link GetEventsResponse} returned by the API.
   */
  public async getEventsByNFT(
    chain: Chain,
    address: string,
    identifier: string,
    args?: GetEventsArgs,
  ): Promise<GetEventsResponse> {
    return this.eventsAPI.getEventsByNFT(chain, address, identifier, args)
  }

  /**
   * Fetch smart contract information for a given chain and address.
   * @param address The contract address.
   * @param chain The chain where the contract is deployed. Defaults to the chain set in the constructor.
   * @returns The {@link GetContractResponse} returned by the API.
   */
  public async getContract(
    address: string,
    chain: Chain = this.chain,
  ): Promise<GetContractResponse> {
    return this.nftsAPI.getContract(address, chain)
  }

  /**
   * Fetch all traits for a collection with their possible values and counts.
   * @param collectionSlug The slug (identifier) of the collection.
   * @returns The {@link GetTraitsResponse} returned by the API.
   */
  public async getTraits(collectionSlug: string): Promise<GetTraitsResponse> {
    return this.collectionsAPI.getTraits(collectionSlug)
  }

  /**
   * Gets a list of trending tokens.
   * @param args Optional query parameters for pagination.
   * @returns The {@link GetTrendingTokensResponse} returned by the API.
   */
  public async getTrendingTokens(
    args?: GetTokensArgs,
  ): Promise<GetTrendingTokensResponse> {
    return this.tokensAPI.getTrendingTokens(args)
  }

  /**
   * Gets a list of top tokens.
   * @param args Optional query parameters for pagination.
   * @returns The {@link GetTopTokensResponse} returned by the API.
   */
  public async getTopTokens(
    args?: GetTokensArgs,
  ): Promise<GetTopTokensResponse> {
    return this.tokensAPI.getTopTokens(args)
  }

  /**
   * Gets a swap quote for exchanging tokens.
   * @param args Query parameters for the swap quote including token addresses, amount, and chain.
   * @returns The {@link GetSwapQuoteResponse} returned by the API.
   */
  public async getSwapQuote(
    args: GetSwapQuoteArgs,
  ): Promise<GetSwapQuoteResponse> {
    return this.tokensAPI.getSwapQuote(args)
  }

  /**
   * Gets details for a specific token.
   * @param chain The chain the token is on.
   * @param address The token contract address.
   * @returns The {@link GetTokenResponse} returned by the API.
   */
  public async getToken(
    chain: string,
    address: string,
  ): Promise<GetTokenResponse> {
    return this.tokensAPI.getToken(chain, address)
  }

  /**
   * Gets a paginated list of token groups — equivalent currencies across
   * chains (e.g. ETH on Ethereum, Base, and Arbitrum share the "eth" group).
   * @param args Optional query parameters (`limit`, `cursor`).
   * @returns The {@link GetTokenGroupsResponse} returned by the API.
   */
  public async getTokenGroups(
    args?: GetTokenGroupsArgs,
  ): Promise<GetTokenGroupsResponse> {
    return this.tokensAPI.getTokenGroups(args)
  }

  /**
   * Gets a single token group by its slug (e.g. "eth").
   * @param slug The token group slug.
   * @returns The {@link GetTokenGroupResponse} returned by the API.
   */
  public async getTokenGroup(slug: string): Promise<GetTokenGroupResponse> {
    return this.tokensAPI.getTokenGroup(slug)
  }

  /**
   * Search across collections, tokens, NFTs, and accounts.
   * Results are ranked by relevance.
   * @param args Query parameters including query text, optional chain/asset type filters, and limit.
   * @returns The {@link SearchResponse} returned by the API.
   */
  public async search(args: SearchArgs): Promise<SearchResponse> {
    return this.searchAPI.search(args)
  }

  /**
   * Gets the list of supported blockchains and their capabilities.
   * @returns The {@link GetChainsResponse} returned by the API.
   */
  public async getChains(): Promise<GetChainsResponse> {
    return this.chainsAPI.getChains()
  }

  /**
   * Gets token balances for a given account.
   * @param address The wallet address to fetch token balances for.
   * @param args Optional query parameters for filtering and pagination.
   * @returns The {@link GetAccountTokensResponse} returned by the API.
   */
  public async getAccountTokens(
    address: string,
    args?: GetAccountTokensArgs,
  ): Promise<GetAccountTokensResponse> {
    return this.accountsAPI.getAccountTokens(address, args)
  }

  /**
   * Validate NFT metadata by fetching and parsing it.
   * @param address The NFT contract address.
   * @param identifier The token identifier.
   * @param chain The chain where the NFT is located. Defaults to the chain set in the constructor.
   * @param ignoreCachedItemUrls Whether to ignore cached item URLs and re-fetch from source.
   * @returns The {@link ValidateMetadataResponse} returned by the API.
   */
  public async validateNFTMetadata(
    address: string,
    identifier: string,
    chain: Chain = this.chain,
    ignoreCachedItemUrls?: boolean,
  ): Promise<ValidateMetadataResponse> {
    return this.nftsAPI.validateMetadata(
      address,
      identifier,
      chain,
      ignoreCachedItemUrls,
    )
  }

  /**
   * Gets all active offers for a specific NFT (not just the best offer).
   * @param collectionSlug The collection slug.
   * @param identifier The NFT token id.
   * @param limit The number of offers to return. Must be between 1 and 200.
   * @param next The cursor for the next page of results.
   * @returns The {@link GetOffersResponse} returned by the API.
   */
  public async getOffersByNFT(
    collectionSlug: string,
    identifier: string | number,
    limit?: number,
    next?: string,
  ): Promise<GetOffersResponse> {
    return this.offersAPI.getOffersByNFT(
      collectionSlug,
      identifier,
      limit,
      next,
    )
  }

  /**
   * Bulk-buy items from a collection using any payment token, including
   * cross-chain. Returns an ordered list of transactions to execute.
   * @param request The sweep request containing buyer, collection, payment, and item caps.
   * @returns The {@link SweepCollectionResponse} returned by the API.
   */
  public async sweepCollection(
    request: SweepCollectionRequest,
  ): Promise<SweepCollectionResponse> {
    return this.listingsAPI.sweepCollection(request)
  }

  /**
   * Get executable transactions for a token swap. Companion to
   * {@link OpenSeaAPI.getSwapQuote} — quote first, then execute.
   * @param request The swap execution request.
   * @returns The {@link SwapExecuteResponse} with transactions and a quote.
   */
  public async executeSwap(
    request: SwapExecuteRequest,
  ): Promise<SwapExecuteResponse> {
    return this.tokensAPI.executeSwap(request)
  }

  /**
   * Get the receipt/status for a submitted transaction. Works for all transaction
   * types: listing fulfillments, cross-chain buys and mints, sweeps, offer
   * fulfillments, and token swaps. Poll this endpoint to check completion status.
   * @param request The transaction receipt request.
   * @returns The {@link TransactionReceiptResponse} returned by the API.
   */
  public async getTransactionReceipt(
    request: TransactionReceiptRequest,
  ): Promise<TransactionReceiptResponse> {
    return this.transactionsAPI.getTransactionReceipt(request)
  }

  /**
   * Gets a list of drops (mints).
   * @param args Optional query parameters for filtering and pagination.
   * @returns The {@link GetDropsResponse} returned by the API.
   */
  public async getDrops(args?: GetDropsArgs): Promise<GetDropsResponse> {
    return this.dropsAPI.getDrops(args)
  }

  /**
   * Gets detailed drop information for a collection.
   * @param slug The collection slug identifying the drop.
   * @returns The {@link GetDropResponse} returned by the API.
   */
  public async getDrop(slug: string): Promise<GetDropResponse> {
    return this.dropsAPI.getDrop(slug)
  }

  /**
   * Builds a mint transaction for a drop.
   * @param slug The collection slug identifying the drop.
   * @param request The mint request containing minter address and quantity.
   * @returns The {@link DropMintResponse} with ready-to-sign transaction data.
   */
  public async buildDropMintTransaction(
    slug: string,
    request: DropMintRequest,
  ): Promise<DropMintResponse> {
    return this.dropsAPI.buildMintTransaction(slug, request)
  }

  /**
   * Builds ordered transactions for paying on one chain and minting a drop on
   * another. Submit each transaction in order, then pass the returned
   * `receiptRequest` unchanged to {@link OpenSeaAPI.getTransactionReceipt}
   * until the status is terminal.
   * @param slug The collection slug identifying the drop.
   * @param request The payer, minter, quantity, and source payment asset.
   * @returns Transactions to submit and the request used to poll their receipt.
   */
  public async buildCrossChainDropMintTransactions(
    slug: string,
    request: CrossChainDropMintRequest,
  ): Promise<CrossChainDropMintResponse> {
    return this.dropsAPI.buildCrossChainMintTransactions(slug, request)
  }

  /**
   * Gets trending collections sorted by sales activity.
   * @param args Optional query parameters for timeframe, chain, category, and pagination.
   * @returns The {@link GetCollectionsPaginatedResponse} returned by the API.
   */
  public async getTrendingCollections(
    args?: GetTrendingCollectionsArgs,
  ): Promise<GetCollectionsPaginatedResponse> {
    return this.collectionsAPI.getTrendingCollections(args)
  }

  /**
   * Gets top collections ranked by various stats.
   * @param args Optional query parameters for sort_by, chain, category, and pagination.
   * @returns The {@link GetCollectionsPaginatedResponse} returned by the API.
   */
  public async getTopCollections(
    args?: GetTopCollectionsArgs,
  ): Promise<GetCollectionsPaginatedResponse> {
    return this.collectionsAPI.getTopCollections(args)
  }

  /**
   * Resolve an ENS name, OpenSea username, or wallet address to canonical account info.
   * @param identifier An ENS name (e.g. vitalik.eth), OpenSea username, or wallet address.
   * @returns The {@link ResolveAccountResponse} returned by the API.
   */
  public async resolveAccount(
    identifier: string,
  ): Promise<ResolveAccountResponse> {
    return this.accountsAPI.resolveAccount(identifier)
  }

  /**
   * Get the public agent ownership relationships for a profile.
   * This is a public read and does not require wallet authentication.
   * @param addressOrUsername An ENS name, OpenSea username, or wallet address.
   * @returns The {@link AgentProfileRelationshipsResponse} returned by the API.
   */
  public async getAgentProfileRelationships(
    addressOrUsername: string,
  ): Promise<AgentProfileRelationshipsResponse> {
    return this.accountsAPI.getAgentProfileRelationships(addressOrUsername)
  }

  /**
   * Get the collection that an NFT belongs to.
   * Useful for multi-contract collections where the token ID disambiguates
   * which collection the NFT belongs to.
   * @param address The NFT contract address.
   * @param identifier The token identifier.
   * @param chain The chain where the NFT is located. Defaults to the chain set in the constructor.
   * @returns The {@link OpenSeaCollection} returned by the API.
   */
  public async getNFTCollection(
    address: string,
    identifier: string,
    chain: Chain = this.chain,
  ): Promise<OpenSeaCollection> {
    return this.nftsAPI.getNFTCollection(address, identifier, chain)
  }

  /**
   * Get detailed metadata for an NFT including name, description, image, traits,
   * and external links.
   * @param address The NFT contract address.
   * @param tokenId The token identifier.
   * @param chain The chain where the NFT is located. Defaults to the chain set in the constructor.
   * @returns The {@link GetNFTMetadataResponse} returned by the API.
   */
  public async getNFTMetadata(
    address: string,
    tokenId: string,
    chain: Chain = this.chain,
  ): Promise<GetNFTMetadataResponse> {
    return this.nftsAPI.getNFTMetadata(address, tokenId, chain)
  }

  /**
   * Fetch multiple tokens in a single request.
   * @param request Batch request listing chain + contract address pairs.
   * @returns The {@link TokenBatchResponse} with detailed token info.
   */
  public async getTokensBatch(
    request: BatchTokensRequest,
  ): Promise<TokenBatchResponse> {
    return this.tokensAPI.getTokensBatch(request)
  }

  /**
   * Fetch the price history of a token.
   * @param chain Chain the token lives on.
   * @param address Token contract address.
   * @param args Time-series window — `start_time` required, `end_time` defaults to now.
   * @returns The {@link PriceHistoryResponse} returned by the API.
   */
  public async getTokenPriceHistory(
    chain: Chain,
    address: string,
    args: TokenTimeSeriesArgs,
  ): Promise<PriceHistoryResponse> {
    return this.tokensAPI.getTokenPriceHistory(chain, address, args)
  }

  /**
   * Fetch OHLCV candles for a token.
   * @param chain Chain the token lives on.
   * @param address Token contract address.
   * @param args Time-series window plus candle `bucketSize` (required).
   * @returns The {@link OhlcvResponse} returned by the API.
   */
  public async getTokenOhlcv(
    chain: Chain,
    address: string,
    args: TokenTimeSeriesArgs & { bucketSize: string },
  ): Promise<OhlcvResponse> {
    return this.tokensAPI.getTokenOhlcv(chain, address, args)
  }

  /**
   * Fetch recent swap activity for a token.
   */
  public async getTokenActivity(
    chain: Chain,
    address: string,
    args?: TokenActivityArgs,
  ): Promise<TokenSwapActivityPaginatedResponse> {
    return this.tokensAPI.getTokenActivity(chain, address, args)
  }

  /**
   * Fetch materialized trade count, USD volume, and average trade size for a
   * token across the requested windows.
   */
  public async getTokenActivityStats(
    chain: Chain,
    address: string,
    args?: TokenActivityStatsArgs,
  ): Promise<TokenActivityStatsResponse> {
    return this.tokensAPI.getTokenActivityStats(chain, address, args)
  }

  /**
   * Fetch paginated fungible token activity (transfers, swaps, wraps, and
   * unwraps) for an account across all chains.
   */
  public async getAccountTokenActivity(
    address: string,
    args?: GetAccountTokenActivityArgs,
  ): Promise<GetAccountTokenActivityResponse> {
    return this.tokensAPI.getAccountTokenActivity(address, args)
  }

  /**
   * Fetch paginated holders for a token, including quantity held, USD value,
   * and aggregate distribution health (STRONG | HEALTHY | CONCERNING | BAD).
   */
  public async getTokenHolders(
    chain: Chain,
    address: string,
    args?: TokenHoldersArgs,
  ): Promise<TokenHoldersResponse> {
    return this.tokensAPI.getTokenHolders(chain, address, args)
  }

  /**
   * Fetch liquidity pools for a token (pool type, USD reserves, and
   * bonding-curve progress / graduation flag where applicable).
   */
  public async getTokenLiquidityPools(
    chain: Chain,
    address: string,
    args?: TokenLiquidityPoolsArgs,
  ): Promise<TokenLiquidityPoolsResponse> {
    return this.tokensAPI.getTokenLiquidityPools(chain, address, args)
  }

  /**
   * Fetch multiple NFTs in a single request.
   */
  public async getNFTsBatch(
    request: BatchNftsRequest,
  ): Promise<NftBatchResponse> {
    return this.nftsAPI.getNFTsBatch(request)
  }

  /**
   * Fetch owners of an NFT.
   */
  public async getNFTOwners(
    address: string,
    identifier: string,
    chain: Chain = this.chain,
    args?: NFTOwnersArgs,
  ): Promise<OwnersPaginatedResponse> {
    return this.nftsAPI.getNFTOwners(address, identifier, chain, args)
  }

  /**
   * Fetch analytics (historical sale points) for an NFT.
   */
  public async getNFTAnalytics(
    address: string,
    identifier: string,
    chain: Chain = this.chain,
  ): Promise<NftAnalyticsResponse> {
    return this.nftsAPI.getNFTAnalytics(address, identifier, chain)
  }

  /**
   * Fetch multiple collections in a single request by slug.
   */
  public async getCollectionsBatch(
    request: BatchCollectionsRequest,
  ): Promise<CollectionBatchResponse> {
    return this.collectionsAPI.getCollectionsBatch(request)
  }

  /**
   * Fetch top offers for a collection grouped by price level.
   */
  public async getCollectionOfferAggregates(
    slug: string,
    args?: PaginatedAnalyticsArgs,
  ): Promise<CollectionOfferAggregatesPaginatedResponse> {
    return this.collectionsAPI.getCollectionOfferAggregates(slug, args)
  }

  /**
   * Fetch holders of a collection.
   */
  public async getCollectionHolders(
    slug: string,
    args?: CollectionHoldersArgs,
  ): Promise<CollectionHoldersPaginatedResponse> {
    return this.collectionsAPI.getCollectionHolders(slug, args)
  }

  /**
   * Fetch the floor-price history of a collection.
   */
  public async getCollectionFloorPrices(
    slug: string,
    args?: CollectionFloorPricesArgs,
  ): Promise<FloorPriceHistoryResponse> {
    return this.collectionsAPI.getCollectionFloorPrices(slug, args)
  }

  /**
   * Get ordered approval + sign actions to create one or more listings.
   */
  public async createListingActions(
    request: CreateListingActionsRequest,
  ): Promise<CreateListingActionsResponse> {
    return this.listingsAPI.createListingActions(request)
  }

  /**
   * Build a deploy-contract transaction for a new drop.
   */
  public async deployDropContract(
    request: DropDeployRequest,
  ): Promise<DropDeployResponse> {
    return this.dropsAPI.deployDropContract(request)
  }

  /**
   * Get the receipt of a previously submitted drop-deploy transaction.
   */
  public async getDeployContractReceipt(
    chain: Chain,
    txHash: string,
  ): Promise<DropDeployReceiptResponse> {
    return this.dropsAPI.getDeployReceipt(chain, txHash)
  }

  /**
   * Build transactions to transfer NFTs or tokens between wallets.
   */
  public async transferAssets(
    request: TransferRequest,
  ): Promise<TransferResponse> {
    return this.assetsAPI.transferAssets(request)
  }

  /**
   * Get portfolio stats (net worth, P&L) for an account.
   */
  public async getPortfolioStats(
    address: string,
    args?: PortfolioArgs,
  ): Promise<PortfolioStatsResponse> {
    return this.accountsAPI.getPortfolioStats(address, args)
  }

  /**
   * Get portfolio net-worth history for an account.
   */
  public async getPortfolioHistory(
    address: string,
    args?: PortfolioArgs,
  ): Promise<PortfolioHistoryResponse> {
    return this.accountsAPI.getPortfolioHistory(address, args)
  }

  /**
   * Get offers received by an account.
   */
  public async getProfileOffersReceived(
    address: string,
    args?: ProfileOrdersArgs,
  ): Promise<ProfileOffersResponse> {
    return this.accountsAPI.getProfileOffersReceived(address, args)
  }

  /**
   * Get active offers made by an account.
   */
  public async getProfileOffers(
    address: string,
    args?: ProfileOrdersArgs,
  ): Promise<ProfileOffersResponse> {
    return this.accountsAPI.getProfileOffers(address, args)
  }

  /**
   * Get active listings for an account.
   */
  public async getProfileListings(
    address: string,
    args?: ProfileOrdersArgs,
  ): Promise<ProfileListingsResponse> {
    return this.accountsAPI.getProfileListings(address, args)
  }

  /**
   * Get items favorited by an account.
   */
  public async getProfileFavorites(
    address: string,
    args?: ProfileFavoritesArgs,
  ): Promise<ProfileFavoritesResponse> {
    return this.accountsAPI.getProfileFavorites(address, args)
  }

  /**
   * Get collections owned by an account.
   */
  public async getProfileCollections(
    address: string,
    args?: ProfileCollectionsArgs,
  ): Promise<ProfileCollectionsResponse> {
    return this.accountsAPI.getProfileCollections(address, args)
  }

  /**
   * Get aggregated trading P&L (realized + unrealized) for an account.
   */
  public async getWalletPnl(address: string): Promise<WalletPnlResponse> {
    return this.accountsAPI.getWalletPnl(address)
  }

  /**
   * Get closed (realized) trading positions for an account.
   */
  public async getWalletClosedPositions(
    address: string,
    args?: WalletClosedPositionsArgs,
  ): Promise<ClosedPositionsResponse> {
    return this.accountsAPI.getWalletClosedPositions(address, args)
  }

  /**
   * Get the token transfers contributing to a wallet's position in a currency.
   */
  public async getWalletTokenTransfers(
    address: string,
    args: WalletTokenTransfersArgs,
  ): Promise<PositionTokenTransfersResponse> {
    return this.accountsAPI.getWalletTokenTransfers(address, args)
  }

  /**
   * Generic fetch method for any API endpoint with automatic rate limit retry
   * @param apiPath Path to URL endpoint under API
   * @param query URL query params. Will be used to create a URLSearchParams object.
   * @param options Request options like timeout and abort signal.
   * @returns @typeParam T The response from the API.
   */
  public async get<T>(
    apiPath: string,
    query: object = {},
    options?: RequestOptions,
  ): Promise<Camelize<T>> {
    return executeWithRateLimit(
      async () => {
        // Snakeize query keys so consumers can pass camelCase args even
        // though the API expects snake_case URL params.
        const qs = this.objectToSearchParams(snakeizeKeysDeep(query))
        const url = qs
          ? `${this.apiBaseUrl}${apiPath}?${qs}`
          : `${this.apiBaseUrl}${apiPath}`
        const raw = await this._fetch(url, "GET", undefined, undefined, options)
        return this.camelizeResponseBody<T>(raw, options)
      },
      { logger: this.logger, signal: options?.signal },
    )
  }

  /**
   * Generic post method for any API endpoint with automatic rate limit retry
   * @param apiPath Path to URL endpoint under API
   * @param body Data to send.
   * @param headers Additional headers to send with the request.
   * @param options Request options. Includes the {@link PostOptions.snakeizeBody}
   *                opt-out (defaults to `true`) for callers that need to emit
   *                the body in exact wire shape (e.g. Seaport-shaped POSTs
   *                whose inner keys are camelCase on the wire).
   * @returns @typeParam T The response from the API.
   */
  public async post<T>(
    apiPath: string,
    body?: object,
    headers?: object,
    options?: PostOptions,
  ): Promise<Camelize<T>> {
    return this.request("POST", apiPath, body, headers, options)
  }

  /** Send a typed JSON request to a write endpoint. */
  public async request<T>(
    method: HttpMethod,
    apiPath: string,
    body?: object,
    headers?: object,
    options?: PostOptions,
  ): Promise<Camelize<T>> {
    return executeWithRateLimit(
      async () => {
        const url = `${this.apiBaseUrl}${apiPath}`
        // Snakeize the body so consumers can pass camelCase even though the
        // API expects snake_case JSON. Opt-out via `snakeizeBody: false` for
        // Seaport-shaped bodies whose inner keys must remain camelCase on the
        // wire (the OpenSea OpenAPI spec uses mixed casing for these).
        const shouldSnakeize = options?.snakeizeBody !== false
        const wireBody =
          body == null || !shouldSnakeize ? body : snakeizeKeysDeep(body)
        const raw = await this._fetch(url, method, headers, wireBody, options)
        return this.camelizeResponseBody<T>(raw, options)
      },
      { logger: this.logger, signal: options?.signal },
    )
  }

  /**
   * Camelize a response body unless the caller opted out via
   * {@link RequestOptions.camelizeResponse}, which endpoints keyed by data
   * rather than field names (e.g. traits) rely on to keep their keys intact.
   *
   * Shared by `get` and `request` so the option cannot silently do nothing on
   * one verb.
   */
  private camelizeResponseBody<T>(
    raw: unknown,
    options?: RequestOptions,
  ): Camelize<T> {
    return options?.camelizeResponse === false
      ? (raw as Camelize<T>)
      : (camelizeKeysDeep(raw) as Camelize<T>)
  }

  private objectToSearchParams(params: object = {}) {
    const urlSearchParams = new URLSearchParams()

    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(item => {
          if (item != null) {
            urlSearchParams.append(key, String(item))
          }
        })
      } else if (value != null) {
        urlSearchParams.append(key, String(value))
      }
    })

    return urlSearchParams.toString()
  }

  /**
   * Fetch from an API Endpoint, sending auth token in headers
   * @param url The URL to fetch
   * @param method HTTP method to use.
   * @param headers Additional headers to send with the request
   * @param body Optional JSON body to send.
   * @param options Request options like timeout and abort signal
   */
  private async _fetch(
    url: string,
    method: "GET" | HttpMethod,
    headers?: object,
    body?: object,
    options?: RequestOptions,
  ) {
    const mergedHeaders: Record<string, string> = {
      // Kept as "opensea-js" for server-side analytics continuity after package rename
      "x-app-id": "opensea-js",
      ...(this.apiKey ? { "X-API-KEY": this.apiKey } : {}),
      ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      ...(body != null ? { "Content-Type": "application/json" } : {}),
      ...headers,
    }

    const sanitizedHeaders = { ...mergedHeaders }
    delete sanitizedHeaders["X-API-KEY"]
    delete sanitizedHeaders.Authorization
    this.logger(
      `Sending request: ${url} ${JSON.stringify({
        method,
        headers: sanitizedHeaders,
        body: body != null ? JSON.stringify(body, null, 2) : undefined,
      })}`,
    )

    // Build abort signal (merge timeout + user-provided signal)
    let controller: AbortController | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let userAbortHandler: (() => void) | undefined
    let signal = options?.signal
    if (options?.timeout !== undefined) {
      const ctrl = new AbortController()
      controller = ctrl
      timeoutId = setTimeout(() => ctrl.abort(), options.timeout)
      // If user provided their own signal, abort ours if theirs fires
      if (options.signal) {
        if (options.signal.aborted) {
          clearTimeout(timeoutId)
          throw new Error("Request aborted")
        }
        userAbortHandler = () => {
          ctrl.abort()
          clearTimeout(timeoutId)
        }
        options.signal.addEventListener("abort", userAbortHandler)
      }
      signal = controller.signal
    } else if (options?.signal?.aborted) {
      throw new Error("Request aborted")
    }

    try {
      const response = await fetch(url, {
        method,
        headers: mergedHeaders,
        body: body != null ? JSON.stringify(body) : undefined,
        signal,
      })

      if (!response.ok) {
        // Handle rate limit errors (429 Too Many Requests and 599 custom rate limit)
        if (response.status === 599 || response.status === 429) {
          throw await this._createRateLimitError(response)
        }
        const rawBody = await response.json().catch(() => ({}))
        const responseBody = camelizeKeysDeep(rawBody) as {
          errors?: { length?: number } | unknown[]
        }
        const errors = responseBody?.errors as
          | { length?: number }
          | unknown[]
          | undefined
        if (errors?.length !== undefined && errors.length > 0) {
          // Handle both string entries (`["not found"]`) and structured ones
          // (`[{code: "invalid_param", message: "..."}]`) — String() on an
          // object yields "[object Object]", so JSON-stringify any non-string
          // element individually before joining.
          const errorMessage = Array.isArray(errors)
            ? errors
                .map(e => (typeof e === "string" ? e : JSON.stringify(e)))
                .join(", ")
            : typeof errors === "string"
              ? errors
              : JSON.stringify(errors)
          throw new Error(`Server Error: ${errorMessage}`)
        }
        throw new Error(
          `Server Error (${response.status}): ${response.statusText}`,
        )
      }
      if (
        response.status === 204 ||
        response.headers.get("content-length") === "0"
      ) {
        return undefined
      }
      const text = await response.text()
      return text.length > 0 ? JSON.parse(text) : undefined
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
      if (userAbortHandler && options?.signal) {
        options.signal.removeEventListener("abort", userAbortHandler)
      }
    }
  }

  /**
   * Request a free-tier OpenSea API key without authentication. The returned
   * key is valid for 7 days and can be passed into the {@link OpenSeaAPI} or
   * {@link BaseOpenSeaSDK} constructors as `apiKey`.
   *
   * @example
   * ```ts
   * const { apiKey } = await OpenSeaAPI.requestInstantApiKey()
   * const api = new OpenSeaAPI({ apiKey })
   * ```
   *
   * @param apiBaseUrl Optional base URL override (defaults to mainnet).
   * @returns The {@link RequestInstantApiKeyResponse} containing the new key,
   *          with response keys camelized to match SDK conventions.
   */
  public static async requestInstantApiKey(
    apiBaseUrl: string = API_BASE_MAINNET,
  ): Promise<RequestInstantApiKeyResponse> {
    const response = await fetch(`${apiBaseUrl}${getInstantApiKeyPath()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app-id": "opensea-js",
      },
      body: "{}",
    })
    if (!response.ok) {
      throw new Error(
        `Server Error (${response.status}): ${response.statusText}`,
      )
    }
    const raw = await response.json()
    return camelizeKeysDeep(raw) as RequestInstantApiKeyResponse
  }

  /**
   * Maximum retry-after value in seconds (5 minutes).
   * Prevents excessively long waits from buggy or malicious servers.
   */
  private static readonly MAX_RETRY_AFTER_SECONDS = 300

  /**
   * Parses the retry-after header from the response with robust error handling.
   * @param response The HTTP response object from the API
   * @returns The retry-after value in seconds (capped at 5 minutes), or undefined if not present or invalid
   */
  private _parseRetryAfter(response: Response): number | undefined {
    const retryAfterHeader = response.headers.get("retry-after")
    if (retryAfterHeader) {
      const trimmed = retryAfterHeader.trim()

      // If it starts with a digit or minus sign, treat as numeric
      if (/^-?\d/.test(trimmed)) {
        // Only accept fully numeric integer values, reject malformed inputs like "5s" or "1.5"
        if (!/^-?\d+$/.test(trimmed)) {
          return undefined
        }
        const parsedSeconds = Number(trimmed)
        if (!Number.isSafeInteger(parsedSeconds) || parsedSeconds <= 0) {
          return undefined
        }
        return Math.min(parsedSeconds, OpenSeaAPI.MAX_RETRY_AFTER_SECONDS)
      }

      // Otherwise, try to parse as HTTP-date
      const parsedDateMs = Date.parse(trimmed)
      if (Number.isNaN(parsedDateMs)) {
        return undefined
      }
      const diffSeconds = Math.ceil((parsedDateMs - Date.now()) / 1000)
      if (diffSeconds <= 0) {
        return undefined
      }
      return Math.min(diffSeconds, OpenSeaAPI.MAX_RETRY_AFTER_SECONDS)
    }
    return undefined
  }

  /**
   * Creates a rate limit error with status code and retry-after information.
   * This is async because it attempts to parse the response body. If the body
   * is malformed JSON, responseBody will be undefined (intentional — the error
   * itself is more important than the body).
   * @param response The HTTP response object from the API
   * @returns An enhanced Error object with statusCode, retryAfter and responseBody properties
   */
  private async _createRateLimitError(
    response: Response,
  ): Promise<OpenSeaRateLimitError> {
    const retryAfter = this._parseRetryAfter(response)
    const error = new Error(
      `${response.status} ${response.statusText}`,
    ) as OpenSeaRateLimitError

    // Add status code and retry-after information to the error object
    error.statusCode = response.status
    error.retryAfter = retryAfter
    const rawBody = await response.json().catch(() => undefined)
    error.responseBody =
      rawBody === undefined ? undefined : camelizeKeysDeep(rawBody)
    return error
  }
}
