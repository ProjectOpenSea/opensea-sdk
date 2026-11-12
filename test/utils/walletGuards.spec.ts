import { describe, expect, test } from "vitest"
import {
  AMOUNT_CEILINGS,
  assertNoSteeringOverridesInCi,
  cappedAmount,
} from "./walletGuards"

describe("cappedAmount", () => {
  test("uses the fallback when unset or empty", () => {
    expect(cappedAmount("OFFER_AMOUNT", undefined, "0.0001")).toBe("0.0001")
    expect(cappedAmount("OFFER_AMOUNT", "", "0.0001")).toBe("0.0001")
  })

  test("accepts an override at exactly the ceiling", () => {
    expect(
      cappedAmount("OFFER_AMOUNT", AMOUNT_CEILINGS.OFFER_AMOUNT, "0.0001"),
    ).toBe(AMOUNT_CEILINGS.OFFER_AMOUNT)
  })

  test("rejects an override above the ceiling", () => {
    expect(() =>
      cappedAmount("OFFER_AMOUNT", "0.001000000000000001", "0.0001"),
    ).toThrow(/OFFER_AMOUNT 0.001000000000000001 is above its ceiling of 0.001/)
    expect(() => cappedAmount("LISTING_AMOUNT", "1", "0.00001")).toThrow(
      /above its ceiling/,
    )
  })

  test("rejects zero and malformed amounts", () => {
    expect(() => cappedAmount("ETH_TO_WRAP", "0", "0.00001")).toThrow(
      /greater than 0/,
    )
    expect(() => cappedAmount("ETH_TO_WRAP", "lots", "0.00001")).toThrow(
      /decimal amount/,
    )
  })
})

describe("assertNoSteeringOverridesInCi", () => {
  test("allows overrides outside CI", () => {
    expect(() =>
      assertNoSteeringOverridesInCi({ FIXTURE_CONTRACT_ADDRESS: "0xabc" }),
    ).not.toThrow()
  })

  test("allows CI with no overrides, including empty strings", () => {
    expect(() =>
      assertNoSteeringOverridesInCi({
        CI: "true",
        FIXTURE_CONTRACT_ADDRESS: "",
        CREATE_LISTING_CHAIN: "",
      }),
    ).not.toThrow()
  })

  test("rejects each override set in CI, naming all of them", () => {
    expect(() =>
      assertNoSteeringOverridesInCi({
        CI: "true",
        FIXTURE_CONTRACT_ADDRESS: "0xabc",
        CREATE_LISTING_TOKEN_ID: "7",
      }),
    ).toThrow(/unset FIXTURE_CONTRACT_ADDRESS, CREATE_LISTING_TOKEN_ID$/)
  })
})
