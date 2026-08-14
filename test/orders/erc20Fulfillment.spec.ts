import { ZeroAddress, ZeroHash } from "ethers"
import { describe, expect, test } from "vitest"
import {
  getErc20Payment,
  getFulfillerConduitKey,
  isZeroConduitKey,
  toBigInt,
} from "../../src/orders/erc20Fulfillment"

const USDG = "0x1234567890123456789012345678901234567890"
const OTHER_ERC20 = "0x9876543210987654321098765432109876543210"
const NFT = "0x88d381e3c65221abea498c69e990d1deb7bd3863"
const SELLER = "0xfba662e1a8e91a350702cf3b87d0c2d2fb4ba57f"
const FEE_RECIPIENT = "0x0000a26b00c1f0df003000390027140000faa719"
const CONDUIT_KEY =
  "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000"

/** ItemType 1 (ERC20) consideration item. */
function erc20Item(token: string, amount: string, recipient = SELLER) {
  return {
    itemType: 1,
    token,
    identifierOrCriteria: "0",
    startAmount: amount,
    endAmount: amount,
    recipient,
  }
}

/** ItemType 0 (native) consideration item. */
function nativeItem(amount: string, recipient = SELLER) {
  return {
    itemType: 0,
    token: ZeroAddress,
    identifierOrCriteria: "0",
    startAmount: amount,
    endAmount: amount,
    recipient,
  }
}

/** ItemType 2 (ERC721) consideration item, as an offer fulfillment carries. */
function erc721Item(tokenId: string, recipient = SELLER) {
  return {
    itemType: 2,
    token: NFT,
    identifierOrCriteria: tokenId,
    startAmount: "1",
    endAmount: "1",
    recipient,
  }
}

function advancedOrderInput(
  consideration: unknown[],
  {
    numerator = 1,
    denominator = 1,
  }: { numerator?: unknown; denominator?: unknown } = {},
) {
  return {
    advancedOrder: {
      parameters: { offerer: SELLER, consideration },
      numerator,
      denominator,
      signature: "0x",
      extraData: "0x",
    },
    criteriaResolvers: [],
    fulfillerConduitKey: CONDUIT_KEY,
    recipient: SELLER,
  }
}

/** basicOrderType 8 is route 2, ERC20_TO_ERC721: the fulfiller pays with ERC20. */
function basicOrderInput(overrides: Record<string, unknown> = {}) {
  return {
    basicOrderParameters: {
      considerationToken: USDG,
      considerationIdentifier: "0",
      considerationAmount: "360000000",
      offerer: SELLER,
      offerToken: NFT,
      offerIdentifier: "1",
      offerAmount: "1",
      basicOrderType: 8,
      offererConduitKey: CONDUIT_KEY,
      fulfillerConduitKey: CONDUIT_KEY,
      totalOriginalAdditionalRecipients: "1",
      additionalRecipients: [{ amount: "9000000", recipient: FEE_RECIPIENT }],
      signature: "0x",
      ...overrides,
    },
  }
}

