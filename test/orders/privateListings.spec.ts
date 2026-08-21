import { ItemType } from "@opensea/seaport-js/lib/constants"
import type {
  CreateInputItem,
  OrderWithCounter,
} from "@opensea/seaport-js/lib/types"
import { ZeroAddress } from "ethers"
import { describe, expect, test } from "vitest"
import {
  computePrivateListingValue,
  constructPrivateListingCounterOrder,
  getPrivateListingConsiderations,
  getPrivateListingFulfillments,
} from "../../src/orders/privateListings"

const SELLER_ADDRESS = "0x1111111111111111111111111111111111111111"
const TAKER_ADDRESS = "0x2222222222222222222222222222222222222222"
const FEE_RECIPIENT = "0x3333333333333333333333333333333333333333"
const NFT_CONTRACT = "0x4444444444444444444444444444444444444444"
const WETH_ADDRESS = "0x5555555555555555555555555555555555555555"
const TOKEN_A = "0x6666666666666666666666666666666666666666"
const TOKEN_B = "0x7777777777777777777777777777777777777777"
// The same address in checksummed and lowercase form.
const TOKEN_A_CHECKSUMMED = "0xAbCdEf0000000000000000000000000000000000"
const TOKEN_A_LOWERCASE = "0xabcdef0000000000000000000000000000000000"

const createMockOrder = (
  consideration: OrderWithCounter["parameters"]["consideration"],
): OrderWithCounter => ({
  parameters: {
    offerer: SELLER_ADDRESS,
    zone: ZeroAddress,
    offer: [
      {
        itemType: ItemType.ERC721,
        token: NFT_CONTRACT,
        identifierOrCriteria: "1",
        startAmount: "1",
        endAmount: "1",
      },
    ],
    consideration,
    orderType: 0,
    startTime: "0",
    endTime: "0",
    zoneHash:
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    salt: "0",
    conduitKey:
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    totalOriginalConsiderationItems: consideration.length,
    counter: "0",
  },
  signature: "0x",
})

