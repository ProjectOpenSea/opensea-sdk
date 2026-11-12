import { describe, expect, test } from "vitest"
import { Chain } from "../../src/types"
import { decodeTokenIds } from "../../src/utils/utils"
import { getReadOnlySdkForChain } from "../utils/setupIntegration"

describe("SDK: getCollectionOffers", () => {
  test("Get Collection Offers", async () => {
    const slug = "cool-cats-nft"
    const response = await getReadOnlySdkForChain(
      Chain.Mainnet,
    ).api.offers.getCollectionOffers(slug)

    expect(response, "Response should not be null").toBeTruthy()
    expect(response.offers, "Collection offers should not be null").toBeTruthy()
    expect(response.offers.length).toBeGreaterThan(0)
    const offer = response.offers[0]
    expect(offer.orderHash, "Order hash should not be null").toBeTruthy()
    expect(offer.criteria).toBeTruthy()
    const tokens = offer.criteria?.encodedTokenIds
    expect(tokens).toBeTruthy()

    const encodedTokenIds = offer.criteria?.encodedTokenIds
    expect(encodedTokenIds).toBeTruthy()

    const decodedTokenIds = decodeTokenIds(encodedTokenIds as string)
    expect(decodedTokenIds[0], "Decoded tokens should not be null").toBeTruthy()
  })
})
