import type {
  ConsiderationInputItem,
  CreateInputItem,
  OrderComponents,
} from "@opensea/seaport-js/lib/types"
import type { CollectionOffer, Listing, NFT, Offer } from "../api/types"
import { INVERSE_BASIS_POINT, ZERO_ADDRESS } from "../constants"
import { executeApprovalsAndGetOrderComponents } from "../orders/orderUseCase"
import type { ProtocolData } from "../orders/types"
import {
  type Amount,
  type AssetWithTokenId,
  type Fee,
  type OpenSeaCollection,
  OrderSide,
  type TokenStandard,
} from "../types"
import { oneMonthFromNowInSeconds } from "../utils/dateHelper"
import { pluralize } from "../utils/stringHelper"
import {
  basisPointsForFee,
  getAssetItemType,
  getFeeRecipient,
  getListingPaymentToken,
  getOfferPaymentToken,
  getSignedZone,
  remapSharedStorefrontAddress,
  totalBasisPointsForFees,
} from "../utils/utils"
import type { SDKContext } from "./context"

/**
 * Result type for bulk operations that may partially succeed.
 * Contains successfully submitted orders and any failures with error information.
 *
 * Generic in the success type so listing-side callers see {@link Listing}[] and
 * offer-side callers see {@link Offer}[].
 */
export interface BulkOrderResult<T extends Listing | Offer = Listing | Offer> {
  /** Successfully submitted orders */
  successful: T[]
  /** Failed order submissions with error information */
  failed: Array<{
    /** Index of the failed order in the original input array */
    index: number
    /**
     * The signed order that failed to submit. When a bulk call received a
     * single order and creating it threw, there is nothing signed to report
     * and this is an empty object rather than a real order, so check for the
     * seaport fields before reading them.
     */
    order?: ProtocolData
    /** The error that occurred during submission */
    error: Error
  }>
}

/**
 * Normalizes a caller-supplied salt for seaport-js.
 *
 * seaport-js only generates a salt when the field is `undefined`, and that
 * generated salt carries the domain tag (the first four bytes of
 * `keccak256(domain)`) used for onchain attribution. Any defined value,
 * including `0`, suppresses both. So an omitted salt has to stay omitted all
 * the way through, and an explicit `0` has to survive as `"0"`.
 */
function normalizeSalt(salt: Amount | undefined): string | undefined {
  return salt !== undefined ? BigInt(salt).toString() : undefined
}

/**
 * Manager for order building and creation operations.
 * Handles listing creation, offer creation, and collection offers.
 */
export class OrdersManager {
  constructor(
    private context: SDKContext,
    private getPriceParametersCallback: (
      orderSide: OrderSide,
      tokenAddress: string,
      amount: Amount,
    ) => Promise<{ basePrice: bigint }>,
  ) {}

  private getAmountWithBasisPointsApplied(
    amount: bigint,
    basisPoints: bigint,
  ): string {
    return ((amount * basisPoints) / INVERSE_BASIS_POINT).toString()
  }

  private isNotMarketplaceFee(fee: Fee): boolean {
    return (
      fee.recipient.toLowerCase() !==
      getFeeRecipient(this.context.chain).toLowerCase()
    )
  }

  private getNFTItems(
    nfts: NFT[],
    quantities: bigint[] = [],
  ): CreateInputItem[] {
    return nfts.map((nft, index) => ({
      itemType: getAssetItemType(
        nft.tokenStandard.toUpperCase() as TokenStandard,
      ),
      token: remapSharedStorefrontAddress(nft.contract),
      identifier: nft.identifier ?? undefined,
      amount: quantities[index]?.toString() ?? "1",
    }))
  }

  private resolveOfferPaymentToken(collection: OpenSeaCollection): string {
    const paymentTokenAddress =
      collection.pricingCurrencies?.offerCurrency?.address
    if (
      paymentTokenAddress == null ||
      paymentTokenAddress.toLowerCase() === ZERO_ADDRESS
    ) {
      return getOfferPaymentToken(this.context.chain)
    }
    return paymentTokenAddress
  }

