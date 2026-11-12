import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { OpenSeaSDK } from "../../src/sdk"
import { type EventData, EventType } from "../../src/types"
import { OFFER_AMOUNT } from "../utils/env"
import {
  fixtureAsset,
  fixtureAssetWithStandard,
  getFixtureBalance,
  getFixtureCollectionSlug,
  OrderTracker,
  pollUntil,
  requireFixtureReady,
  waitForIndexed,
  wethAsset,
} from "../utils/fixture"
import {
  FIXTURE_CHAIN,
  FIXTURE_TOKEN_ID,
  getBuyerAddress,
  getBuyerSdkForChain,
  getSdkForChain,
  getWalletAddress,
  hasWallet,
  LISTING_AMOUNT,
} from "../utils/setupIntegration"
import { getRandomExpiration } from "../utils/utils"

/** Records transaction events on `sdk` while `action` runs. */
const withTransactionEvents = async (
  sdk: OpenSeaSDK,
  action: () => Promise<string>,
) => {
  const observed: { type: EventType; data: EventData }[] = []
  const listeners = [
    EventType.TransactionCreated,
    EventType.TransactionConfirmed,
    EventType.TransactionFailed,
  ].map(eventType => {
    const handler = (data: EventData) =>
      observed.push({ type: eventType, data })
    sdk.addListener(eventType, handler)
    return { eventType, handler }
  })
  try {
    const txHash = await action()
    return { txHash, observed }
  } finally {
    for (const { eventType, handler } of listeners) {
      sdk.removeListener(eventType, handler)
    }
  }
}

const expectConfirmed = (
  txHash: string,
  observed: { type: EventType; data: EventData }[],
) => {
  expect(txHash).toMatch(/^0x[0-9a-fA-F]{64}$/)
  const confirmed = observed.find(
    e => e.type === EventType.TransactionConfirmed,
  )
  expect(confirmed, "Expected TransactionConfirmed event").toBeDefined()
  expect(confirmed?.data.transactionHash).toBe(txHash)
  expect(
    observed.find(e => e.type === EventType.TransactionFailed),
  ).toBeUndefined()
}

describe.skipIf(!hasWallet)("SDK: fulfill fixture orders", () => {
  const tracker = new OrderTracker()

  beforeAll(requireFixtureReady)

  afterAll(async () => {
    await tracker.cancelAll(getSdkForChain(FIXTURE_CHAIN), getWalletAddress())
  }, 120_000)

  test("Buyer fulfills the owner's listing found via getBestListing", async () => {
    const sellerSdk = getSdkForChain(FIXTURE_CHAIN)
    const buyerSdk = getBuyerSdkForChain(FIXTURE_CHAIN)
    const buyerAddress = getBuyerAddress()

    const listing = await sellerSdk.createListing({
      accountAddress: getWalletAddress(),
      amount: LISTING_AMOUNT,
      asset: fixtureAsset(),
      expirationTime: getRandomExpiration(),
    })
    tracker.track(listing)
    const listedPrice = BigInt(listing.price.current.value)

    const slug = await getFixtureCollectionSlug()
    const best = await pollUntil(
      "the new listing to reach getBestListing",
      async () => {
        const candidate = await buyerSdk.api.listings.getBestListing(
          slug,
          FIXTURE_TOKEN_ID,
          true,
        )
        return candidate.orderHash === listing.orderHash ? candidate : undefined
      },
    )
    expect(best.chain).toBe(FIXTURE_CHAIN)
    expect(best.orderHash).toBe(listing.orderHash)
    expect(BigInt(best.price.current.value)).toBe(listedPrice)
    expect(typeof best.protocolAddress).toBe("string")

    const balanceBefore = await getFixtureBalance(buyerSdk, buyerAddress)
    // Fill the owner's own listing rather than `best`: anyone can list the
    // fixture, and the buyer should only ever pay the price set above.
    const { txHash, observed } = await withTransactionEvents(buyerSdk, () =>
      buyerSdk.fulfillOrder({ order: listing, accountAddress: buyerAddress }),
    )
    expectConfirmed(txHash, observed)

    expect(await getFixtureBalance(buyerSdk, buyerAddress)).toBe(
      balanceBefore + 1n,
    )
  }, 180_000)

  test("Buyer accepts the owner's item offer", async () => {
    const offererSdk = getSdkForChain(FIXTURE_CHAIN)
    const buyerSdk = getBuyerSdkForChain(FIXTURE_CHAIN)
    const buyerAddress = getBuyerAddress()
    const ownerAddress = getWalletAddress()

    const offer = await offererSdk.createOffer({
      accountAddress: ownerAddress,
      amount: OFFER_AMOUNT,
      asset: fixtureAsset(),
      expirationTime: getRandomExpiration(),
    })
    tracker.track(offer)
    const offeredWei = BigInt(offer.price.value)

    // No-op once the buyer has approved the conduit for the fixture.
    await buyerSdk.batchApproveAssets({
      assets: [{ asset: fixtureAssetWithStandard() }],
      fromAddress: buyerAddress,
    })

    await waitForIndexed(buyerSdk, offer, FIXTURE_CHAIN)

    const tokensBefore = await getFixtureBalance(buyerSdk, buyerAddress)
    const ownerTokensBefore = await getFixtureBalance(buyerSdk, ownerAddress)
    const wethBefore = await buyerSdk.getBalance({
      accountAddress: buyerAddress,
      asset: wethAsset(),
    })

    const { txHash, observed } = await withTransactionEvents(buyerSdk, () =>
      buyerSdk.fulfillOrder({ order: offer, accountAddress: buyerAddress }),
    )
    expectConfirmed(txHash, observed)

    expect(await getFixtureBalance(buyerSdk, buyerAddress)).toBe(
      tokensBefore - 1n,
    )
    expect(await getFixtureBalance(buyerSdk, ownerAddress)).toBe(
      ownerTokensBefore + 1n,
    )
    const wethReceived =
      (await buyerSdk.getBalance({
        accountAddress: buyerAddress,
        asset: wethAsset(),
      })) - wethBefore
    // The offer amount minus marketplace and creator fees.
    expect(wethReceived).toBeGreaterThan(0n)
    expect(wethReceived).toBeLessThanOrEqual(offeredWei)
  }, 180_000)
})
