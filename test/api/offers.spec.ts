import type { OrderComponents } from "@opensea/seaport-js/lib/types"
import { describe, expect, test, vi } from "vitest"
import { OffersAPI } from "../../src/api/offers"
import type {
  BuildOfferResponse,
  CollectionOffer,
  GetBestOfferResponse,
  GetOffersResponse,
  Offer,
} from "../../src/api/types"
import type { ProtocolData } from "../../src/orders/types"
import { Chain } from "../../src/types"
import { createMockFetcher } from "../fixtures/fetcher"

describe("API: OffersAPI", () => {
  let mockGet: ReturnType<typeof vi.fn>
  let mockPost: ReturnType<typeof vi.fn>
  let offersAPI: OffersAPI

  beforeEach(() => {
    const {
      fetcher,
      mockGet: getMock,
      mockPost: postMock,
    } = createMockFetcher()
    mockGet = getMock
    mockPost = postMock
    offersAPI = new OffersAPI(fetcher, Chain.Mainnet)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("getAllOffers", () => {
    test("fetches all offers for a collection without parameters", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [
          {
            orderHash: "0x123",
            chain: Chain.Mainnet,
            type: "basic",
            price: {
              current: {
                currency: "WETH",
                decimals: 18,
                value: "500000000000000000",
              },
            },
            protocolData: {} as unknown as ProtocolData,
            protocolAddress: "0xabc",
          } as unknown as Offer,
        ],
        next: "cursor-123",
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await offersAPI.getAllOffers("test-collection")

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/offers/collection/test-collection/all",
      )
      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: undefined,
        next: undefined,
      })
      expect(result.offers).toHaveLength(1)
      expect(result.next).toBe("cursor-123")
    })

    test("fetches all offers with limit parameter", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await offersAPI.getAllOffers("test-collection", 50)

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: 50,
        next: undefined,
      })
    })

    test("fetches all offers with pagination cursor", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [],
        next: "cursor-456",
      }

      mockGet.mockResolvedValue(mockResponse)

      await offersAPI.getAllOffers("test-collection", undefined, "cursor-123")

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: undefined,
        next: "cursor-123",
      })
    })

    test("fetches all offers with both limit and pagination", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await offersAPI.getAllOffers("test-collection", 25, "cursor-xyz")

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: 25,
        next: "cursor-xyz",
      })
    })

    test("filters all offers by maker", async () => {
      mockGet.mockResolvedValue({ offers: [], next: undefined })

      await offersAPI.getAllOffers("test-collection", 10, undefined, "0xabc")

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: 10,
        maker: "0xabc",
      })
    })

    test("handles empty offers array", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await offersAPI.getAllOffers("test-collection")

      expect(result.offers).toEqual([])
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("Collection not found"))

      try {
        await offersAPI.getAllOffers("nonexistent-collection")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Collection not found")
      }
    })
  })

  describe("getTraitOffers", () => {
    test("fetches trait offers without optional parameters", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [
          {
            orderHash: "0xabc",
          } as unknown as Offer,
        ],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await offersAPI.getTraitOffers(
        "test-collection",
        "Background",
        "Blue",
      )

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/offers/collection/test-collection/traits",
      )
      expect(mockGet.mock.calls[0][1]).toEqual({
        type: "Background",
        value: "Blue",
        limit: undefined,
        next: undefined,
        floatValue: undefined,
        intValue: undefined,
      })
      expect(result.offers).toHaveLength(1)
    })

    test("fetches trait offers with limit parameter", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await offersAPI.getTraitOffers("test-collection", "Background", "Red", 30)

      expect(mockGet.mock.calls[0][1]).toMatchObject({
        type: "Background",
        value: "Red",
        limit: 30,
      })
    })

    test("fetches trait offers with pagination cursor", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await offersAPI.getTraitOffers(
        "test-collection",
        "Eyes",
        "Laser",
        undefined,
        "cursor-abc",
      )

      expect(mockGet.mock.calls[0][1]).toMatchObject({
        type: "Eyes",
        value: "Laser",
        next: "cursor-abc",
      })
    })

    test("fetches trait offers with float value", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await offersAPI.getTraitOffers(
        "test-collection",
        "Rarity",
        "Score",
        undefined,
        undefined,
        95.5,
      )

      expect(mockGet.mock.calls[0][1]).toMatchObject({
        type: "Rarity",
        value: "Score",
        floatValue: 95.5,
      })
    })

    test("fetches trait offers with int value", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await offersAPI.getTraitOffers(
        "test-collection",
        "Level",
        "Power",
        undefined,
        undefined,
        undefined,
        100,
      )

      expect(mockGet.mock.calls[0][1]).toMatchObject({
        type: "Level",
        value: "Power",
        intValue: 100,
      })
    })

    test("fetches trait offers with all parameters", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await offersAPI.getTraitOffers(
        "test-collection",
        "Trait",
        "Value",
        20,
        "cursor-xyz",
        75.5,
        50,
      )

      expect(mockGet.mock.calls[0][1]).toEqual({
        type: "Trait",
        value: "Value",
        limit: 20,
        next: "cursor-xyz",
        floatValue: 75.5,
        intValue: 50,
      })
    })

    test("handles empty offers array", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await offersAPI.getTraitOffers(
        "test-collection",
        "Type",
        "Value",
      )

      expect(result.offers).toEqual([])
    })

    test("sends a numeric range with mode", async () => {
      mockGet.mockResolvedValue({ offers: [], next: undefined })

      await offersAPI.getTraitOffers(
        "test-collection",
        "Level",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { mode: "NUMERIC", minValue: 1, maxValue: 5 },
      )

      expect(mockGet.mock.calls[0][1]).toEqual({
        type: "Level",
        mode: "NUMERIC",
        minValue: 1,
        maxValue: 5,
      })
    })

    test("JSON-encodes multi-trait filters", async () => {
      mockGet.mockResolvedValue({ offers: [], next: undefined })

      await offersAPI.getTraitOffers(
        "test-collection",
        undefined,
        undefined,
        20,
        undefined,
        undefined,
        undefined,
        {
          mode: "MULTI",
          traits: [
            { traitType: "Background", value: "Red" },
            { traitType: "Eyes", value: "Laser" },
          ],
        },
      )

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: 20,
        mode: "MULTI",
        traits:
          '[{"traitType":"Background","value":"Red"},{"traitType":"Eyes","value":"Laser"}]',
      })
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("Trait not found"))

      try {
        await offersAPI.getTraitOffers("test-collection", "Invalid", "Trait")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Trait not found")
      }
    })
  })

  describe("getBestOffer", () => {
    test("fetches best offer with string tokenId", async () => {
      const mockResponse: GetBestOfferResponse = {
        orderHash: "0xbest123",
        chain: Chain.Mainnet,
        type: "basic",
        price: {
          current: {
            currency: "WETH",
            decimals: 18,
            value: "750000000000000000",
          },
        },
        protocolData: {} as unknown as ProtocolData,
        protocolAddress: "0xdef456",
      } as unknown as GetBestOfferResponse

      mockGet.mockResolvedValue(mockResponse)

      const result = await offersAPI.getBestOffer("test-collection", "1234")

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/offers/collection/test-collection/nfts/1234/best",
      )
      expect(mockGet.mock.calls[0][1]).toBeUndefined()
      expect(result.orderHash).toBe("0xbest123")
    })

    test("fetches best offer with number tokenId", async () => {
      const mockResponse: GetBestOfferResponse = {
        orderHash: "0xdef",
      } as unknown as GetBestOfferResponse

      mockGet.mockResolvedValue(mockResponse)

      await offersAPI.getBestOffer("test-collection", 5678)

      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/offers/collection/test-collection/nfts/5678/best",
      )
    })

    test("handles large token IDs", async () => {
      const mockResponse: GetBestOfferResponse = {
        orderHash: "0x123",
      } as unknown as GetBestOfferResponse

      mockGet.mockResolvedValue(mockResponse)

      const largeTokenId = "99999999999999999999"
      await offersAPI.getBestOffer("test-collection", largeTokenId)

      expect(mockGet.mock.calls[0][0]).toContain(largeTokenId)
    })

    test("throws error when no offer found", async () => {
      mockGet.mockRejectedValue(new Error("No offer found"))

      try {
        await offersAPI.getBestOffer("test-collection", "999")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("No offer found")
      }
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("Server Error"))

      try {
        await offersAPI.getBestOffer("test-collection", "123")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Server Error")
      }
    })
  })

  describe("buildOffer", () => {
    test("builds collection offer without trait parameters", async () => {
      const mockResponse: BuildOfferResponse = {
        partialParameters: {
          offerer: "0xofferer123",
          offer: [],
          consideration: [],
        } as unknown as BuildOfferResponse["partialParameters"],
        criteria: { collection: { slug: "test-collection" } },
      }

      mockPost.mockResolvedValue(mockResponse)

      const result = await offersAPI.buildOffer(
        "0xofferer123",
        5,
        "test-collection",
        true,
      )

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(mockPost.mock.calls[0][0]).toBe("/api/v2/offers/build")
      expect(result.partialParameters).toBeDefined()
    })

    test("builds collection offer with offerProtectionEnabled false", async () => {
      const mockResponse: BuildOfferResponse = {
        partialParameters:
          {} as unknown as BuildOfferResponse["partialParameters"],
        criteria: { collection: { slug: "test-collection" } },
      }

      mockPost.mockResolvedValue(mockResponse)

      await offersAPI.buildOffer("0xofferer123", 10, "test-collection", false)

      expect(mockPost).toHaveBeenCalledTimes(1)
    })

    test("builds collection offer with trait type and value", async () => {
      const mockResponse: BuildOfferResponse = {
        partialParameters:
          {} as unknown as BuildOfferResponse["partialParameters"],
        criteria: { collection: { slug: "test-collection" } },
      }

      mockPost.mockResolvedValue(mockResponse)

      await offersAPI.buildOffer(
        "0xofferer123",
        3,
        "test-collection",
        true,
        "Background",
        "Blue",
      )

      expect(mockPost).toHaveBeenCalledTimes(1)
    })

    test("throws error when only traitType is provided", async () => {
      try {
        await offersAPI.buildOffer(
          "0xofferer123",
          5,
          "test-collection",
          true,
          "Background",
          undefined,
        )
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain(
          "Both traitType and traitValue must be defined if one is defined",
        )
      }
    })

    test("throws error when only traitValue is provided", async () => {
      try {
        await offersAPI.buildOffer(
          "0xofferer123",
          5,
          "test-collection",
          true,
          undefined,
          "Blue",
        )
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain(
          "Both traitType and traitValue must be defined if one is defined",
        )
      }
    })

    test("builds collection offer with multiple traits", async () => {
      const mockResponse: BuildOfferResponse = {
        partialParameters:
          {} as unknown as BuildOfferResponse["partialParameters"],
        criteria: { collection: { slug: "test-collection" } },
      }

      mockPost.mockResolvedValue(mockResponse)

      const traits = [
        { type: "Background", value: "Blue" },
        { type: "Hat", value: "Beanie" },
      ]

      await offersAPI.buildOffer(
        "0xofferer123",
        2,
        "test-collection",
        true,
        undefined,
        undefined,
        traits,
      )

      expect(mockPost).toHaveBeenCalledTimes(1)
    })

    test("throws error when both traits array and traitType/traitValue are provided", async () => {
      const traits = [
        { type: "Background", value: "Blue" },
        { type: "Hat", value: "Beanie" },
      ]

      try {
        await offersAPI.buildOffer(
          "0xofferer123",
          5,
          "test-collection",
          true,
          "Fur",
          "Golden",
          traits,
        )
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain(
          "Cannot use both 'traits' array and individual 'traitType'/'traitValue' parameters",
        )
      }
    })

    test("throws error when trait in array is missing type", async () => {
      const traits = [
        { type: "Background", value: "Blue" },
        { type: "", value: "Beanie" },
      ]

      try {
        await offersAPI.buildOffer(
          "0xofferer123",
          5,
          "test-collection",
          true,
          undefined,
          undefined,
          traits,
        )
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain(
          "Each trait must have both 'type' and 'value' properties",
        )
      }
    })

    test("throws error when trait in array is missing value", async () => {
      const traits = [
        { type: "Background", value: "Blue" },
        { type: "Hat", value: "" },
      ]

      try {
        await offersAPI.buildOffer(
          "0xofferer123",
          5,
          "test-collection",
          true,
          undefined,
          undefined,
          traits,
        )
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain(
          "Each trait must have both 'type' and 'value' properties",
        )
      }
    })

    test("builds collection offer with numeric traits", async () => {
      const mockResponse: BuildOfferResponse = {
        partialParameters:
          {} as unknown as BuildOfferResponse["partialParameters"],
        criteria: { collection: { slug: "test-collection" } },
      }

      mockPost.mockResolvedValue(mockResponse)

      const numericTraits = [
        { type: "Level", min: 1, max: 10 },
        { type: "Power", min: 50 },
      ]

      await offersAPI.buildOffer(
        "0xofferer123",
        2,
        "test-collection",
        true,
        undefined,
        undefined,
        undefined,
        numericTraits,
      )

      expect(mockPost).toHaveBeenCalledTimes(1)
    })

    test("builds collection offer with both string traits and numeric traits", async () => {
      const mockResponse: BuildOfferResponse = {
        partialParameters:
          {} as unknown as BuildOfferResponse["partialParameters"],
        criteria: { collection: { slug: "test-collection" } },
      }

      mockPost.mockResolvedValue(mockResponse)

      const traits = [{ type: "Background", value: "Blue" }]
      const numericTraits = [{ type: "Level", min: 1, max: 10 }]

      await offersAPI.buildOffer(
        "0xofferer123",
        2,
        "test-collection",
        true,
        undefined,
        undefined,
        traits,
        numericTraits,
      )

      expect(mockPost).toHaveBeenCalledTimes(1)
    })

    test("throws error when numeric trait is missing type", async () => {
      const numericTraits = [{ type: "", min: 1, max: 10 }]

      try {
        await offersAPI.buildOffer(
          "0xofferer123",
          5,
          "test-collection",
          true,
          undefined,
          undefined,
          undefined,
          numericTraits,
        )
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain(
          "Each numeric trait must have a 'type' property",
        )
      }
    })

    test("throws error when numeric trait has neither min nor max", async () => {
      const numericTraits = [{ type: "Level" }]

      try {
        await offersAPI.buildOffer(
          "0xofferer123",
          5,
          "test-collection",
          true,
          undefined,
          undefined,
          undefined,
          numericTraits,
        )
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain(
          "must have at least one of 'min' or 'max'",
        )
      }
    })

    test("throws error when numeric trait min > max", async () => {
      const numericTraits = [{ type: "Level", min: 10, max: 1 }]

      try {
        await offersAPI.buildOffer(
          "0xofferer123",
          5,
          "test-collection",
          true,
          undefined,
          undefined,
          undefined,
          numericTraits,
        )
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain(
          "'min' (10) must be <= 'max' (1)",
        )
      }
    })

    test("throws error on API failure", async () => {
      mockPost.mockRejectedValue(new Error("Build failed"))

      try {
        await offersAPI.buildOffer("0xofferer123", 5, "test-collection", true)
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Build failed")
      }
    })
  })

  describe("getCollectionOffers", () => {
    test("fetches collection offers for a slug without parameters", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [
          {
            orderHash: "0x123",
            chain: Chain.Mainnet,
            protocolData: {} as unknown as ProtocolData,
            protocolAddress: "0xabc",
          } as unknown as Offer,
        ],
        next: "cursor-123",
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await offersAPI.getCollectionOffers("test-collection")

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/offers/collection/test-collection",
      )
      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: undefined,
        next: undefined,
      })
      expect(result.offers).toHaveLength(1)
      expect(result.next).toBe("cursor-123")
    })

    test("fetches collection offers with limit parameter", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await offersAPI.getCollectionOffers("test-collection", 50)

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: 50,
        next: undefined,
      })
    })

    test("fetches collection offers with pagination cursor", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [],
        next: "cursor-next",
      }

      mockGet.mockResolvedValue(mockResponse)

      await offersAPI.getCollectionOffers(
        "test-collection",
        undefined,
        "cursor-prev",
      )

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: undefined,
        next: "cursor-prev",
      })
    })

    test("handles empty offers list", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await offersAPI.getCollectionOffers("test-collection")

      expect(result.offers).toEqual([])
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("Collection not found"))

      try {
        await offersAPI.getCollectionOffers("nonexistent-collection")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Collection not found")
      }
    })
  })

  describe("postCollectionOffer", () => {
    test("posts collection offer without trait parameters", async () => {
      const mockOrder: ProtocolData = {
        parameters: {
          offerer: "0xofferer123",
          offer: [],
          consideration: [],
        } as unknown as OrderComponents,
        signature: "0xsig123",
      }

      const mockResponse: CollectionOffer = {
        protocolData: mockOrder,
        protocolAddress: "0xabc",
      } as unknown as CollectionOffer

      mockPost.mockResolvedValue(mockResponse)

      const result = await offersAPI.postCollectionOffer(
        mockOrder,
        "test-collection",
      )

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(mockPost.mock.calls[0][0]).toBe("/api/v2/offers")
      expect(result).toEqual(mockResponse)
    })

    test("posts collection offer with trait type and value", async () => {
      const mockOrder: ProtocolData = {
        parameters: {} as unknown as OrderComponents,
        signature: "0xsig456",
      }

      const mockResponse: CollectionOffer = {
        protocolData: mockOrder,
      } as unknown as CollectionOffer

      mockPost.mockResolvedValue(mockResponse)

      await offersAPI.postCollectionOffer(
        mockOrder,
        "test-collection",
        "Background",
        "Red",
      )

      expect(mockPost).toHaveBeenCalledTimes(1)
    })

    test("posts collection offer with multiple traits", async () => {
      const mockOrder: ProtocolData = {
        parameters: {} as unknown as OrderComponents,
        signature: "0xsig789",
      }

      const mockResponse: CollectionOffer = {
        protocolData: mockOrder,
      } as unknown as CollectionOffer

      mockPost.mockResolvedValue(mockResponse)

      const traits = [
        { type: "Background", value: "Blue" },
        { type: "Hat", value: "Beanie" },
      ]

      await offersAPI.postCollectionOffer(
        mockOrder,
        "test-collection",
        undefined,
        undefined,
        traits,
      )

      expect(mockPost).toHaveBeenCalledTimes(1)
    })

    test("returns null when appropriate", async () => {
      const mockOrder: ProtocolData = {
        parameters: {} as unknown as OrderComponents,
        signature: "0xsig",
      }

      mockPost.mockResolvedValue(null)

      const result = await offersAPI.postCollectionOffer(
        mockOrder,
        "test-collection",
      )

      expect(result).toBeNull()
    })

    test("throws error on API failure", async () => {
      const mockOrder: ProtocolData = {
        parameters: {} as unknown as OrderComponents,
        signature: "0xsig",
      }

      mockPost.mockRejectedValue(new Error("Post failed"))

      try {
        await offersAPI.postCollectionOffer(mockOrder, "test-collection")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Post failed")
      }
    })

    test("throws error when both traits array and traitType/traitValue are provided", async () => {
      const mockOrder: ProtocolData = {
        parameters: {} as unknown as OrderComponents,
        signature: "0xsig",
      }

      try {
        await offersAPI.postCollectionOffer(
          mockOrder,
          "test-collection",
          "Background",
          "Blue",
          [{ type: "Background", value: "Blue" }],
        )
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain(
          "Cannot use both 'traits' array and individual",
        )
      }
    })

    test("throws error when only traitType is provided without traitValue", async () => {
      const mockOrder: ProtocolData = {
        parameters: {} as unknown as OrderComponents,
        signature: "0xsig",
      }

      try {
        await offersAPI.postCollectionOffer(
          mockOrder,
          "test-collection",
          "Background",
        )
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain(
          "Both traitType and traitValue must be defined",
        )
      }
    })

    test("throws error when trait in array is missing type", async () => {
      const mockOrder: ProtocolData = {
        parameters: {} as unknown as OrderComponents,
        signature: "0xsig",
      }

      try {
        await offersAPI.postCollectionOffer(
          mockOrder,
          "test-collection",
          undefined,
          undefined,
          [{ type: "", value: "Blue" }],
        )
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain(
          "Each trait must have both 'type' and 'value'",
        )
      }
    })

    test("throws error when numeric trait is missing type", async () => {
      const mockOrder: ProtocolData = {
        parameters: {} as unknown as OrderComponents,
        signature: "0xsig",
      }

      try {
        await offersAPI.postCollectionOffer(
          mockOrder,
          "test-collection",
          undefined,
          undefined,
          undefined,
          [{ type: "", min: 1, max: 10 }],
        )
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain(
          "Each numeric trait must have a 'type' property",
        )
      }
    })

    test("throws error when numeric trait min > max", async () => {
      const mockOrder: ProtocolData = {
        parameters: {} as unknown as OrderComponents,
        signature: "0xsig",
      }

      try {
        await offersAPI.postCollectionOffer(
          mockOrder,
          "test-collection",
          undefined,
          undefined,
          undefined,
          [{ type: "Speed", min: 100, max: 10 }],
        )
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain(
          "'min' (100) must be <= 'max' (10)",
        )
      }
    })
  })

  describe("getOffersByNFT", () => {
    test("fetches offers for a specific NFT", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [
          {
            orderHash: "0x123",
            chain: Chain.Mainnet,
            protocolData: {} as unknown as ProtocolData,
            protocolAddress: "0xabc",
            price: {
              currency: "WETH",
              decimals: 18,
              value: "500000000000000000",
            },
          } as unknown as Offer,
        ],
        next: "cursor-123",
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await offersAPI.getOffersByNFT("azuki", "1")

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/offers/collection/azuki/nfts/1",
      )
      expect(result.offers).toHaveLength(1)
      expect(result.next).toBe("cursor-123")
    })

    test("fetches offers with limit and pagination", async () => {
      const mockResponse: GetOffersResponse = {
        offers: [],
        next: "cursor-next",
      }

      mockGet.mockResolvedValue(mockResponse)

      await offersAPI.getOffersByNFT("azuki", "1", 50, "cursor-prev")

      expect(mockGet.mock.calls[0][1]).toMatchObject({
        limit: 50,
        next: "cursor-prev",
      })
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("NFT not found"))

      await expect(offersAPI.getOffersByNFT("azuki", "999")).rejects.toThrow(
        "NFT not found",
      )
    })
  })

  describe("Constructor", () => {
    test("initializes with get and post functions", () => {
      const { fetcher } = createMockFetcher()
      const api = new OffersAPI(fetcher, Chain.Mainnet)

      expect(api).toBeInstanceOf(OffersAPI)
    })
  })
})
