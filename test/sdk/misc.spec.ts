import { ethers } from "ethers"
import { describe, expect, test } from "vitest"
import {
  SHARED_STOREFRONT_ADDRESSES,
  SHARED_STOREFRONT_LAZY_MINT_ADAPTER_CROSS_CHAIN_ADDRESS,
} from "../../src/constants"
import {
  decodeTokenIds,
  hasErrorCode,
  remapSharedStorefrontAddress,
} from "../../src/utils/utils"
import { BAYC_CONTRACT_ADDRESS } from "../utils/constants"
import { sdk } from "../utils/sdk"

describe("SDK: misc", () => {
  test("Instance has public methods", () => {
    expect(typeof sdk.wrapEth).toBe("function")
  })

  test("Instance exposes API methods", () => {
    expect(typeof sdk.api.getOrderByHash).toBe("function")
    expect(typeof sdk.api.postListing).toBe("function")
    expect(typeof sdk.api.postOffer).toBe("function")
    expect(typeof sdk.api.sweepCollection).toBe("function")
    expect(typeof sdk.api.getOffersByNFT).toBe("function")
    expect(typeof sdk.api.executeSwap).toBe("function")
    expect(typeof sdk.api.getTransactionReceipt).toBe("function")
  })

  test("Checks that a non-shared storefront address is returned unchanged", async () => {
    const address = BAYC_CONTRACT_ADDRESS
    expect(remapSharedStorefrontAddress(address)).toBe(address)
  })

  test("Checks that shared storefront addresses are remapped to checksummed lazy mint adapter address", async () => {
    for (const address of SHARED_STOREFRONT_ADDRESSES) {
      expect(remapSharedStorefrontAddress(address)).toBe(
        ethers.getAddress(
          SHARED_STOREFRONT_LAZY_MINT_ADAPTER_CROSS_CHAIN_ADDRESS,
        ),
      )
    }
  })

  test("Should throw an error when using methods that need a provider or wallet with the accountAddress", async () => {
    const wallet = ethers.Wallet.createRandom()
    const accountAddress = wallet.address
    const expectedErrorMessage = `Specified accountAddress is not available through wallet or provider: ${accountAddress}`

    try {
      await sdk.wrapEth({ amountInEth: "0.1", accountAddress })
      throw new Error("should have thrown")
    } catch (e: any) {
      expect(e.message).toContain(expectedErrorMessage)
    }

    try {
      await sdk.unwrapWeth({ amountInEth: "0.1", accountAddress })
      throw new Error("should have thrown")
    } catch (e: any) {
      expect(e.message).toContain(expectedErrorMessage)
    }

    const asset = {} as any

    try {
      await sdk.createOffer({ asset, amount: 1, accountAddress })
      throw new Error("should have thrown")
    } catch (e: any) {
      expect(e.message).toContain(expectedErrorMessage)
    }

    try {
      await sdk.createListing({ asset, amount: 1, accountAddress })
      throw new Error("should have thrown")
    } catch (e: any) {
      expect(e.message).toContain(expectedErrorMessage)
    }

    try {
      await sdk.createCollectionOffer({
        collectionSlug: "",
        amount: 1,
        quantity: 1,
        accountAddress,
      })
      throw new Error("should have thrown")
    } catch (e: any) {
      expect(e.message).toContain(expectedErrorMessage)
    }

    const order = {} as any

    try {
      await sdk.fulfillOrder({ order, accountAddress })
      throw new Error("should have thrown")
    } catch (e: any) {
      expect(e.message).toContain(expectedErrorMessage)
    }

    try {
      await sdk.cancelOrder({ order, accountAddress })
      throw new Error("should have thrown")
    } catch (e: any) {
      expect(e.message).toContain(expectedErrorMessage)
    }

    try {
      await sdk.approveOrder({
        ...order,
        maker: { address: accountAddress },
      })
      throw new Error("should have thrown")
    } catch (e: any) {
      expect(e.message).toContain(expectedErrorMessage)
    }
  })

  describe("decodeTokenIds", () => {
    it('should return ["*"] when given "*" as input', () => {
      expect(decodeTokenIds("*")).toEqual(["*"])
    })

    it("should return [] when given empty string as input", () => {
      expect(decodeTokenIds("")).toEqual([])
    })

    it("should correctly decode a single number", () => {
      expect(decodeTokenIds("123")).toEqual(["123"])
    })

    it("should correctly decode multiple comma-separated numbers", () => {
      expect(decodeTokenIds("1,2,3,4")).toEqual(["1", "2", "3", "4"])
    })

    it("should correctly decode a single number", () => {
      expect(decodeTokenIds("10:10")).toEqual(["10"])
    })

    it("should correctly decode a range of numbers", () => {
      expect(decodeTokenIds("5:8")).toEqual(["5", "6", "7", "8"])
    })

    it("should correctly decode multiple ranges of numbers", () => {
      expect(decodeTokenIds("1:3,7:9")).toEqual(["1", "2", "3", "7", "8", "9"])
    })

    it("should correctly decode a mix of single numbers and ranges", () => {
      expect(decodeTokenIds("1,3:5,8")).toEqual(["1", "3", "4", "5", "8"])
    })

    it("should throw an error for invalid input format", () => {
      expect(() => decodeTokenIds("1:3:5,8")).toThrow(
        "Invalid input format. Expected a valid comma-separated list of numbers and ranges.",
      )
      expect(() => decodeTokenIds("1;3:5,8")).toThrow(
        "Invalid input format. Expected a valid comma-separated list of numbers and ranges.",
      )
    })

    it("should throw an error for invalid range format", () => {
      expect(() => decodeTokenIds("5:2")).toThrow(
        "Invalid range. End value: 2 must be greater than or equal to the start value: 5.",
      )
    })

    it("should handle very large input numbers", () => {
      const encoded = "10000000000000000000000000:10000000000000000000000002"
      expect(decodeTokenIds(encoded)).toEqual([
        "10000000000000000000000000",
        "10000000000000000000000001",
        "10000000000000000000000002",
      ])
    })
  })

  describe("hasErrorCode", () => {
    it("should return true for an error carrying a code", () => {
      expect(hasErrorCode({ code: "CALL_EXCEPTION" })).toBe(true)
      expect(hasErrorCode(new Error("boom"))).toBe(false)
    })

    it("should return false for nullish input instead of throwing", () => {
      // `null` and `undefined` are legal `unknown` values and both reach a
      // `catch` binding (`throw null`, `Promise.reject()`). The guard read
      // `.code` straight off the argument, so it threw a TypeError and hid the
      // error its caller was about to rethrow.
      expect(() => hasErrorCode(null)).not.toThrow()
      expect(hasErrorCode(null)).toBe(false)
      expect(hasErrorCode(undefined)).toBe(false)
    })
  })
})
