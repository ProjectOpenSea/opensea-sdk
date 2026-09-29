import { describe, expect, expectTypeOf, test } from "vitest"
import {
  type Camelize,
  camelizeKeysDeep,
  type Snakeize,
  snakeizeKeysDeep,
} from "../../src/utils/case"

describe("camelizeKeysDeep", () => {
  test("camelizes snake_case keys on a flat object", () => {
    expect(camelizeKeysDeep({ isNsfw: true, usdPrice: "1.5" })).toEqual({
      isNsfw: true,
      usdPrice: "1.5",
    })
  })

  test("camelizes nested objects recursively", () => {
    expect(
      camelizeKeysDeep({
        pricingCurrencies: {
          listingCurrency: { ethPrice: "1", usdPrice: "3000" },
        },
      }),
    ).toEqual({
      pricingCurrencies: {
        listingCurrency: { ethPrice: "1", usdPrice: "3000" },
      },
    })
  })

  test("walks arrays of objects", () => {
    expect(
      camelizeKeysDeep([
        { traitType: "Background", displayType: null },
        { traitType: "Fur" },
      ]),
    ).toEqual([
      { traitType: "Background", displayType: null },
      { traitType: "Fur" },
    ])
  })

  test("handles multi-segment snake_case", () => {
    expect(camelizeKeysDeep({ total_original_consideration_items: 3 })).toEqual(
      {
        totalOriginalConsiderationItems: 3,
      },
    )
  })

  test("preserves primitives, null, undefined", () => {
    expect(camelizeKeysDeep("hello")).toBe("hello")
    expect(camelizeKeysDeep(42)).toBe(42)
    expect(camelizeKeysDeep(null)).toBe(null)
    expect(camelizeKeysDeep(undefined)).toBe(undefined)
  })

  test("leaves keys without underscores untouched", () => {
    expect(camelizeKeysDeep({ already: "fine", camelCase: true })).toEqual({
      already: "fine",
      camelCase: true,
    })
  })

  test("doesn't mangle Date instances", () => {
    const d = new Date("2026-01-01")
    expect(camelizeKeysDeep({ joinedDate: d })).toEqual({ joinedDate: d })
  })

  test("preserves keys with digits", () => {
    expect(camelizeKeysDeep({ chain_id: 1, version_2: "v2" })).toEqual({
      chainId: 1,
      version2: "v2",
    })
  })
})

describe("snakeizeKeysDeep", () => {
  test("snakeizes camelCase keys on a flat object", () => {
    expect(snakeizeKeysDeep({ isNsfw: true, usdPrice: "1.5" })).toEqual({
      is_nsfw: true,
      usd_price: "1.5",
    })
  })

  test("rewrites top-level protocolAddress in an order-post body", () => {
    const order = {
      parameters: { offerer: "0xabc", startTime: "1", endTime: "2" },
      signature: "0xsig",
      protocolAddress: "0xseaport",
    }
    expect(snakeizeKeysDeep(order)).toEqual({
      // The default behavior recursively rewrites everything — this asserts
      // the dumb mechanical conversion (the opt-out at the callsite is what
      // preserves inner Seaport keys, not snakeize itself).
      parameters: { offerer: "0xabc", start_time: "1", end_time: "2" },
      signature: "0xsig",
      protocol_address: "0xseaport",
    })
  })

  test("rewrites top-level offererSignature → offerer_signature", () => {
    // Verifies that snakeize correctly rewrites the camelCase top-level keys.
    // The CancelRequest schema actually wants the camelCase form on the wire,
    // which is why offchainCancelOrder opts out — but the conversion itself
    // is mechanical and snake-correct.
    expect(snakeizeKeysDeep({ offererSignature: "0xsig" })).toEqual({
      offerer_signature: "0xsig",
    })
  })

  test("walks arrays of objects", () => {
    expect(
      snakeizeKeysDeep([
        { traitType: "Background", displayType: null },
        { traitType: "Fur" },
      ]),
    ).toEqual([
      { trait_type: "Background", display_type: null },
      { trait_type: "Fur" },
    ])
  })

  test("handles multi-segment camelCase", () => {
    expect(snakeizeKeysDeep({ totalOriginalConsiderationItems: 3 })).toEqual({
      total_original_consideration_items: 3,
    })
  })

  test("preserves primitives, null, undefined", () => {
    expect(snakeizeKeysDeep("hello")).toBe("hello")
    expect(snakeizeKeysDeep(42)).toBe(42)
    expect(snakeizeKeysDeep(null)).toBe(null)
    expect(snakeizeKeysDeep(undefined)).toBe(undefined)
  })

  test("doesn't mangle Date instances", () => {
    const d = new Date("2026-01-01")
    expect(snakeizeKeysDeep({ joinedDate: d })).toEqual({ joined_date: d })
  })

  test("position-0 guard: PascalCase key has no leading underscore", () => {
    // Without the position-0 guard, `MyKey` would snakeize to `_my_key`.
    expect(snakeizeKeysDeep({ MyKey: 1 })).toEqual({ my_key: 1 })
  })

  test("position-0 guard: acronym key has no leading underscore", () => {
    // Without the position-0 guard, `URL` would snakeize to `_u_r_l`.
    expect(snakeizeKeysDeep({ URL: "https://example" })).toEqual({
      u_r_l: "https://example",
    })
  })

  test("leaves already-snake_case keys with leading lowercase untouched", () => {
    expect(snakeizeKeysDeep({ already_snake: 1, also_fine: 2 })).toEqual({
      already_snake: 1,
      also_fine: 2,
    })
  })
})

