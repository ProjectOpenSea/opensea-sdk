import { describe, expect, test, vi } from "vitest"
import { TokensAPI } from "../../src/api/tokens"
import type {
  GetAccountTokenActivityResponse,
  GetSwapQuoteResponse,
  GetTokenGroupResponse,
  GetTokenGroupsResponse,
  GetTokenResponse,
  GetTopTokensResponse,
  GetTrendingTokensResponse,
  Token,
  TokenActivityStatsResponse,
} from "../../src/api/types"
import { Chain } from "../../src/types"
import { createMockFetcher } from "../fixtures/fetcher"

const mockToken: Token = {
  address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  chain: "ethereum",
  name: "Wrapped Ether",
  symbol: "WETH",
  decimals: 18,
  usdPrice: "1",
  isVerified: true,
  imageUrl: "https://example.com/weth.png",
  openseaUrl:
    "https://opensea.io/tokens/ethereum/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
}

describe("API: TokensAPI", () => {
  let mockGet: ReturnType<typeof vi.fn>
  let tokensAPI: TokensAPI

  beforeEach(() => {
    const { fetcher, mockGet: getMock } = createMockFetcher()
    mockGet = getMock
    tokensAPI = new TokensAPI(fetcher)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("getTrendingTokens", () => {
    test("fetches trending tokens without parameters", async () => {
      const mockResponse: GetTrendingTokensResponse = {
        tokens: [mockToken],
        next: "cursor-123",
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await tokensAPI.getTrendingTokens()

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe("/api/v2/tokens/trending")
      expect(mockGet.mock.calls[0][1]).toBeUndefined()
      expect(result.tokens).toHaveLength(1)
      expect(result.tokens[0].symbol).toBe("WETH")
      expect(result.next).toBe("cursor-123")
    })

    test("fetches trending tokens with limit", async () => {
      const mockResponse: GetTrendingTokensResponse = {
        tokens: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await tokensAPI.getTrendingTokens({ limit: 10 })

      expect(mockGet.mock.calls[0][1]).toEqual({ limit: 10 })
    })

    test("sends cursor when the caller passes it directly", async () => {
      mockGet.mockResolvedValue({ tokens: [], next: undefined })

      await tokensAPI.getTrendingTokens({ cursor: "cursor-direct" })

      expect(mockGet.mock.calls[0][1]).toEqual({ cursor: "cursor-direct" })
    })

    test("fetches trending tokens with limit and cursor", async () => {
      const mockResponse: GetTrendingTokensResponse = {
        tokens: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await tokensAPI.getTrendingTokens({ limit: 5, cursor: "cursor-abc" })

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: 5,
        cursor: "cursor-abc",
      })
    })

    test("handles empty tokens array", async () => {
      const mockResponse: GetTrendingTokensResponse = {
        tokens: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await tokensAPI.getTrendingTokens()

      expect(result.tokens).toEqual([])
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("API Error"))

      try {
        await tokensAPI.getTrendingTokens()
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("API Error")
      }
    })
  })

  describe("getTopTokens", () => {
    test("fetches top tokens without parameters", async () => {
      const mockResponse: GetTopTokensResponse = {
        tokens: [mockToken],
        next: "cursor-123",
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await tokensAPI.getTopTokens()

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe("/api/v2/tokens/top")
      expect(mockGet.mock.calls[0][1]).toBeUndefined()
      expect(result.tokens).toHaveLength(1)
      expect(result.next).toBe("cursor-123")
    })

    test("fetches top tokens with limit", async () => {
      const mockResponse: GetTopTokensResponse = {
        tokens: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      await tokensAPI.getTopTokens({ limit: 20 })

      expect(mockGet.mock.calls[0][1]).toEqual({ limit: 20 })
    })

    test("fetches top tokens with pagination cursor", async () => {
      const mockResponse: GetTopTokensResponse = {
        tokens: [],
        next: "cursor-456",
      }

      mockGet.mockResolvedValue(mockResponse)

      await tokensAPI.getTopTokens({ cursor: "cursor-123" })

      expect(mockGet.mock.calls[0][1]).toEqual({ cursor: "cursor-123" })
    })

    test("handles empty tokens array", async () => {
      const mockResponse: GetTopTokensResponse = {
        tokens: [],
        next: undefined,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await tokensAPI.getTopTokens()

      expect(result.tokens).toEqual([])
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("API Error"))

      try {
        await tokensAPI.getTopTokens()
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("API Error")
      }
    })
  })

  describe("getSwapQuote", () => {
    test("fetches swap quote with required parameters", async () => {
      const mockResponse = {
        price: "1.5",
        route: "direct",
      } as unknown as GetSwapQuoteResponse

      mockGet.mockResolvedValue(mockResponse)

      const args = {
        fromChain: "ethereum",
        fromAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        toChain: "ethereum",
        toAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        quantity: "1000000000000000000",
        address: "0x1234567890123456789012345678901234567890",
      }

      const result = await tokensAPI.getSwapQuote(args)

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe("/api/v2/swap/quote")
      expect(mockGet.mock.calls[0][1]).toEqual(args)
      expect(result).toHaveProperty("price", "1.5")
    })

    test("fetches swap quote with optional parameters", async () => {
      const mockResponse = {
        price: "1.5",
      } as unknown as GetSwapQuoteResponse

      mockGet.mockResolvedValue(mockResponse)

      const args = {
        fromChain: "ethereum",
        fromAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        toChain: "base",
        toAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        quantity: "1000000000000000000",
        address: "0x1234567890123456789012345678901234567890",
        slippage: 0.5,
        recipient: "0x9876543210987654321098765432109876543210",
      }

      await tokensAPI.getSwapQuote(args)

      expect(mockGet.mock.calls[0][1]).toEqual(args)
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("Insufficient liquidity"))

      try {
        await tokensAPI.getSwapQuote({
          fromChain: "ethereum",
          fromAddress: "0x123",
          toChain: "ethereum",
          toAddress: "0x456",
          quantity: "1000",
          address: "0x789",
        })
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Insufficient liquidity")
      }
    })
  })

  describe("getToken", () => {
    test("fetches token details", async () => {
      const mockResponse: GetTokenResponse = { ...mockToken, status: "OK" }

      mockGet.mockResolvedValue(mockResponse)

      const result = await tokensAPI.getToken(
        "ethereum",
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      )

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/chain/ethereum/token/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      )
      expect(result.name).toBe("Wrapped Ether")
      expect(result.symbol).toBe("WETH")
      expect(result.decimals).toBe(18)
    })

    test("handles different chains", async () => {
      const mockResponse: GetTokenResponse = {
        ...mockToken,
        chain: "polygon",
        status: "OK",
      }

      mockGet.mockResolvedValue(mockResponse)

      await tokensAPI.getToken("polygon", "0x123")

      expect(mockGet.mock.calls[0][0]).toBe("/api/v2/chain/polygon/token/0x123")
    })

    test("handles token with null image_url", async () => {
      const mockResponse: GetTokenResponse = {
        ...mockToken,
        status: "OK",
        imageUrl: null,
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await tokensAPI.getToken("ethereum", "0x123")

      expect(result.imageUrl).toBeNull()
    })

    test("throws error on API failure", async () => {
      mockGet.mockRejectedValue(new Error("Token not found"))

      try {
        await tokensAPI.getToken("ethereum", "0x000")
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Token not found")
      }
    })
  })

  describe("getTokenActivityStats", () => {
    test("fetches all materialized windows by default", async () => {
      const mockResponse: TokenActivityStatsResponse = {
        chain: "base",
        address: "0x4200000000000000000000000000000000000006",
        computedAt: "2026-07-23T00:52:11.879132Z",
        windows: {
          "24h": {
            trades: 5714,
            volumeUsd: "710410.75",
            averageTradeUsd: "124.33",
          },
        },
      }
      mockGet.mockResolvedValue(mockResponse)

      const result = await tokensAPI.getTokenActivityStats(
        Chain.Base,
        mockResponse.address,
      )

      expect(mockGet).toHaveBeenCalledWith(
        `/api/v2/chain/base/token/${mockResponse.address}/activity/stats`,
        undefined,
      )
      expect(result.computedAt).toBe("2026-07-23T00:52:11.879132Z")
      expect(result.windows["24h"]?.volumeUsd).toBe("710410.75")
    })

    test("serializes selected windows as a comma-separated query", async () => {
      mockGet.mockResolvedValue({
        chain: "ethereum",
        address: "0xabc",
        windows: {},
      })

      await tokensAPI.getTokenActivityStats(Chain.Mainnet, "0xabc", {
        windows: ["1h", "24h"],
      })

      expect(mockGet).toHaveBeenCalledWith(
        "/api/v2/chain/ethereum/token/0xabc/activity/stats",
        { windows: "1h,24h" },
      )
    })
  })

  describe("getTokenGroups", () => {
    test("fetches token groups without parameters", async () => {
      const mockResponse = {
        tokenGroups: [],
        next: "cursor-xyz",
      } as unknown as GetTokenGroupsResponse

      mockGet.mockResolvedValue(mockResponse)

      const result = await tokensAPI.getTokenGroups()

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe("/api/v2/token-groups")
      expect(mockGet.mock.calls[0][1]).toBeUndefined()
      expect(result).toBe(mockResponse)
    })

    test("passes limit and cursor query args", async () => {
      mockGet.mockResolvedValue({} as GetTokenGroupsResponse)

      await tokensAPI.getTokenGroups({ limit: 10, cursor: "abc" })

      expect(mockGet.mock.calls[0][1]).toEqual({ limit: 10, cursor: "abc" })
    })
  })

  describe("getTokenGroup", () => {
    test("fetches a single token group by slug", async () => {
      const mockResponse = { slug: "eth" } as unknown as GetTokenGroupResponse

      mockGet.mockResolvedValue(mockResponse)

      const result = await tokensAPI.getTokenGroup("eth")

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe("/api/v2/token-groups/eth")
      expect(mockGet.mock.calls[0][1]).toBeUndefined()
      expect(result).toBe(mockResponse)
    })
  })

  describe("getTokenHolders", () => {
    test("fetches token holders without args", async () => {
      mockGet.mockResolvedValue({ holders: [] })

      await tokensAPI.getTokenHolders(
        Chain.Mainnet,
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      )

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/chain/ethereum/token/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/holders",
      )
      expect(mockGet.mock.calls[0][1]).toBeUndefined()
    })

    test("passes limit/cursor/sortBy/sortDirection query args", async () => {
      mockGet.mockResolvedValue({ holders: [] })

      await tokensAPI.getTokenHolders(Chain.Mainnet, "0xabc", {
        limit: 50,
        cursor: "page-2",
        sortBy: "QUANTITY",
        sortDirection: "desc",
      })

      expect(mockGet.mock.calls[0][1]).toEqual({
        limit: 50,
        cursor: "page-2",
        sortBy: "QUANTITY",
        sortDirection: "desc",
      })
    })
  })

  describe("getTokenLiquidityPools", () => {
    test("fetches token liquidity pools without args", async () => {
      mockGet.mockResolvedValue({ pools: [] })

      await tokensAPI.getTokenLiquidityPools(
        Chain.Mainnet,
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      )

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/chain/ethereum/token/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/liquidity-pools",
      )
      expect(mockGet.mock.calls[0][1]).toBeUndefined()
    })

    test("passes limit query arg", async () => {
      mockGet.mockResolvedValue({ pools: [] })

      await tokensAPI.getTokenLiquidityPools(Chain.Mainnet, "0xabc", {
        limit: 50,
      })

      expect(mockGet.mock.calls[0][1]).toEqual({ limit: 50 })
    })
  })

  describe("getAccountTokenActivity", () => {
    test("fetches account token activity without args", async () => {
      const mockResponse: GetAccountTokenActivityResponse = {
        activities: [],
      }

      mockGet.mockResolvedValue(mockResponse)

      const result = await tokensAPI.getAccountTokenActivity(
        "0x1234567890123456789012345678901234567890",
      )

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet.mock.calls[0][0]).toBe(
        "/api/v2/account/0x1234567890123456789012345678901234567890/token-activity",
      )
      expect(mockGet.mock.calls[0][1]).toBeUndefined()
      expect(result.activities).toEqual([])
    })

    test("passes chain/token/type/limit/next query args", async () => {
      mockGet.mockResolvedValue({ activities: [] })

      await tokensAPI.getAccountTokenActivity("0xabc", {
        chains: ["ethereum", "base"],
        tokens: ["0x111", "0x222"],
        type: ["swap", "wrap"],
        limit: 25,
        next: "page-1",
      })

      expect(mockGet.mock.calls[0][1]).toEqual({
        chains: ["ethereum", "base"],
        tokens: ["0x111", "0x222"],
        type: ["swap", "wrap"],
        limit: 25,
        next: "page-1",
      })
    })
  })

  describe("Constructor", () => {
    test("initializes with fetcher", () => {
      const { fetcher } = createMockFetcher()
      const api = new TokensAPI(fetcher)

      expect(api).toBeInstanceOf(TokensAPI)
    })
  })
})
