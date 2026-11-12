import { SeaportABI } from "@opensea/seaport-js/lib/abi/Seaport"
import type { OrderComponents } from "@opensea/seaport-js/lib/types"
import { CONDUIT_CONTROLLER_ABI, ERC20_ABI } from "../abi/abis"
import type { Listing, Offer, Order } from "../api/types"
import { CONDUIT_CONTROLLER_ADDRESS } from "../constants"
import { appendCalldataSuffix } from "../orders/attribution"
import {
  getErc20Payment,
  getFulfillerConduitKey,
  isZeroConduitKey,
  toBigInt,
} from "../orders/erc20Fulfillment"
import {
  computePrivateListingValue,
  constructPrivateListingCounterOrder,
  getPrivateListingFulfillments,
} from "../orders/privateListings"
import { OrderType, type OrderV2 } from "../orders/types"
import { DEFAULT_SEAPORT_CONTRACT_ADDRESS } from "../orders/utils"
import {
  type Amount,
  type AssetWithTokenId,
  EventType,
  OrderSide,
} from "../types"
import {
  getDefaultConduit,
  getSeaportInstance,
  hasErrorCode,
  requireValidProtocol,
} from "../utils/utils"
import type { SDKContext } from "./context"
import type { OrdersManager } from "./orders"

const FULFILL_BASIC_ORDER_ALIAS = "fulfillBasicOrder_efficient_6GL6yc"

/**
 * Manager for order fulfillment and validation operations.
 * Handles fulfilling orders, validating orders onchain, and approving orders.
 */
export class FulfillmentManager {
  constructor(
    private context: SDKContext,
    private ordersManager: OrdersManager,
  ) {}

  /**
   * Fulfill a private order for a designated address.
   * The order must have a taker address set (i.e., it is a private listing).
   */
  async fulfillPrivateOrder({
    order,
    accountAddress,
    domain,
    overrides,
  }: {
    order: OrderV2
    accountAddress: string
    domain?: string
    overrides?: Record<string, unknown>
  }): Promise<string> {
    await this.context.requireAccountIsAvailable(accountAddress)
    if (!order.taker?.address) {
      throw new Error(
        "Order is not a private listing - must have a taker address",
      )
    }
    const counterOrder = constructPrivateListingCounterOrder(
      order.protocolData,
      order.taker.address,
    )
    const fulfillments = getPrivateListingFulfillments(order.protocolData)

    const value = computePrivateListingValue(
      order.protocolData,
      order.taker.address,
    )

    const seaport = getSeaportInstance(
      order.protocolAddress,
      this.context.seaport,
    )
    const transaction = await seaport
      .matchOrders({
        orders: [order.protocolData, counterOrder],
        fulfillments,
        overrides: {
          ...overrides,
          value,
        },
        accountAddress,
        domain,
      })
      .transact()
    const transactionReceipt = await transaction.wait()
    if (!transactionReceipt) {
      throw new Error("Missing transaction receipt")
    }

    await this.context.confirmTransaction(
      transactionReceipt.hash,
      EventType.MatchOrders,
      "Fulfilling order",
    )
    return transactionReceipt.hash
  }