  private async getFees({
    collection,
    seller,
    paymentTokenAddress,
    amount,
    includeOptionalCreatorFees = false,
    isPrivateListing = false,
  }: {
    collection: OpenSeaCollection
    seller?: string
    paymentTokenAddress: string
    amount: bigint
    includeOptionalCreatorFees?: boolean
    isPrivateListing?: boolean
  }): Promise<ConsiderationInputItem[]> {
    let collectionFees = includeOptionalCreatorFees
      ? collection.fees
      : collection.fees.filter(fee => fee.required)
    if (isPrivateListing) {
      collectionFees = collectionFees.filter(fee =>
        this.isNotMarketplaceFee(fee),
      )
    }
    const collectionFeesBasisPoints = totalBasisPointsForFees(collectionFees)
    const sellerBasisPoints = INVERSE_BASIS_POINT - collectionFeesBasisPoints

    const getConsiderationItem = (basisPoints: bigint, recipient?: string) => {
      return {
        token: paymentTokenAddress,
        amount: this.getAmountWithBasisPointsApplied(amount, basisPoints),
        recipient,
      }
    }

    const considerationItems: ConsiderationInputItem[] = []

    if (seller) {
      considerationItems.push(getConsiderationItem(sellerBasisPoints, seller))
    }
    if (collectionFeesBasisPoints > 0) {
      for (const fee of collectionFees) {
        considerationItems.push(
          getConsiderationItem(basisPointsForFee(fee), fee.recipient),
        )
      }
    }
    return considerationItems
  }

  /**
   * The single-order path a bulk call takes when it receives exactly one
   * order. A bulk signature costs more to decode onchain because of the merkle
   * proof, so one order goes through the normal single-order signature.
   */
  private async createOneForBulk<T extends Listing | Offer>(
    create: () => Promise<T>,
    continueOnError: boolean,
  ): Promise<BulkOrderResult<T>> {
    try {
      const order = await create()
      return {
        successful: [order],
        failed: [],
      }
    } catch (error) {
      if (continueOnError) {
        return {
          successful: [],
          failed: [
            {
              index: 0,
              order: {} as ProtocolData, // Order wasn't created
              error: error as Error,
            },
          ],
        }
      }
      throw error
    }
  }

  /**
   * Submits bulk-signed orders to the OpenSea API one at a time and collects
   * the outcome. Rate limiting is handled by the API client.
   *
   * Shared by createBulkListings and createBulkOffers so that submission
   * ordering, continueOnError and progress reporting cannot drift apart
   * between the two.
   */
  private async submitBulkSignedOrders<T extends Listing | Offer>({
    orders,
    noun,
    post,
    continueOnError,
    onProgress,
  }: {
    orders: ProtocolData[]
    noun: string
    post: (order: ProtocolData) => Promise<T>
    continueOnError: boolean
    onProgress?: (completed: number, total: number) => void
  }): Promise<BulkOrderResult<T>> {
    this.context.logger(
      `Starting submission of ${orders.length} bulk-signed ${pluralize(orders.length, noun)} to OpenSea API...`,
    )

    const submittedOrders: T[] = []
    const failedOrders: BulkOrderResult["failed"] = []

    for (let i = 0; i < orders.length; i++) {
      this.context.logger(`Submitting ${noun} ${i + 1}/${orders.length}...`)
      try {
        const submittedOrder = await post(orders[i])
        submittedOrders.push(submittedOrder)
        this.context.logger(`Completed ${noun} ${i + 1}/${orders.length}`)
      } catch (error) {
        const errorMessage = (error as Error).message
        this.context.logger(
          `Failed ${noun} ${i + 1}/${orders.length}: ${errorMessage}`,
        )
        failedOrders.push({
          index: i,
          order: orders[i],
          error: error as Error,
        })

        // If not continuing on error, throw immediately
        if (!continueOnError) {
          throw error
        }
      }

      // Reached for each order that finished, submitted or failed. A failure
      // with continueOnError false throws above and is never reported here.
      onProgress?.(i + 1, orders.length)
    }

    if (submittedOrders.length > 0) {
      this.context.logger(
        `Successfully submitted ${submittedOrders.length}/${orders.length} ${pluralize(submittedOrders.length, noun)}`,
      )
    }

    if (failedOrders.length > 0) {
      this.context.logger(
        `Failed to submit ${failedOrders.length}/${orders.length} ${pluralize(failedOrders.length, noun)}`,
      )
    }

    return {
      successful: submittedOrders,
      failed: failedOrders,
    }
  }