describe("Orders: privateListings", () => {
  describe("computePrivateListingValue", () => {
    test("should return 0 for zero-payment private listings", () => {
      const order = createMockOrder([
        // Only NFT going to taker, no payment items
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifierOrCriteria: "1",
          startAmount: "1",
          endAmount: "1",
          recipient: TAKER_ADDRESS,
        },
      ])

      const value = computePrivateListingValue(order, TAKER_ADDRESS)
      expect(value).toBe(0n)
    })

    test("should sum native currency items not going to taker", () => {
      const order = createMockOrder([
        // NFT to taker
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifierOrCriteria: "1",
          startAmount: "1",
          endAmount: "1",
          recipient: TAKER_ADDRESS,
        },
        // Payment to seller (1 ETH)
        {
          itemType: ItemType.NATIVE,
          token: ZeroAddress,
          identifierOrCriteria: "0",
          startAmount: "1000000000000000000",
          endAmount: "1000000000000000000",
          recipient: SELLER_ADDRESS,
        },
        // Fee to fee recipient (0.1 ETH)
        {
          itemType: ItemType.NATIVE,
          token: ZeroAddress,
          identifierOrCriteria: "0",
          startAmount: "100000000000000000",
          endAmount: "100000000000000000",
          recipient: FEE_RECIPIENT,
        },
      ])

      const value = computePrivateListingValue(order, TAKER_ADDRESS)
      // 1 ETH + 0.1 ETH = 1.1 ETH
      expect(value).toBe(1100000000000000000n)
    })

    test("should ignore ERC20 currency items", () => {
      const order = createMockOrder([
        // NFT to taker
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifierOrCriteria: "1",
          startAmount: "1",
          endAmount: "1",
          recipient: TAKER_ADDRESS,
        },
        // WETH payment to seller (should be ignored)
        {
          itemType: ItemType.ERC20,
          token: WETH_ADDRESS,
          identifierOrCriteria: "0",
          startAmount: "1000000000000000000",
          endAmount: "1000000000000000000",
          recipient: SELLER_ADDRESS,
        },
      ])

      const value = computePrivateListingValue(order, TAKER_ADDRESS)
      expect(value).toBe(0n)
    })

    test("should handle mixed native and ERC20 payments", () => {
      const order = createMockOrder([
        // NFT to taker
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifierOrCriteria: "1",
          startAmount: "1",
          endAmount: "1",
          recipient: TAKER_ADDRESS,
        },
        // Native payment to seller (0.5 ETH)
        {
          itemType: ItemType.NATIVE,
          token: ZeroAddress,
          identifierOrCriteria: "0",
          startAmount: "500000000000000000",
          endAmount: "500000000000000000",
          recipient: SELLER_ADDRESS,
        },
        // WETH payment (should be ignored)
        {
          itemType: ItemType.ERC20,
          token: WETH_ADDRESS,
          identifierOrCriteria: "0",
          startAmount: "500000000000000000",
          endAmount: "500000000000000000",
          recipient: SELLER_ADDRESS,
        },
      ])

      const value = computePrivateListingValue(order, TAKER_ADDRESS)
      // Only native ETH counts
      expect(value).toBe(500000000000000000n)
    })
  })

  describe("constructPrivateListingCounterOrder", () => {
    test("should return empty offer for zero-payment private listings", () => {
      const order = createMockOrder([
        // Only NFT going to taker
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifierOrCriteria: "1",
          startAmount: "1",
          endAmount: "1",
          recipient: TAKER_ADDRESS,
        },
      ])

      const counterOrder = constructPrivateListingCounterOrder(
        order,
        TAKER_ADDRESS,
      )

      expect(counterOrder.parameters.offer).toEqual([])
      expect(counterOrder.parameters.consideration).toEqual([])
      expect(counterOrder.parameters.offerer).toBe(TAKER_ADDRESS)
    })

    test("should aggregate payment items into single offer", () => {
      const order = createMockOrder([
        // NFT to taker
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifierOrCriteria: "1",
          startAmount: "1",
          endAmount: "1",
          recipient: TAKER_ADDRESS,
        },
        // Payment to seller
        {
          itemType: ItemType.NATIVE,
          token: ZeroAddress,
          identifierOrCriteria: "0",
          startAmount: "1000000000000000000",
          endAmount: "1000000000000000000",
          recipient: SELLER_ADDRESS,
        },
        // Fee to fee recipient
        {
          itemType: ItemType.NATIVE,
          token: ZeroAddress,
          identifierOrCriteria: "0",
          startAmount: "100000000000000000",
          endAmount: "100000000000000000",
          recipient: FEE_RECIPIENT,
        },
      ])

      const counterOrder = constructPrivateListingCounterOrder(
        order,
        TAKER_ADDRESS,
      )

      expect(counterOrder.parameters.offer).toHaveLength(1)
      expect(counterOrder.parameters.offer[0].itemType).toBe(ItemType.NATIVE)
      expect(counterOrder.parameters.offer[0].startAmount).toBe(
        "1100000000000000000",
      )
      expect(counterOrder.parameters.offer[0].endAmount).toBe(
        "1100000000000000000",
      )
    })

    test("should throw if payment items contain non-currency items", () => {
      const order = createMockOrder([
        // NFT to taker
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifierOrCriteria: "1",
          startAmount: "1",
          endAmount: "1",
          recipient: TAKER_ADDRESS,
        },
        // Another NFT to seller (invalid)
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifierOrCriteria: "2",
          startAmount: "1",
          endAmount: "1",
          recipient: SELLER_ADDRESS,
        },
      ])

      expect(() =>
        constructPrivateListingCounterOrder(order, TAKER_ADDRESS),
      ).toThrow("did not contain only currency items")
    })

    test("should throw if payment items have mixed currency types", () => {
      const order = createMockOrder([
        // NFT to taker
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifierOrCriteria: "1",
          startAmount: "1",
          endAmount: "1",
          recipient: TAKER_ADDRESS,
        },
        // ETH to seller
        {
          itemType: ItemType.NATIVE,
          token: ZeroAddress,
          identifierOrCriteria: "0",
          startAmount: "500000000000000000",
          endAmount: "500000000000000000",
          recipient: SELLER_ADDRESS,
        },
        // WETH to fee recipient (different currency type)
        {
          itemType: ItemType.ERC20,
          token: WETH_ADDRESS,
          identifierOrCriteria: "0",
          startAmount: "100000000000000000",
          endAmount: "100000000000000000",
          recipient: FEE_RECIPIENT,
        },
      ])

      expect(() =>
        constructPrivateListingCounterOrder(order, TAKER_ADDRESS),
      ).toThrow("Not all currency items were the same")
    })

    test("should throw if ERC20 payment items reference different tokens", () => {
      // Without the token check these two are summed into a single 120 TOKEN_A
      // offer item, and Seaport rejects the match onchain instead.
      const order = createMockOrder([
        // NFT to taker
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifierOrCriteria: "1",
          startAmount: "1",
          endAmount: "1",
          recipient: TAKER_ADDRESS,
        },
        // TOKEN_A payment to seller
        {
          itemType: ItemType.ERC20,
          token: TOKEN_A,
          identifierOrCriteria: "0",
          startAmount: "100",
          endAmount: "100",
          recipient: SELLER_ADDRESS,
        },
        // TOKEN_B payment to fee recipient
        {
          itemType: ItemType.ERC20,
          token: TOKEN_B,
          identifierOrCriteria: "0",
          startAmount: "20",
          endAmount: "20",
          recipient: FEE_RECIPIENT,
        },
      ])

      expect(() =>
        constructPrivateListingCounterOrder(order, TAKER_ADDRESS),
      ).toThrow("payment items must all use the same token")
    })

    test("should not treat differently-cased identical ERC20 tokens as different currencies", () => {
      const order = createMockOrder([
        // NFT to taker
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifierOrCriteria: "1",
          startAmount: "1",
          endAmount: "1",
          recipient: TAKER_ADDRESS,
        },
        // TOKEN_A checksummed, payment to seller
        {
          itemType: ItemType.ERC20,
          token: TOKEN_A_CHECKSUMMED,
          identifierOrCriteria: "0",
          startAmount: "100",
          endAmount: "100",
          recipient: SELLER_ADDRESS,
        },
        // Same token lowercased, payment to fee recipient
        {
          itemType: ItemType.ERC20,
          token: TOKEN_A_LOWERCASE,
          identifierOrCriteria: "0",
          startAmount: "20",
          endAmount: "20",
          recipient: FEE_RECIPIENT,
        },
      ])

      const counterOrder = constructPrivateListingCounterOrder(
        order,
        TAKER_ADDRESS,
      )

      expect(counterOrder.parameters.offer).toHaveLength(1)
      expect(counterOrder.parameters.offer[0].itemType).toBe(ItemType.ERC20)
      expect(counterOrder.parameters.offer[0].token).toBe(TOKEN_A_CHECKSUMMED)
      expect(counterOrder.parameters.offer[0].startAmount).toBe("120")
      expect(counterOrder.parameters.offer[0].endAmount).toBe("120")
    })

    test("should still aggregate multiple payment items in the same token", () => {
      const order = createMockOrder([
        // NFT to taker
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifierOrCriteria: "1",
          startAmount: "1",
          endAmount: "1",
          recipient: TAKER_ADDRESS,
        },
        // WETH to seller
        {
          itemType: ItemType.ERC20,
          token: WETH_ADDRESS,
          identifierOrCriteria: "0",
          startAmount: "900000000000000000",
          endAmount: "900000000000000000",
          recipient: SELLER_ADDRESS,
        },
        // WETH fee
        {
          itemType: ItemType.ERC20,
          token: WETH_ADDRESS,
          identifierOrCriteria: "0",
          startAmount: "100000000000000000",
          endAmount: "100000000000000000",
          recipient: FEE_RECIPIENT,
        },
      ])

      const counterOrder = constructPrivateListingCounterOrder(
        order,
        TAKER_ADDRESS,
      )

      expect(counterOrder.parameters.offer).toHaveLength(1)
      expect(counterOrder.parameters.offer[0].token).toBe(WETH_ADDRESS)
      expect(counterOrder.parameters.offer[0].startAmount).toBe(
        "1000000000000000000",
      )
    })
  })

  describe("getPrivateListingConsiderations", () => {
    test("stamps the private-sale recipient onto every offer item, preserving order and fields", () => {
      const offer: CreateInputItem[] = [
        { itemType: ItemType.ERC721, token: NFT_CONTRACT, identifier: "1" },
        {
          itemType: ItemType.ERC1155,
          token: NFT_CONTRACT,
          identifier: "2",
          amount: "5",
        },
      ]

      expect(getPrivateListingConsiderations(offer, TAKER_ADDRESS)).toEqual([
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifier: "1",
          recipient: TAKER_ADDRESS,
        },
        {
          itemType: ItemType.ERC1155,
          token: NFT_CONTRACT,
          identifier: "2",
          amount: "5",
          recipient: TAKER_ADDRESS,
        },
      ])
    })

    test("returns an empty array for an empty offer", () => {
      expect(getPrivateListingConsiderations([], TAKER_ADDRESS)).toEqual([])
    })
  })

  describe("getPrivateListingFulfillments", () => {
    test("matches each offered NFT to its consideration counterpart and routes every currency item to the counter order", () => {
      const order = createMockOrder([
        // NFT going to the private taker -- matches the offered NFT (offer item 0)
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifierOrCriteria: "1",
          startAmount: "1",
          endAmount: "1",
          recipient: TAKER_ADDRESS,
        },
        // native payment to seller
        {
          itemType: ItemType.NATIVE,
          token: ZeroAddress,
          identifierOrCriteria: "0",
          startAmount: "1000000000000000000",
          endAmount: "1000000000000000000",
          recipient: SELLER_ADDRESS,
        },
        // native fee
        {
          itemType: ItemType.NATIVE,
          token: ZeroAddress,
          identifierOrCriteria: "0",
          startAmount: "100000000000000000",
          endAmount: "100000000000000000",
          recipient: FEE_RECIPIENT,
        },
      ])

      expect(getPrivateListingFulfillments(order)).toEqual([
        // NFT: offer item 0 of the listing (order 0) <-> its consideration item 0
        {
          offerComponents: [{ orderIndex: 0, itemIndex: 0 }],
          considerationComponents: [{ orderIndex: 0, itemIndex: 0 }],
        },
        // payment: counter order (1) offer item 0 <-> consideration item 1
        {
          offerComponents: [{ orderIndex: 1, itemIndex: 0 }],
          considerationComponents: [{ orderIndex: 0, itemIndex: 1 }],
        },
        // fee: counter order (1) offer item 0 <-> consideration item 2
        {
          offerComponents: [{ orderIndex: 1, itemIndex: 0 }],
          considerationComponents: [{ orderIndex: 0, itemIndex: 2 }],
        },
      ])
    })

    test("skips non-currency consideration items, leaving only the NFT fulfillment", () => {
      const order = createMockOrder([
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifierOrCriteria: "1",
          startAmount: "1",
          endAmount: "1",
          recipient: TAKER_ADDRESS,
        },
      ])

      expect(getPrivateListingFulfillments(order)).toEqual([
        {
          offerComponents: [{ orderIndex: 0, itemIndex: 0 }],
          considerationComponents: [{ orderIndex: 0, itemIndex: 0 }],
        },
      ])
    })

    test("throws when an offered NFT has no matching consideration item", () => {
      // The consideration NFT carries a different identifier than the offered NFT (id 1).
      const order = createMockOrder([
        {
          itemType: ItemType.ERC721,
          token: NFT_CONTRACT,
          identifierOrCriteria: "999",
          startAmount: "1",
          endAmount: "1",
          recipient: TAKER_ADDRESS,
        },
      ])

      expect(() => getPrivateListingFulfillments(order)).toThrow(
        "Could not find matching offer item in the consideration",
      )
    })
  })
})
