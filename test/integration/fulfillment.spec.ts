import { ethers } from "ethers"
import { describe, expect, test } from "vitest"
import { OrderSide } from "../../src/types"
import { api } from "../utils/liveSdk"

describe("Generating fulfillment data", () => {
  test(`Generate fulfillment data for listing`, async () => {
    const { listings } = await api.getAllListings("boredapeyachtclub", 1)
    const listing = listings?.[0]

    if (!listing?.orderHash) {
      return
    }

    const fulfillment = await api.generateFulfillmentData(
      ethers.Wallet.createRandom().address,
      listing.orderHash,
      listing.protocolAddress!,
      OrderSide.LISTING,
    )

    expect(fulfillment.fulfillmentData.orders[0].signature).toBeDefined()
  })

  test(`Generate fulfillment data for offer`, async () => {
    const { offers } = await api.getAllOffers("boredapeyachtclub", 10)
    const offer = offers?.find(o => !o.criteria)

    if (!offer?.orderHash) {
      return
    }

    const fulfillment = await api.generateFulfillmentData(
      ethers.Wallet.createRandom().address,
      offer.orderHash,
      offer.protocolAddress!,
      OrderSide.OFFER,
    )

    expect(fulfillment.fulfillmentData.orders[0].signature).toBeDefined()
  })

  test(`Generate fulfillment data for collection offer with consideration parameters`, async () => {
    // Get a collection offer (criteria offer)
    const offers = await api.getAllOffers("boredapeyachtclub", 1)

    if (!offers.offers || offers.offers.length === 0) {
      // Skip if no offers available
      return
    }

    // Find a criteria offer (collection or trait offer)
    const collectionOffer = offers.offers.find(offer => offer.criteria)

    if (!collectionOffer?.orderHash) {
      // Skip if no collection offers available
      return
    }

    try {
      // Test with consideration parameters for criteria offers
      const fulfillment = await api.generateFulfillmentData(
        ethers.Wallet.createRandom().address,
        collectionOffer.orderHash,
        collectionOffer.protocolAddress!,
        OrderSide.OFFER,
        "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D", // BAYC contract
        "1", // Token ID
      )

      expect(fulfillment.fulfillmentData.orders[0].signature).toBeDefined()
      expect(fulfillment.protocol).toBe("seaport")
    } catch (error) {
      // Order may no longer be active/valid, or the token may not match
      // the offer's trait criteria. Skip on expected API errors.
      if (
        error instanceof Error &&
        (error.message.includes("Order not found") ||
          error.message.includes("does not match") ||
          error.message.includes("not fulfillable"))
      ) {
        return
      }
      throw error
    }
  })
})
