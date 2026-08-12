import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { WalletAuthFetcher } from "../../src/api/fetcher"
import { WalletAuthAPI } from "../../src/api/walletAuth"

/**
 * Request-body casing for wallet-auth writes.
 *
 * `Fetcher.request` snake_cases every body by default, because most of the API
 * takes snake_case JSON. A handful of endpoints don't — their OpenAPI schemas
 * declare camelCase properties — and for those the default silently corrupts
 * the request. Where the camelCase field is required the call fails outright;
 * where it's optional the server returns 200 and quietly ignores it, which is
 * the worse failure because nothing surfaces.
 *
 * These tests pin the opt-out for the endpoints that need it, and guard against
 * a new camelCase endpoint being added without one.
 */

/**
 * Locate the OpenAPI spec.
 *
 * `node_modules/@opensea/api-types/opensea-api.json` comes first because it is
 * the only location that exists in **both** contexts this suite runs in: a
 * workspace symlink in the monorepo, and the installed package on the public
 * `opensea-js` mirror, where `packages/api-types/` doesn't exist at all and
 * api-types is an ordinary npm dependency. (`opensea-api.json` is in the
 * package's `files`, so it ships.) The monorepo paths stay as a fallback for
 * a checkout whose deps aren't installed.
 *
 * Deliberately not `import.meta.url`: `tsconfig.check.json` compiles the tests
 * under a module setting that disallows it.
 */
function findSpecPath(): string {
  let dir = process.cwd()
  for (let depth = 0; depth < 5; depth++) {
    for (const relative of [
      "node_modules/@opensea/api-types/opensea-api.json",
      "packages/api-types/opensea-api.json",
      "../api-types/opensea-api.json",
    ]) {
      const candidate = resolve(dir, relative)
      if (existsSync(candidate)) return candidate
    }
    dir = resolve(dir, "..")
  }
  throw new Error("Could not locate opensea-api.json")
}

/** Operations whose request body is camelCase on the wire, per the OpenAPI spec. */
const KNOWN_CAMELCASE_OPERATIONS = [
  // Seaport-shaped bodies — opted out in api/orders.ts and api/offers.ts.
  "build_offer_v2",
  "post_criteria_offer_v2",
  "post_listing",
  "post_offer",
  // WalletAuthAPI — opted out below, covered by the behavioural tests here.
  // `link_wallet_with_siwx` is also posted by auth/siwx.ts via raw fetch +
  // JSON.stringify, which never snake_cases; the WalletAuthAPI path needs the
  // explicit opt-out to match it.
  "cancel_order",
  "link_wallet_with_siwx",
  "set_profile_nft_pfp",
  "update_profile_settings",
  "upload_profile_image",
].sort()

function camelCaseRequestOperations(): string[] {
  const spec = JSON.parse(readFileSync(findSpecPath(), "utf8")) as {
    components: { schemas: Record<string, unknown> }
    paths: Record<string, Record<string, unknown>>
  }
  const schemas = spec.components.schemas as Record<
    string,
    {
      properties?: Record<string, { $ref?: string; items?: { $ref?: string } }>
    }
  >

  const hasCamelKey = (name: string, seen = new Set<string>()): boolean => {
    if (seen.has(name)) return false
    seen.add(name)
    const properties = schemas[name]?.properties ?? {}
    for (const [prop, definition] of Object.entries(properties)) {
      if (/[a-z][A-Z]/.test(prop)) return true
      const ref = definition.$ref ?? definition.items?.$ref
      if (ref && hasCamelKey(ref.split("/").pop() as string, seen)) return true
    }
    return false
  }

  const found: string[] = []
  for (const methods of Object.values(spec.paths)) {
    for (const operation of Object.values(methods)) {
      const op = operation as {
        operationId?: string
        requestBody?: {
          content?: { "application/json"?: { schema?: { $ref?: string } } }
        }
      }
      const ref = op.requestBody?.content?.["application/json"]?.schema?.$ref
      if (!(op.operationId && ref)) continue
      if (hasCamelKey(ref.split("/").pop() as string))
        found.push(op.operationId)
    }
  }
  return [...new Set(found)].sort()
}

