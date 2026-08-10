import EventEmitter = require("node:events")

import type { Seaport } from "@opensea/seaport-js"
import type { OrderComponents } from "@opensea/seaport-js/lib/types"
import { OpenSeaAPI } from "../api/api"
import type {
  CollectionOffer,
  Listing,
  Offer,
  Order,
  RequestInstantApiKeyResponse,
} from "../api/types"
import { ZERO_ADDRESS } from "../constants"
import type { OrderV2 } from "../orders/types"
import type { ContractCaller, OpenSeaWallet } from "../provider/types"
import type {
  Amount,
  AssetWithTokenId,
  AssetWithTokenStandard,
  Chain,
  EventData,
} from "../types"
import { EventType, OrderSide } from "../types"
import { checksumAddress } from "../utils/address"
import { parseUnits } from "../utils/units"
import { AssetsManager } from "./assets"
import { CancellationManager } from "./cancellation"
import { FulfillmentManager } from "./fulfillment"
import { type BulkOrderResult, OrdersManager } from "./orders"
import { TokensManager } from "./tokens"

/**
 * Configuration passed to the base SDK by entry-point constructors.
 */
export interface BaseSDKConfig {
  wallet: OpenSeaWallet
  contractCaller: ContractCaller
  seaport: Seaport
  api: OpenSeaAPI
  chain: Chain
  logger: (arg: string) => void
  /** Get available account addresses for requireAccountIsAvailable checks */
  getAvailableAccounts: () => Promise<string[]>
  cachedPaymentTokenDecimals: { [address: string]: number }
}

/**
 * Base OpenSea SDK class containing all shared business logic.
 * Entry-point classes (ethers, viem) extend this and only differ in constructor.
 * @category Main Classes
 */
export class BaseOpenSeaSDK {
  /** Seaport client @see {@link https://github.com/ProjectOpenSea/seaport-js} */
  public seaport: Seaport
  /** Logger function to use when debugging */
  public logger: (arg: string) => void
  /** API instance */
  public readonly api: OpenSeaAPI
  /** The configured chain */
  public readonly chain: Chain

  protected _wallet: OpenSeaWallet
  protected _contractCaller: ContractCaller
  private _emitter: EventEmitter
  private _cachedPaymentTokenDecimals: { [address: string]: number }
  private _getAvailableAccounts: () => Promise<string[]>

  // Manager instances
  private _tokensManager: TokensManager
  private _assetsManager: AssetsManager
  private _cancellationManager: CancellationManager
  private _ordersManager: OrdersManager
  private _fulfillmentManager: FulfillmentManager

  protected constructor(config: BaseSDKConfig) {
    this.chain = config.chain
    this.api = config.api
    this.seaport = config.seaport
    this.logger = config.logger
    this._wallet = config.wallet
    this._contractCaller = config.contractCaller
    this._cachedPaymentTokenDecimals = config.cachedPaymentTokenDecimals
    this._getAvailableAccounts = config.getAvailableAccounts
    this._emitter = new EventEmitter()

    const context = {
      chain: this.chain,
      wallet: this._wallet,
      contractCaller: this._contractCaller,
      api: this.api,
      seaport: this.seaport,
      logger: this.logger,
      dispatch: this._dispatch.bind(this),
      confirmTransaction: this._confirmTransaction.bind(this),
      requireAccountIsAvailable: this._requireAccountIsAvailable.bind(this),
    }

    this._tokensManager = new TokensManager(context)
    this._assetsManager = new AssetsManager(context)
    this._cancellationManager = new CancellationManager(context)
    this._ordersManager = new OrdersManager(
      context,
      this._getPriceParameters.bind(this),
    )
    this._fulfillmentManager = new FulfillmentManager(
      context,
      this._ordersManager,
    )
  }

