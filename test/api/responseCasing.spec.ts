import type {
  AccountResolveResponse,
  AccountResponse,
} from "@opensea/api-types"
import { describe, expect, expectTypeOf, test } from "vitest"
import {
  type Camelize,
  camelizeKeysDeep,
  type GetTraitsResponse,
  type OpenSeaAccount,
  OpenSeaAPI,
  type ResolveAccountResponse,
} from "../../src"
import type { Fetcher, WalletAuthFetcher } from "../../src/api/fetcher"

/**
 * The SDK rewrites response keys from snake_case to camelCase, so a raw
 * `@opensea/api-types` type describes the wire and not the value an SDK method
 * hands back. These assignments pin how much of that the compiler catches:
 * each one fails the type check if its verdict flips, which is what keeps the
 * README's claim honest.
 *
 * `check-types` is where this earns its keep. Vitest compiles the tests with
 * esbuild, which strips types without checking them, and the function is never
 * called.
 */
function _casingPairings(
  account: OpenSeaAccount,
  resolved: ResolveAccountResponse,
) {
  // Caught. `AccountResponse` requires `is_verified`, `is_agent` and four more
  // snake_case keys, none of which survive camelization under those names.
  // @ts-expect-error a camelCase SDK value is not the snake_case wire shape
  const wrongAccount: AccountResponse = account

  // Not caught, and this is the case the documentation exists for.
  // `AccountResolveResponse` requires only `address`, which has no underscore
  // to rewrite. Every other key is optional, so nothing is reported missing
  // and the camelCase keys pass as extras. The reader then writes
  // `account.ens_name` and gets undefined.
  const silentlyWrongResolve: AccountResolveResponse = resolved

  // Both correct spellings.
  const rightViaCamelize: Camelize<AccountResolveResponse> = resolved
  const rightViaSdkAlias: ResolveAccountResponse = resolved

  return [
    wrongAccount,
    silentlyWrongResolve,
    rightViaCamelize,
    rightViaSdkAlias,
  ]
}

/** A wire shape with keys the rewrite would rename, for the assertions below. */
type WireShape = {
  trait_name: string
  nested_object: { inner_key: string }
  count: number
}

/**
 * `camelizeResponse: false` and the declared return type.
 *
 * `get`, `post` and `request` each carry two signatures. Writing the literal
 * `false` selects the one that returns the raw `T`, because that is the call
 * where the rewrite does not run. Every other spelling returns `Camelize<T>`,
 * which is what the method returned before the overload existed.
 *
 * The spellings below are the ones a caller actually writes, and each is
 * pinned rather than described: a signature change that sent any of them down
 * the other branch fails `check-types`. Shapes 4 and 5a are the honest limit
 * of the approach, and they are asserted for the same reason as the rest, so
 * that closing the gap later is a visible edit here.
 *
 * Nothing in this function runs. Vitest compiles the file with esbuild, which
 * strips types without checking them, so `check-types` is what reads it, and
 * the calls would issue real requests if they were ever invoked.
 */
async function _camelizeResponseOverloads(
  api: OpenSeaAPI,
  dynamicFlag: boolean,
) {
  // A `const` declaration widens the property to `boolean`; `as const` keeps
  // the literal. The two go down different branches, which is shapes 5a/5b.
  const widenedOptions = { camelizeResponse: false }
  const frozenOptions = { camelizeResponse: false } as const

  // 1. Literal `false`. The raw wire shape, snake_case keys and all.
  const literalFalse = await api.get<WireShape>("/p", undefined, {
    camelizeResponse: false,
  })
  expectTypeOf(literalFalse).toEqualTypeOf<WireShape>()

  // 2. Literal `true`. The camelized view, unchanged.
  const literalTrue = await api.get<WireShape>("/p", undefined, {
    camelizeResponse: true,
  })
  expectTypeOf(literalTrue).toEqualTypeOf<Camelize<WireShape>>()

  // 3. Option omitted, which is nearly every call in the package.
  const omitted = await api.get<WireShape>("/p")
  expectTypeOf(omitted).toEqualTypeOf<Camelize<WireShape>>()
  const otherOptionsOnly = await api.get<WireShape>("/p", {}, { timeout: 5000 })
  expectTypeOf(otherOptionsOnly).toEqualTypeOf<Camelize<WireShape>>()

  // 4. A `boolean` the compiler cannot see the value of. Still compiles, and
  // still returns the camelized view, which is what it returned before. The
  // runtime skips the rewrite when the variable is `false`, so this spelling
  // keeps the original mismatch.
  const dynamic = await api.get<WireShape>("/p", undefined, {
    camelizeResponse: dynamicFlag,
  })
  expectTypeOf(dynamic).toEqualTypeOf<Camelize<WireShape>>()

  // 5a. Options from a widened variable. Same mismatch as shape 4, same reason.
  const fromWidened = await api.get<WireShape>("/p", undefined, widenedOptions)
  expectTypeOf(fromWidened).toEqualTypeOf<Camelize<WireShape>>()

  // 5b. Options from an `as const` variable, and 5c a spread that keeps the
  // literal. Both reach the raw signature.
  const fromFrozen = await api.get<WireShape>("/p", undefined, frozenOptions)
  expectTypeOf(fromFrozen).toEqualTypeOf<WireShape>()
  const fromSpread = await api.get<WireShape>("/p", undefined, {
    ...{ timeout: 5000 },
    camelizeResponse: false,
  })
  expectTypeOf(fromSpread).toEqualTypeOf<WireShape>()

  // The write verbs carry the same pair.
  const postRaw = await api.post<WireShape>("/p", undefined, undefined, {
    camelizeResponse: false,
  })
  expectTypeOf(postRaw).toEqualTypeOf<WireShape>()
  const postCamelized = await api.post<WireShape>("/p", {})
  expectTypeOf(postCamelized).toEqualTypeOf<Camelize<WireShape>>()
  const requestRaw = await api.request<WireShape>(
    "PATCH",
    "/p",
    undefined,
    undefined,
    { camelizeResponse: false },
  )
  expectTypeOf(requestRaw).toEqualTypeOf<WireShape>()

  const requestCamelized = await api.request<WireShape>("PATCH", "/p", {})
  expectTypeOf(requestCamelized).toEqualTypeOf<Camelize<WireShape>>()

  // The bug. Before the overload this line compiled and read `undefined`.
  // @ts-expect-error the un-camelized response has `trait_name`, not `traitName`
  const camelKeyOnRawResponse = literalFalse.traitName

  return [
    literalFalse,
    literalTrue,
    omitted,
    otherOptionsOnly,
    dynamic,
    fromWidened,
    fromFrozen,
    fromSpread,
    postRaw,
    postCamelized,
    requestRaw,
    requestCamelized,
    camelKeyOnRawResponse,
  ]
}