  /**
   * Build listing order without submitting to API
   * @param options Listing parameters
   * @returns The seaport-js use case. Call `executeAllActions()` to approve and
   * sign it for API submission, or
   * {@link executeApprovalsAndGetOrderComponents} to approve it without a
   * signature for onchain validation.
   */
  private async _buildListingOrder({
    asset,
    accountAddress,
    amount,
    quantity = 1,
    domain,
    salt,
    listingTime,
    expirationTime,
    buyerAddress,
    includeOptionalCreatorFees = false,
    zone = ZERO_ADDRESS,
  }: {
    asset: AssetWithTokenId
    accountAddress: string
    amount: Amount
    quantity?: Amount
    domain?: string
    salt?: Amount
    listingTime?: number
    expirationTime?: number
    buyerAddress?: string
    includeOptionalCreatorFees?: boolean
    zone?: string
  }) {
    await this.context.requireAccountIsAvailable(accountAddress)

    const { nft } = await this.context.api.nfts.getNFT(
      asset.tokenAddress,
      asset.tokenId,
    )
    const offerAssetItems = this.getNFTItems([nft], [BigInt(quantity ?? 1)])

    const collection = await this.context.api.collections.getCollection(
      nft.collection,
    )

    const paymentTokenAddress =
      collection.pricingCurrencies?.listingCurrency?.address ??
      getListingPaymentToken(this.context.chain)

    const { basePrice } = await this.getPriceParametersCallback(
      OrderSide.LISTING,
      paymentTokenAddress,
      amount,
    )

    const considerationFeeItems = await this.getFees({
      collection,
      seller: accountAddress,
      paymentTokenAddress,
      amount: basePrice,
      includeOptionalCreatorFees,
      isPrivateListing: !!buyerAddress,
    })

    if (buyerAddress) {
      const { getPrivateListingConsiderations } = await import(
        "../orders/privateListings"
      )
      considerationFeeItems.push(
        ...getPrivateListingConsiderations(offerAssetItems, buyerAddress),
      )
    }

    if (collection.requiredZone) {
      zone = collection.requiredZone
    }

    return this.context.seaport.createOrder(
      {
        offer: offerAssetItems,
        consideration: considerationFeeItems,
        startTime: listingTime?.toString(),
        endTime:
          expirationTime?.toString() ?? oneMonthFromNowInSeconds().toString(),
        zone,
        domain,
        salt: normalizeSalt(salt),
        restrictedByZone: zone !== ZERO_ADDRESS,
        allowPartialFills: true,
      },
      accountAddress,
    )
  }

  /**
   * Build listing order components without submitting to API.
   *
   * Runs any token approvals the order needs, but does not ask the wallet to
   * sign: the components are meant for onchain validation, which needs no
   * offchain signature.
   *
   * @param options Listing parameters
   * @returns OrderComponents ready for onchain validation
   */
  async buildListingOrderComponents({
    asset,
    accountAddress,
    amount,
    quantity = 1,
    domain,
    salt,
    listingTime,
    expirationTime,
    buyerAddress,
    includeOptionalCreatorFees = false,
    zone = ZERO_ADDRESS,
  }: {
    asset: AssetWithTokenId
    accountAddress: string
    amount: Amount
    quantity?: Amount
    domain?: string
    salt?: Amount
    listingTime?: number
    expirationTime?: number
    buyerAddress?: string
    includeOptionalCreatorFees?: boolean
    zone?: string
  }): Promise<OrderComponents> {
    const useCase = await this._buildListingOrder({
      asset,
      accountAddress,
      amount,
      quantity,
      domain,
      salt,
      listingTime,
      expirationTime,
      buyerAddress,
      includeOptionalCreatorFees,
      zone,
    })
    return executeApprovalsAndGetOrderComponents(useCase)
  }

