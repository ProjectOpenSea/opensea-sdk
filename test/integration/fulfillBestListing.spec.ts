import { describe, expect, test } from "vitest"
import { type EventData, EventType } from "../../src/types"
import { ensureVarsOrSkip } from "../utils/runtime"
// import order adjusted above
import {
  BUY_LISTING_CHAIN,
  BUY_LISTING_CONTRACT_ADDRESS,
  BUY_LISTING_TOKEN_ID,
  getSdkForChain,
  requireIntegrationEnv,
  walletAddress,
} from "../utils/setupIntegration"

describe("SDK: fulfill best listing", () => {
  beforeEach(() => {
    requireIntegrationEnv()
  })

  test("Get best listing and fulfill without errors", async function () {
    if (
      !ensureVarsOrSkip(this, {
        BUY_LISTING_CHAIN,
        BUY_LISTING_CONTRACT_ADDRESS,
        BUY_LISTING_TOKEN_ID,
      })
    ) {
      return
    }

    const sdkClient = getSdkForChain(BUY_LISTING_CHAIN)
    const chain = BUY_LISTING_CHAIN
    const contractAddress = BUY_LISTING_CONTRACT_ADDRESS as string
    const tokenId = BUY_LISTING_TOKEN_ID as string

    const { nft } = await sdkClient.api.nfts.getNFT(
      contractAddress,
      tokenId,
      chain,
    )
    expect(nft).toBeDefined()
    expect(typeof nft.collection).toBe("string")
    const slug = nft.collection

    const listing = await sdkClient.api.listings.getBestListing(
      slug,
      tokenId,
      true,
    )
    expect(listing).toBeDefined()
    expect(listing.chain).toBe(chain)
    expect(typeof listing.orderHash).toBe("string")
    expect(typeof listing.protocolAddress).toBe("string")

    const observedEvents: { type: EventType; data: EventData }[] = []
    const listeners = [
      EventType.TransactionCreated,
      EventType.TransactionConfirmed,
      EventType.TransactionFailed,
    ].map(eventType => {
      const handler = (eventData: EventData) => {
        observedEvents.push({ type: eventType, data: eventData })
      }
      sdkClient.addListener(eventType, handler)
      return { eventType, handler }
    })

    try {
      const txHash = await sdkClient.fulfillOrder({
        order: listing,
        accountAddress: walletAddress,
      })

      expect(txHash).toMatch(/^0x[0-9a-fA-F]{64}$/)

      const confirmedEvent = observedEvents.find(
        event => event.type === EventType.TransactionConfirmed,
      )
      expect(
        confirmedEvent,
        "Expected TransactionConfirmed event",
      ).toBeDefined()
      expect(confirmedEvent?.data.transactionHash).toBe(txHash)

      const failedEvent = observedEvents.find(
        event => event.type === EventType.TransactionFailed,
      )
      expect(failedEvent).toBeUndefined()
    } finally {
      for (const { eventType, handler } of listeners) {
        sdkClient.removeListener(eventType, handler)
      }
    }
  })
})