/**
 * The same pair on the `Fetcher` and `WalletAuthFetcher` contracts.
 *
 * The sub-clients call through these interfaces rather than through
 * `OpenSeaAPI`, and nothing else pins them: `getTraits` is the only in-package
 * caller of the option, and its response type is unchanged by `Camelize`, so
 * dropping the raw overload from the interface alone left `check-types` green.
 * These assertions close that gap, so they use a type whose keys the rewrite
 * renames.
 */
async function _fetcherContractOverloads(
  fetcher: Fetcher,
  walletFetcher: WalletAuthFetcher,
) {
  const getRaw = await fetcher.get<WireShape>("/p", undefined, {
    camelizeResponse: false,
  })
  expectTypeOf(getRaw).toEqualTypeOf<WireShape>()
  const getCamelized = await fetcher.get<WireShape>("/p")
  expectTypeOf(getCamelized).toEqualTypeOf<Camelize<WireShape>>()

  const postRaw = await fetcher.post<WireShape>("/p", undefined, undefined, {
    camelizeResponse: false,
  })
  expectTypeOf(postRaw).toEqualTypeOf<WireShape>()
  const postCamelized = await fetcher.post<WireShape>("/p", {})
  expectTypeOf(postCamelized).toEqualTypeOf<Camelize<WireShape>>()

  const requestRaw = await walletFetcher.request<WireShape>(
    "PATCH",
    "/p",
    undefined,
    undefined,
    { camelizeResponse: false },
  )
  expectTypeOf(requestRaw).toEqualTypeOf<WireShape>()
  const requestCamelized = await walletFetcher.request<WireShape>(
    "PATCH",
    "/p",
    {},
  )
  expectTypeOf(requestCamelized).toEqualTypeOf<Camelize<WireShape>>()

  return [
    getRaw,
    getCamelized,
    postRaw,
    postCamelized,
    requestRaw,
    requestCamelized,
  ]
}

describe("response casing contract", () => {
  test("the SDK's response aliases are the camelized view, not the wire type", () => {
    expectTypeOf<OpenSeaAccount>().toEqualTypeOf<Camelize<AccountResponse>>()
    expectTypeOf<ResolveAccountResponse>().toEqualTypeOf<
      Camelize<AccountResolveResponse>
    >()
    expectTypeOf<ResolveAccountResponse>().not.toEqualTypeOf<AccountResolveResponse>()
  })

  test("Camelize and camelizeKeysDeep are exported from the package root", () => {
    // The type-only assertions above already fail to compile without
    // `Camelize`, but this names the export so a reader of the failure knows
    // what moved.
    expect(typeof camelizeKeysDeep).toBe("function")
  })

  test("Camelize is a no-op on the traits response, so getTraits is sound either way", () => {
    // `getTraits` is the package's own user of `camelizeResponse: false`. Its
    // response is keyed by collection-authored trait names, and `Camelize<T>`
    // passes index signatures through untouched, so the raw and camelized
    // spellings are the same type and the overload does not change its call.
    expectTypeOf<
      Camelize<GetTraitsResponse>
    >().toEqualTypeOf<GetTraitsResponse>()
    expect(typeof new OpenSeaAPI({}).collections.getTraits).toBe("function")
  })

  test("a wire-typed field is absent at runtime once the response is camelized", () => {
    const wire: AccountResolveResponse = {
      address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      ens_name: "vitalik.eth",
    }

    const view = camelizeKeysDeep(wire)

    expect(view.ensName).toBe("vitalik.eth")
    expect(view).not.toHaveProperty("ens_name")
  })
})