describe("getErc20Payment: advanced and standard orders", () => {
  test("sums every ERC20 consideration item, seller proceeds plus fees", () => {
    const payment = getErc20Payment(
      advancedOrderInput([
        erc20Item(USDG, "351000000"),
        erc20Item(USDG, "9000000", FEE_RECIPIENT),
      ]),
    )
    expect(payment).toEqual({ token: USDG, amount: 360000000n })
  })

  test("returns null for a partial-fill advanced order, not the full-order sum", () => {
    // A 1/4 fill of seller 80 + fee 20 really costs 25; the full 100 is not a
    // confident preflight amount, so the helper must fail open.
    expect(
      getErc20Payment(
        advancedOrderInput(
          [erc20Item(USDG, "80"), erc20Item(USDG, "20", FEE_RECIPIENT)],
          { numerator: 1, denominator: 4 },
        ),
      ),
    ).toBe(null)
  })

  test("treats an equal positive fraction as a full fill (e.g. 2/2)", () => {
    expect(
      getErc20Payment(
        advancedOrderInput(
          [erc20Item(USDG, "80"), erc20Item(USDG, "20", FEE_RECIPIENT)],
          { numerator: 2, denominator: 2 },
        ),
      ),
    ).toEqual({ token: USDG, amount: 100n })
  })

  test("returns null for a missing or unparsable fraction, and for zero", () => {
    const items = [erc20Item(USDG, "80"), erc20Item(USDG, "20", FEE_RECIPIENT)]

    const missingNumerator = advancedOrderInput(items)
    delete (missingNumerator.advancedOrder as Record<string, unknown>).numerator
    expect(getErc20Payment(missingNumerator)).toBe(null)

    const missingDenominator = advancedOrderInput(items)
    delete (missingDenominator.advancedOrder as Record<string, unknown>)
      .denominator
    expect(getErc20Payment(missingDenominator)).toBe(null)

    expect(
      getErc20Payment(advancedOrderInput(items, { numerator: "nope" })),
    ).toBe(null)
    expect(getErc20Payment(advancedOrderInput(items, { numerator: 0 }))).toBe(
      null,
    )
    expect(getErc20Payment(advancedOrderInput(items, { denominator: 0 }))).toBe(
      null,
    )
  })

  test("reads the same consideration from a fulfillOrder input shape", () => {
    const payment = getErc20Payment({
      order: {
        parameters: { offerer: SELLER, consideration: [erc20Item(USDG, "89")] },
        signature: "0x",
      },
      fulfillerConduitKey: CONDUIT_KEY,
      recipient: SELLER,
    })
    expect(payment).toEqual({ token: USDG, amount: 89n })
  })

  test("returns null for a native-priced listing", () => {
    expect(getErc20Payment(advancedOrderInput([nativeItem("99000000")]))).toBe(
      null,
    )
  })

  test("returns null when native and ERC20 items are mixed", () => {
    expect(
      getErc20Payment(
        advancedOrderInput([nativeItem("1"), erc20Item(USDG, "1")]),
      ),
    ).toBe(null)
  })

  test("returns null for an offer fulfillment, where an NFT is the consideration", () => {
    // The fulfiller hands over the NFT; the ERC20 fee comes out of the offer.
    expect(
      getErc20Payment(
        advancedOrderInput([
          erc721Item("1"),
          erc20Item(USDG, "9000000", FEE_RECIPIENT),
        ]),
      ),
    ).toBe(null)
  })

  test("returns null when the consideration mixes two ERC20 tokens", () => {
    expect(
      getErc20Payment(
        advancedOrderInput([erc20Item(USDG, "1"), erc20Item(OTHER_ERC20, "1")]),
      ),
    ).toBe(null)
  })

  test("matches token addresses case-insensitively", () => {
    const payment = getErc20Payment(
      advancedOrderInput([
        erc20Item(USDG, "1"),
        erc20Item(USDG.toUpperCase().replace("0X", "0x"), "2"),
      ]),
    )
    expect(payment).toEqual({ token: USDG, amount: 3n })
  })

  test("returns null for an unreadable amount rather than guessing", () => {
    expect(
      getErc20Payment(advancedOrderInput([erc20Item(USDG, "not-a-number")])),
    ).toBe(null)
  })

  test("returns null for an empty consideration, and for unknown shapes", () => {
    expect(getErc20Payment(advancedOrderInput([]))).toBe(null)
    expect(getErc20Payment({ orders: [] })).toBe(null)
    expect(getErc20Payment(undefined)).toBe(null)
    expect(getErc20Payment("nonsense")).toBe(null)
  })
})