describe("Snakeize<T>", () => {
  test("rewrites keys at the type level", () => {
    type In = { isNsfw: boolean; usdPrice: string }
    type Out = Snakeize<In>
    expectTypeOf<Out>().toEqualTypeOf<{
      is_nsfw: boolean
      usd_price: string
    }>()
  })

  test("position-0 guard at the type level", () => {
    type In = { MyKey: number }
    type Out = Snakeize<In>
    expectTypeOf<Out>().toEqualTypeOf<{ my_key: number }>()
  })

  test("no underscore before a digit, agreeing with the runtime", () => {
    // `Uppercase<"1">` is `"1"`, so the old guard read every digit as an
    // uppercase letter and the type promised `chain_2_id` where the runtime
    // writes `chain2_id`. Reading `body.chain_2_id` then type-checked and came
    // back undefined. `expectTypeOf` is only checked by `check-types`; the
    // runtime assertion below is what vitest runs.
    type In = { chain2Id: string; erc721TokenId: string }
    type Out = Snakeize<In>
    expectTypeOf<Out>().toEqualTypeOf<{
      chain2_id: string
      erc721_token_id: string
    }>()

    expect(snakeizeKeysDeep({ chain2Id: "1", erc721TokenId: "2" })).toEqual({
      chain2_id: "1",
      erc721_token_id: "2",
    })
  })

  test("a leading underscore is not an uppercase letter either", () => {
    // Same root cause: `Uppercase<"_">` is `"_"`. The runtime's `/[A-Z]/`
    // leaves the key alone; the type used to add a second underscore.
    type In = { _private: number }
    expectTypeOf<Snakeize<In>>().toEqualTypeOf<{ _private: number }>()
    expect(snakeizeKeysDeep({ _private: 1 })).toEqual({ _private: 1 })
  })
})

describe("Camelize<T>", () => {
  test("rewrites keys at the type level", () => {
    type In = { isNsfw: boolean; bannerImageUrl: string }
    type Out = Camelize<In>
    expectTypeOf<Out>().toEqualTypeOf<{
      isNsfw: boolean
      bannerImageUrl: string
    }>()
  })

  test("recurses through nested objects and arrays", () => {
    type In = {
      pricingCurrencies: {
        listingCurrency: { ethPrice: string }
      }
      socialMediaAccounts: Array<{ platform: string; user_name: string }>
    }
    type Out = Camelize<In>
    expectTypeOf<Out>().toEqualTypeOf<{
      pricingCurrencies: {
        listingCurrency: { ethPrice: string }
      }
      socialMediaAccounts: Array<{ platform: string; userName: string }>
    }>()
  })
})
