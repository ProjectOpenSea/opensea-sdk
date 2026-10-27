import { describe, expect, test } from "vitest"
import type { ProtocolData } from "../../src/orders/types"
import {
  DEFAULT_SEAPORT_CONTRACT_ADDRESS,
  getBuildCollectionOfferPayload,
  getFulfillListingPayload,
  getFulfillmentDataPath,
  getFulfillOfferPayload,
  getPostCollectionOfferPayload,
} from "../../src/orders/utils"
import { Chain, OrderSide } from "../../src/types"

describe("Orders: utils", () => {
  describe("getFulfillmentDataPath", () => {
    test("should return listings path for LISTING side", () => {
      const result = getFulfillmentDataPath(OrderSide.LISTING)
      expect(result).toBe("/api/v2/listings/fulfillment_data")
    })

    test("should return offers path for OFFER side", () => {
      const result = getFulfillmentDataPath(OrderSide.OFFER)
      expect(result).toBe("/api/v2/offers/fulfillment_data")
    })
  })

  describe("getPostCollectionOfferPayload", () => {
    test("should create basic collection offer payload without traits", () => {
      const protocolData = { parameters: {} } as any as ProtocolData
      const result = getPostCollectionOfferPayload(
        "boredapeyachtclub",
        protocolData,
        Chain.Mainnet,
      )

      expect(result).toEqual({
        criteria: {
          collection: { slug: "boredapeyachtclub" },
        },
        protocol_data: protocolData,
        protocol_address: DEFAULT_SEAPORT_CONTRACT_ADDRESS,
      })
    })

    test("sends traitType and traitValue as a one-element traits array", () => {
      const protocolData = { parameters: {} } as any as ProtocolData
      const result = getPostCollectionOfferPayload(
        "boredapeyachtclub",
        protocolData,
        Chain.Mainnet,
        "Background",
        "Blue",
      )

      expect(result.criteria.traits).toEqual([
        { type: "Background", value: "Blue" },
      ])
      expect(result.criteria).not.toHaveProperty("trait")
    })

    test("should not add trait criteria when only traitType is provided", () => {
      const protocolData = { parameters: {} } as any as ProtocolData
      const result = getPostCollectionOfferPayload(
        "boredapeyachtclub",
        protocolData,
        Chain.Mainnet,
        "Background",
      )

      expect(result.criteria.traits).toBeUndefined()
      expect(result.criteria).not.toHaveProperty("trait")
    })

    test("should not add trait criteria when only traitValue is provided", () => {
      const protocolData = { parameters: {} } as any as ProtocolData
      const result = getPostCollectionOfferPayload(
        "boredapeyachtclub",
        protocolData,
        Chain.Mainnet,
        undefined,
        "Blue",
      )

      expect(result.criteria.traits).toBeUndefined()
      expect(result.criteria).not.toHaveProperty("trait")
    })

    test("should add traits array when provided", () => {
      const protocolData = { parameters: {} } as any as ProtocolData
      const traits = [
        { type: "Background", value: "Blue" },
        { type: "Hat", value: "Beanie" },
      ]
      const result = getPostCollectionOfferPayload(
        "boredapeyachtclub",
        protocolData,
        Chain.Mainnet,
        undefined,
        undefined,
        traits,
      )

      expect(result.criteria).toHaveProperty("traits")
      expect((result.criteria as any).traits).toEqual(traits)
    })

    test("should prioritize traits array over individual traitType/traitValue", () => {
      const protocolData = { parameters: {} } as any as ProtocolData
      const traits = [
        { type: "Background", value: "Blue" },
        { type: "Hat", value: "Beanie" },
      ]
      const result = getPostCollectionOfferPayload(
        "boredapeyachtclub",
        protocolData,
        Chain.Mainnet,
        "Fur",
        "Brown",
        traits,
      )

      expect(result.criteria).toHaveProperty("traits")
      expect((result.criteria as any).traits).toEqual(traits)
      expect(result.criteria).not.toHaveProperty("trait")
    })

    test("should not add traits when empty array is provided", () => {
      const protocolData = { parameters: {} } as any as ProtocolData
      const result = getPostCollectionOfferPayload(
        "boredapeyachtclub",
        protocolData,
        Chain.Mainnet,
        undefined,
        undefined,
        [],
      )

      expect((result.criteria as any).traits).toBeUndefined()
      expect(result.criteria).not.toHaveProperty("trait")
    })

    test("should add numericTraits when provided", () => {
      const protocolData = { parameters: {} } as any as ProtocolData
      const numericTraits = [
        { type: "Level", min: 1, max: 10 },
        { type: "Power", min: 50 },
      ]
      const result = getPostCollectionOfferPayload(
        "boredapeyachtclub",
        protocolData,
        Chain.Mainnet,
        undefined,
        undefined,
        undefined,
        numericTraits,
      )

      expect((result.criteria as any).numericTraits).toEqual(numericTraits)
    })

    test("should add both traits and numericTraits when both provided", () => {
      const protocolData = { parameters: {} } as any as ProtocolData
      const traits = [{ type: "Background", value: "Blue" }]
      const numericTraits = [{ type: "Level", min: 1, max: 10 }]
      const result = getPostCollectionOfferPayload(
        "boredapeyachtclub",
        protocolData,
        Chain.Mainnet,
        undefined,
        undefined,
        traits,
        numericTraits,
      )

      expect((result.criteria as any).traits).toEqual(traits)
      expect((result.criteria as any).numericTraits).toEqual(numericTraits)
    })

    test("should not add numericTraits when empty array is provided", () => {
      const protocolData = { parameters: {} } as any as ProtocolData
      const result = getPostCollectionOfferPayload(
        "boredapeyachtclub",
        protocolData,
        Chain.Mainnet,
        undefined,
        undefined,
        undefined,
        [],
      )

      expect((result.criteria as any).numericTraits).toBeUndefined()
    })
  })

  describe("getBuildCollectionOfferPayload", () => {
    test("should create basic build collection offer payload without traits", () => {
      const result = getBuildCollectionOfferPayload(
        "0xOfferer",
        5,
        "boredapeyachtclub",
        true,
        Chain.Mainnet,
      )

      expect(result).toEqual({
        offerer: "0xOfferer",
        quantity: 5,
        criteria: {
          collection: {
            slug: "boredapeyachtclub",
          },
        },
        protocol_address: DEFAULT_SEAPORT_CONTRACT_ADDRESS,
        offer_protection_enabled: true,
      })
    })

    test("sends traitType and traitValue as a one-element traits array", () => {
      const result = getBuildCollectionOfferPayload(
        "0xOfferer",
        3,
        "boredapeyachtclub",
        false,
        Chain.Mainnet,
        "Hat",
        "Crown",
      )

      expect(result.criteria.traits).toEqual([{ type: "Hat", value: "Crown" }])
      expect(result.criteria).not.toHaveProperty("trait")
      expect(result.offer_protection_enabled).toBe(false)
    })

    test("should add traits array when provided", () => {
      const traits = [
        { type: "Background", value: "Blue" },
        { type: "Hat", value: "Beanie" },
      ]
      const result = getBuildCollectionOfferPayload(
        "0xOfferer",
        2,
        "boredapeyachtclub",
        true,
        Chain.Mainnet,
        undefined,
        undefined,
        traits,
      )

      expect(result.criteria).toHaveProperty("traits")
      expect((result.criteria as any).traits).toEqual(traits)
    })

    test("should prioritize traits array over individual traitType/traitValue", () => {
      const traits = [
        { type: "Background", value: "Blue" },
        { type: "Fur", value: "Golden" },
      ]
      const result = getBuildCollectionOfferPayload(
        "0xOfferer",
        1,
        "boredapeyachtclub",
        false,
        Chain.Mainnet,
        "Hat",
        "Crown",
        traits,
      )

      expect(result.criteria).toHaveProperty("traits")
      expect((result.criteria as any).traits).toEqual(traits)
      expect(result.criteria).not.toHaveProperty("trait")
    })

    test("should not add traits when empty array is provided", () => {
      const result = getBuildCollectionOfferPayload(
        "0xOfferer",
        5,
        "boredapeyachtclub",
        true,
        Chain.Mainnet,
        undefined,
        undefined,
        [],
      )

      expect((result.criteria as any).traits).toBeUndefined()
      expect(result.criteria).not.toHaveProperty("trait")
    })

    test("should add numericTraits when provided", () => {
      const numericTraits = [
        { type: "Level", min: 1, max: 10 },
        { type: "Power", min: 50 },
      ]
      const result = getBuildCollectionOfferPayload(
        "0xOfferer",
        2,
        "boredapeyachtclub",
        true,
        Chain.Mainnet,
        undefined,
        undefined,
        undefined,
        numericTraits,
      )

      expect((result.criteria as any).numericTraits).toEqual(numericTraits)
    })

    test("should add both traits and numericTraits when both provided", () => {
      const traits = [{ type: "Background", value: "Blue" }]
      const numericTraits = [{ type: "Level", min: 1, max: 10 }]
      const result = getBuildCollectionOfferPayload(
        "0xOfferer",
        2,
        "boredapeyachtclub",
        true,
        Chain.Mainnet,
        undefined,
        undefined,
        traits,
        numericTraits,
      )

      expect((result.criteria as any).traits).toEqual(traits)
      expect((result.criteria as any).numericTraits).toEqual(numericTraits)
    })

    test("should not add numericTraits when empty array is provided", () => {
      const result = getBuildCollectionOfferPayload(
        "0xOfferer",
        5,
        "boredapeyachtclub",
        true,
        Chain.Mainnet,
        undefined,
        undefined,
        undefined,
        [],
      )

      expect((result.criteria as any).numericTraits).toBeUndefined()
    })
  })

  describe("getFulfillListingPayload", () => {
    test("should create basic listing fulfillment payload without consideration", () => {
      const result = getFulfillListingPayload(
        "0xFulfiller",
        "0xOrderHash",
        "0xProtocol",
        Chain.Mainnet,
      )

      expect(result).toEqual({
        listing: {
          hash: "0xOrderHash",
          chain: Chain.Mainnet,
          protocolAddress: "0xProtocol",
        },
        fulfiller: {
          address: "0xFulfiller",
        },
        unitsToFill: "1",
        includeOptionalCreatorFees: false,
      })
      expect(result.consideration).toBeUndefined()
    })

    test("should include includeOptionalCreatorFees when set to true", () => {
      const result = getFulfillListingPayload(
        "0xFulfiller",
        "0xOrderHash",
        "0xProtocol",
        Chain.Mainnet,
        undefined,
        undefined,
        "1",
        undefined,
        true,
      )

      expect(result.includeOptionalCreatorFees).toBe(true)
    })

    test("should add consideration for criteria listings", () => {
      const result = getFulfillListingPayload(
        "0xFulfiller",
        "0xOrderHash",
        "0xProtocol",
        Chain.Mainnet,
        "0xAssetContract",
        "123",
      )

      expect(result.consideration).toEqual({
        assetContractAddress: "0xAssetContract",
        tokenId: "123",
      })
    })

    test("should not add consideration when only assetContractAddress is provided", () => {
      const result = getFulfillListingPayload(
        "0xFulfiller",
        "0xOrderHash",
        "0xProtocol",
        Chain.Mainnet,
        "0xAssetContract",
      )

      expect(result.consideration).toBeUndefined()
    })

    test("should not add consideration when only tokenId is provided", () => {
      const result = getFulfillListingPayload(
        "0xFulfiller",
        "0xOrderHash",
        "0xProtocol",
        Chain.Mainnet,
        undefined,
        "123",
      )

      expect(result.consideration).toBeUndefined()
    })
  })

  describe("getFulfillOfferPayload", () => {
    test("should create basic offer fulfillment payload without consideration", () => {
      const result = getFulfillOfferPayload(
        "0xFulfiller",
        "0xOrderHash",
        "0xProtocol",
        Chain.Polygon,
      )

      expect(result).toEqual({
        offer: {
          hash: "0xOrderHash",
          chain: Chain.Polygon,
          protocolAddress: "0xProtocol",
        },
        fulfiller: {
          address: "0xFulfiller",
        },
        unitsToFill: "1",
        includeOptionalCreatorFees: false,
      })
      expect(result.consideration).toBeUndefined()
    })

    test("should add consideration for criteria offers", () => {
      const result = getFulfillOfferPayload(
        "0xFulfiller",
        "0xOrderHash",
        "0xProtocol",
        Chain.Polygon,
        "0xAssetContract",
        "456",
      )

      expect(result.consideration).toEqual({
        assetContractAddress: "0xAssetContract",
        tokenId: "456",
      })
    })

    test("should include includeOptionalCreatorFees when set to true", () => {
      const result = getFulfillOfferPayload(
        "0xFulfiller",
        "0xOrderHash",
        "0xProtocol",
        Chain.Polygon,
        undefined,
        undefined,
        "1",
        true,
      )

      expect(result.includeOptionalCreatorFees).toBe(true)
    })
  })
})