  /**
   * Fulfill an order for an asset. The order can be either a listing or an offer.
   * Uses the OpenSea API to generate fulfillment transaction data and executes it directly.
   * @param options
   * @param options.order The order to fulfill, a.k.a. "take"
   * @param options.accountAddress Address of the wallet taking the offer.
   * @param options.assetContractAddress Optional address of the NFT contract for criteria offers (e.g., collection offers). Required when fulfilling collection offers.
   * @param options.tokenId Optional token ID for criteria offers (e.g., collection offers). Required when fulfilling collection offers.
   * @param options.unitsToFill Optional number of units to fill. Defaults to 1 for both listings and offers.
   * @param options.recipientAddress Optional recipient address for the NFT when fulfilling a listing. Not applicable for offers.
   * @param options.includeOptionalCreatorFees Whether to include optional creator fees in the fulfillment. If creator fees are already required, this is a no-op. Defaults to false.
   * @param options.overrides Transaction overrides, ignored if not set.
   * @returns Transaction hash of the order.
   *
   * @throws Error if the accountAddress is not available through wallet or provider.
   * @throws Error if the order's protocol address is not supported by OpenSea. See {@link isValidProtocol}.
   * @throws Error if a signer is not provided (read-only providers cannot fulfill orders).
   * @throws Error if the order hash is not available.
   */
  async fulfillOrder({
    order,
    accountAddress,
    assetContractAddress,
    tokenId,
    unitsToFill,
    recipientAddress,
    includeOptionalCreatorFees = false,
    overrides,
  }: {
    order: OrderV2 | Order | Listing | Offer
    accountAddress: string
    assetContractAddress?: string
    tokenId?: string
    unitsToFill?: Amount
    recipientAddress?: string
    includeOptionalCreatorFees?: boolean
    overrides?: Record<string, unknown>
  }): Promise<string> {
    await this.context.requireAccountIsAvailable(accountAddress)

    const protocolAddress = order.protocolAddress
    if (!protocolAddress) {
      throw new Error("Order protocol address is required")
    }
    requireValidProtocol(protocolAddress)

    const orderHash = order.orderHash

    const side =
      (order as OrderV2).side ??
      ("type" in order &&
      [OrderType.BASIC, OrderType.ENGLISH].includes(order.type as OrderType)
        ? OrderSide.LISTING
        : OrderSide.OFFER)

    const isPrivateListing = "taker" in order ? !!order.taker : false
    if (isPrivateListing) {
      return this.fulfillPrivateOrder({
        order: order as OrderV2,
        accountAddress,
        overrides,
      })
    }

    // Get fulfillment data from the API
    if (!orderHash) {
      throw new Error("Order hash is required to fulfill an order")
    }

    // Convert unitsToFill to string, defaulting to "1" if not provided
    const unitsToFillStr =
      unitsToFill !== undefined ? unitsToFill.toString() : "1"

    const fulfillmentData =
      await this.context.api.orders.generateFulfillmentData(
        accountAddress,
        orderHash,
        protocolAddress,
        side,
        assetContractAddress,
        tokenId,
        unitsToFillStr,
        recipientAddress,
        includeOptionalCreatorFees,
      )

    // Use the transaction data returned by the API
    const transaction = fulfillmentData.fulfillmentData.transaction
    const inputData = transaction.inputData

    // Extract function name and build parameters array in correct order
    const rawFunctionName = transaction.function.split("(")[0]
    const functionName =
      rawFunctionName === FULFILL_BASIC_ORDER_ALIAS
        ? "fulfillBasicOrder"
        : rawFunctionName
    let params: unknown[]

    // Order parameters based on the function being called
    if (
      functionName === "fulfillAdvancedOrder" &&
      "advancedOrder" in inputData
    ) {
      params = [
        inputData.advancedOrder,
        inputData.criteriaResolvers || [],
        inputData.fulfillerConduitKey ||
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        inputData.recipient,
      ]
    } else if (
      (functionName === "fulfillBasicOrder" ||
        rawFunctionName === FULFILL_BASIC_ORDER_ALIAS) &&
      "parameters" in inputData
    ) {
      params = [inputData.parameters]
    } else if (functionName === "fulfillOrder" && "order" in inputData) {
      params = [
        inputData.order,
        inputData.fulfillerConduitKey ||
          "0x0000000000000000000000000000000000000000000000000000000000000000",
      ]
    } else {
      // Fallback: try to use values in object order
      params = Object.values(inputData)
    }

    // ERC20-priced listings send no native value; Seaport pulls the payment from
    // the buyer instead, which reverts with a bare "execution reverted" when the
    // spender has not been approved. Catch that before spending gas.
    await this.requireErc20PaymentIsSpendable(inputData, transaction.to, {
      accountAddress,
    })

    const encodedData = this.context.contractCaller.encodeFunctionData({
      abi: SeaportABI,
      functionName,
      args: params,
    })

    // Re-encoding from inputData drops the attribution suffix the API appended
    // to its own calldata, so put it back. See appendCalldataSuffix.
    const data = appendCalldataSuffix(encodedData, transaction.calldataSuffix)

    // Send the transaction using the signer from wallet
    const wallet = this.context.wallet
    if (!("signer" in wallet)) {
      throw new Error("A signer is required to fulfill orders")
    }
    const tx = await wallet.signer.sendTransaction({
      to: transaction.to,
      value: BigInt(transaction.value),
      data,
      overrides: overrides as Record<string, unknown>,
    })

    await this.context.confirmTransaction(
      tx.hash,
      EventType.MatchOrders,
      "Fulfilling order",
    )
    return tx.hash
  }