  /**
   * Build offer order without submitting to API
   * @param options Offer parameters
   * @returns OrderWithCounter ready for API submission or onchain validation
   */
  private async _buildOfferOrder({
    asset,
    accountAddress,
    amount,
    quantity = 1,
    domain,
    salt,
    expirationTime,
    zone = getSignedZone(this.context.chain),
  }: {
    asset: AssetWithTokenId
    accountAddress: string
    amount: Amount
    quantity?: Amount
    domain?: string
    salt?: Amount
    expirationTime?: Amount
    zone?: string
  }) {
    await this.context.requireAccountIsAvailable(accountAddress)

    const { nft } = await this.context.api.nfts.getNFT(
      asset.tokenAddress,
      asset.tokenId,
    )
    const considerationAssetItems = this.getNFTItems(
      [nft],
      [BigInt(quantity ?? 1)],
    )

    const collection = await this.context.api.collections.getCollection(
      nft.collection,
    )

    const paymentTokenAddress = this.resolveOfferPaymentToken(collection)

    const { basePrice } = await this.getPriceParametersCallback(
      OrderSide.OFFER,
      paymentTokenAddress,
      amount,
    )

    const considerationFeeItems = await this.getFees({
      collection,
      paymentTokenAddress,
      amount: basePrice,
    })

    if (collection.requiredZone) {
      zone = collection.requiredZone
    }

    return this.context.seaport.createOrder(
      {
        offer: [
          {
            token: paymentTokenAddress,
            amount: basePrice.toString(),
          },
        ],
        consideration: [...considerationAssetItems, ...considerationFeeItems],
        endTime:
          expirationTime !== undefined
            ? BigInt(expirationTime).toString()
            : oneMonthFromNowInSeconds().toString(),
        zone,
        domain,
        salt: normalizeSalt(salt),
        restrictedByZone: zone !== ZERO_ADDRESS,
        allowPartialFills: true,
      },
      accountAddress,
    )
  }

  /**
   * Build offer order components without submitting to API.
   *
   * Runs any token approvals the order needs, but does not ask the wallet to
   * sign: the components are meant for onchain validation, which needs no
   * offchain signature.
   *
   * @param options Offer parameters
   * @returns OrderComponents ready for onchain validation
   */
  async buildOfferOrderComponents({
    asset,
    accountAddress,
    amount,
    quantity = 1,
    domain,
    salt,
    expirationTime,
    zone = getSignedZone(this.context.chain),
  }: {
    asset: AssetWithTokenId
    accountAddress: string
    amount: Amount
    quantity?: Amount
    domain?: string
    salt?: Amount
    expirationTime?: Amount
    zone?: string
  }): Promise<OrderComponents> {
    const useCase = await this._buildOfferOrder({
      asset,
      accountAddress,
      amount,
      quantity,
      domain,
      salt,
      expirationTime,
      zone,
    })
    return executeApprovalsAndGetOrderComponents(useCase)
  }

  /**
   * Create and submit an offer on an asset.
   * @param options
   * @param options.asset The asset to trade. tokenAddress and tokenId must be defined.
   * @param options.accountAddress Address of the wallet making the offer.
   * @param options.amount Amount in decimal format (e.g., "1.5" for 1.5 ETH, not wei). Automatically converted to base units.
   * @param options.quantity Number of assets to bid for. Defaults to 1.
   * @param options.domain Optional domain for onchain attribution. Hashed and included in salt.
   * @param options.salt Arbitrary salt. Auto-generated if not provided.
   * @param options.expirationTime Expiration time for the order, in UTC seconds
   * @param options.zone Zone for order protection. Defaults to chain's signed zone.
   *
   * @returns The {@link Offer} that was created.
   *
   * @throws Error if the asset does not contain a token id.
   * @throws Error if the accountAddress is not available through wallet or provider.
   * @throws Error if the amount is not greater than 0.
   */
  async createOffer({
    asset,
    accountAddress,
    amount,
    quantity = 1,
    domain,
    salt,
    expirationTime,
    zone = getSignedZone(this.context.chain),
  }: {
    asset: AssetWithTokenId
    accountAddress: string
    amount: Amount
    quantity?: Amount
    domain?: string
    salt?: Amount
    expirationTime?: Amount
    zone?: string
  }): Promise<Offer> {
    const useCase = await this._buildOfferOrder({
      asset,
      accountAddress,
      amount,
      quantity,
      domain,
      salt,
      expirationTime,
      zone,
    })
    const order = await useCase.executeAllActions()

    return this.context.api.orders.postOffer(
      order,
      this.context.seaport.contract.target as string,
    )
  }