  /**
   * Request a free-tier OpenSea API key without authentication. The returned
   * key can be passed as `apiKey` into the SDK constructor to bootstrap usage.
   * Rate limited to 3 keys per hour per IP; keys expire after 30 days.
   *
   * @example
   * ```ts
   * const { apiKey } = await OpenSeaSDK.requestInstantApiKey()
   * const sdk = new OpenSeaSDK(provider, { apiKey })
   * ```
   *
   * @param apiBaseUrl Optional base URL override (defaults to mainnet).
   */
  public static async requestInstantApiKey(
    apiBaseUrl?: string,
  ): Promise<RequestInstantApiKeyResponse> {
    return OpenSeaAPI.requestInstantApiKey(apiBaseUrl)
  }

  // ─── Event Listeners ───────────────────────────────────────────────

  /**
   * Add a listener for events emitted by the SDK.
   * @param event The {@link EventType} to listen to.
   * @param listener A callback that will accept an object with {@link EventData}
   * @param once Whether the listener should only be called once.
   */
  public addListener(
    event: EventType,
    listener: (data: EventData) => void,
    once = false,
  ) {
    if (once) {
      this._emitter.once(event, listener)
    } else {
      this._emitter.addListener(event, listener)
    }
  }

  /**
   * Remove an event listener.
   * @param event The {@link EventType} to remove a listener for
   * @param listener The listener to remove
   */
  public removeListener(event: EventType, listener: (data: EventData) => void) {
    this._emitter.removeListener(event, listener)
  }

  /**
   * Remove all event listeners. Call when unmounting a component that listens to events.
   * @param event Optional EventType to remove listeners for
   */
  public removeAllListeners(event?: EventType) {
    this._emitter.removeAllListeners(event)
  }

  // ─── Token Operations ──────────────────────────────────────────────

  /**
   * Wrap native asset into wrapped native asset (e.g. ETH into WETH, POL into WPOL).
   * Wrapped native assets are needed for making offers.
   * @param options
   * @param options.amountInEth Amount of native asset to wrap
   * @param options.accountAddress Address of the user's wallet containing the native asset
   */
  public async wrapEth(options: {
    amountInEth: Amount
    accountAddress: string
  }) {
    return this._tokensManager.wrapEth(options)
  }

  /**
   * Unwrap wrapped native asset into native asset (e.g. WETH into ETH, WPOL into POL).
   * Emits the `UnwrapWeth` event when the transaction is prompted.
   * @param options
   * @param options.amountInEth How much wrapped native asset to unwrap
   * @param options.accountAddress Address of the user's wallet containing the wrapped native asset
   */
  public async unwrapWeth(options: {
    amountInEth: Amount
    accountAddress: string
  }) {
    return this._tokensManager.unwrapWeth(options)
  }

  // ─── Order Creation ────────────────────────────────────────────────

  /**
   * Create and submit an offer on an asset.
   * @param options
   * @param options.asset The asset to trade. tokenAddress and tokenId must be defined.
   * @param options.accountAddress Address of the wallet making the offer.
   * @param options.amount Amount in decimal format (e.g., "1.5" for 1.5 ETH, not wei). Automatically converted to base units.
   * @param options.quantity Number of assets to bid for. Defaults to 1.
   * @param options.domain Optional domain for onchain attribution.
   * @param options.salt Arbitrary salt. Auto-generated if not provided.
   * @param options.expirationTime Expiration time for the order, in UTC seconds
   * @param options.zone Zone for order protection. Defaults to chain's signed zone.
   * @returns The {@link Offer} that was created.
   */
  public async createOffer(options: {
    asset: AssetWithTokenId
    accountAddress: string
    amount: Amount
    quantity?: Amount
    domain?: string
    salt?: Amount
    expirationTime?: Amount
    zone?: string
  }): Promise<Offer> {
    return this._ordersManager.createOffer(options)
  }

