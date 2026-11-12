import type { FulfillmentDataResponse, ProtocolData } from "../orders/types"
import {
  getFulfillListingPayload,
  getFulfillmentDataPath,
  getFulfillOfferPayload,
} from "../orders/utils"
import { type Chain, OrderSide } from "../types"
import type { Camelize } from "../utils/case"
import {
  getCancelOrderPath,
  getCreateCancelOrderActionsPath,
  getOrderByHashPath,
  getPostListingPath,
  getPostOfferPath,
} from "./apiPaths"
import type { Fetcher } from "./fetcher"
import type {
  CancelOrderResponse,
  CreateCancelOrderActionsRequest,
  CreateCancelOrderActionsResponse,
  GetOrderByHashResponse,
  Listing,
  Offer,
} from "./types"

/**
 * Order-related API operations
 */
export class OrdersAPI {
  constructor(
    private fetcher: Fetcher,
    private chain: Chain,
  ) {}

  /**
   * Gets a single order by its order hash.
   * Returns the raw API response which can be either an Offer or Listing.
   */
  async getOrderByHash(
    orderHash: string,
    protocolAddress: string,
    chain: Chain = this.chain,
  ): Promise<GetOrderByHashResponse> {
    const response = await this.fetcher.get<{
      order: GetOrderByHashResponse
    }>(getOrderByHashPath(chain, protocolAddress, orderHash))
    return response.order
  }

  /**
   * Generate the data needed to fulfill a listing or an offer onchain.
   */
  async generateFulfillmentData(
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
    const payload =
      side === OrderSide.LISTING
        ? getFulfillListingPayload(
            fulfillerAddress,
            orderHash,
            protocolAddress,
            this.chain,
            assetContractAddress,
            tokenId,
            unitsToFill,
            recipientAddress,
            includeOptionalCreatorFees,
          )
        : getFulfillOfferPayload(
            fulfillerAddress,
            orderHash,
            protocolAddress,
            this.chain,
            assetContractAddress,
            tokenId,
            unitsToFill,
            includeOptionalCreatorFees,
          )
    return this.fetcher.post<FulfillmentDataResponse>(
      getFulfillmentDataPath(side),
      payload,
    )
  }

  /**
   * Post a listing to OpenSea.
   *
   * The body uses mixed casing per the OpenSea OpenAPI spec: the outer
   * envelope (`protocol_address`) is snake_case, but the inner Seaport
   * struct (`parameters.startTime`, `parameters.orderType`, `offer[].itemType`,
   * etc.) mirrors the onchain struct names and must stay camelCase on the
   * wire. We pass `snakeizeBody: false` and emit the body in exact wire shape.
   */
  async postListing(
    order: ProtocolData,
    protocolAddress: string,
  ): Promise<Listing> {
    if (!order) {
      throw new Error("order data is required")
    }
    if (!protocolAddress || !/^0x[a-fA-F0-9]{40}$/.test(protocolAddress)) {
      throw new Error("Invalid protocol address format")
    }

    return this.fetcher.post<Listing>(
      getPostListingPath(this.chain, "seaport"),
      {
        ...order,
        protocol_address: protocolAddress,
      },
      undefined,
      { snakeizeBody: false },
    )
  }

  /**
   * Post an offer to OpenSea.
   *
   * Same mixed-casing wire shape as {@link postListing}: outer
   * `protocol_address` is snake_case but the inner Seaport struct stays
   * camelCase. We opt out of automatic snakeize so `parameters` is sent
   * verbatim.
   */
  async postOffer(
    order: ProtocolData,
    protocolAddress: string,
  ): Promise<Offer> {
    if (!order) {
      throw new Error("order data is required")
    }
    if (!protocolAddress || !/^0x[a-fA-F0-9]{40}$/.test(protocolAddress)) {
      throw new Error("Invalid protocol address format")
    }

    return this.fetcher.post<Offer>(
      getPostOfferPath(this.chain, "seaport"),
      {
        ...order,
        protocol_address: protocolAddress,
      },
      undefined,
      { snakeizeBody: false },
    )
  }

  /**
   * Offchain cancel an order, offer or listing, by its order hash when protected by the SignedZone.
   *
   * The API refuses an offchain cancel for a recently created order ("Orders created recently
   * must be cancelled onchain"). Cancel it onchain instead: `sdk.cancelOrder()` sends the
   * transaction, or {@link OrdersAPI.createCancelOrderActions | createCancelOrderActions} returns the steps to execute.
   *
   * The OpenSea OpenAPI `CancelRequest` schema uses camelCase
   * `offererSignature`, so we opt out of automatic snakeize.
   */
  async offchainCancelOrder(
    protocolAddress: string,
    orderHash: string,
    chain: Chain = this.chain,
    offererSignature?: string,
  ): Promise<CancelOrderResponse> {
    return this.fetcher.post<CancelOrderResponse>(
      getCancelOrderPath(chain, protocolAddress, orderHash),
      { offererSignature },
      undefined,
      { snakeizeBody: false },
    )
  }

  /**
   * Get the ordered actions required to cancel an order onchain.
   */
  async createCancelOrderActions(
    protocolAddress: string,
    orderIdentifier: string,
    request: CreateCancelOrderActionsRequest,
    chain: Chain = this.chain,
  ): Promise<CreateCancelOrderActionsResponse> {
    return this.fetcher.post<CreateCancelOrderActionsResponse>(
      getCreateCancelOrderActionsPath(chain, protocolAddress, orderIdentifier),
      request,
    )
  }
}