  /**
   * Create and submit a listing for an asset.
   * @param options
   * @param options.asset The asset to trade. tokenAddress and tokenId must be defined.
   * @param options.accountAddress  Address of the wallet making the listing
   * @param options.amount Amount in decimal format (e.g., "1.5" for 1.5 ETH, not wei). Automatically converted to base units.
   * @param options.quantity Number of assets to list. Defaults to 1.
   * @param options.domain Optional domain for onchain attribution. Hashed and included in the salt.
   * @param options.salt Arbitrary salt. Auto-generated if not provided.
   * @param options.listingTime Optional time when the order will become fulfillable, in UTC seconds. Undefined means it will start now.
   * @param options.expirationTime Expiration time for the order, in UTC seconds.
   * @param options.buyerAddress Optional address that's allowed to purchase this item. If specified, no other address will be able to take the order, unless its value is the null address.
   * @param options.includeOptionalCreatorFees If true, optional creator fees will be included in the listing. Default: false.
   * @param options.zone Zone for order protection. Defaults to no zone.
   * @returns The {@link Listing} that was created.
   *
   * @throws Error if the asset does not contain a token id.
   * @throws Error if the accountAddress is not available through wallet or provider.
   * @throws Error if the amount is not greater than 0.
   */
  async createListing({
    asset,
    accountAddress,
    amount,
    quantity = 1,
    domain,
    salt,
    listingTime,
    expirationTime,
    buyerAddress,
    includeOptionalCreatorFees = false,
    zone = ZERO_ADDRESS,
  }: {
    asset: AssetWithTokenId
    accountAddress: string
    amount: Amount
    quantity?: Amount
    domain?: string
    salt?: Amount
    listingTime?: number
    expirationTime?: number
    buyerAddress?: string
    includeOptionalCreatorFees?: boolean
    zone?: string
  }): Promise<Listing> {
    const useCase = await this._buildListingOrder({
      asset,
      accountAddress,
      amount,
      quantity,
      domain,
      salt,
      listingTime,
      expirationTime,
      buyerAddress,
      includeOptionalCreatorFees,
      zone,
    })
    const order = await useCase.executeAllActions()

    return this.context.api.orders.postListing(
      order,
      this.context.seaport.contract.target as string,
    )
  }

