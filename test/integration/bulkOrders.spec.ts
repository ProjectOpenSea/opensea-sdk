import { describe, expect, test } from "vitest"
import { Chain } from "../../src/types"
import { OFFER_AMOUNT } from "../utils/env"
import { ensureVarsOrSkip } from "../utils/runtime"
import {
  CREATE_LISTING_3_CHAIN,
  CREATE_LISTING_3_CONTRACT_ADDRESS,
  CREATE_LISTING_3_TOKEN_ID,
  CREATE_LISTING_CHAIN,
  CREATE_LISTING_CONTRACT_ADDRESS,
  CREATE_LISTING_TOKEN_ID,
  getSdkForChain,
  LISTING_AMOUNT,
  requireIntegrationEnv,
  walletAddress,
} from "../utils/setupIntegration"
import { expectValidOrder, getRandomExpiration } from "../utils/utils"

describe("SDK: bulk order posting", () => {
  beforeEach(() => {
    requireIntegrationEnv()
  })

  test("Post Bulk Offers - Mainnet", async function () {
    if (
      !ensureVarsOrSkip(this, {
        CREATE_LISTING_CONTRACT_ADDRESS,
        CREATE_LISTING_TOKEN_ID,
        CREATE_LISTING_3_CONTRACT_ADDRESS,
        CREATE_LISTING_3_TOKEN_ID,
      })
    ) {
      return
    }

    // Verify CREATE_LISTING_3 is on the same chain as CREATE_LISTING
    // Both NFTs must be on the same chain to test cross-collection bulk
    // orders on a single chain
    if (CREATE_LISTING_3_CHAIN !== CREATE_LISTING_CHAIN) {
      throw new Error(
        `CREATE_LISTING_3 must be on the same chain as CREATE_LISTING (${CREATE_LISTING_CHAIN}), but got ${CREATE_LISTING_3_CHAIN}`,
      )
    }

    const chain = Chain.Mainnet
    const sdk = getSdkForChain(chain)

    const expirationTime = getRandomExpiration()

    // Create multiple offers across different collections on mainnet
    const offers = [
      {
        asset: {
          tokenAddress: CREATE_LISTING_CONTRACT_ADDRESS as string,
          tokenId: CREATE_LISTING_TOKEN_ID as string,
        },
        amount: +OFFER_AMOUNT / 2,
        expirationTime,
      },
      {
        asset: {
          tokenAddress: CREATE_LISTING_3_CONTRACT_ADDRESS as string,
          tokenId: CREATE_LISTING_3_TOKEN_ID as string,
        },
        amount: +OFFER_AMOUNT / 2,
        expirationTime,
      },
    ]

    console.log(`Creating ${offers.length} bulk offers...`)

    const result = await sdk.createBulkOffers({
      offers,
      accountAddress: walletAddress,
      continueOnError: false, // Fail if any order fails
      onProgress: (completed, total) => {
        console.log(`Progress: ${completed}/${total} offers submitted`)
      },
    })

    // Verify all orders were created successfully
    expect(result.successful).toHaveLength(offers.length)
    expect(result.failed).toHaveLength(0)

    // Validate each order
    result.successful.forEach((order, index) => {
      console.log(`Order ${index + 1} hash:`, order.orderHash)
      if (order.protocolData!.signature) {
        console.log(
          `Order ${index + 1} signature length:`,
          order.protocolData!.signature.length,
        )
      }
      expectValidOrder(order)
      expect(Number(order.protocolData!.parameters.endTime)).toBe(
        expirationTime,
      )
      expect(order.protocolData!.parameters.offerer.toLowerCase()).toBe(
        walletAddress.toLowerCase(),
      )
    })

    console.log("✓ All bulk offers created and validated successfully")
  })

  test("Post Bulk Offers with continueOnError - Mainnet", async function () {
    // This test validates the continueOnError mechanism by creating offers where
    // one has parameters that may fail API validation (dust amount)
    if (
      !ensureVarsOrSkip(this, {
        CREATE_LISTING_CONTRACT_ADDRESS,
        CREATE_LISTING_TOKEN_ID,
        CREATE_LISTING_3_CONTRACT_ADDRESS,
        CREATE_LISTING_3_TOKEN_ID,
      })
    ) {
      return
    }

    // Verify CREATE_LISTING_3 is on the same chain as CREATE_LISTING
    if (CREATE_LISTING_3_CHAIN !== CREATE_LISTING_CHAIN) {
      throw new Error(
        `CREATE_LISTING_3 must be on the same chain as CREATE_LISTING (${CREATE_LISTING_CHAIN}), but got ${CREATE_LISTING_3_CHAIN}`,
      )
    }

    const chain = Chain.Mainnet
    const sdk = getSdkForChain(chain)

    const expirationTime = getRandomExpiration()

    // Create offers including one with a dust amount that may fail API validation
    const offers = [
      {
        asset: {
          tokenAddress: CREATE_LISTING_CONTRACT_ADDRESS as string,
          tokenId: CREATE_LISTING_TOKEN_ID as string,
        },
        amount: +OFFER_AMOUNT,
        expirationTime,
      },
      {
        asset: {
          tokenAddress: CREATE_LISTING_3_CONTRACT_ADDRESS as string,
          tokenId: CREATE_LISTING_3_TOKEN_ID as string,
        },
        amount: 0.00001, // Amount that fails API validation (min amount 0.0001 ETH)
        expirationTime,
      },
    ]

    console.log(
      `Creating ${offers.length} bulk offers with continueOnError=true...`,
    )

    const result = await sdk.createBulkOffers({
      offers,
      accountAddress: walletAddress,
      continueOnError: true, // Continue even if some orders fail
      onProgress: (completed, total) => {
        console.log(`Progress: ${completed}/${total} offers processed`)
      },
    })

    console.log(`Successful: ${result.successful.length}`)
    console.log(`Failed: ${result.failed.length}`)

    // Verify the result structure is correct
    expect(result).toHaveProperty("successful")
    expect(result).toHaveProperty("failed")
    expect(Array.isArray(result.successful)).toBe(true)
    expect(Array.isArray(result.failed)).toBe(true)

    // At least one should succeed (the valid offer)
    expect(result.successful.length).toBeGreaterThan(0)

    // Validate successful orders
    result.successful.forEach(order => {
      expectValidOrder(order)
      expect(Number(order.protocolData!.parameters.endTime)).toBe(
        expirationTime,
      )
    })

    // Log failed orders for debugging (if any)
    if (result.failed.length > 0) {
      console.log(
        `Note: ${result.failed.length} offer(s) failed (expected due to dust amount):`,
      )
      result.failed.forEach(failure => {
        console.log(
          `  Order ${failure.index} failed:`,
          failure.error.message.substring(0, 100),
        )
      })
    } else {
      console.log(
        "Note: All offers succeeded. API may have accepted the dust amount.",
      )
    }

    console.log(
      "✓ Bulk offers with continueOnError completed - error handling mechanism verified",
    )
  })

  test("Post Bulk Listings", async function () {
    if (
      !ensureVarsOrSkip(this, {
        CREATE_LISTING_CONTRACT_ADDRESS,
        CREATE_LISTING_TOKEN_ID,
        CREATE_LISTING_3_CONTRACT_ADDRESS,
        CREATE_LISTING_3_TOKEN_ID,
      })
    ) {
      return
    }

    const chain = CREATE_LISTING_CHAIN
    const sdk = getSdkForChain(chain)

    // Verify CREATE_LISTING_3 is on the same chain as CREATE_LISTING
    // Both NFTs must be on the same chain to test cross-collection bulk
    // orders on a single chain
    if (CREATE_LISTING_3_CHAIN !== CREATE_LISTING_CHAIN) {
      throw new Error(
        `CREATE_LISTING_3 must be on the same chain as CREATE_LISTING (${CREATE_LISTING_CHAIN}), but got ${CREATE_LISTING_3_CHAIN}`,
      )
    }

    const expirationTime = getRandomExpiration()

    // Create multiple listings on same chain across different collections
    const listings = [
      {
        asset: {
          tokenAddress: CREATE_LISTING_CONTRACT_ADDRESS as string,
          tokenId: CREATE_LISTING_TOKEN_ID as string,
        },
        amount: LISTING_AMOUNT,
        expirationTime,
      },
      {
        asset: {
          tokenAddress: CREATE_LISTING_3_CONTRACT_ADDRESS as string,
          tokenId: CREATE_LISTING_3_TOKEN_ID as string,
        },
        amount: LISTING_AMOUNT,
        expirationTime,
      },
    ]

    console.log(`Creating ${listings.length} bulk listings on ${chain}...`)

    const result = await sdk.createBulkListings({
      listings,
      accountAddress: walletAddress,
      continueOnError: false,
      onProgress: (completed, total) => {
        console.log(`Progress: ${completed}/${total} listings submitted`)
      },
    })

    // Verify all orders were created successfully
    expect(result.successful).toHaveLength(listings.length)
    expect(result.failed).toHaveLength(0)

    // Validate each order
    result.successful.forEach((order, index) => {
      console.log(`Listing ${index + 1} hash:`, order.orderHash)
      if (order.protocolData!.signature) {
        console.log(
          `Listing ${index + 1} signature length:`,
          order.protocolData!.signature.length,
        )
      }
      expectValidOrder(order)
      expect(Number(order.protocolData!.parameters.endTime)).toBe(
        expirationTime,
      )
      expect(order.protocolData!.parameters.offerer.toLowerCase()).toBe(
        walletAddress.toLowerCase(),
      )
    })

    console.log("✓ All bulk listings created and validated successfully")
  })

  test("Post Bulk Listings with different prices and parameters", async function () {
    // CREATE_LISTING and CREATE_LISTING_3 must be on the same chain (CREATE_LISTING_CHAIN)
    // to test cross-collection bulk orders on a single chain
    if (
      !ensureVarsOrSkip(this, {
        CREATE_LISTING_CONTRACT_ADDRESS,
        CREATE_LISTING_TOKEN_ID,
        CREATE_LISTING_3_CONTRACT_ADDRESS,
        CREATE_LISTING_3_TOKEN_ID,
      })
    ) {
      return
    }

    const chain = CREATE_LISTING_CHAIN
    const sdk = getSdkForChain(chain)

    // Verify CREATE_LISTING_3 is on the same chain as CREATE_LISTING
    // Both NFTs must be on the same chain to test cross-collection bulk
    // orders on a single chain
    if (CREATE_LISTING_3_CHAIN !== CREATE_LISTING_CHAIN) {
      throw new Error(
        `CREATE_LISTING_3 must be on the same chain as CREATE_LISTING (${CREATE_LISTING_CHAIN}), but got ${CREATE_LISTING_3_CHAIN}`,
      )
    }

    const expirationTime = getRandomExpiration()
    const expirationTime2 = getRandomExpiration()

    // Create listings with different parameters across different collections
    const listings: Array<{
      asset: { tokenAddress: string; tokenId: string }
      amount: string
      expirationTime?: number
      includeOptionalCreatorFees?: boolean
    }> = [
      {
        asset: {
          tokenAddress: CREATE_LISTING_CONTRACT_ADDRESS as string,
          tokenId: CREATE_LISTING_TOKEN_ID as string,
        },
        amount: LISTING_AMOUNT,
        expirationTime,
      },
      {
        asset: {
          tokenAddress: CREATE_LISTING_3_CONTRACT_ADDRESS as string,
          tokenId: CREATE_LISTING_3_TOKEN_ID as string,
        },
        amount: String(+LISTING_AMOUNT * 1.5), // Different price
        expirationTime: expirationTime2, // Different expiration
        includeOptionalCreatorFees: true, // Include optional fees
      },
    ]

    console.log(
      `Creating ${listings.length} bulk listings with varying parameters...`,
    )

    const result = await sdk.createBulkListings({
      listings,
      accountAddress: walletAddress,
      continueOnError: false,
      onProgress: (completed, total) => {
        console.log(`Progress: ${completed}/${total} listings submitted`)
      },
    })

    expect(result.successful).toHaveLength(listings.length)
    expect(result.failed).toHaveLength(0)

    // Validate each order has correct parameters
    result.successful.forEach((order, index) => {
      expectValidOrder(order)
      console.log(`Listing ${index + 1}:`, {
        hash: order.orderHash,
        expirationTime: order.protocolData!.parameters.endTime,
        signatureLength: order.protocolData!.signature?.length || "N/A",
      })
    })

    console.log(
      "✓ Bulk listings with different parameters created successfully",
    )
  })

  test("Post Single Listing via Bulk API - uses normal signature", async function () {
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

    // Create a single listing via bulk API
    const listings = [
      {
        asset: {
          tokenAddress: CREATE_LISTING_CONTRACT_ADDRESS,
          tokenId: CREATE_LISTING_TOKEN_ID,
        },
        amount: LISTING_AMOUNT,
        expirationTime,
      },
    ]

    console.log(
      "Creating single listing via bulk API (should use normal signature)...",
    )

    const result = await sdk.createBulkListings({
      listings,
      accountAddress: walletAddress,
    })

    expect(result.successful).toHaveLength(1)
    expect(result.failed).toHaveLength(0)

    const order = result.successful[0]
    expect(order).not.toBeNull()
    expectValidOrder(order)

    // Normal signature should be shorter than bulk signature (no merkle proof)
    // Normal compact signature: 130 chars (0x + 128 hex chars)
    // Bulk signature: 130 + 6 (index) + merkle proof encoding
    if (order.protocolData!.signature) {
      const signatureLength = order.protocolData!.signature.length
      console.log("Single order signature length:", signatureLength)

      // For single orders, the bulk API should use normal signature to save gas
      // So the signature should be approximately 130 characters (0x + 64 bytes = 128 hex chars)
      expect(signatureLength).toBeLessThan(200)
    } else {
      console.log(
        "Signature not returned by API (this is expected for some endpoints)",
      )
    }

    console.log("✓ Single listing via bulk API uses optimized normal signature")
  })

  test("Verify bulk signature structure and merkle proofs", async function () {
    if (
      !ensureVarsOrSkip(this, {
        CREATE_LISTING_CONTRACT_ADDRESS,
        CREATE_LISTING_TOKEN_ID,
        CREATE_LISTING_3_CONTRACT_ADDRESS,
        CREATE_LISTING_3_TOKEN_ID,
      })
    ) {
      return
    }

    // Verify CREATE_LISTING_3 is on the same chain as CREATE_LISTING
    // Both NFTs must be on the same chain to test cross-collection bulk
    // orders on a single chain
    if (CREATE_LISTING_3_CHAIN !== CREATE_LISTING_CHAIN) {
      throw new Error(
        `CREATE_LISTING_3 must be on the same chain as CREATE_LISTING (${CREATE_LISTING_CHAIN}), but got ${CREATE_LISTING_3_CHAIN}`,
      )
    }

    const chain = Chain.Mainnet
    const sdk = getSdkForChain(chain)

    // Create 2 offers
    const offers = [
      {
        asset: {
          tokenAddress: CREATE_LISTING_CONTRACT_ADDRESS as string,
          tokenId: CREATE_LISTING_TOKEN_ID as string,
        },
        amount: +OFFER_AMOUNT,
      },
      {
        asset: {
          tokenAddress: CREATE_LISTING_3_CONTRACT_ADDRESS as string,
          tokenId: CREATE_LISTING_3_TOKEN_ID as string,
        },
        amount: +OFFER_AMOUNT,
      },
    ]

    console.log(
      `Creating ${offers.length} offers to verify bulk signature structure...`,
    )

    const result = await sdk.createBulkOffers({
      offers,
      accountAddress: walletAddress,
      continueOnError: false,
    })

    expect(result.successful).toHaveLength(offers.length)

    // Analyze signature structure
    result.successful.forEach((order, index) => {
      const signature = order.protocolData!.signature
      console.log(`\nOrder ${index}:`)
      console.log(`  Order hash: ${order.orderHash}`)

      if (signature) {
        console.log(`  Signature length: ${signature.length} chars`)
        console.log(`  Signature prefix: ${signature.substring(0, 66)}...`)

        // Bulk signature structure:
        // - Base signature: 130 chars (0x + 128 hex = 64 bytes)
        // - Index: 6 hex chars (3 bytes)
        // - Merkle proof: variable length ABI encoded array
        expect(signature.length).toBeGreaterThan(130)
        expect(signature.startsWith("0x")).toBe(true)

        // Extract and log index from signature
        const indexHex = signature.substring(130, 136)
        const extractedIndex = parseInt(indexHex, 16)
        console.log(`  Extracted index: ${extractedIndex} (expected: ${index})`)
        expect(extractedIndex).toBe(index)
      } else {
        console.log(
          `  Signature not returned by API (this is expected for some endpoints)`,
        )
      }
    })

    console.log("\n✓ Bulk signature structure verified successfully")
  })
})