describe("wallet-auth request body casing", () => {
  const get = vi.fn().mockResolvedValue({})
  const request = vi.fn().mockResolvedValue({})
  const api = new WalletAuthAPI({
    get,
    request,
  } as unknown as WalletAuthFetcher)

  beforeEach(() => {
    get.mockClear()
    request.mockClear()
  })

  /** The `options` argument `Fetcher.request` receives (5th positional). */
  const optionsOf = (call: unknown[]) =>
    call[4] as { snakeizeBody?: boolean } | undefined
  const bodyOf = (call: unknown[]) => call[2] as Record<string, unknown>

  it("sends set_profile_nft_pfp verbatim — contractAddress and tokenId are required", async () => {
    // Snake-casing these produced contract_address/token_id, which the server
    // rejects as missing required fields. The call could never succeed.
    await api.setProfileNftPfp({
      contractAddress: "0xabc",
      tokenId: "1",
      chain: "polygon",
    } as never)

    const call = request.mock.calls[0]
    expect(optionsOf(call)?.snakeizeBody).toBe(false)
    expect(bodyOf(call)).toMatchObject({
      contractAddress: "0xabc",
      tokenId: "1",
    })
  })

  it("sends upload_profile_image verbatim — imageType and contentType are required", async () => {
    await api.createProfileImageUpload({
      imageType: "PROFILE",
      contentType: "image/png",
    } as never)

    const call = request.mock.calls[0]
    expect(optionsOf(call)?.snakeizeBody).toBe(false)
    expect(bodyOf(call)).toMatchObject({
      imageType: "PROFILE",
      contentType: "image/png",
    })
  })

  it("sends update_profile_settings verbatim so displayName is not dropped", async () => {
    // Every field here is optional, so snake-casing returned 200 while silently
    // discarding everything except `bio` — a single word with no casing to
    // mangle. That made the bug invisible from the response.
    await api.updateProfileSettings({
      displayName: "scopecreep",
      bio: "autonomous agent",
      externalUrl: "https://example.com",
    } as never)

    const call = request.mock.calls[0]
    expect(optionsOf(call)?.snakeizeBody).toBe(false)
    expect(bodyOf(call)).toMatchObject({
      displayName: "scopecreep",
      bio: "autonomous agent",
      externalUrl: "https://example.com",
    })
  })

  it("sends cancel_order verbatim so offererSignature survives", async () => {
    await api.cancelOrder("ethereum", "0xprotocol", "0xhash", {
      offererSignature: "0xsig",
    } as never)

    const call = request.mock.calls[0]
    expect(optionsOf(call)?.snakeizeBody).toBe(false)
    expect(bodyOf(call)).toMatchObject({ offererSignature: "0xsig" })
  })

  it("sends link_wallet_with_siwx verbatim so chainArch and the signed message survive", async () => {
    // chainArch is required, so snake-casing it made the call fail validation.
    // The nested message keys are camelCase too, and the server rebuilds the
    // signed SIWX message from them — renaming them breaks verification.
    await api.linkWallet({
      chainArch: "EVM",
      signature: "0xsig",
      message: { chainId: "1", issuedAt: "2026-01-01T00:00:00Z" },
    } as never)

    const call = request.mock.calls[0]
    expect(optionsOf(call)?.snakeizeBody).toBe(false)
    expect(bodyOf(call)).toMatchObject({
      chainArch: "EVM",
      message: { chainId: "1", issuedAt: "2026-01-01T00:00:00Z" },
    })
  })

  it("leaves snake_case bodies on the default path", async () => {
    // The opt-out is per-endpoint, not a blanket change: bodies that really are
    // snake_case on the wire must keep being converted for the caller.
    await api.createProfileShelf({
      title: "Best deals",
      items: [{ tokenId: "1", chain: "polygon", contractAddress: "0xabc" }],
    } as never)

    expect(optionsOf(request.mock.calls[0])?.snakeizeBody).toBeUndefined()
  })

  it("flags any new camelCase request body so its casing gets a decision", () => {
    // Tripwire: this list is the set of endpoints known to need verbatim bodies.
    // A new one appearing here means the default snake_casing would corrupt it —
    // handle it explicitly, then add it to KNOWN_CAMELCASE_OPERATIONS.
    expect(camelCaseRequestOperations()).toEqual(KNOWN_CAMELCASE_OPERATIONS)
  })
})