  /**
   * Create and submit multiple listings using Seaport's bulk order creation.
   * This method uses a single signature for all listings and submits them individually to the OpenSea API with rate limit handling.
   * All listings must be from the same account address.
   *
   * With a single listing, this uses a normal order signature instead of a bulk signature,
   * since bulk signatures cost more to verify onchain (merkle proof).
   *
   * @param options
   * @param options.listings Array of listing parameters. Each listing requires asset, amount, and optionally other listing parameters.
   * @param options.accountAddress Address of the wallet making the listings
   * @param options.continueOnError If true, continue submitting remaining listings even if some fail. Default: false (throw on first error).
   * @param options.onProgress Optional callback for progress updates. Called after each
   *   listing that finishes, whether it succeeded or failed. A failure when `continueOnError`
   *   is false throws instead, so that listing is never reported.
   * @returns {@link BulkOrderResult} containing successful orders and any failures.
   *
   * @throws Error if listings array is empty
   * @throws Error if the accountAddress is not available through wallet or provider.
   * @throws Error if any asset does not contain a token id.
   * @throws Error if continueOnError is false and any submission fails.
   */
  async createBulkListings({
    listings,
    accountAddress,
    continueOnError = false,
    onProgress,
  }: {
    listings: Array<{
      asset: AssetWithTokenId
      amount: Amount
      quantity?: Amount
      domain?: string
      salt?: Amount
      listingTime?: number
      expirationTime?: number
      buyerAddress?: string
      includeOptionalCreatorFees?: boolean
      zone?: string
    }>
    accountAddress: string
    continueOnError?: boolean
    onProgress?: (completed: number, total: number) => void
  }): Promise<BulkOrderResult<Listing>> {
    if (listings.length === 0) {
      throw new Error("Listings array cannot be empty")
    }

    // If only one listing, use normal signature to avoid bulk signature overhead
    if (listings.length === 1) {
      return this.createOneForBulk(
        () => this.createListing({ ...listings[0], accountAddress }),
        continueOnError,
      )
    }

    await this.context.requireAccountIsAvailable(accountAddress)

    // Build metadata array for each listing
    const listingMetadata: Array<{
      nft: NFT
      collection: OpenSeaCollection
      paymentTokenAddress: string
      basePrice: bigint
      zone: string
      domain?: string
      salt?: Amount
      listingTime?: number
      expirationTime?: number
    }> = []

    // Build all order inputs
    for (const listing of listings) {
      const {
        asset,
        amount,
        domain,
        salt,
        listingTime,
        expirationTime,
        zone = ZERO_ADDRESS,
      } = listing

      // Fetch NFT and collection data
      const { nft } = await this.context.api.nfts.getNFT(
        asset.tokenAddress,
        asset.tokenId,
      )
      const collection = await this.context.api.collections.getCollection(
        nft.collection,
      )

      const paymentTokenAddress =
        collection.pricingCurrencies?.listingCurrency?.address ??
        getListingPaymentToken(this.context.chain)

      // Priced here, in input order, so a bad amount throws on the first
      // offending listing rather than out of the Promise.all below.
      const { basePrice } = await this.getPriceParametersCallback(
        OrderSide.LISTING,
        paymentTokenAddress,
        amount,
      )

      let finalZone = zone
      if (collection.requiredZone) {
        finalZone = collection.requiredZone
      }

      listingMetadata.push({
        nft,
        collection,
        paymentTokenAddress,
        basePrice,
        zone: finalZone,
        domain,
        salt,
        listingTime,
        expirationTime,
      })
    }

    // Create the bulk orders using seaport's createBulkOrders method
    const createOrderInputsForSeaport = listings.map(async (listing, index) => {
      const {
        quantity = 1,
        listingTime,
        expirationTime,
        buyerAddress,
        includeOptionalCreatorFees = false,
      } = listing

      const metadata = listingMetadata[index]
      const offerAssetItems = this.getNFTItems(
        [metadata.nft],
        [BigInt(quantity ?? 1)],
      )

      const considerationFeeItems = await this.getFees({
        collection: metadata.collection,
        seller: accountAddress,
        paymentTokenAddress: metadata.paymentTokenAddress,
        amount: metadata.basePrice,
        includeOptionalCreatorFees,
        isPrivateListing: !!buyerAddress,
      })

      if (buyerAddress) {
        const { getPrivateListingConsiderations } = await import(
          "../orders/privateListings"
        )
        considerationFeeItems.push(
          ...getPrivateListingConsiderations(offerAssetItems, buyerAddress),
        )
      }

      return {
        offer: offerAssetItems,
        consideration: considerationFeeItems,
        startTime: listingTime?.toString(),
        endTime:
          expirationTime?.toString() ?? oneMonthFromNowInSeconds().toString(),
        zone: metadata.zone,
        domain: metadata.domain,
        salt: normalizeSalt(metadata.salt),
        restrictedByZone: metadata.zone !== ZERO_ADDRESS,
        allowPartialFills: true,
      }
    })

    const resolvedInputs = await Promise.all(createOrderInputsForSeaport)

    const { executeAllActions } = await this.context.seaport.createBulkOrders(
      resolvedInputs,
      accountAddress,
    )

    const orders = await executeAllActions()

    return this.submitBulkSignedOrders({
      orders,
      noun: "listing",
      post: order =>
        this.context.api.orders.postListing(
          order,
          this.context.seaport.contract.target as string,
        ),
      continueOnError,
      onProgress,
    })
  }

