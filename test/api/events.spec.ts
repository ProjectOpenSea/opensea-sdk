import { describe, expect, test, vi } from "vitest"
import { EventsAPI } from "../../src/api/events"
import {
  AssetEventType,
  type EventAsset,
  type GetEventsResponse,
  type ListingEvent,
  type OfferEvent,
  type SaleEvent,
  type TransferEvent,
} from "../../src/api/types"
import { Chain } from "../../src/types"
import { createMockFetcher } from "../fixtures/fetcher"

describe("API: EventsAPI", () => {
  let mockGet: ReturnType<typeof vi.fn>
  let eventsAPI: EventsAPI

  beforeEach(() => {
    const { fetcher, mockGet: getMock } = createMockFetcher()
    mockGet = getMock
    eventsAPI = new EventsAPI(fetcher)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("getEvents", () => {
    test("fetches events without parameters", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [
          {
            eventType: AssetEventType.LISTING,
            eventTimestamp: 1234567890,
            chain: "ethereum",
            quantity: 1,
            payment: {
              quantity: "1000000000000000000",
              tokenAddress: "0x0000000000000000000000000000000000000000",
              decimals: 18,
              symbol: "ETH",
            },
            startDate: null,
            expirationDate: 1234567990,
            asset: {} as EventAsset,
            maker: "0x123",
            taker: "",
            isPrivateListing: false,
          } as unknown as ListingEvent,
        ],
        next: "cursor-123",
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await eventsAPI.getEvents()

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe("/api/v2/events")
      expect(mockGet.mock.calls[0][1]).toBeUndefined()
      expect(result.assetEvents).toHaveLength(1)
      expect(result.next).toBe("cursor-123")
    })

    test("fetches events with event_type filter", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await eventsAPI.getEvents({ eventType: AssetEventType.SALE })

      expect(mockGet.mock.calls[0][1]).toEqual({
        eventType: "sale",
      })
    })

    test("fetches events with limit parameter", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await eventsAPI.getEvents({ limit: 50 })

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: 50,
      })
    })

    test("fetches events with pagination cursor", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [],
        next: "cursor-456",
      }

      mockGet.mockResolvedValue(mockResponse)

      await eventsAPI.getEvents({ next: "cursor-123" })

      expect(mockGet.mock.calls[0][1]).toEqual({
        next: "cursor-123",
      })
    })

    test("fetches events with after timestamp", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await eventsAPI.getEvents({ after: 1234567890 })

      expect(mockGet.mock.calls[0][1]).toEqual({
        after: 1234567890,
      })
    })

    test("fetches events with before timestamp", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await eventsAPI.getEvents({ before: 1234567890 })

      expect(mockGet.mock.calls[0][1]).toEqual({
        before: 1234567890,
      })
    })

    test("fetches events with chain filter", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await eventsAPI.getEvents({ chain: "ethereum" })

      // GET /api/v2/events documents no `chain` parameter and does not filter on one, so the
      // SDK drops it rather than implying a filter that never applied. Verified against the
      // live API: `chain=solana` still returned Ethereum events.
      expect(mockGet.mock.calls[0][1]).toEqual({})
    })

    test("fetches events with multiple parameters", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await eventsAPI.getEvents({
        eventType: AssetEventType.SALE,
        limit: 25,
        chain: "ethereum",
        after: 1234567890,
      })

      // `chain` is dropped for this endpoint; every other parameter passes through.
      expect(mockGet.mock.calls[0][1]).toEqual({
        eventType: "sale",
        limit: 25,
        after: 1234567890,
      })
    })

    test("handles empty events array", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await eventsAPI.getEvents()

      expect(result.assetEvents).toEqual([])
    })

    test("handles multiple events in response", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [
          { eventType: AssetEventType.LISTING } as unknown as ListingEvent,
          { eventType: AssetEventType.SALE } as unknown as SaleEvent,
          { eventType: AssetEventType.TRANSFER } as unknown as TransferEvent,
        ],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await eventsAPI.getEvents()

      expect(result.assetEvents).toHaveLength(3)
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("API Error"))

      try {
        await eventsAPI.getEvents()
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("API Error")
      }
    })
  })

  describe("getEventsByAccount", () => {
    test("fetches events for an account without parameters", async () => {
      const address = "0x1234567890123456789012345678901234567890"
      const mockResponse: GetEventsResponse = {
        assetEvents: [
          {
            eventType: AssetEventType.TRANSFER,
            eventTimestamp: 1234567890,
            chain: "ethereum",
            quantity: 1,
            transaction: "0xabc",
            fromAddress: "0x000",
            toAddress: address,
            nft: {} as EventAsset,
          } as unknown as TransferEvent,
        ],
        next: "cursor-123",
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await eventsAPI.getEventsByAccount(address)

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        `/api/v2/events/accounts/${address}`,
      )
      expect(mockGet.mock.calls[0][1]).toBeUndefined()
      expect(result.assetEvents).toHaveLength(1)
      expect(result.next).toBe("cursor-123")
    })

    test("fetches events for an account with parameters", async () => {
      const address = "0x1234567890123456789012345678901234567890"
      const mockResponse: GetEventsResponse = {
        assetEvents: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await eventsAPI.getEventsByAccount(address, {
        eventType: AssetEventType.SALE,
        limit: 10,
      })

      expect(mockGet.mock.calls[0][1]).toEqual({
        eventType: "sale",
        limit: 10,
      })
    })

    test("handles lowercase address", async () => {
      const address = "0xabcdef1234567890123456789012345678901234"
      const mockResponse: GetEventsResponse = {
        assetEvents: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await eventsAPI.getEventsByAccount(address)

      expect(mockGet.mock.calls[0][0]).toContain(address)
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("Account not found"))

      try {
        await eventsAPI.getEventsByAccount("0x123")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Account not found")
      }
    })
  })

  describe("getEventsByCollection", () => {
    test("fetches events for a collection without parameters", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [
          {
            eventType: AssetEventType.SALE,
            eventTimestamp: 1234567890,
            chain: "ethereum",
            quantity: 1,
            transaction: "0xabc",
            orderHash: "0xdef",
            protocolAddress: "0x123",
            payment: {
              quantity: "1000000000000000000",
              tokenAddress: "0x0000000000000000000000000000000000000000",
              decimals: 18,
              symbol: "ETH",
            },
            closingDate: 1234567890,
            seller: "0x111",
            buyer: "0x222",
            nft: {} as EventAsset,
          } as unknown as SaleEvent,
        ],
        next: "cursor-123",
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await eventsAPI.getEventsByCollection("test-collection")

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/events/collection/test-collection",
      )
      expect(mockGet.mock.calls[0][1]).toBeUndefined()
      expect(result.assetEvents).toHaveLength(1)
      expect(result.next).toBe("cursor-123")
    })

    test("fetches events for a collection with parameters", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await eventsAPI.getEventsByCollection("test-collection", {
        limit: 20,
        next: "cursor-xyz",
      })

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: 20,
        next: "cursor-xyz",
      })
    })

    test("handles collection slug with special characters", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await eventsAPI.getEventsByCollection("collection-name-123")

      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/events/collection/collection-name-123",
      )
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("Collection not found"))

      try {
        await eventsAPI.getEventsByCollection("nonexistent-collection")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Collection not found")
      }
    })

    test("JSON-encodes args.traits into the query", async () => {
      mockGet.mockResolvedValue({ assetEvents: [], next: undefined })

      await eventsAPI.getEventsByCollection("test-collection", {
        limit: 5,
        traits: [{ traitType: "Background", value: "Red" }],
      })

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: 5,
        traits: '[{"traitType":"Background","value":"Red"}]',
      })
    })

    test("omits traits when args.traits is an empty array", async () => {
      mockGet.mockResolvedValue({ assetEvents: [], next: undefined })

      await eventsAPI.getEventsByCollection("test-collection", {
        limit: 5,
        traits: [],
      })

      expect(mockGet.mock.calls[0][1]).toEqual({ limit: 5 })
    })

    test("does not send the account-only chain filter", async () => {
      mockGet.mockResolvedValue({ assetEvents: [], next: undefined })

      await eventsAPI.getEventsByCollection("test-collection", {
        chain: "solana",
        limit: 5,
        traits: [{ traitType: "Background", value: "Red" }],
      })

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: 5,
        traits: '[{"traitType":"Background","value":"Red"}]',
      })
    })
  })

  describe("getEventsByNFT", () => {
    test("fetches events for an NFT without parameters", async () => {
      const chain = Chain.Mainnet
      const address = "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d"
      const identifier = "1"
      const mockResponse: GetEventsResponse = {
        assetEvents: [
          {
            eventType: AssetEventType.OFFER,
            eventTimestamp: 1234567890,
            chain: "ethereum",
            quantity: 1,
            payment: {
              quantity: "1000000000000000000",
              tokenAddress: "0x0000000000000000000000000000000000000000",
              decimals: 18,
              symbol: "ETH",
            },
            startDate: 1234567890,
            expirationDate: 1234567990,
            asset: {} as EventAsset,
            maker: "0x123",
            taker: "",
          } as unknown as OfferEvent,
        ],
        next: "cursor-123",
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await eventsAPI.getEventsByNFT(chain, address, identifier)

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        `/api/v2/events/chain/${chain}/contract/${address}/nfts/${identifier}`,
      )
      expect(mockGet.mock.calls[0][1]).toBeUndefined()
      expect(result.assetEvents).toHaveLength(1)
      expect(result.next).toBe("cursor-123")
    })

    test("fetches events for an NFT with parameters", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await eventsAPI.getEventsByNFT(Chain.Mainnet, "0x123", "1", {
        eventType: AssetEventType.TRANSFER,
        limit: 5,
      })

      expect(mockGet.mock.calls[0][1]).toEqual({
        eventType: "transfer",
        limit: 5,
      })
    })

    test("handles large token IDs", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const largeTokenId = "99999999999999999999"
      await eventsAPI.getEventsByNFT(Chain.Mainnet, "0x123", largeTokenId)

      expect(mockGet.mock.calls[0][0]).toContain(largeTokenId)
    })

    test("handles different chains", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await eventsAPI.getEventsByNFT(Chain.Polygon, "0x123", "1")

      expect(mockGet.mock.calls[0][0]).toContain("polygon")
    })

    test("uses the path chain without sending a second chain filter", async () => {
      mockGet.mockResolvedValue({ assetEvents: [], next: undefined })

      await eventsAPI.getEventsByNFT(Chain.Mainnet, "0x123", "1", {
        chain: "solana",
        limit: 5,
      })

      expect(mockGet.mock.calls[0][0]).toContain("/chain/ethereum/")
      expect(mockGet.mock.calls[0][1]).toEqual({ limit: 5 })
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("NFT not found"))

      try {
        await eventsAPI.getEventsByNFT(Chain.Mainnet, "0x123", "999")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("NFT not found")
      }
    })
  })

  describe("Constructor", () => {
    test("initializes with get function", () => {
      const { fetcher } = createMockFetcher()
      const api = new EventsAPI(fetcher)

      expect(api).toBeInstanceOf(EventsAPI)
    })
  })

  describe("Event Types", () => {
    test("handles listing events", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [
          {
            eventType: AssetEventType.LISTING,
            eventTimestamp: 1234567890,
            chain: "ethereum",
            quantity: 1,
            payment: {
              quantity: "1000000000000000000",
              tokenAddress: "0x0000000000000000000000000000000000000000",
              decimals: 18,
              symbol: "ETH",
            },
            startDate: null,
            expirationDate: 1234567990,
            asset: {
              identifier: "1",
              collection: "test",
              contract: "0x123",
              tokenStandard: "erc721",
              name: "Test NFT",
              description: "Test",
              imageUrl: "https://example.com/1.png",
              displayImageUrl: "https://example.com/1.png",
              displayAnimationUrl: null,
              metadataUrl: "https://example.com/metadata/1",
              openseaUrl: "https://opensea.io/assets/ethereum/0x123/1",
              updatedAt: "2023-01-01T00:00:00Z",
              isDisabled: false,
              isNsfw: false,
              traits: [],
            },
            maker: "0x123",
            taker: "",
            isPrivateListing: false,
          } as unknown as ListingEvent,
        ],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await eventsAPI.getEvents()

      expect(result.assetEvents[0].eventType).toBe(AssetEventType.LISTING)
      expect((result.assetEvents[0] as ListingEvent).maker).toBe("0x123")
    })

    test("handles sale events", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [
          {
            eventType: AssetEventType.SALE,
            eventTimestamp: 1234567890,
            chain: "ethereum",
            quantity: 1,
            transaction: "0xabc",
            orderHash: "0xdef",
            protocolAddress: "0x123",
            payment: {
              quantity: "1000000000000000000",
              tokenAddress: "0x0000000000000000000000000000000000000000",
              decimals: 18,
              symbol: "ETH",
            },
            closingDate: 1234567890,
            seller: "0x111",
            buyer: "0x222",
            nft: {} as EventAsset,
          } as unknown as SaleEvent,
        ],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await eventsAPI.getEvents()

      expect(result.assetEvents[0].eventType).toBe(AssetEventType.SALE)
      expect((result.assetEvents[0] as SaleEvent).seller).toBe("0x111")
      expect((result.assetEvents[0] as SaleEvent).buyer).toBe("0x222")
    })

    test("handles transfer events", async () => {
      const mockResponse: GetEventsResponse = {
        assetEvents: [
          {
            eventType: AssetEventType.TRANSFER,
            eventTimestamp: 1234567890,
            chain: "ethereum",
            quantity: 1,
            transaction: "0xabc",
            fromAddress: "0x111",
            toAddress: "0x222",
            nft: {} as EventAsset,
          } as unknown as TransferEvent,
        ],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await eventsAPI.getEvents()

      expect(result.assetEvents[0].eventType).toBe(AssetEventType.TRANSFER)
      expect((result.assetEvents[0] as TransferEvent).fromAddress).toBe("0x111")
      expect((result.assetEvents[0] as TransferEvent).toAddress).toBe("0x222")
    })
  })
})
