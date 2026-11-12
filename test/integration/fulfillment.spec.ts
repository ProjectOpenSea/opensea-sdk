import { ethers } from "ethers"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { CollectionOffer, Listing, Offer } from "../../src/api/types"
import { OrderSide } from "../../src/types"
import { OFFER_AMOUNT } from "../utils/env"
import {
  fixtureAsset,
  getFixtureBalance,
  getFixtureCollectionSlug,
  OrderTracker,
  requireFixtureReady,
  waitForIndexed,
} from "../utils/fixture"
import {
  FIXTURE_CHAIN,
  FIXTURE_CONTRACT_ADDRESS,
  FIXTURE_TOKEN_ID,
  getBuyerAddress,
  getSdkForChain,
  getWalletAddress,
  hasWallet,
  LISTING_AMOUNT,
} from "../utils/setupIntegration"
import { getRandomExpiration } from "../utils/utils"

/**
 * The owner posts a listing, an item offer, and a collection offer on the
 * fixture; the derived buyer, who holds fixture tokens, is the fulfiller. Only
 * fulfillment data is generated, nothing is filled, and every order is
 * cancelled onchain afterwards.
 */
describe.skipIf(!hasWallet)("Generating fulfillment data", () => {
  const tracker = new OrderTracker()
  let listing: Listing
  let itemOffer: Offer
  let collectionOffer: CollectionOffer

  beforeAll(async () => {
    requireFixtureReady()
    const sdk = getSdkForChain(FIXTURE_CHAIN)
    const accountAddress = getWalletAddress()

    listing = await sdk.createListing({
      accountAddress,
      amount: LISTING_AMOUNT,
      asset: fixtureAsset(),
      expirationTime: getRandomExpiration(),
    })
    tracker.track(listing)

    itemOffer = await sdk.createOffer({
      accountAddress,
      amount: OFFER_AMOUNT,
      asset: fixtureAsset(),
      expirationTime: getRandomExpiration(),
    })
    tracker.track(itemOffer)

    const created = await sdk.createCollectionOffer({
      collectionSlug: await getFixtureCollectionSlug(),
      accountAddress,
      amount: OFFER_AMOUNT,
      quantity: 1,
      expirationTime: getRandomExpiration(),
    })
    expect(created, "Collection offer should be created").not.toBeNull()
    collectionOffer = created!
    tracker.track(collectionOffer)

    for (const order of [listing, itemOffer, collectionOffer]) {
      await waitForIndexed(sdk, order, FIXTURE_CHAIN)
    }

    const buyerTokens = await getFixtureBalance(sdk, getBuyerAddress())
    expect(
      buyerTokens,
      "Buyer must hold the fixture token it is asked to sell",
    ).toBeGreaterThan(0n)
  }, 180_000)

  afterAll(async () => {
    await tracker.cancelAll(getSdkForChain(FIXTURE_CHAIN), getWalletAddress())
  }, 120_000)

  test("Generate fulfillment data for listing", async () => {
    const fulfillment = await getSdkForChain(
      FIXTURE_CHAIN,
    ).api.orders.generateFulfillmentData(
      getBuyerAddress(),
      listing.orderHash!,
      listing.protocolAddress!,
      OrderSide.LISTING,
    )

    expect(fulfillment.fulfillmentData.orders[0].signature).toBeDefined()
  })

  test("Generate fulfillment data for offer", async () => {
    const fulfillment = await getSdkForChain(
      FIXTURE_CHAIN,
    ).api.orders.generateFulfillmentData(
      getBuyerAddress(),
      itemOffer.orderHash!,
      itemOffer.protocolAddress!,
      OrderSide.OFFER,
    )

    expect(fulfillment.fulfillmentData.orders[0].signature).toBeDefined()
  })

  test("Reject offer fulfillment data for a fulfiller that does not own the item", async () => {
    await expect(
      getSdkForChain(FIXTURE_CHAIN).api.orders.generateFulfillmentData(
        ethers.Wallet.createRandom().address,
        itemOffer.orderHash!,
        itemOffer.protocolAddress!,
        OrderSide.OFFER,
      ),
    ).rejects.toThrow("Item is not owned by the fulfiller")
  })

  test("Generate fulfillment data for collection offer with consideration parameters", async () => {
    const fulfillment = await getSdkForChain(
      FIXTURE_CHAIN,
    ).api.orders.generateFulfillmentData(
      getBuyerAddress(),
      collectionOffer.orderHash!,
      collectionOffer.protocolAddress!,
      OrderSide.OFFER,
      FIXTURE_CONTRACT_ADDRESS,
      FIXTURE_TOKEN_ID,
    )

    expect(fulfillment.fulfillmentData.orders[0].signature).toBeDefined()
    // The spec types `protocol` as a free-form string; the API sends the
    // Seaport version it built the fulfillment for (e.g. "seaport1.6").
    expect(fulfillment.protocol).toMatch(/^seaport/)
  })
})