  /**
   * Create and submit multiple offers using Seaport's bulk order creation.
   * This method uses a single signature for all offers and submits them individually to the OpenSea API with rate limit handling.
   * All offers must be from the same account address.
   *
   * With a single offer, this uses a normal order signature instead of a bulk signature,
   * since bulk signatures cost more to verify onchain (merkle proof).
   *
   * @param options
   * @param options.offers Array of offer parameters. Each offer requires asset, amount, and optionally other offer parameters.
   * @param options.accountAddress Address of the wallet making the offers
   * @param options.continueOnError If true, continue submitting remaining offers even if some fail. Default: false (throw on first error).
   * @param options.onProgress Optional callback for progress updates. Called after each
   *   offer that finishes, whether it succeeded or failed. A failure when `continueOnError`
   *   is false throws instead, so that offer is never reported.
   * @returns {@link BulkOrderResult} containing successful orders and any failures.
   *
   * @throws Error if offers array is empty
   * @throws Error if the accountAddress is not available through wallet or provider.
   * @throws Error if any asset does not contain a token id.
   * @throws Error if continueOnError is false and any submission fails.
   */
  async createBulkOffers({
    offers,
    accountAddress,
    continueOnError = false,
    onProgress,
  }: {
    offers: Array<{
      asset: AssetWithTokenId
      amount: Amount
      quantity?: Amount
      domain?: string
      salt?: Amount
      expirationTime?: Amount
      zone?: string
    }>
    accountAddress: string
    continueOnError?: boolean
    onProgress?: (completed: number, total: number) => void
  }): Promise<BulkOrderResult<Offer>> {
    if (offers.length === 0) {
      throw new Error("Offers array cannot be empty")
    }

    // If only one offer, use normal signature to avoid bulk signature overhead
    if (offers.length === 1) {
      return this.createOneForBulk(
        () => this.createOffer({ ...offers[0], accountAddress }),
        continueOnError,
      )
    }

    await this.context.requireAccountIsAvailable(accountAddress)

    // Build metadata array for each offer
    const offerMetadata: Array<{
      nft: NFT
      collection: OpenSeaCollection
      paymentTokenAddress: string
      zone: string
      domain?: string
      salt?: Amount
      expirationTime?: Amount
    }> = []

    // Build all order inputs
    for (const offer of offers) {
      const {
        asset,
        domain,
        salt,
        expirationTime,
        zone = getSignedZone(this.context.chain),
      } = offer

      // Fetch NFT and collection data
      const { nft } = await this.context.api.nfts.getNFT(
        asset.tokenAddress,
        asset.tokenId,
      )
      const collection = await this.context.api.collections.getCollection(
        nft.collection,
      )

      const paymentTokenAddress = this.resolveOfferPaymentToken(collection)

      let finalZone = zone
      if (collection.requiredZone) {
        finalZone = collection.requiredZone
      }

      offerMetadata.push({
        nft,
        collection,
        paymentTokenAddress,
        zone: finalZone,
        domain,
        salt,
        expirationTime,
      })
    }

    // Create the bulk orders using seaport's createBulkOrders method
    const createOrderInputsForSeaport = offers.map((offer, index) => {
      const { amount, quantity = 1 } = offer

      const metadata = offerMetadata[index]
      const considerationAssetItems = this.getNFTItems(
        [metadata.nft],
        [BigInt(quantity ?? 1)],
      )

      return this.getPriceParametersCallback(
        OrderSide.OFFER,
        metadata.paymentTokenAddress,
        amount,
      ).then(async ({ basePrice }) => {
        const considerationFeeItems = await this.getFees({
          collection: metadata.collection,
          paymentTokenAddress: metadata.paymentTokenAddress,
          amount: basePrice,
        })

        return {
          offer: [
            {
              token: metadata.paymentTokenAddress,
              amount: basePrice.toString(),
            },
          ],
          consideration: [...considerationAssetItems, ...considerationFeeItems],
          endTime:
            metadata.expirationTime !== undefined
              ? BigInt(metadata.expirationTime).toString()
              : oneMonthFromNowInSeconds().toString(),
          zone: metadata.zone,
          domain: metadata.domain,
          salt: normalizeSalt(metadata.salt),
          restrictedByZone: metadata.zone !== ZERO_ADDRESS,
          allowPartialFills: true,
        }
      })
    })

    const resolvedInputs = await Promise.all(createOrderInputsForSeaport)

    const { executeAllActions } = await this.context.seaport.createBulkOrders(
      resolvedInputs,
      accountAddress,
    )

    const orders = await executeAllActions()

    return this.submitBulkSignedOrders({
      orders,
      noun: "offer",
      post: order =>
        this.context.api.orders.postOffer(
          order,
          this.context.seaport.contract.target as string,
        ),
      continueOnError,
      onProgress,
    })
  }

