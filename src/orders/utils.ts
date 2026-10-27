import { CROSS_CHAIN_SEAPORT_V1_6_ADDRESS } from "@opensea/seaport-js/lib/constants"
import { API_V2_PREFIX } from "../api/apiPaths"
import { type Chain, OrderSide } from "../types"
import { getSeaportAddress } from "../utils"
import type { ProtocolData } from "./types"

export const DEFAULT_SEAPORT_CONTRACT_ADDRESS = CROSS_CHAIN_SEAPORT_V1_6_ADDRESS

/**
 * Build the POST /api/v2/offers body for a collection offer.
 *
 * The OpenSea OpenAPI spec uses mixed casing here: the outer envelope
 * (`protocol_address`, `protocol_data`) is snake_case, but the Seaport
 * `parameters` inside `protocol_data` and `numericTraits` inside `criteria`
 * keep their camelCase keys on the wire. Emit the body in exact wire shape
 * so callers can pass `snakeizeBody: false`.
 */
export const getPostCollectionOfferPayload = (
  collectionSlug: string,
  protocolData: ProtocolData,
  chain: Chain,
  traitType?: string,
  traitValue?: string,
  traits?: Array<{ type: string; value: string }>,
  numericTraits?: Array<{ type: string; min?: number; max?: number }>,
) => {
  const payload = {
    criteria: {
      collection: { slug: collectionSlug },
    } as {
      collection: { slug: string }
      traits?: Array<{ type: string; value: string }>
      numericTraits?: Array<{ type: string; min?: number; max?: number }>
    },
    protocol_data: protocolData,
    protocol_address: getSeaportAddress(chain),
  }

  if (traits && traits.length > 0) {
    payload.criteria.traits = traits
  } else if (traitType && traitValue) {
    payload.criteria.traits = [{ type: traitType, value: traitValue }]
  }
  if (numericTraits && numericTraits.length > 0) {
    payload.criteria.numericTraits = numericTraits
  }
  return payload
}

/**
 * Build the POST /api/v2/offers/build body. Same mixed-casing rules as
 * {@link getPostCollectionOfferPayload}: outer `protocol_address` and
 * `offer_protection_enabled` are snake_case, `numericTraits` stays camelCase.
 */
export const getBuildCollectionOfferPayload = (
  offererAddress: string,
  quantity: number,
  collectionSlug: string,
  offerProtectionEnabled: boolean,
  chain: Chain,
  traitType?: string,
  traitValue?: string,
  traits?: Array<{ type: string; value: string }>,
  numericTraits?: Array<{ type: string; min?: number; max?: number }>,
) => {
  const payload = {
    offerer: offererAddress,
    quantity,
    criteria: {
      collection: { slug: collectionSlug },
    } as {
      collection: { slug: string }
      traits?: Array<{ type: string; value: string }>
      numericTraits?: Array<{ type: string; min?: number; max?: number }>
    },
    protocol_address: getSeaportAddress(chain),
    offer_protection_enabled: offerProtectionEnabled,
  }

  if (traits && traits.length > 0) {
    payload.criteria.traits = traits
  } else if (traitType && traitValue) {
    payload.criteria.traits = [{ type: traitType, value: traitValue }]
  }
  if (numericTraits && numericTraits.length > 0) {
    payload.criteria.numericTraits = numericTraits
  }
  return payload
}

export const getFulfillmentDataPath = (side: OrderSide) => {
  const sidePath = side === OrderSide.LISTING ? "listings" : "offers"
  return `${API_V2_PREFIX}/${sidePath}/fulfillment_data`
}

export const getFulfillListingPayload = (
  fulfillerAddress: string,
  orderHash: string,
  protocolAddress: string,
  chain: Chain,
  assetContractAddress?: string,
  tokenId?: string,
  unitsToFill: string = "1",
  recipientAddress?: string,
  includeOptionalCreatorFees: boolean = false,
) => {
  const payload: {
    listing: { hash: string; chain: Chain; protocolAddress: string }
    fulfiller: { address: string }
    consideration?: { assetContractAddress: string; tokenId: string }
    unitsToFill: string
    recipient?: string
    includeOptionalCreatorFees: boolean
  } = {
    listing: {
      hash: orderHash,
      chain,
      protocolAddress,
    },
    fulfiller: { address: fulfillerAddress },
    unitsToFill,
    includeOptionalCreatorFees,
  }

  if (assetContractAddress && tokenId) {
    payload.consideration = { assetContractAddress, tokenId }
  }
  if (recipientAddress) {
    payload.recipient = recipientAddress
  }
  return payload
}

export const getFulfillOfferPayload = (
  fulfillerAddress: string,
  orderHash: string,
  protocolAddress: string,
  chain: Chain,
  assetContractAddress?: string,
  tokenId?: string,
  unitsToFill: string = "1",
  includeOptionalCreatorFees: boolean = false,
) => {
  const payload: {
    offer: { hash: string; chain: Chain; protocolAddress: string }
    fulfiller: { address: string }
    consideration?: { assetContractAddress: string; tokenId: string }
    unitsToFill: string
    includeOptionalCreatorFees: boolean
  } = {
    offer: {
      hash: orderHash,
      chain,
      protocolAddress,
    },
    fulfiller: { address: fulfillerAddress },
    unitsToFill,
    includeOptionalCreatorFees,
  }

  if (assetContractAddress && tokenId) {
    payload.consideration = { assetContractAddress, tokenId }
  }
  return payload
}
