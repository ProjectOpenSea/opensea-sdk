import { afterEach, describe, expect, test, vi } from "vitest"
import { OpenSeaAPI } from "../../src/api/api"

function respond(value: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async () => new Response(JSON.stringify(value), { status: 200 }),
    )
}

function query(fetch: ReturnType<typeof respond>, index = 0) {
  return new URL(String(fetch.mock.calls[index][0])).searchParams
}

afterEach(() => vi.restoreAllMocks())

describe("existing REST discovery options", () => {
  test("collection filters preserve positional arguments, false and zero", async () => {
    const fetch = respond({ nfts: [], next: null })
    const api = new OpenSeaAPI({ apiKey: "test" })
    const ranges = '[{"traitType":"Level","min":0,"max":10}]'
    await api.nfts.getNFTsByCollection(
      "cards",
      25,
      "cursor",
      [{ traitType: "Color", value: "Red" }],
      false,
      {
        isListed: false,
        priceMin: 0,
        priceMax: 2.5,
        rarityMin: 1,
        rarityMax: 50,
        sortBy: "rarity",
        sortDirection: "asc",
        numericTraits: ranges,
      },
    )
    expect(Object.fromEntries(query(fetch))).toEqual({
      limit: "25",
      next: "cursor",
      traits: '[{"traitType":"Color","value":"Red"}]',
      has_agent_binding: "false",
      is_listed: "false",
      price_min: "0",
      price_max: "2.5",
      rarity_min: "1",
      rarity_max: "50",
      sort_by: "rarity",
      sort_direction: "asc",
      numeric_traits: ranges,
    })
    await api.nfts.getNFTsByCollection("cards")
    expect([...query(fetch, 1)]).toEqual([])
  })

  test("depth and wallets remain opt-in", async () => {
    const fetch = respond({ social_media_accounts: [] })
    const api = new OpenSeaAPI({ apiKey: "test" })
    await api.collections.getCollectionOfferAggregates("cards", {
      includeDepth: true,
    })
    await api.accounts.getAccount("MixedCaseWallet", { include: ["wallets"] })
    expect(query(fetch, 0).get("include_depth")).toBe("true")
    expect(query(fetch, 1).getAll("include")).toEqual(["wallets"])
    expect(new URL(String(fetch.mock.calls[1][0])).pathname).toBe(
      "/api/v2/accounts/MixedCaseWallet",
    )
    await api.collections.getCollectionOfferAggregates("cards")
    await api.accounts.getAccount("MixedCaseWallet")
    for (const index of [2, 3]) expect([...query(fetch, index)]).toEqual([])
  })

  test("collection P&L stays decimal strings with unknown basis preserved", async () => {
    respond({
      collections: [
        {
          cost_basis_usd: "123456789.123456789",
          profit_loss_usd: null,
          profit_loss_percent: null,
          known_basis_quantity: 0,
          cost_basis_coverage: "NONE",
          valuation_method: "COLLECTION_TOP_OFFER",
        },
      ],
      next: null,
    })
    const api = new OpenSeaAPI({ apiKey: "test" })
    const result = await api.accounts.getProfileCollections("0xabc")
    expect(result.collections[0]).toMatchObject({
      costBasisUsd: "123456789.123456789",
      profitLossUsd: null,
      profitLossPercent: null,
      knownBasisQuantity: 0,
    })
  })
})
