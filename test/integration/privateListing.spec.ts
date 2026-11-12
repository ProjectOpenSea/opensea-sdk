import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { Listing } from "../../src/api/types"
import type { OrderV2 } from "../../src/orders/types"
import { getFeeRecipient } from "../../src/utils/utils"
import {
  getFixtureBalance,
  OrderTracker,
  requireFixtureReady,
  waitForIndexed,
} from "../utils/fixture"
import { normalizeChainName } from "../utils/runtime"
import {
  CREATE_LISTING_CHAIN,
  CREATE_LISTING_CONTRACT_ADDRESS,
  CREATE_LISTING_TOKEN_ID,
  FIXTURE_CHAIN,
  getBuyerAddress,
  getBuyerSdkForChain,
  getSdkForChain,
  getWalletAddress,
  hasWallet,
  LISTING_AMOUNT,
  usesCustomListingAsset,
} from "../utils/setupIntegration"
import { expectValidOrder, getRandomExpiration } from "../utils/utils"

/**
 * fulfillPrivateOrder takes an OrderV2 but reads only orderHash, protocolData,
 * protocolAddress, and taker.address. The API returns a Listing, which has no
 * taker, so the designated buyer is supplied here. Its signature is null, so
 * this also covers fetching the signature through the fulfillment endpoint.
 */
const asPrivateOrder = (listing: Listing, taker: string): OrderV2 =>
  ({
    orderHash: listing.orderHash,
    protocolData: listing.protocolData!,
    protocolAddress: listing.protocolAddress!,
    taker: { address: taker },
  }) as unknown as OrderV2

describe.skipIf(!hasWallet)(
  `SDK: Private Listings Integration - ${normalizeChainName(CREATE_LISTING_CHAIN)}`,
  () => {
    const tracker = new OrderTracker()

    beforeAll(requireFixtureReady)

    afterAll(async () => {
      await tracker.cancelAll(
        getSdkForChain(CREATE_LISTING_CHAIN),
        getWalletAddress(),
      )
    }, 120_000)

    test("Post Private Listing to the buyer, who fulfills it", async () => {
      const chain = CREATE_LISTING_CHAIN
      const sdk = getSdkForChain(chain)
      const buyerAddress = getBuyerAddress()

      const order = await sdk.createListing({
        accountAddress: getWalletAddress(),
        amount: LISTING_AMOUNT,
        asset: {
          tokenAddress: CREATE_LISTING_CONTRACT_ADDRESS,
          tokenId: CREATE_LISTING_TOKEN_ID,
        },
        buyerAddress,
        expirationTime: getRandomExpiration(),
      })
      tracker.track(order)
      expectValidOrder(order)

      const consideration = order.protocolData!.parameters.consideration
      expect(consideration).toBeDefined()

      const hasMarketplaceFee = consideration.some(
        item =>
          item.recipient?.toLowerCase() ===
          getFeeRecipient(chain).toLowerCase(),
      )
      expect(hasMarketplaceFee).toBe(false)

      const itemToBuyer = consideration.find(
        item => item.recipient.toLowerCase() === buyerAddress.toLowerCase(),
      )
      expect(itemToBuyer, "NFT should be routed to the buyer").toBeDefined()
      expect(itemToBuyer!.token.toLowerCase()).toBe(
        CREATE_LISTING_CONTRACT_ADDRESS.toLowerCase(),
      )
      expect(itemToBuyer!.identifierOrCriteria).toBe(CREATE_LISTING_TOKEN_ID)

      // A custom CREATE_LISTING asset may be an NFT the owner wants to keep.
      if (usesCustomListingAsset || chain !== FIXTURE_CHAIN) {
        return
      }

      const buyerSdk = getBuyerSdkForChain(chain)
      // A taker reads a private listing from the API, so it is indexed by then.
      await waitForIndexed(buyerSdk, order, chain)
      const balanceBefore = await getFixtureBalance(buyerSdk, buyerAddress)
      const txHash = await buyerSdk.fulfillPrivateOrder({
        order: asPrivateOrder(order, buyerAddress),
        accountAddress: buyerAddress,
      })
      expect(txHash).toMatch(/^0x[0-9a-fA-F]{64}$/)
      expect(await getFixtureBalance(buyerSdk, buyerAddress)).toBe(
        balanceBefore + 1n,
      )
    }, 180_000)

    test("Post Regular Listing (for comparison)", async () => {
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
      tracker.track(order)
      expectValidOrder(order)

      expect(order.protocolData!.parameters.consideration).toBeDefined()
      expect(
        order.protocolData!.parameters.consideration.length,
      ).toBeGreaterThan(0)
    })
  },
)
