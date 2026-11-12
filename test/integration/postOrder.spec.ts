import { parseEther } from "ethers"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { Chain } from "../../src/types"
import { OFFER_AMOUNT } from "../utils/env"
import {
  getFixtureCollectionSlug,
  OrderTracker,
  pollUntil,
  requireFixtureReady,
} from "../utils/fixture"
import {
  CREATE_LISTING_2_CHAIN,
  CREATE_LISTING_2_CONTRACT_ADDRESS,
  CREATE_LISTING_2_TOKEN_ID,
  CREATE_LISTING_CHAIN,
  CREATE_LISTING_CONTRACT_ADDRESS,
  CREATE_LISTING_TOKEN_ID,
  FIXTURE_CHAIN,
  FIXTURE_TRAIT,
  getSdkForChain,
  getWalletAddress,
  hasWallet,
  LISTING_AMOUNT,
} from "../utils/setupIntegration"
import { expectValidOrder, getRandomExpiration } from "../utils/utils"

describe.skipIf(!hasWallet)("SDK: order posting", () => {
  // One tracker per chain, since a cancel transaction is chain-specific.
  const trackers = new Map<Chain, OrderTracker>()
  const trackerFor = (chain: Chain) => {
    if (!trackers.has(chain)) {
      trackers.set(chain, new OrderTracker())
    }
    return trackers.get(chain)!
  }

  beforeAll(requireFixtureReady)

  afterAll(async () => {
    for (const [chain, tracker] of trackers) {
      await tracker.cancelAll(getSdkForChain(chain), getWalletAddress())
    }
  }, 180_000)

  test(`Post Offer - ${CREATE_LISTING_CHAIN}`, async () => {
    const sdk = getSdkForChain(CREATE_LISTING_CHAIN)
    const expirationTime = getRandomExpiration()
    const order = await sdk.createOffer({
      accountAddress: getWalletAddress(),
      amount: +OFFER_AMOUNT,
      asset: {
        tokenAddress: CREATE_LISTING_CONTRACT_ADDRESS,
        tokenId: CREATE_LISTING_TOKEN_ID,
      },
      expirationTime,
    })
    trackerFor(CREATE_LISTING_CHAIN).track(order)
    expectValidOrder(order)
    expect(order.protocolData!.parameters.endTime).toBe(
      expirationTime.toString(),
    )
    expect(BigInt(order.price.value)).toBe(parseEther(OFFER_AMOUNT))

    const fetched = await pollUntil("offer to be indexed", () =>
      sdk.api.orders.getOrderByHash(order.orderHash!, order.protocolAddress!),
    )
    expect(fetched.orderHash).toBe(order.orderHash)
    expect(fetched.protocolData!.parameters.offerer.toLowerCase()).toBe(
      getWalletAddress().toLowerCase(),
    )
  })

  test(`Post Listing - ${CREATE_LISTING_CHAIN}`, async () => {
    const sdk = getSdkForChain(CREATE_LISTING_CHAIN)
    const order = await sdk.createListing({
      accountAddress: getWalletAddress(),
      amount: LISTING_AMOUNT,
      asset: {
        tokenAddress: CREATE_LISTING_CONTRACT_ADDRESS,
        tokenId: CREATE_LISTING_TOKEN_ID,
      },
      expirationTime: getRandomExpiration(),
    })
    trackerFor(CREATE_LISTING_CHAIN).track(order)
    expectValidOrder(order)
    expect(BigInt(order.price.current.value)).toBe(parseEther(LISTING_AMOUNT))
  })

  test(`Post Listing with quantity 2 - ${CREATE_LISTING_2_CHAIN}`, async () => {
    const sdk = getSdkForChain(CREATE_LISTING_2_CHAIN)
    const order = await sdk.createListing({
      accountAddress: getWalletAddress(),
      amount: LISTING_AMOUNT,
      quantity: 2,
      asset: {
        tokenAddress: CREATE_LISTING_2_CONTRACT_ADDRESS,
        tokenId: CREATE_LISTING_2_TOKEN_ID,
      },
      expirationTime: getRandomExpiration(),
    })
    trackerFor(CREATE_LISTING_2_CHAIN).track(order)
    expectValidOrder(order)
    const offered = order.protocolData!.parameters.offer[0]
    expect(offered.identifierOrCriteria).toBe(CREATE_LISTING_2_TOKEN_ID)
    expect(offered.startAmount).toBe("2")
  })

  test("Post Listing with Optional Creator Fees", async () => {
    const sdk = getSdkForChain(CREATE_LISTING_CHAIN)

    const { nft } = await sdk.api.nfts.getNFT(
      CREATE_LISTING_CONTRACT_ADDRESS,
      CREATE_LISTING_TOKEN_ID,
      CREATE_LISTING_CHAIN,
    )
    const collection = await sdk.api.collections.getCollection(nft.collection)

    const order = await sdk.createListing({
      accountAddress: getWalletAddress(),
      amount: LISTING_AMOUNT,
      asset: {
        tokenAddress: CREATE_LISTING_CONTRACT_ADDRESS,
        tokenId: CREATE_LISTING_TOKEN_ID,
      },
      includeOptionalCreatorFees: true,
      expirationTime: getRandomExpiration(),
    })
    trackerFor(CREATE_LISTING_CHAIN).track(order)
    expectValidOrder(order)

    const hasOptionalFees = collection.fees.some(fee => !fee.required)
    if (hasOptionalFees) {
      const requiredFeesCount = collection.fees.filter(
        fee => fee.required,
      ).length
      expect(
        order.protocolData!.parameters.consideration.length,
      ).toBeGreaterThan(1 + requiredFeesCount)
    }
  })

  test(`Post Collection Offer and cancel offchain - ${FIXTURE_CHAIN}`, async () => {
    const sdk = getSdkForChain(FIXTURE_CHAIN)
    const offerResponse = await sdk.createCollectionOffer({
      collectionSlug: await getFixtureCollectionSlug(),
      accountAddress: getWalletAddress(),
      amount: OFFER_AMOUNT,
      quantity: 1,
      expirationTime: getRandomExpiration(),
    })
    expect(offerResponse).toBeDefined()
    expect(offerResponse).toHaveProperty("protocolAddress")
    expect(offerResponse).toHaveProperty("protocolData")
    expect(offerResponse).toHaveProperty("orderHash")
    // Tracked so afterAll cancels it onchain if the offchain cancel is refused.
    trackerFor(FIXTURE_CHAIN).track(offerResponse)

    const { protocolAddress, orderHash } = offerResponse!
    expect(orderHash, "EVM offers should have an order hash").toBeTruthy()
    // The cancel endpoint answers "Some orders were not found" until the
    // posted offer is indexed, so wait until it is readable by hash.
    await pollUntil("collection offer to be indexed", () =>
      sdk.api.orders.getOrderByHash(orderHash!, protocolAddress!),
    )

    // Behind os2-core's recent_offer_onchain_cancel flag, the API refuses an
    // offchain cancel for a signed-zone offer younger than 5 minutes, and the
    // SDK appends a pointer to sdk.cancelOrder. Either outcome is checked;
    // afterAll cancels the offer onchain when it was refused.
    let cancelResponse: Awaited<ReturnType<typeof sdk.offchainCancelOrder>>
    try {
      cancelResponse = await sdk.offchainCancelOrder(
        protocolAddress!,
        orderHash!,
        undefined,
        undefined,
        true,
      )
    } catch (error) {
      expect((error as Error).message).toMatch(
        /created recently must be cancell?ed onchain.*sdk\.cancelOrder/s,
      )
      return
    }
    expect(cancelResponse).toHaveProperty("lastSignatureIssuedValidUntil")
    // An offchain cancel stops new fulfillment signatures but leaves one already
    // issued fillable until it expires, so afterAll still cancels it onchain.
  })

  test("Post Trait Offer", async ctx => {
    const target = await getTraitOfferTarget()
    if (!target) {
      ctx.skip(
        "the fixture collection does not have trait offers enabled; see README-integration.md",
      )
      return
    }
    const sdk = getSdkForChain(target.chain)
    const offerResponse = await sdk.createCollectionOffer({
      collectionSlug: target.collectionSlug,
      accountAddress: getWalletAddress(),
      amount: OFFER_AMOUNT,
      quantity: 1,
      traitType: target.trait.type,
      traitValue: target.trait.value,
      expirationTime: getRandomExpiration(),
    })
    expect(offerResponse).toBeDefined()
    expect(offerResponse).toHaveProperty("protocolData")
    trackerFor(target.chain).track(offerResponse)
    expect(offerResponse?.criteria.traits).toEqual([target.trait])
  })
})

/**
 * Trait offers need the collection's `trait_offers_enabled` flag, which only an
 * OpenSea admin can set on the fixture (its supply is over the self-serve limit).
 * The test posts only on the fixture, so a real holder can never fill it.
 */
const getTraitOfferTarget = async () => {
  const collectionSlug = await getFixtureCollectionSlug()
  const collection =
    await getSdkForChain(FIXTURE_CHAIN).api.collections.getCollection(
      collectionSlug,
    )
  if (!collection.traitOffersEnabled) {
    return undefined
  }
  return { chain: FIXTURE_CHAIN, collectionSlug, trait: FIXTURE_TRAIT }
}
