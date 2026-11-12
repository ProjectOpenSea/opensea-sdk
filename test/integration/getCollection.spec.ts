import { describe, expect, test } from "vitest"
import { CollectionOrderByOption } from "../../src/api/types"
import { Chain, SafelistStatus } from "../../src/types"
import { getReadOnlySdkForChain } from "../utils/setupIntegration"
import { processInBatches } from "../utils/utils"

/**
 * The all-chain sweep walks every supported chain, so it is slow and exposed to
 * any one chain's API being briefly unavailable. It stays off for ordinary
 * integration runs and is opted into for scheduled or manual multi-chain
 * validation, rather than being permanently unreachable behind `test.skip`.
 */
const allChainCollectionsTest =
  process.env.OPENSEA_RUN_ALL_CHAIN_COLLECTIONS === "true" ? test : test.skip

describe("SDK: getCollection", () => {
  test("Get Verified Collection", async () => {
    const slug = "cool-cats-nft"
    const collection = await getReadOnlySdkForChain(
      Chain.Mainnet,
    ).api.collections.getCollection(slug)

    expect(collection).toBeTruthy()
    expect(collection.name).toBeTruthy()
    expect(collection.collection).toBe(slug)
    expect(collection.safelistStatus).toBe(SafelistStatus.VERIFIED)
  })

  test("Get Collections", async () => {
    const response = await getReadOnlySdkForChain(
      Chain.Mainnet,
    ).api.collections.getCollections()
    const { collections, next } = response
    expect(collections[0], "Collection should not be null").toBeTruthy()
    expect(collections[0].name, "Collection name should exist").toBeTruthy()
    expect(next, "Next cursor should be included").toBeTruthy()

    const response2 = await getReadOnlySdkForChain(
      Chain.Mainnet,
    ).api.collections.getCollections(CollectionOrderByOption.MARKET_CAP)
    const { collections: collectionsByMarketCap, next: nextByMarketCap } =
      response2
    expect(
      collectionsByMarketCap[0],
      "Collection should not be null",
    ).toBeTruthy()
    expect(
      collectionsByMarketCap[0].name,
      "Collection name should exist",
    ).toBeTruthy()
    expect(nextByMarketCap, "Next cursor should be included").toBeTruthy()

    expect(
      collectionsByMarketCap[0].name,
      "Collection order should differ",
    ).not.toBe(collections[0].name)
  })

  test("Get Collections by creator", async () => {
    const response = await getReadOnlySdkForChain(
      Chain.Mainnet,
    ).api.collections.getCollections(
      CollectionOrderByOption.CREATED_DATE,
      undefined,
      "YugaLabs",
    )
    const slugs = response.collections.map(c => c.collection)
    expect(slugs).toContain("boredapeyachtclub")
    expect(slugs).toContain("mutant-ape-yacht-club")
    expect(slugs, "Creator filter should exclude other creators").not.toContain(
      "cool-cats-nft",
    )
  })

  test("Get Collection Stats", async () => {
    const slug = "cool-cats-nft"
    const stats = await getReadOnlySdkForChain(
      Chain.Mainnet,
    ).api.collections.getCollectionStats(slug)

    expect(stats, "Stats should not be null").toBeTruthy()
    expect(stats.total.volume, "Volume should not be null").toBeTruthy()
    expect(stats.total.sales, "Sales should not be null").toBeTruthy()
    expect(stats.intervals, "Intervals should exist").toBeTruthy()
  })

  allChainCollectionsTest("Get Collections for all chains", async () => {
    // Excluding Solana (no NFT collections)
    const chains = Object.values(Chain).filter(chain => chain !== Chain.Solana)
    const sdk = getReadOnlySdkForChain(Chain.Mainnet)

    await processInBatches(chains, 3, async chain => {
      try {
        const response = await sdk.api.collections.getCollections(
          CollectionOrderByOption.CREATED_DATE,
          chain,
          undefined,
          false,
          3, // Limit to returning 3 collections per chain to keep test fast
        )

        const { collections } = response
        expect(
          Array.isArray(collections),
          `Collections should be an array for ${chain}`,
        ).toBe(true)
        expect(
          collections.length,
          `Chain ${chain} should have at least one collection`,
        ).toBeGreaterThan(0)
        expect(
          collections[0].name,
          `Collection name should exist for ${chain}`,
        ).toBeTruthy()
        expect(
          collections[0].collection,
          `Collection slug should exist for ${chain}`,
        ).toBeTruthy()
      } catch (error) {
        throw new Error(
          `Failed to get collections for chain "${chain}": ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    })
  })
})
