import { describe, expect, test } from "vitest"
import { Chain } from "../../src/types"
import { OFFER_AMOUNT } from "../utils/env"
import { ensureVarsOrSkip } from "../utils/runtime"
import {
  CREATE_LISTING_2_CHAIN,
  CREATE_LISTING_2_CONTRACT_ADDRESS,
  CREATE_LISTING_2_TOKEN_ID,
  CREATE_LISTING_CHAIN,
  CREATE_LISTING_CONTRACT_ADDRESS,
  CREATE_LISTING_TOKEN_ID,
  getSdkForChain,
  LISTING_AMOUNT,
  requireIntegrationEnv,
  walletAddress,
} from "../utils/setupIntegration"
import { expectValidOrder, getRandomExpiration } from "../utils/utils"

describe("SDK: order posting", () => {
  beforeEach(() => {
    requireIntegrationEnv()
  })

  test("Post Offer - Mainnet", async () => {
    const chain = Chain.Mainnet
    const sdk = getSdkForChain(chain)

    const expirationTime = getRandomExpiration()
    const offer = {
      accountAddress: walletAddress,
      amount: +OFFER_AMOUNT,
      asset: {
        tokenAddress: "0x1a92f7381b9f03921564a437210bb9396471050c",
        tokenId: "2288",
      },
      expirationTime,
    }
    const order = await sdk.createOffer(offer)
    expectValidOrder(order)
    expect(order.protocolData!.parameters.endTime).toBe(
      expirationTime.toString(),
    )
    expect(BigInt(order.price.value)).toBe(
      BigInt(parseFloat(OFFER_AMOUNT) * 10 ** 18),
    )
  })

  test("Post Offer - Polygon", async function () {
    const chain2 = Chain.Polygon
    const sdk2 = getSdkForChain(chain2)

    const expirationTime = getRandomExpiration()
    const offer = {
      accountAddress: walletAddress,
      amount: +OFFER_AMOUNT,
      asset: {
        tokenAddress: "0x251be3a17af4892035c37ebf5890f4a4d889dcad",
        tokenId:
          "5157722665851654661253630736650528917481758416718625695136396853508305538271",
      },
      expirationTime,
    }
    try {
      const order = await sdk2.createOffer(offer)
      expectValidOrder(order)
    } catch (error) {
      if (
        (error as Error).message?.includes("does not have the amount needed")
      ) {
        console.log("Skipping - wallet has insufficient Polygon balance")
        this.skip()
      }
      throw error
    }
  })

  test(`Post Listing - ${CREATE_LISTING_CHAIN}`, async function () {
    if (
      !ensureVarsOrSkip(this, {
        CREATE_LISTING_CONTRACT_ADDRESS,
        CREATE_LISTING_TOKEN_ID,
      })
    ) {
      return
    }

    const chain = CREATE_LISTING_CHAIN
    const sdk = getSdkForChain(chain)
    const expirationTime = getRandomExpiration()
    const listing = {
      accountAddress: walletAddress,
      amount: LISTING_AMOUNT,
      asset: {
        tokenAddress: CREATE_LISTING_CONTRACT_ADDRESS,
        tokenId: CREATE_LISTING_TOKEN_ID,
      },
      expirationTime,
    }
    const order = await sdk.createListing(listing)
    expectValidOrder(order)
  })

  test(`Post Listing - ${CREATE_LISTING_2_CHAIN}`, async function () {
    if (
      !ensureVarsOrSkip(this, {
        CREATE_LISTING_2_CONTRACT_ADDRESS,
        CREATE_LISTING_2_TOKEN_ID,
      })
    ) {
      return
    }

    const chain2 = CREATE_LISTING_2_CHAIN
    const sdk2 = getSdkForChain(chain2)
    const expirationTime = getRandomExpiration()
    const listing = {
      accountAddress: walletAddress,
      amount: +LISTING_AMOUNT * 1_000_000,
      asset: {
        tokenAddress: CREATE_LISTING_2_CONTRACT_ADDRESS as string,
        tokenId: CREATE_LISTING_2_TOKEN_ID as string,
      },
      expirationTime,
    }
    const order = await sdk2.createListing(listing)
    expectValidOrder(order)
  })

  test("Post Listing with Optional Creator Fees", async function () {
    if (
      !ensureVarsOrSkip(this, {
        CREATE_LISTING_CONTRACT_ADDRESS,
        CREATE_LISTING_TOKEN_ID,
      })
    ) {
      return
    }

    const chain = CREATE_LISTING_CHAIN
    const sdk = getSdkForChain(chain)
    const expirationTime = getRandomExpiration()

    // Get the NFT to retrieve its collection
    const { nft } = await sdk.api.nfts.getNFT(
      CREATE_LISTING_CONTRACT_ADDRESS,
      CREATE_LISTING_TOKEN_ID,
    )
    const collection = await sdk.api.collections.getCollection(nft.collection)

    const listing = {
      accountAddress: walletAddress,
      amount: LISTING_AMOUNT,
      asset: {
        tokenAddress: CREATE_LISTING_CONTRACT_ADDRESS,
        tokenId: CREATE_LISTING_TOKEN_ID,
      },
      includeOptionalCreatorFees: true,
      expirationTime,
    }
    const order = await sdk.createListing(listing)
    expectValidOrder(order)

    // Verify that optional creator fees are included
    const hasOptionalFees = collection.fees.some(fee => !fee.required)
    if (hasOptionalFees) {
      // Check that the order has more consideration items than just seller + required fees
      const requiredFeesCount = collection.fees.filter(
        fee => fee.required,
      ).length
      expect(
        order.protocolData!.parameters.consideration.length,
      ).toBeGreaterThan(1 + requiredFeesCount)
    }
  })

  test("Post Collection Offer - Mainnet", async () => {
    const chain = Chain.Mainnet
    const sdk = getSdkForChain(chain)
    const collection = await sdk.api.collections.getCollection("cool-cats-nft")
    const expirationTime = getRandomExpiration()
    const postOrderRequest = {
      collectionSlug: collection.collection,
      accountAddress: walletAddress,
      amount: OFFER_AMOUNT,
      quantity: 1,
      expirationTime,
    }
    const offerResponse = await sdk.createCollectionOffer(postOrderRequest)
    expect(offerResponse).toBeDefined()
    expect(offerResponse).toHaveProperty("protocolAddress")
    expect(offerResponse).toHaveProperty("protocolData")
    expect(offerResponse).toHaveProperty("orderHash")

    // Wait to ensure the order is indexed
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Cancel the order using self serve API key tied to the offerer
    expect(offerResponse).not.toBeNull()
    const { protocolAddress, orderHash } = offerResponse!
    expect(orderHash, "EVM offers should have an order hash").toBeTruthy()
    const cancelResponse = await sdk.offchainCancelOrder(
      protocolAddress!,
      orderHash!,
      undefined,
      undefined,
      true,
    )
    expect(cancelResponse).toBeDefined()
    expect(cancelResponse).toHaveProperty("lastSignatureIssuedValidUntil")
  })

  test("Post Collection Offer - Polygon", async () => {
    const chain = Chain.Polygon
    const sdk = getSdkForChain(chain)
    const collection =
      await sdk.api.collections.getCollection("arttoken-1155-4")
    const expirationTime = getRandomExpiration()
    const postOrderRequest = {
      collectionSlug: collection.collection,
      accountAddress: walletAddress,
      amount: 0.0001,
      quantity: 1,
      expirationTime,
    }
    const offerResponse = await sdk.createCollectionOffer(postOrderRequest)
    expect(offerResponse).toBeDefined()
    expect(offerResponse).toHaveProperty("protocolAddress")
    expect(offerResponse).toHaveProperty("protocolData")
    expect(offerResponse).toHaveProperty("orderHash")

    // Wait to ensure the order is indexed
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Cancel the order using the offerer signature, deriving it from the ethers signer
    expect(offerResponse).not.toBeNull()
    const { protocolAddress, orderHash } = offerResponse!
    expect(orderHash, "EVM offers should have an order hash").toBeTruthy()
    const cancelResponse = await sdk.offchainCancelOrder(
      protocolAddress!,
      orderHash!,
      undefined,
      undefined,
      true,
    )
    expect(cancelResponse).toBeDefined()
    expect(cancelResponse).toHaveProperty("lastSignatureIssuedValidUntil")
  })

  test("Post Trait Offer - Ethereum", async () => {
    const chain = Chain.Mainnet
    const sdk = getSdkForChain(chain)
    const collection = await sdk.api.collections.getCollection("cool-cats-nft")
    const expirationTime = getRandomExpiration()
    const postOrderRequest = {
      collectionSlug: collection.collection,
      accountAddress: walletAddress,
      amount: OFFER_AMOUNT,
      quantity: 1,
      traitType: "face",
      traitValue: "tvface bobross",
      expirationTime,
    }
    const offerResponse = await sdk.createCollectionOffer(postOrderRequest)
    expect(offerResponse).toBeDefined()
    expect(offerResponse).toHaveProperty("protocolData")
    expect(offerResponse?.criteria.traits).toEqual([
      { type: "face", value: "tvface bobross" },
    ])
  })
})