  /**
   * Throw an actionable error when the buyer cannot pay for an ERC20-priced
   * listing, because they hold too little of the payment token or have not
   * approved the address Seaport pulls it from.
   *
   * The check is skipped for native-priced listings, for offer fulfillments, and
   * for any response shape or RPC read it cannot interpret, so it never blocks a
   * purchase that would otherwise have succeeded.
   */
  private async requireErc20PaymentIsSpendable(
    inputData: unknown,
    seaportAddress: string,
    { accountAddress }: { accountAddress: string },
  ): Promise<void> {
    const payment = getErc20Payment(inputData)
    if (!payment) {
      return
    }

    const spender = await this.resolveFulfillerSpender(
      getFulfillerConduitKey(inputData),
      seaportAddress,
    )
    if (!spender) {
      return
    }

    const spendState = await this.readErc20SpendState(
      payment.token,
      accountAddress,
      spender,
    )
    if (!spendState) {
      return
    }

    const amounts = `have ${spendState.balance}, need ${payment.amount} (base units of the payment token)`
    if (spendState.balance < payment.amount) {
      throw new Error(
        `Insufficient ${payment.token} balance to fulfill this listing: ${amounts}. ` +
          `Fund ${accountAddress} with the payment token before fulfilling.`,
      )
    }
    if (spendState.allowance < payment.amount) {
      throw new Error(
        `Payment token ${payment.token} is not approved for this listing: allowance for ` +
          `${spender} is ${spendState.allowance}, need ${payment.amount} (base units of the ` +
          `payment token). ERC20-priced listings send no native value, so Seaport pulls the ` +
          `payment through this spender. Send approve(${spender}, ${payment.amount}) from ` +
          `${accountAddress} first.`,
      )
    }
  }

  /**
   * Resolve the address that will pull the payment token: Seaport itself when the
   * fulfiller conduit key is `bytes32(0)`, otherwise the conduit registered for
   * that key. Returns null when the key cannot be resolved.
   */
  private async resolveFulfillerSpender(
    conduitKey: string | null,
    seaportAddress: string,
  ): Promise<string | null> {
    if (!conduitKey || isZeroConduitKey(conduitKey)) {
      return seaportAddress
    }

    const defaultConduit = getDefaultConduit(this.context.chain)
    if (conduitKey.toLowerCase() === defaultConduit.key.toLowerCase()) {
      return defaultConduit.address
    }

    try {
      const result = await this.context.contractCaller.readContract({
        address: CONDUIT_CONTROLLER_ADDRESS,
        abi: CONDUIT_CONTROLLER_ABI,
        functionName: "getConduit",
        args: [conduitKey],
      })
      if (
        !Array.isArray(result) ||
        typeof result[0] !== "string" ||
        result[1] !== true
      ) {
        return null
      }
      return result[0]
    } catch (error) {
      this.context.logger(
        `Could not resolve conduit for key ${conduitKey}, skipping the ERC20 approval check: ${error}`,
      )
      return null
    }
  }

  /** Read the buyer's payment-token balance and allowance for a spender. */
  private async readErc20SpendState(
    token: string,
    owner: string,
    spender: string,
  ): Promise<{ balance: bigint; allowance: bigint } | null> {
    const contractCaller = this.context.contractCaller
    try {
      const [rawBalance, rawAllowance] = await Promise.all([
        contractCaller.readContract({
          address: token,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [owner],
        }),
        contractCaller.readContract({
          address: token,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [owner, spender],
        }),
      ])
      const balance = toBigInt(rawBalance)
      const allowance = toBigInt(rawAllowance)
      if (balance === null || allowance === null) {
        return null
      }
      return { balance, allowance }
    } catch (error) {
      this.context.logger(
        `Could not read ${token} balance or allowance, skipping the ERC20 approval check: ${error}`,
      )
      return null
    }
  }

  /**
   * Returns whether an order is fulfillable.
   * An order may not be fulfillable if a target item's transfer function
   * is locked for some reason, e.g. an item is being rented within a game
   * or trading has been locked for an item type.
   * @param options
   * @param options.order Order to check
   * @param options.accountAddress The account address that will be fulfilling the order
   * @returns True if the order is fulfillable, else False.
   *
   * @throws Error if the order's protocol address is not supported by OpenSea. See {@link isValidProtocol}.
   */
  async isOrderFulfillable({
    order,
    accountAddress,
  }: {
    order: OrderV2
    accountAddress: string
  }): Promise<boolean> {
    requireValidProtocol(order.protocolAddress)

    const seaport = getSeaportInstance(
      order.protocolAddress,
      this.context.seaport,
    )

    try {
      const isValid = await seaport
        .validate([order.protocolData], accountAddress)
        .staticCall()
      return !!isValid
    } catch (error) {
      if (hasErrorCode(error) && error.code === "CALL_EXCEPTION") {
        return false
      }
      throw error
    }
  }

