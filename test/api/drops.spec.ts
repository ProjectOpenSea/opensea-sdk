import { beforeEach, describe, expect, test, vi } from "vitest"
import { OpenSeaAPI } from "../../src/api/api"
import { DropsAPI } from "../../src/api/drops"
import type {
  CrossChainDropMintResponse,
  DropMintResponse,
} from "../../src/api/types"
import { createMockFetcher } from "../fixtures/fetcher"

describe("API: DropsAPI", () => {
  let mockPost: ReturnType<typeof vi.fn>
  let dropsAPI: DropsAPI

  beforeEach(() => {
    const { fetcher, mockPost: postMock } = createMockFetcher()
    mockPost = postMock
    dropsAPI = new DropsAPI(fetcher)
  })

  test("builds cross-chain mint transactions with the full request", async () => {
    const response: CrossChainDropMintResponse = {
      transactions: [
        {
          chain: "base",
          to: "0xrelay",
          data: "0x1234",
          value: "1000",
          valueHex: "0x3e8",
        },
      ],
      receiptRequest: {
        swapQuote: {
          fromAssets: [
            {
              chain: "base",
              contract: "0x0000000000000000000000000000000000000000",
              amount: "1000",
            },
          ],
          toAssets: [
            {
              chain: "ape_chain",
              contract: "0xnft",
              tokenId: "0",
              amount: "1",
            },
          ],
        },
        relayRequestId: "0xrequest",
      },
    }
    mockPost.mockResolvedValue(response)

    const result = await dropsAPI.buildCrossChainMintTransactions("pyro", {
      payer: "0xpayer",
      minter: "0xminter",
      quantity: 1,
      payment: {
        chain: "base",
        tokenAddress: "0x0000000000000000000000000000000000000000",
      },
    })

    expect(mockPost).toHaveBeenCalledWith(
      "/api/v2/drops/pyro/cross_chain_mint",
      {
        payer: "0xpayer",
        minter: "0xminter",
        quantity: 1,
        payment: {
          chain: "base",
          tokenAddress: "0x0000000000000000000000000000000000000000",
        },
      },
    )
    expect(result).toBe(response)
  })

  test("builds an ERC-1155 mint for the named token", async () => {
    const response = {
      to: "0xseadrop",
      data: "0x1234",
      value: "0",
      chain: "base",
    } as DropMintResponse
    mockPost.mockResolvedValue(response)

    const result = await dropsAPI.buildMintTransaction("cool-1155", {
      minter: "0xminter",
      quantity: 1,
      tokenId: "0",
    })

    expect(mockPost).toHaveBeenCalledWith("/api/v2/drops/cool-1155/mint", {
      minter: "0xminter",
      quantity: 1,
      tokenId: "0",
    })
    expect(result).toBe(response)
  })

  test("puts tokenId on the wire as token_id", async () => {
    const bodies: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(init.body as string)
        return new Response(
          JSON.stringify({ to: "0x1", data: "0x", value: "0", chain: "base" }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      }),
    )

    try {
      const live = new OpenSeaAPI({ apiKey: "key" })
      await live.drops.buildMintTransaction("cool-1155", {
        minter: "0xminter",
        quantity: 1,
        tokenId: "0",
      })
    } finally {
      vi.unstubAllGlobals()
    }

    expect(bodies.map(body => JSON.parse(body))).toEqual([
      { minter: "0xminter", quantity: 1, token_id: "0" },
    ])
  })
})
