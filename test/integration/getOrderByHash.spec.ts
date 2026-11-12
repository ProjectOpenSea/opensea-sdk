import { JsonRpcProvider } from "ethers"
import { describe, expect, test } from "vitest"
import { OpenSeaSDK } from "../../src/sdk"
import { Chain } from "../../src/types"
import { OPENSEA_API_KEY } from "../utils/env"

// Create SDK without wallet - only needs API key for read-only operations
const provider = new JsonRpcProvider("https://cloudflare-eth.com")
const sdk = new OpenSeaSDK(provider, {
  chain: Chain.Mainnet,
  apiKey: OPENSEA_API_KEY,
})

describe("SDK: getOrderByHash", () => {
  test("Get Order By Hash - Offer", async () => {
    const slug = "boredapeyachtclub"

    // First get an offer to get its hash and protocol address
    const offersResponse = await sdk.api.offers.getAllOffers(slug)
    expect(offersResponse.offers.length).toBeGreaterThan(0)

    const offer = offersResponse.offers[0]
    const orderHash = offer.orderHash
    const protocolAddress = offer.protocolAddress!
    expect(orderHash, "EVM offers should have an order hash").toBeTruthy()

    // Now fetch the same order by hash
    const response = await sdk.api.orders.getOrderByHash(
      orderHash!,
      protocolAddress,
    )

    expect(response, "Response should not be null").toBeTruthy()
    expect(response.orderHash).toBe(orderHash)
    expect(response.protocolAddress).toBe(protocolAddress)
    expect(
      response.protocolData,
      "Protocol data should not be null",
    ).toBeTruthy()
    expect(
      response.protocolData!.parameters,
      "Protocol data parameters should not be null",
    ).toBeTruthy()
    expect(
      response.protocolData!.parameters.offerer,
      "Offerer should not be null",
    ).toBeTruthy()
  })

  test("Get Order By Hash - Listing", async () => {
    const slug = "boredapeyachtclub"

    // First get a listing to get its hash and protocol address
    const listingsResponse = await sdk.api.listings.getAllListings(slug)
    expect(listingsResponse.listings.length).toBeGreaterThan(0)

    const listing = listingsResponse.listings[0]
    const orderHash = listing.orderHash
    const protocolAddress = listing.protocolAddress!
    expect(orderHash, "EVM listings should have an order hash").toBeTruthy()

    // Now fetch the same order by hash
    const response = await sdk.api.orders.getOrderByHash(
      orderHash!,
      protocolAddress,
    )

    expect(response).toBeTruthy()
    expect(response.orderHash).toBe(orderHash)
    expect(response.protocolAddress).toBe(protocolAddress)
    expect(
      response.protocolData,
      "Protocol data should not be null",
    ).toBeTruthy()
    expect(
      response.protocolData!.parameters,
      "Protocol data parameters should not be null",
    ).toBeTruthy()
  })

  test("Get Order By Hash returns data usable for cancellation", async () => {
    const slug = "boredapeyachtclub"

    // Get an offer
    const offersResponse = await sdk.api.offers.getAllOffers(slug)
    expect(offersResponse.offers.length).toBeGreaterThan(0)

    const offer = offersResponse.offers[0]
    expect(offer.orderHash, "EVM offers should have an order hash").toBeTruthy()

    // Fetch by hash
    const response = await sdk.api.orders.getOrderByHash(
      offer.orderHash!,
      offer.protocolAddress!,
    )

    // Verify the response has fields needed for cancellation
    expect(
      response.protocolAddress,
      "protocolAddress is required for cancel",
    ).toBeTruthy()
    expect(
      response.protocolData,
      "protocolData is required for cancel",
    ).toBeTruthy()
    expect(
      response.protocolData!.parameters,
      "protocolData.parameters is required for cancel",
    ).toBeTruthy()
    expect(
      response.protocolData!.parameters.offerer,
      "offerer is required for cancel",
    ).toBeTruthy()
    expect(
      Array.isArray(response.protocolData!.parameters.offer),
      "offer array is required for cancel",
    ).toBe(true)
    expect(
      Array.isArray(response.protocolData!.parameters.consideration),
      "consideration array is required for cancel",
    ).toBe(true)
  })
})