  /**
   * Create and submit a listing for an asset.
   * @param options
   * @param options.asset The asset to trade. tokenAddress and tokenId must be defined.
   * @param options.accountAddress Address of the wallet making the listing
   * @param options.amount Amount in decimal format (e.g., "1.5" for 1.5 ETH, not wei). Automatically converted to base units.
   * @param options.quantity Number of assets to list. Defaults to 1.
   * @param options.domain Optional domain for onchain attribution.
   * @param options.salt Arbitrary salt. Auto-generated if not provided.
   * @param options.listingTime Optional time when the order will become fulfillable, in UTC seconds.
   * @param options.expirationTime Expiration time for the order, in UTC seconds.
   * @param options.buyerAddress Optional address that's allowed to purchase this item.
   * @param options.includeOptionalCreatorFees If true, optional creator fees will be included. Default: false.
   * @param options.zone Zone for order protection. Defaults to no zone.
   * @returns The {@link Listing} that was created.
   */
  public async createListing(options: {
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
    return this._ordersManager.createListing(options)
  }

  /** Create and submit multiple listings using Seaport's bulk order creation. */
  public async createBulkListings(options: {
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
    return this._ordersManager.createBulkListings(options)
  }

  /** Create and submit multiple offers using Seaport's bulk order creation. */
  public async createBulkOffers(options: {
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
    return this._ordersManager.createBulkOffers(options)
  }

  /** Create and submit a collection offer. */
  public async createCollectionOffer(options: {
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
    return this._ordersManager.createCollectionOffer(options)
  }

  // ─── Order Fulfillment ─────────────────────────────────────────────

  /**
   * Fulfill an order for an asset. The order can be either a listing or an offer.
   * Uses the OpenSea API to generate fulfillment transaction data and executes it directly.
   * @param options
   * @param options.order The order to fulfill, a.k.a. "take"
   * @param options.accountAddress Address of the wallet taking the offer.
   * @param options.assetContractAddress Optional address of the NFT contract for criteria offers.
   * @param options.tokenId Optional token ID for criteria offers.
   * @param options.unitsToFill Optional number of units to fill. Defaults to 1.
   * @param options.recipientAddress Optional recipient address for the NFT when fulfilling a listing.
   * @param options.includeOptionalCreatorFees Whether to include optional creator fees. Defaults to false.
   * @param options.overrides Transaction overrides (gasLimit, maxFeePerGas, etc.).
   * @returns Transaction hash of the order.
   */
  public async fulfillOrder(options: {
    order: OrderV2 | Order | Listing | Offer
    accountAddress: string
    assetContractAddress?: string
    tokenId?: string
    unitsToFill?: Amount
    recipientAddress?: string
    includeOptionalCreatorFees?: boolean
    overrides?: Record<string, unknown>
  }): Promise<string> {
    return this._fulfillmentManager.fulfillOrder(options)
  }

  /**
   * Fulfill a private listing directly using Seaport's matchOrders.
   * The order must have a taker address set (i.e., it is a private listing).
   * @param options
   * @param options.order The private listing order to fulfill. Must have a taker address.
   * @param options.accountAddress Address of the wallet fulfilling the order.
   * @param options.domain Optional domain for onchain attribution.
   * @param options.overrides Transaction overrides (gasLimit, maxFeePerGas, etc.).
   * @returns Transaction hash of the fulfillment.
   */
  public async fulfillPrivateOrder(options: {
    order: OrderV2
    accountAddress: string
    domain?: string
    overrides?: Record<string, unknown>
  }): Promise<string> {
    return this._fulfillmentManager.fulfillPrivateOrder(options)
  }

  /**
   * Get cross-chain fulfillment data for one or more listings.
   * Supports same-chain, cross-token, and cross-chain purchases (up to 50 listings).
   * All listings must be EVM (Seaport orders). Payment can be from any chain (EVM or SVM).
   * Returns an ordered list of transactions to sign and submit.
   * @param options
   * @param options.listings Array of listings to fulfill (order hash, chain, protocol address)
   * @param options.fulfillerAddress The buyer's wallet address
   * @param options.paymentChain Chain slug of the payment token (EVM or SVM)
   * @param options.paymentTokenAddress Payment token contract address (0x0...0 for native)
   * @param options.recipientAddress Optional different recipient for the NFTs
   */
  public async getCrossChainFulfillmentData(options: {
    listings: Array<{
      hash: string
      chain: string
      protocolAddress: string
    }>
    fulfillerAddress: string
    paymentChain: string
    paymentTokenAddress: string
    recipientAddress?: string
  }) {
    return this.api.getCrossChainFulfillmentData({
      listings: options.listings.map(l => ({
        hash: l.hash,
        chain: l.chain,
        protocolAddress: l.protocolAddress,
      })),
      fulfiller: { address: options.fulfillerAddress },
      payment: {
        chain: options.paymentChain,
        tokenAddress: options.paymentTokenAddress,
      },
      ...(options.recipientAddress
        ? { recipient: options.recipientAddress }
        : {}),
    })
  }

  /** Returns whether an order is fulfillable. */
  public async isOrderFulfillable(options: {
    order: OrderV2
    accountAddress: string
  }): Promise<boolean> {
    return this._fulfillmentManager.isOrderFulfillable(options)
  }

  /** Approve an order with an onchain transaction. */
  public async approveOrder(order: OrderV2, domain?: string) {
    return this._fulfillmentManager.approveOrder(order, domain)
  }

  /** Validates an order onchain using Seaport's validate() method. */
  public async validateOrderOnchain(
    orderComponents: OrderComponents,
    accountAddress: string,
  ) {
    return this._fulfillmentManager.validateOrderOnchain(
      orderComponents,
      accountAddress,
    )
  }

  /** Create and validate a listing onchain. */
  public async createListingAndValidateOnchain(options: {
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
  }): Promise<string> {
    return this._fulfillmentManager.createListingAndValidateOnchain(options)
  }

  /** Create and validate an offer onchain. */
  public async createOfferAndValidateOnchain(options: {
    asset: AssetWithTokenId
    accountAddress: string
    amount: Amount
    quantity?: Amount
    domain?: string
    salt?: Amount
    expirationTime?: Amount
    zone?: string
  }): Promise<string> {
    return this._fulfillmentManager.createOfferAndValidateOnchain(options)
  }

  // ─── Order Cancellation ────────────────────────────────────────────

  /**
   * Cancel multiple orders onchain, preventing them from being fulfilled.
   * @param options
   * @param options.orders Array of orders to cancel. Can be OrderV2 objects or OrderComponents.
   * @param options.orderHashes Optional array of order hashes to cancel.
   * @param options.accountAddress The account address cancelling the orders.
   * @param options.protocolAddress The Seaport protocol address for the orders.
   * @param options.domain Optional domain for onchain attribution.
   * @param options.overrides Transaction overrides (gasLimit, maxFeePerGas, etc.).
   * @returns Transaction hash of the cancellation.
   */
  public async cancelOrders(options: {
    orders?: Array<OrderV2 | OrderComponents>
    orderHashes?: string[]
    accountAddress: string
    protocolAddress?: string
    domain?: string
    overrides?: Record<string, unknown>
  }): Promise<string> {
    return this._cancellationManager.cancelOrders(options)
  }

  /** Cancel an order onchain, preventing it from ever being fulfilled. */
  public async cancelOrder(options: {
    order?: OrderV2
    orderHash?: string
    accountAddress: string
    protocolAddress?: string
    domain?: string
  }): Promise<string> {
    return this._cancellationManager.cancelOrder(options)
  }

  /** Offchain cancel an order by its order hash when protected by the SignedZone. */
  public async offchainCancelOrder(
    protocolAddress: string,
    orderHash: string,
    chain: Chain = this.chain,
    offererSignature?: string,
    useSignerToDeriveOffererSignature?: boolean,
  ) {
    return this._cancellationManager.offchainCancelOrder(
      protocolAddress,
      orderHash,
      chain,
      offererSignature,
      useSignerToDeriveOffererSignature,
    )
  }

  // ─── Asset Operations ──────────────────────────────────────────────

  /**
   * Get an account's balance of any Asset.
   */
  public async getBalance(options: {
    accountAddress: string
    asset: AssetWithTokenStandard
  }): Promise<bigint> {
    return this._assetsManager.getBalance(options)
  }

  /**
   * Transfer an asset. This asset can be an ERC20, ERC1155, or ERC721.
   * @param options
   * @param options.asset The Asset to transfer. tokenStandard must be set.
   * @param options.amount Amount of asset to transfer. Not used for ERC721.
   * @param options.fromAddress The address to transfer from
   * @param options.toAddress The address to transfer to
   * @param options.overrides Transaction overrides (gasLimit, maxFeePerGas, etc.).
   */
  public async transfer(options: {
    asset: AssetWithTokenStandard
    amount?: Amount
    fromAddress: string
    toAddress: string
    overrides?: Record<string, unknown>
  }): Promise<void> {
    return this._assetsManager.transfer(options)
  }

  /** Bulk transfer multiple assets using OpenSea's TransferHelper contract. */
  public async bulkTransfer(options: {
    assets: Array<{
      asset: AssetWithTokenStandard
      toAddress: string
      amount?: Amount
    }>
    fromAddress: string
    overrides?: Record<string, unknown>
  }): Promise<string> {
    return this._assetsManager.bulkTransfer(options)
  }

  /** Batch approve multiple assets for transfer to the OpenSea conduit. */
  public async batchApproveAssets(options: {
    assets: Array<{
      asset: AssetWithTokenStandard
      amount?: Amount
    }>
    fromAddress: string
    overrides?: Record<string, unknown>
  }): Promise<string | undefined> {
    return this._assetsManager.batchApproveAssets(options)
  }

  // ─── Private Helpers ───────────────────────────────────────────────

  /**
   * Compute the `basePrice` parameter to be used to price an order.
   */
  private async _getPriceParameters(
    orderSide: OrderSide,
    tokenAddress: string,
    amount: Amount,
  ) {
    tokenAddress = tokenAddress.toLowerCase()
    const isEther = tokenAddress === ZERO_ADDRESS
    let decimals = 18
    if (!isEther) {
      if (tokenAddress in this._cachedPaymentTokenDecimals) {
        decimals = this._cachedPaymentTokenDecimals[tokenAddress]
      } else {
        const paymentToken = await this.api.getPaymentToken(tokenAddress)
        this._cachedPaymentTokenDecimals[tokenAddress] = paymentToken.decimals
        decimals = paymentToken.decimals
      }
    }

    if (amount == null) {
      throw new Error("Starting price must be a number >= 0")
    }
    if (isEther && orderSide === OrderSide.OFFER) {
      throw new Error("Offers must use wrapped ETH or an ERC-20 token.")
    }
    const amountWei = parseUnits(amount.toString(), decimals)
    const basePrice = amountWei
    if (amountWei < 0) {
      throw new Error("Starting price must be a number >= 0")
    }
    return { basePrice }
  }

  private _dispatch(event: EventType, data: EventData) {
    this._emitter.emit(event, data)
  }

  private async _requireAccountIsAvailable(accountAddress: string) {
    const checksummed = checksumAddress(accountAddress)
    const availableAccounts = await this._getAvailableAccounts()

    if (availableAccounts.includes(checksummed)) {
      return
    }

    throw new Error(
      `Specified accountAddress is not available through wallet or provider: ${checksummed}. Accounts available: ${
        availableAccounts.length > 0 ? availableAccounts.join(", ") : "none"
      }`,
    )
  }

  private async _confirmTransaction(
    transactionHash: string,
    event: EventType,
    description: string,
  ): Promise<void> {
    const transactionEventData = { transactionHash, event }
    this.logger(`Transaction started: ${description}`)

    try {
      this._dispatch(EventType.TransactionCreated, transactionEventData)
      await this._wallet.provider.waitForTransaction(transactionHash)
      this.logger(`Transaction succeeded: ${description}`)
      this._dispatch(EventType.TransactionConfirmed, transactionEventData)
    } catch (error) {
      this.logger(`Transaction failed: ${description}`)
      this._dispatch(EventType.TransactionFailed, {
        ...transactionEventData,
        error,
      })
      throw error
    }
  }
}