  /**
   * Create and submit a collection offer.
   * @param options
   * @param options.collectionSlug Identifier for the collection.
   * @param options.accountAddress Address of the wallet making the offer.
   * @param options.amount Amount in decimal format (e.g., "1.5" for 1.5 ETH, not wei). Automatically converted to base units.
   * @param options.quantity Number of assets to bid for.
   * @param options.domain Optional domain for onchain attribution. Hashed and included in the salt.
   * @param options.salt Arbitrary salt. Auto-generated if not provided.
   * @param options.expirationTime Expiration time for the order, in UTC seconds.
   * @param options.offerProtectionEnabled Use signed zone for protection against disabled items. Default: true.
   * @param options.traitType If defined, the trait name to create the collection offer for.
   * @param options.traitValue If defined, the trait value to create the collection offer for.
   * @param options.traits If defined, an array of traits to create the multi-trait collection offer for.
   * @param options.numericTraits If defined, an array of numeric trait criteria with min/max ranges.
   * @returns The {@link CollectionOffer} that was created.
   */
  async createCollectionOffer({
    collectionSlug,
    accountAddress,
    amount,
    quantity,
    domain,
    salt,
    expirationTime,
    offerProtectionEnabled = true,
    traitType,
    traitValue,
    traits,
    numericTraits,
  }: {
    collectionSlug: string
    accountAddress: string
    amount: Amount
    quantity: number
    domain?: string
    salt?: Amount
    expirationTime?: number | string
    offerProtectionEnabled?: boolean
    traitType?: string
    traitValue?: string
    traits?: Array<{ type: string; value: string }>
    numericTraits?: Array<{ type: string; min?: number; max?: number }>
  }): Promise<CollectionOffer | null> {
    await this.context.requireAccountIsAvailable(accountAddress)

    const collection =
      await this.context.api.collections.getCollection(collectionSlug)

    const paymentTokenAddress = this.resolveOfferPaymentToken(collection)

    const buildOfferResult = await this.context.api.offers.buildOffer(
      accountAddress,
      quantity,
      collectionSlug,
      offerProtectionEnabled,
      traitType,
      traitValue,
      traits,
      numericTraits,
    )
    const item = buildOfferResult.partialParameters.consideration[0]
    const convertedConsiderationItem = {
      itemType: item.itemType,
      token: item.token,
      identifier: item.identifierOrCriteria,
      amount: item.startAmount,
    }

    const { basePrice } = await this.getPriceParametersCallback(
      OrderSide.OFFER,
      paymentTokenAddress,
      amount,
    )
    const considerationFeeItems = await this.getFees({
      collection,
      paymentTokenAddress,
      amount: basePrice,
    })

    const considerationItems = [
      convertedConsiderationItem,
      ...considerationFeeItems,
    ]

    const payload = {
      offerer: accountAddress,
      offer: [
        {
          token: paymentTokenAddress,
          amount: basePrice.toString(),
        },
      ],
      consideration: considerationItems,
      endTime:
        expirationTime?.toString() ?? oneMonthFromNowInSeconds().toString(),
      zone: buildOfferResult.partialParameters.zone,
      domain,
      salt: normalizeSalt(salt),
      restrictedByZone: true,
      allowPartialFills: true,
    }

    const { executeAllActions } = await this.context.seaport.createOrder(
      payload,
      accountAddress,
    )
    const order = await executeAllActions()

    return this.context.api.offers.postCollectionOffer(
      order,
      collectionSlug,
      traitType,
      traitValue,
      traits,
      numericTraits,
    )
  }
}
