import { describe, expect, test, vi } from "vitest"
import { CollectionsAPI } from "../../src/api/collections"
import {
  CollectionOrderByOption,
  type GetCollectionResponse,
  type GetCollectionsResponse,
  type GetTraitsResponse,
} from "../../src/api/types"
import {
  Chain,
  type OpenSeaCollection,
  type OpenSeaCollectionStats,
} from "../../src/types"
import { createMockFetcher } from "../fixtures/fetcher"

describe("API: CollectionsAPI", () => {
  let mockGet: ReturnType<typeof vi.fn>
  let collectionsAPI: CollectionsAPI

  beforeEach(() => {
    const { fetcher, mockGet: getMock } = createMockFetcher()
    mockGet = getMock
    collectionsAPI = new CollectionsAPI(fetcher)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("getCollection", () => {
    test("fetches a single collection by slug", async () => {
      const mockResponse: GetCollectionResponse = {
        collection: "test-collection",
        name: "Test Collection",
        description: "A test collection",
        imageUrl: "https://example.com/image.png",
        bannerImageUrl: "https://example.com/banner.png",
        owner: "0x1234567890123456789012345678901234567890",
        safelistStatus: "verified",
        category: "art",
        isDisabled: false,
        isNsfw: false,
        traitOffersEnabled: true,
        collectionOffersEnabled: true,
        openseaUrl: "https://opensea.io/collection/test-collection",
        projectUrl: "https://example.com",
        wikiUrl: "https://wiki.example.com",
        discordUrl: "https://discord.gg/example",
        telegramUrl: "https://t.me/example",
        twitterUsername: "testcollection",
        instagramUsername: "testcollection",
        contracts: [],
        editors: [],
        fees: [],
        rarity: null,
        pricingCurrencies: null,
        totalSupply: 10000,
        createdDate: "2024-01-01T00:00:00Z",
      } as unknown as GetCollectionResponse

      mockGet.mockResolvedValue(mockResponse)

      const result = await collectionsAPI.getCollection("test-collection")

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/collections/test-collection",
      )
      // Verify the response is returned raw (snake_case from api-types)
      expect(result.collection).toBe("test-collection")
      expect(result.name).toBe("Test Collection")
      expect(result.imageUrl).toBe("https://example.com/image.png")
      expect(result.bannerImageUrl).toBe("https://example.com/banner.png")
      expect(result.safelistStatus).toBe("verified")
    })

    test("handles slug with special characters", async () => {
      const mockResponse: GetCollectionResponse = {
        collection: "test-collection-123",
      } as unknown as GetCollectionResponse

      mockGet.mockResolvedValue(mockResponse)

      await collectionsAPI.getCollection("test-collection-123")

      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/collections/test-collection-123",
      )
    })

    test("throws error when collection not found", async () => {
      mockGet.mockRejectedValue(new Error("Collection not found"))

      try {
        await collectionsAPI.getCollection("nonexistent-collection")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Collection not found")
      }
    })
  })

  describe("getCollections", () => {
    test("fetches collections with default parameters", async () => {
      const mockResponse: GetCollectionsResponse = {
        collections: [
          {
            collection: "collection-1",
            name: "Collection 1",
          } as unknown as OpenSeaCollection,
          {
            collection: "collection-2",
            name: "Collection 2",
          } as unknown as OpenSeaCollection,
        ],
        next: "cursor-123",
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await collectionsAPI.getCollections()

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe("/api/v2/collections")
      expect(mockGet.mock.calls[0][1]).toEqual({
        orderBy: CollectionOrderByOption.CREATED_DATE,
        chain: undefined,
        creatorUsername: undefined,
        includeHidden: false,
        limit: undefined,
        next: undefined,
      })
      expect(result.collections).toHaveLength(2)
      expect(result.next).toBe("cursor-123")
    })

    test("fetches collections with orderBy parameter", async () => {
      const mockResponse: GetCollectionsResponse = {
        collections: [],
      }

      mockGet.mockResolvedValue(mockResponse)

      await collectionsAPI.getCollections(CollectionOrderByOption.MARKET_CAP)

      expect(mockGet.mock.calls[0][1]).toMatchObject({
        orderBy: CollectionOrderByOption.MARKET_CAP,
      })
    })

    test("fetches collections filtered by chain", async () => {
      const mockResponse: GetCollectionsResponse = {
        collections: [],
      }

      mockGet.mockResolvedValue(mockResponse)

      await collectionsAPI.getCollections(
        CollectionOrderByOption.CREATED_DATE,
        Chain.Polygon,
      )

      expect(mockGet.mock.calls[0][1]).toMatchObject({
        chain: Chain.Polygon,
      })
    })

    test("fetches collections filtered by creator username", async () => {
      const mockResponse: GetCollectionsResponse = {
        collections: [],
      }

      mockGet.mockResolvedValue(mockResponse)

      await collectionsAPI.getCollections(
        CollectionOrderByOption.CREATED_DATE,
        undefined,
        "test-creator",
      )

      expect(mockGet.mock.calls[0][1]).toMatchObject({
        creatorUsername: "test-creator",
      })
    })

    test("fetches collections with includeHidden set to true", async () => {
      const mockResponse: GetCollectionsResponse = {
        collections: [],
      }

      mockGet.mockResolvedValue(mockResponse)

      await collectionsAPI.getCollections(
        CollectionOrderByOption.CREATED_DATE,
        undefined,
        undefined,
        true,
      )

      expect(mockGet.mock.calls[0][1]).toMatchObject({
        includeHidden: true,
      })
    })

    test("fetches collections with limit parameter", async () => {
      const mockResponse: GetCollectionsResponse = {
        collections: [],
      }

      mockGet.mockResolvedValue(mockResponse)

      await collectionsAPI.getCollections(
        CollectionOrderByOption.CREATED_DATE,
        undefined,
        undefined,
        false,
        50,
      )

      expect(mockGet.mock.calls[0][1]).toMatchObject({
        limit: 50,
      })
    })

    test("fetches collections with pagination cursor", async () => {
      const mockResponse: GetCollectionsResponse = {
        collections: [],
        next: "cursor-456",
      }

      mockGet.mockResolvedValue(mockResponse)

      await collectionsAPI.getCollections(
        CollectionOrderByOption.CREATED_DATE,
        undefined,
        undefined,
        false,
        undefined,
        "cursor-123",
      )

      expect(mockGet.mock.calls[0][1]).toMatchObject({
        next: "cursor-123",
      })
    })

    test("fetches collections with all parameters", async () => {
      const mockResponse: GetCollectionsResponse = {
        collections: [],
      }

      mockGet.mockResolvedValue(mockResponse)

      await collectionsAPI.getCollections(
        CollectionOrderByOption.SEVEN_DAY_VOLUME,
        Chain.Mainnet,
        "creator-username",
        true,
        25,
        "cursor-xyz",
      )

      expect(mockGet.mock.calls[0][1]).toEqual({
        orderBy: CollectionOrderByOption.SEVEN_DAY_VOLUME,
        chain: Chain.Mainnet,
        creatorUsername: "creator-username",
        includeHidden: true,
        limit: 25,
        next: "cursor-xyz",
      })
    })

    test("transforms collections using collectionFromJSON", async () => {
      const mockResponse = {
        collections: [
          {
            collection: "collection-1",
            name: "Collection 1",
          } as unknown as OpenSeaCollection,
        ],
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await collectionsAPI.getCollections()

      // Verify that the collections were processed
      expect(result.collections).toHaveLength(1)
      expect(result.collections[0]).toHaveProperty("collection")
    })

    test("handles empty collections list", async () => {
      const mockResponse: GetCollectionsResponse = {
        collections: [],
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await collectionsAPI.getCollections()

      expect(result.collections).toEqual([])
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("API Error"))

      try {
        await collectionsAPI.getCollections()
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("API Error")
      }
    })
  })

  describe("getCollectionStats", () => {
    test("fetches stats for a collection", async () => {
      const mockResponse: OpenSeaCollectionStats = {
        total: {
          volume: 1000,
          sales: 500,
          numOwners: 250,
          floorPrice: 1.5,
          floorPriceSymbol: "ETH",
        },
        intervals: [
          {
            interval: "one_day",
            volume: 100,
            sales: 50,
          },
        ],
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await collectionsAPI.getCollectionStats("test-collection")

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/collections/test-collection/stats",
      )
      expect(result).toEqual(mockResponse)
      expect(result.total.volume).toBe(1000)
      expect(result.total.sales).toBe(500)
    })

    test("fetches stats with various collection slugs", async () => {
      const mockResponse: OpenSeaCollectionStats = {
        total: {
          volume: 0,
          sales: 0,
          numOwners: 0,
          floorPrice: 0,
          floorPriceSymbol: "ETH",
        },
        intervals: [],
      }

      mockGet.mockResolvedValue(mockResponse)

      await collectionsAPI.getCollectionStats("collection-with-dashes")

      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/collections/collection-with-dashes/stats",
      )
    })

    test("handles collection with no stats", async () => {
      const mockResponse: OpenSeaCollectionStats = {
        total: {
          volume: 0,
          sales: 0,
          numOwners: 0,
          floorPrice: 0,
          floorPriceSymbol: "ETH",
        },
        intervals: [],
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await collectionsAPI.getCollectionStats("new-collection")

      expect(result.total.volume).toBe(0)
      expect(result.total.sales).toBe(0)
      expect(result.intervals).toEqual([])
    })

    test("throws error when stats not found", async () => {
      mockGet.mockRejectedValue(new Error("Stats not found"))

      try {
        await collectionsAPI.getCollectionStats("nonexistent-collection")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Stats not found")
      }
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("Server Error"))

      try {
        await collectionsAPI.getCollectionStats("test-collection")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Server Error")
      }
    })
  })

  describe("getTraits", () => {
    test("fetches traits for a collection", async () => {
      const mockResponse: GetTraitsResponse = {
        categories: {
          Background: "string",
          Fur: "string",
          Eyes: "string",
          Mouth: "string",
          Hat: "string",
        },
        counts: {
          Background: {
            Blue: 1234,
            Green: 2345,
            Red: 987,
          },
          Fur: {
            Brown: 1500,
            Black: 1200,
            "Golden Brown": 456,
          },
          Eyes: {
            Bored: 2500,
            Angry: 1800,
          },
        },
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await collectionsAPI.getTraits("boredapeyachtclub")

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe("/api/v2/traits/boredapeyachtclub")
      expect(result.categories).toHaveProperty("Background")
      expect(result.categories).toHaveProperty("Fur")
      expect(result.counts).toHaveProperty("Background")
      expect(result.counts.Background).toHaveProperty("Blue")
      expect(result.counts.Background.Blue).toBe(1234)
      expect(result.counts.Fur["Golden Brown"]).toBe(456)
    })

    test("opts out of response camelization", async () => {
      // The keys in this payload are trait names and trait values, so the
      // fetcher's default snake_case → camelCase rewrite would corrupt them.
      mockGet.mockResolvedValue({ categories: {}, counts: {} })

      await collectionsAPI.getTraits("boredapeyachtclub")

      expect(mockGet.mock.calls[0][2]).toEqual({ camelizeResponse: false })
    })

    test("handles collection with no traits", async () => {
      const mockResponse: GetTraitsResponse = {
        categories: {},
        counts: {},
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await collectionsAPI.getTraits("no-traits-collection")

      expect(result.categories).toEqual({})
      expect(result.counts).toEqual({})
    })

    test("handles numeric traits", async () => {
      const mockResponse: GetTraitsResponse = {
        categories: {
          Level: "number",
          Power: "number",
        },
        counts: {
          Level: {
            "1": 100,
            "2": 200,
            "3": 300,
          },
          Power: {
            "100": 50,
            "200": 75,
            "300": 25,
          },
        },
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await collectionsAPI.getTraits("numeric-traits-collection")

      expect(result.categories.Level).toBe("number")
      expect(result.categories.Power).toBe("number")
      expect(result.counts.Level["1"]).toBe(100)
      expect(result.counts.Power["100"]).toBe(50)
    })

    test("handles date traits", async () => {
      const mockResponse: GetTraitsResponse = {
        categories: {
          CreatedDate: "date",
        },
        counts: {
          CreatedDate: {
            "2024-01-01": 50,
            "2024-01-02": 75,
          },
        },
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await collectionsAPI.getTraits("date-traits-collection")

      expect(result.categories.CreatedDate).toBe("date")
      expect(result.counts.CreatedDate["2024-01-01"]).toBe(50)
    })

    test("handles traits with special characters in values", async () => {
      const mockResponse: GetTraitsResponse = {
        categories: {
          Type: "string",
        },
        counts: {
          Type: {
            "Special-Character_123": 100,
            "With Spaces": 200,
            "With/Slash": 50,
          },
        },
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await collectionsAPI.getTraits("special-chars-collection")

      expect(result.counts.Type["Special-Character_123"]).toBe(100)
      expect(result.counts.Type["With Spaces"]).toBe(200)
      expect(result.counts.Type["With/Slash"]).toBe(50)
    })

    test("handles large trait counts", async () => {
      const mockResponse: GetTraitsResponse = {
        categories: {
          Color: "string",
        },
        counts: {
          Color: {
            Blue: 999999,
            Red: 1000000,
            Green: 500000,
          },
        },
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await collectionsAPI.getTraits("large-collection")

      expect(result.counts.Color.Blue).toBe(999999)
      expect(result.counts.Color.Red).toBe(1000000)
    })

    test("handles collection slugs with special characters", async () => {
      const mockResponse: GetTraitsResponse = {
        categories: {},
        counts: {},
      }

      mockGet.mockResolvedValue(mockResponse)

      await collectionsAPI.getTraits("collection-with-dashes-123")

      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/traits/collection-with-dashes-123",
      )
    })

    test("handles many trait categories", async () => {
      const categories: Record<string, "string" | "number" | "date"> = {}
      const counts: Record<string, Record<string, number>> = {}

      for (let i = 0; i < 20; i++) {
        const traitName = `Trait${i}`
        categories[traitName] = "string"
        counts[traitName] = {
          Value1: 10,
          Value2: 20,
        }
      }

      const mockResponse: GetTraitsResponse = {
        categories,
        counts,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await collectionsAPI.getTraits("many-traits-collection")

      expect(Object.keys(result.categories)).toHaveLength(20)
      expect(Object.keys(result.counts)).toHaveLength(20)
    })

    test("throws error when collection not found", async () => {
      mockGet.mockRejectedValue(new Error("Collection not found"))

      try {
        await collectionsAPI.getTraits("nonexistent-collection")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Collection not found")
      }
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("Server Error"))

      try {
        await collectionsAPI.getTraits("test-collection")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Server Error")
      }
    })
  })

  describe("Constructor", () => {
    test("initializes with fetcher", () => {
      const { fetcher } = createMockFetcher()
      const api = new CollectionsAPI(fetcher)

      expect(api).toBeInstanceOf(CollectionsAPI)
    })
  })
})