  /**
   * Approve an order with an onchain transaction instead of an offchain signature.
   * @param order Order to approve
   * @param domain An optional domain to be hashed and included at the end of fulfillment calldata, used for onchain order attribution in analytics.
   * @returns Transaction hash of the approval transaction
   *
   * @throws Error if the accountAddress is not available through wallet or provider.
   * @throws Error if the order's protocol address is not supported by OpenSea. See {@link isValidProtocol}.
   */
  async approveOrder(order: OrderV2, domain?: string) {
    await this.context.requireAccountIsAvailable(order.maker.address)
    requireValidProtocol(order.protocolAddress)

    this.context.dispatch(EventType.ApproveOrder, {
      orderV2: order,
      accountAddress: order.maker.address,
    })

    const seaport = getSeaportInstance(
      order.protocolAddress,
      this.context.seaport,
    )
    const transaction = await seaport
      .validate([order.protocolData], order.maker.address, domain)
      .transact()

    await this.context.confirmTransaction(
      transaction.hash,
      EventType.ApproveOrder,
      "Approving order",
    )

    return transaction.hash
  }

  /**
   * Validates an order onchain using Seaport's validate() method.
   *
   * The order is left with an empty signature: Seaport takes the transaction
   * sender as proof the offerer approved it. This does not post the order to
   * OpenSea. It becomes discoverable only once OpenSea ingests the resulting
   * `OrderValidated` event.
   *
   * @param orderComponents The order to validate
   * @param accountAddress Address sending the validate transaction
   * @param protocolAddress Seaport protocol address the components were built
   * for. Defaults to {@link DEFAULT_SEAPORT_CONTRACT_ADDRESS}.
   * @returns Transaction hash of the validate transaction
   *
   * @throws Error if the accountAddress is not available through wallet or provider.
   * @throws Error if the protocol address is not supported by OpenSea. See {@link isValidProtocol}.
   */
  async validateOrderOnchain(
    orderComponents: OrderComponents,
    accountAddress: string,
    protocolAddress: string = DEFAULT_SEAPORT_CONTRACT_ADDRESS,
  ) {
    await this.context.requireAccountIsAvailable(accountAddress)
    requireValidProtocol(protocolAddress)

    this.context.dispatch(EventType.ApproveOrder, {
      orderV2: { protocolData: orderComponents } as unknown as OrderV2,
      accountAddress,
    })

    const seaport = getSeaportInstance(protocolAddress, this.context.seaport)
    const transaction = await seaport
      .validate(
        [{ parameters: orderComponents, signature: "0x" }],
        accountAddress,
      )
      .transact()

    await this.context.confirmTransaction(
      transaction.hash,
      EventType.ApproveOrder,
      "Validating order onchain",
    )

    return transaction.hash
  }

  /**
   * Create a listing and validate it onchain, instead of signing it offchain.
   *
   * Runs any token approvals the listing needs, then sends one `validate()`
   * transaction. The wallet is never asked for an EIP-712 signature, so this
   * works for contract accounts that cannot produce one.
   *
   * Unlike {@link OrdersManager.createListing}, this does not post the listing
   * to OpenSea. It becomes discoverable only once OpenSea ingests the
   * `OrderValidated` event, so the returned hash is a transaction hash, not an
   * order hash.
   *
   * @returns Transaction hash of the validate transaction
   */
  async createListingAndValidateOnchain({
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
    zone,
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
  }): Promise<string> {
    const orderComponents =
      await this.ordersManager.buildListingOrderComponents({
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

    return this.validateOrderOnchain(orderComponents, accountAddress)
  }

  /**
   * Create an offer and validate it onchain, instead of signing it offchain.
   *
   * Runs any token approvals the offer needs, then sends one `validate()`
   * transaction. The wallet is never asked for an EIP-712 signature, so this
   * works for contract accounts that cannot produce one.
   *
   * Unlike {@link OrdersManager.createOffer}, this does not post the offer to
   * OpenSea. It becomes discoverable only once OpenSea ingests the
   * `OrderValidated` event, so the returned hash is a transaction hash, not an
   * order hash.
   *
   * @returns Transaction hash of the validate transaction
   */
  async createOfferAndValidateOnchain({
    asset,
    accountAddress,
    amount,
    quantity = 1,
    domain,
    salt,
    expirationTime,
    zone,
  }: {
    asset: AssetWithTokenId
    accountAddress: string
    amount: Amount
    quantity?: Amount
    domain?: string
    salt?: Amount
    expirationTime?: Amount
    zone?: string
  }): Promise<string> {
    const orderComponents = await this.ordersManager.buildOfferOrderComponents({
      asset,
      accountAddress,
      amount,
      quantity,
      domain,
      salt,
      expirationTime,
      zone,
    })

    return this.validateOrderOnchain(orderComponents, accountAddress)
  }
}
