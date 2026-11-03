import { describe, expect, test, vi } from "vitest"
import { ListingsAPI } from "../../src/api/listings"
import type {
  CrossChainFulfillmentResponse,
  GetBestListingResponse,
  GetListingsResponse,
  Listing,
} from "../../src/api/types"
import type { OrderV2 } from "../../src/orders/types"
import { Chain } from "../../src/types"
import { createMockFetcher } from "../fixtures/fetcher"

describe("API: ListingsAPI", () => {
  let mockGet: ReturnType<typeof vi.fn>
  let mockPost: ReturnType<typeof vi.fn>
  let listingsAPI: ListingsAPI

  beforeEach(() => {
    const {
      fetcher,
      mockGet: getMock,
      mockPost: postMock,
    } = createMockFetcher()
    mockGet = getMock
    mockPost = postMock
    listingsAPI = new ListingsAPI(fetcher)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("getAllListings", () => {
    test("fetches all listings for a collection without parameters", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [
          {
            orderHash: "0x123",
            chain: Chain.Mainnet,
            type: "basic",
            price: {
              current: {
                currency: "ETH",
                decimals: 18,
                value: "1000000000000000000",
              },
            },
            protocolData: {} as unknown as OrderV2,
            protocolAddress: "0xabc",
          } as unknown as Listing,
        ],
        next: "cursor-123",
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await listingsAPI.getAllListings("test-collection")

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/listings/collection/test-collection/all",
      )
      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: undefined,
        next: undefined,
      })
      expect(result.listings).toHaveLength(1)
      expect(result.next).toBe("cursor-123")
    })

    test("fetches all listings with limit parameter", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await listingsAPI.getAllListings("test-collection", 50)

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: 50,
        next: undefined,
      })
    })

    test("fetches all listings with pagination cursor", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [],
        next: "cursor-456",
      }

      mockGet.mockResolvedValue(mockResponse)

      await listingsAPI.getAllListings(
        "test-collection",
        undefined,
        "cursor-123",
      )

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: undefined,
        next: "cursor-123",
      })
    })

    test("fetches all listings with both limit and pagination", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await listingsAPI.getAllListings("test-collection", 25, "cursor-xyz")

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: 25,
        next: "cursor-xyz",
      })
    })

    test("filters all listings by maker", async () => {
      mockGet.mockResolvedValue({ listings: [], next: undefined })

      await listingsAPI.getAllListings(
        "test-collection",
        undefined,
        undefined,
        true,
        "0xabc",
      )

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: undefined,
        next: undefined,
        includePrivateListings: true,
        maker: "0xabc",
      })
    })

    test("handles collection slug with special characters", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await listingsAPI.getAllListings("collection-name-123")

      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/listings/collection/collection-name-123/all",
      )
    })

    test("handles empty listings array", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await listingsAPI.getAllListings("test-collection")

      expect(result.listings).toEqual([])
    })

    test("handles multiple listings in response", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [
          { orderHash: "0x1" } as unknown as Listing,
          { orderHash: "0x2" } as unknown as Listing,
          { orderHash: "0x3" } as unknown as Listing,
        ],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await listingsAPI.getAllListings("test-collection")

      expect(result.listings).toHaveLength(3)
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("API Error"))

      try {
        await listingsAPI.getAllListings("test-collection")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("API Error")
      }
    })

    test("throws error when collection not found", async () => {
      mockGet.mockRejectedValue(new Error("Collection not found"))

      try {
        await listingsAPI.getAllListings("nonexistent-collection")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Collection not found")
      }
    })
  })

  describe("getBestListing", () => {
    test("fetches best listing for a token with string tokenId", async () => {
      const mockResponse: GetBestListingResponse = {
        orderHash: "0xabc123",
        chain: Chain.Mainnet,
        type: "basic",
        price: {
          current: {
            currency: "ETH",
            decimals: 18,
            value: "1500000000000000000",
          },
        },
        protocolData: {} as unknown as OrderV2,
        protocolAddress: "0xdef456",
      } as unknown as Listing

      mockGet.mockResolvedValue(mockResponse)

      const result = await listingsAPI.getBestListing("test-collection", "1234")

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/listings/collection/test-collection/nfts/1234/best",
      )
      expect(mockGet.mock.calls[0][1]).toBeUndefined()
      expect(result.orderHash).toBe("0xabc123")
    })

    test("fetches best listing for a token with number tokenId", async () => {
      const mockResponse: GetBestListingResponse = {
        orderHash: "0xdef",
      } as unknown as Listing

      mockGet.mockResolvedValue(mockResponse)

      await listingsAPI.getBestListing("test-collection", 5678)

      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/listings/collection/test-collection/nfts/5678/best",
      )
    })

    test("handles large token IDs", async () => {
      const mockResponse: GetBestListingResponse = {
        orderHash: "0x123",
      } as unknown as Listing

      mockGet.mockResolvedValue(mockResponse)

      const largeTokenId = "99999999999999999999"
      await listingsAPI.getBestListing("test-collection", largeTokenId)

      expect(mockGet.mock.calls[0][0]).toContain(largeTokenId)
    })

    test("handles collection slug with special characters", async () => {
      const mockResponse: GetBestListingResponse = {
        orderHash: "0x456",
      } as unknown as Listing

      mockGet.mockResolvedValue(mockResponse)

      await listingsAPI.getBestListing("my-collection-v2", "100")

      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/listings/collection/my-collection-v2/nfts/100/best",
      )
    })

    test("throws error when no listing found", async () => {
      mockGet.mockRejectedValue(new Error("No listing found"))

      try {
        await listingsAPI.getBestListing("test-collection", "999")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("No listing found")
      }
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("Server Error"))

      try {
        await listingsAPI.getBestListing("test-collection", "123")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Server Error")
      }
    })
  })

  describe("getBestListings", () => {
    test("fetches best listings for a collection without parameters", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [
          {
            orderHash: "0x111",
            price: {
              current: {
                value: "1000000000000000000",
              },
            },
          } as unknown as Listing,
          {
            orderHash: "0x222",
            price: {
              current: {
                value: "1100000000000000000",
              },
            },
          } as unknown as Listing,
        ],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await listingsAPI.getBestListings("test-collection")

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/listings/collection/test-collection/best",
      )
      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: undefined,
        next: undefined,
      })
      expect(result.listings).toHaveLength(2)
    })

    test("fetches best listings with limit parameter", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await listingsAPI.getBestListings("test-collection", 10)

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: 10,
        next: undefined,
      })
    })

    test("fetches best listings with pagination cursor", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [],
        next: "cursor-next",
      }

      mockGet.mockResolvedValue(mockResponse)

      await listingsAPI.getBestListings(
        "test-collection",
        undefined,
        "cursor-prev",
      )

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: undefined,
        next: "cursor-prev",
      })
    })

    test("fetches best listings with both limit and pagination", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await listingsAPI.getBestListings("test-collection", 20, "cursor-abc")

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: 20,
        next: "cursor-abc",
      })
    })

    test("handles collection slug with dashes", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await listingsAPI.getBestListings("my-awesome-collection")

      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/listings/collection/my-awesome-collection/best",
      )
    })

    test("handles empty listings array", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await listingsAPI.getBestListings("test-collection")

      expect(result.listings).toEqual([])
    })

    test("handles response with pagination cursor", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [{ orderHash: "0x1" } as unknown as Listing],
        next: "next-cursor-value",
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await listingsAPI.getBestListings("test-collection")

      expect(result.next).toBe("next-cursor-value")
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("API Error"))

      try {
        await listingsAPI.getBestListings("test-collection")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("API Error")
      }
    })

    test("throws error when collection not found", async () => {
      mockGet.mockRejectedValue(new Error("Collection not found"))

      try {
        await listingsAPI.getBestListings("nonexistent-collection")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Collection not found")
      }
    })

    test("JSON-encodes the traits array into the query", async () => {
      mockGet.mockResolvedValue({ listings: [], next: undefined })

      await listingsAPI.getBestListings(
        "test-collection",
        undefined,
        undefined,
        undefined,
        [
          { traitType: "Background", value: "Red" },
          { traitType: "Eyes", value: "Laser" },
        ],
      )

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: undefined,
        next: undefined,
        traits:
          '[{"traitType":"Background","value":"Red"},{"traitType":"Eyes","value":"Laser"}]',
      })
    })

    test("omits traits param when array is empty", async () => {
      mockGet.mockResolvedValue({ listings: [], next: undefined })

      await listingsAPI.getBestListings(
        "test-collection",
        undefined,
        undefined,
        undefined,
        [],
      )

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: undefined,
        next: undefined,
      })
    })
  })

  describe("sweepCollection", () => {
    test("posts sweep request to /listings/sweep", async () => {
      const mockResponse = { steps: [] } as unknown as Awaited<
        ReturnType<typeof listingsAPI.sweepCollection>
      >
      mockPost.mockResolvedValue(mockResponse)

      const request = {
        collectionSlug: "azuki",
        maxItems: 5,
        maxPricePerItem: "1000000000000000000",
        buyer: "0xBuyer",
        payment: {} as unknown,
      } as unknown as Parameters<typeof listingsAPI.sweepCollection>[0]
      await listingsAPI.sweepCollection(request)

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(mockPost.mock.calls[0][0]).toBe("/api/v2/listings/sweep")
      expect(mockPost.mock.calls[0][1]).toBe(request)
    })
  })

  describe("Constructor", () => {
    test("initializes with fetcher", () => {
      const { fetcher } = createMockFetcher()
      const api = new ListingsAPI(fetcher)

      expect(api).toBeInstanceOf(ListingsAPI)
    })
  })

  describe("remaining_quantity field", () => {
    test("getBestListing includes remaining_quantity in response", async () => {
      const mockResponse: GetBestListingResponse = {
        orderHash: "0xabc123",
        chain: Chain.Mainnet,
        type: "basic",
        price: {
          current: {
            currency: "ETH",
            decimals: 18,
            value: "1500000000000000000",
          },
        },
        protocolData: {} as unknown as OrderV2,
        protocolAddress: "0xdef456",
        remainingQuantity: 1,
      } as unknown as Listing

      mockGet.mockResolvedValue(mockResponse)

      const result = await listingsAPI.getBestListing("test-collection", "1234")

      expect(result.remainingQuantity).toBe(1)
    })

    test("getAllListings includes remaining_quantity for each listing", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [
          {
            orderHash: "0x111",
            remainingQuantity: 1,
          } as unknown as Listing,
          {
            orderHash: "0x222",
            remainingQuantity: 5,
          } as unknown as Listing,
        ],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await listingsAPI.getAllListings("test-collection")

      expect(result.listings[0].remainingQuantity).toBe(1)
      expect(result.listings[1].remainingQuantity).toBe(5)
    })

    test("getBestListings includes remaining_quantity for partially filled orders", async () => {
      const mockResponse: GetListingsResponse = {
        listings: [
          {
            orderHash: "0x333",
            remainingQuantity: 3,
          } as unknown as Listing,
        ],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await listingsAPI.getBestListings("test-collection")

      expect(result.listings[0].remainingQuantity).toBe(3)
    })
  })

  describe("getCrossChainFulfillmentData", () => {
    test("posts to the correct endpoint with the full request body", async () => {
      const mockResponse: CrossChainFulfillmentResponse = {
        transactions: [
          { chain: "ethereum", to: "0xabc", data: "0x123", value: "0" },
        ],
      }

      mockPost.mockResolvedValue(mockResponse)

      const result = await listingsAPI.getCrossChainFulfillmentData({
        listings: [
          {
            hash: "0xorderhash",
            chain: "ethereum",
            protocolAddress: "0xseaport",
          },
        ],
        fulfiller: { address: "0xbuyer" },
        payment: {
          chain: "base",
          tokenAddress: "0x0000000000000000000000000000000000000000",
        },
      })

      expect(mockPost).toHaveBeenCalledWith(
        "/api/v2/listings/cross_chain_fulfillment_data",
        {
          listings: [
            {
              hash: "0xorderhash",
              chain: "ethereum",
              protocolAddress: "0xseaport",
            },
          ],
          fulfiller: { address: "0xbuyer" },
          payment: {
            chain: "base",
            tokenAddress: "0x0000000000000000000000000000000000000000",
          },
        },
      )
      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0].chain).toBe("ethereum")
    })

    test("includes optional recipient in request", async () => {
      mockPost.mockResolvedValue({ transactions: [] })

      await listingsAPI.getCrossChainFulfillmentData({
        listings: [
          {
            hash: "0xhash",
            chain: "ethereum",
            protocolAddress: "0xseaport",
          },
        ],
        fulfiller: { address: "0xbuyer" },
        payment: {
          chain: "base",
          tokenAddress: "0x0000000000000000000000000000000000000000",
        },
        recipient: "0xrecipient",
      })

      expect(mockPost).toHaveBeenCalledWith(
        "/api/v2/listings/cross_chain_fulfillment_data",
        expect.objectContaining({
          recipient: "0xrecipient",
        }),
      )
    })

    test("supports multiple listings for sweep", async () => {
      mockPost.mockResolvedValue({
        transactions: [
          { chain: "ethereum", to: "0xabc", data: "0x111", value: "0" },
          { chain: "ethereum", to: "0xabc", data: "0x222", value: "0" },
        ],
      })

      const result = await listingsAPI.getCrossChainFulfillmentData({
        listings: [
          {
            hash: "0xhash1",
            chain: "ethereum",
            protocolAddress: "0xseaport",
          },
          {
            hash: "0xhash2",
            chain: "ethereum",
            protocolAddress: "0xseaport",
          },
        ],
        fulfiller: { address: "0xbuyer" },
        payment: {
          chain: "base",
          tokenAddress: "0x0000000000000000000000000000000000000000",
        },
      })

      expect(result.transactions).toHaveLength(2)
      expect(mockPost.mock.calls[0][1].listings).toHaveLength(2)
    })

    test("throws on API error", async () => {
      mockPost.mockRejectedValue(new Error("Bad Request"))

      await expect(
        listingsAPI.getCrossChainFulfillmentData({
          listings: [],
          fulfiller: { address: "0xbuyer" },
          payment: {
            chain: "base",
            tokenAddress: "0x0000000000000000000000000000000000000000",
          },
        }),
      ).rejects.toThrow("Bad Request")
    })
  })
})
