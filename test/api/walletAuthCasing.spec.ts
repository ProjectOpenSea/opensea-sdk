import { beforeEach, describe, expect, it, vi } from "vitest"
import { OpenSeaAPI } from "../../src/api/api"
import type { WalletAuthFetcher } from "../../src/api/fetcher"
import { WalletAuthAPI } from "../../src/api/walletAuth"
import { readOpenApiSpec } from "../utils/openapiSpec"

/**
 * Request-body casing for wallet-auth writes.
 *
 * `Fetcher.request` snake_cases every body by default, because most of the API
 * takes snake_case JSON. A handful of endpoints don't (their OpenAPI schemas
 * declare camelCase properties), and for those the default silently corrupts
 * the request. Where the camelCase field is required the call fails outright;
 * where it's optional the server returns 200 and quietly ignores it, which is
 * the worse failure because nothing surfaces.
 *
 * These tests pin the opt-out for the endpoints that need it, and guard against
 * a new camelCase endpoint being added without one.
 */

/** Operations whose request body is camelCase on the wire, per the OpenAPI spec. */
const KNOWN_CAMELCASE_OPERATIONS = [
  // Seaport-shaped bodies, opted out in api/orders.ts and api/offers.ts.
  "build_offer_v2",
  "post_criteria_offer_v2",
  "post_listing",
  "post_offer",
  // WalletAuthAPI, opted out below and covered by the behavioural tests here.
  // `link_wallet_with_siwx` has two senders: auth/siwx.ts posts it with a raw
  // fetch + JSON.stringify, which never snake_cases, and WalletAuthAPI posts it
  // through Fetcher, which needs the explicit opt-out to put the same bytes on
  // the wire. Naming only the raw-fetch path here is what hid the second one.
  "cancel_order",
  // Token exchange, added to the spec in api-types 0.9.3. Its wire body is camelCase and there is
  // no SDK sender yet, so nothing needs an opt-out today. Verified against the live endpoint:
  // {"subjectToken": ...} reaches the service, {"subject_token": ...} comes back 422 "Missing
  // required field 'subjectToken'". Any future sender must pass snakeizeBody: false.
  "exchange_scoped_token",
  "link_wallet_with_siwx",
  "set_profile_nft_pfp",
  "update_profile_settings",
  "upload_profile_image",
].sort()

const HTTP_METHODS = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
])

function camelCaseRequestOperations(): string[] {
  const spec = readOpenApiSpec()
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
    for (const [method, operation] of Object.entries(methods)) {
      if (!HTTP_METHODS.has(method)) continue
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

function operationIdsInInstalledSpec(): Set<string> {
  const spec = readOpenApiSpec()
  const found = new Set<string>()
  for (const methods of Object.values(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!HTTP_METHODS.has(method)) continue
      const operationId = (operation as { operationId?: string }).operationId
      if (operationId) found.add(operationId)
    }
  }
  return found
}

function usesLegacyCreateOfferActionItemSchema(): boolean {
  const spec = readOpenApiSpec()
  const request = spec.components.schemas.CreateOfferActionsRequest as {
    properties?: { item?: { $ref?: string } }
  }
  return request.properties?.item?.$ref === "#/components/schemas/OfferItem"
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
    // discarding everything except `bio`, a single word with no casing to
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
    // chainArch is required, so snake-casing it to chain_arch made the call fail
    // validation every time. The nested message keys are camelCase too, and the
    // server rebuilds the signed SIWX message from them, so renaming those breaks
    // signature verification even where the request itself would be accepted.
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

  it("puts the agent handshake on the wire as snake_case", async () => {
    // Every test above stubs the fetcher, so none of them prove the default path
    // converts anything. A caller reading `proposeAgentRelationship` sees the body
    // handed straight to `request` and can reasonably conclude they must supply
    // the wire shape themselves. They must not, and guessing wrong is expensive:
    // the API answers a camelCase body with 400 "Missing required field
    // 'counterparty_address'". This drives the real fetcher and pins the bytes.
    const bodies: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(init.body as string)
        return new Response(JSON.stringify({ created: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }),
    )

    try {
      const live = new OpenSeaAPI({ apiKey: "key", authToken: "jwt" })
      const proposal = {
        counterpartyAddress: "0xowner",
        callerRole: "AGENT",
      } as const

      await live.walletAuth.proposeAgentRelationship(proposal)
      await live.walletAuth.confirmAgentRelationship(proposal)
    } finally {
      vi.unstubAllGlobals()
    }

    expect(bodies).toHaveLength(2)
    for (const body of bodies) {
      expect(JSON.parse(body)).toEqual({
        counterparty_address: "0xowner",
        caller_role: "AGENT",
      })
    }
  })

  it("flags any new camelCase request body so its casing gets a decision", () => {
    // Tripwire: this list is the set of endpoints known to need verbatim bodies.
    // A new one here means the default snake_casing would corrupt it:
    // handle it explicitly, then add it to KNOWN_CAMELCASE_OPERATIONS.
    // The flat public mirror may temporarily install the previously published
    // api-types while a new spec version is being released, so compare only
    // operations present in that installed spec.
    const installedOperationIds = operationIdsInInstalledSpec()
    const expectedOperations = usesLegacyCreateOfferActionItemSchema()
      ? [...KNOWN_CAMELCASE_OPERATIONS, "create_offer_actions"]
      : KNOWN_CAMELCASE_OPERATIONS
    const expected = expectedOperations
      .filter(operationId => installedOperationIds.has(operationId))
      .sort()
    expect(camelCaseRequestOperations()).toEqual(expected)
  })
})