describe("getErc20Payment: basic orders", () => {
  test("sums considerationAmount and additionalRecipients for an ERC20 route", () => {
    expect(getErc20Payment(basicOrderInput())).toEqual({
      token: USDG,
      amount: 369000000n,
    })
  })

  test.each([
    ["ETH_TO_ERC721", 0],
    ["ETH_TO_ERC721 restricted", 3],
    ["ETH_TO_ERC1155", 4],
    ["ETH_TO_ERC1155 restricted", 7],
  ])("returns null for native route %s (basicOrderType %i)", (_name, type) => {
    expect(
      getErc20Payment(
        basicOrderInput({
          basicOrderType: type,
          considerationToken: ZeroAddress,
        }),
      ),
    ).toBe(null)
  })

  test.each([
    ["ERC20_TO_ERC721", 8],
    ["ERC20_TO_ERC721 restricted", 11],
    ["ERC20_TO_ERC1155", 12],
    ["ERC20_TO_ERC1155 restricted", 15],
  ])("reads ERC20 route %s (basicOrderType %i)", (_name, type) => {
    expect(getErc20Payment(basicOrderInput({ basicOrderType: type }))).toEqual({
      token: USDG,
      amount: 369000000n,
    })
  })

  test.each([
    ["ERC721_TO_ERC20", 16],
    ["ERC1155_TO_ERC20", 23],
  ])("returns null for offer route %s (basicOrderType %i), where the offerer pays", (_name, type) => {
    // considerationToken is the NFT here, so treating it as payment would be wrong.
    expect(
      getErc20Payment(
        basicOrderInput({ basicOrderType: type, considerationToken: NFT }),
      ),
    ).toBe(null)
  })

  test("accepts bigint amounts from an adapter that returns them decoded", () => {
    expect(
      getErc20Payment(
        basicOrderInput({
          basicOrderType: 8n,
          considerationAmount: 360000000n,
          additionalRecipients: [
            { amount: 9000000n, recipient: FEE_RECIPIENT },
          ],
        }),
      ),
    ).toEqual({ token: USDG, amount: 369000000n })
  })

  test("treats a missing additionalRecipients list as no fees", () => {
    expect(
      getErc20Payment(basicOrderInput({ additionalRecipients: undefined })),
    ).toEqual({ token: USDG, amount: 360000000n })
  })

  test("returns null when basicOrderType is missing or unreadable", () => {
    expect(
      getErc20Payment(basicOrderInput({ basicOrderType: undefined })),
    ).toBe(null)
    expect(getErc20Payment(basicOrderInput({ basicOrderType: "route" }))).toBe(
      null,
    )
  })
})

describe("getFulfillerConduitKey", () => {
  test("reads the top-level key from advanced and standard order inputs", () => {
    expect(getFulfillerConduitKey(advancedOrderInput([]))).toBe(CONDUIT_KEY)
  })

  test("reads the key nested in basicOrderParameters", () => {
    expect(getFulfillerConduitKey(basicOrderInput())).toBe(CONDUIT_KEY)
  })

  test("returns null when no key is present", () => {
    expect(getFulfillerConduitKey({ orders: [] })).toBe(null)
    expect(getFulfillerConduitKey(undefined)).toBe(null)
  })
})

describe("isZeroConduitKey", () => {
  test("treats bytes32(0) and a missing key as no conduit", () => {
    expect(isZeroConduitKey(ZeroHash)).toBe(true)
    expect(isZeroConduitKey(ZeroHash.toUpperCase().replace("0X", "0x"))).toBe(
      true,
    )
    expect(isZeroConduitKey(null)).toBe(true)
    expect(isZeroConduitKey("")).toBe(true)
  })

  test("treats a real conduit key as a conduit", () => {
    expect(isZeroConduitKey(CONDUIT_KEY)).toBe(false)
  })
})

describe("toBigInt", () => {
  test("accepts bigints, decimal strings, and integers", () => {
    expect(toBigInt(12n)).toBe(12n)
    expect(toBigInt("360000000")).toBe(360000000n)
    expect(toBigInt(" 42 ")).toBe(42n)
    expect(toBigInt(7)).toBe(7n)
  })

  test("rejects values it cannot read exactly", () => {
    expect(toBigInt("0x10")).toBe(null)
    expect(toBigInt("1.5")).toBe(null)
    expect(toBigInt(1.5)).toBe(null)
    expect(toBigInt(undefined)).toBe(null)
    expect(toBigInt(null)).toBe(null)
    expect(toBigInt({})).toBe(null)
  })
})
