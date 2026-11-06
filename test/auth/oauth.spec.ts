import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  decodeJwtPayload,
  extractLinkedWallets,
  extractOpenSeaScopes,
  extractWalletAddress,
  OpenSeaOAuth,
  tryDecodeJwtPayload,
} from "../../src/auth/oauth"

const ISSUER = "https://auth.example.com"
const CLIENT_ID = "test-client-id"

const DISCOVERY = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/oauth/v2/authorize`,
  token_endpoint: `${ISSUER}/oauth/v2/token`,
  device_authorization_endpoint: `${ISSUER}/oauth/v2/device_authorization`,
  revocation_endpoint: `${ISSUER}/oauth/v2/revoke`,
  code_challenge_methods_supported: ["S256"],
}

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: "",
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response
}

function mockDiscovery(fetchMock: ReturnType<typeof vi.fn>) {
  fetchMock.mockImplementationOnce(() =>
    Promise.resolve(jsonResponse(DISCOVERY)),
  )
}

function jwt(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload))
    .toString("base64url")
    .replace(/=+$/, "")
  return `header.${encoded}.signature`
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("OpenSeaOAuth", () => {
  test("throws without a clientId", () => {
    expect(() => new OpenSeaOAuth({ clientId: "" })).toThrow(/clientId/)
  })

  test("throws when the issuer is not https (and not loopback)", () => {
    expect(
      () =>
        new OpenSeaOAuth({
          clientId: CLIENT_ID,
          issuer: "http://auth.example.com",
        }),
    ).toThrow(/https/)
  })

  test("allows an http loopback issuer for local testing", () => {
    expect(
      () =>
        new OpenSeaOAuth({
          clientId: CLIENT_ID,
          issuer: "http://127.0.0.1:8151",
        }),
    ).not.toThrow()
  })

  test("rejects a discovery document whose issuer does not match", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({ ...DISCOVERY, issuer: "https://evil.example.com" }),
      ),
    )
    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })
    await expect(oauth.getDiscovery()).rejects.toThrow(/issuer mismatch/)
  })

  test("rejects a discovery document with an insecure token endpoint", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          ...DISCOVERY,
          token_endpoint: "http://auth.example.com/oauth/v2/token",
        }),
      ),
    )
    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })
    await expect(oauth.getDiscovery()).rejects.toThrow(/token_endpoint/)
  })

  test("aborts and surfaces a timeout when a request hangs", async () => {
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
        })
      })
    })
    const oauth = new OpenSeaOAuth({
      clientId: CLIENT_ID,
      issuer: ISSUER,
      timeoutMs: 10,
    })
    await expect(oauth.getDiscovery()).rejects.toThrow(/timed out/)
  })

  describe("a server that sends headers and then stalls the body", () => {
    const TIMEOUT_MS = 100

    function stalledBody(signal: AbortSignal | null | undefined, ok: boolean) {
      const stall = () =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
          })
        })
      return {
        ok,
        status: ok ? 200 : 500,
        statusText: "",
        json: stall,
        text: stall,
      } as unknown as Response
    }

    function stallNextResponse(ok: boolean) {
      fetchMock.mockImplementationOnce((_url: string, init: RequestInit) =>
        Promise.resolve(stalledBody(init.signal, ok)),
      )
    }

    afterEach(() => {
      vi.useRealTimers()
    })

    test.each([
      {
        read: "discovery JSON",
        run: (oauth: OpenSeaOAuth) => {
          stallNextResponse(true)
          return oauth.getDiscovery()
        },
      },
      {
        read: "token JSON",
        run: (oauth: OpenSeaOAuth) => {
          mockDiscovery(fetchMock)
          stallNextResponse(true)
          return oauth.refresh("refresh-token")
        },
      },
      {
        read: "token error text",
        run: (oauth: OpenSeaOAuth) => {
          mockDiscovery(fetchMock)
          stallNextResponse(false)
          return oauth.refresh("refresh-token")
        },
      },
      {
        read: "device poll error JSON",
        run: (oauth: OpenSeaOAuth) => {
          mockDiscovery(fetchMock)
          stallNextResponse(false)
          return oauth.pollDeviceToken({
            device_code: "device-code",
            user_code: "USER-CODE",
            verification_uri: `${ISSUER}/device`,
            expires_in: 600,
            interval: 5,
          })
        },
      },
    ])("times out a stalled $read read", async ({ run }) => {
      vi.useFakeTimers()
      const oauth = new OpenSeaOAuth({
        clientId: CLIENT_ID,
        issuer: ISSUER,
        timeoutMs: TIMEOUT_MS,
      })
      let outcome = "still pending"
      run(oauth).then(
        () => {
          outcome = "resolved"
        },
        (error: Error) => {
          outcome = error.message
        },
      )

      await vi.advanceTimersByTimeAsync(TIMEOUT_MS)

      expect(outcome).toMatch(/timed out after 100ms/)
    })
  })

  test("createAuthorizationRequest builds a PKCE authorization URL", async () => {
    mockDiscovery(fetchMock)
    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })

    const req = await oauth.createAuthorizationRequest({
      redirectUri: "http://127.0.0.1:8151/callback",
      scopes: ["read:eligibility"],
    })

    const url = new URL(req.url)
    expect(url.origin + url.pathname).toBe(`${ISSUER}/oauth/v2/authorize`)
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID)
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:8151/callback",
    )
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("code_challenge")).toBeTruthy()
    expect(url.searchParams.get("state")).toBe(req.state)
    const scope = url.searchParams.get("scope")?.split(" ")
    expect(scope).toEqual([
      "openid",
      "offline_access",
      "read:eligibility",
      "urn:zitadel:iam:org:project:role:read:eligibility",
    ])
    expect(req.codeVerifier.length).toBeGreaterThan(20)
  })

  test("createAuthorizationRequest rejects unknown OpenSea scopes", async () => {
    mockDiscovery(fetchMock)
    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })

    await expect(
      oauth.createAuthorizationRequest({
        redirectUri: "http://127.0.0.1:8151/callback",
        scopes: ["admin:everything"],
      }),
    ).rejects.toThrow("Unknown OpenSea OAuth scopes: admin:everything")
  })

  test("createAuthorizationRequest rejects an explicit empty scope list", async () => {
    mockDiscovery(fetchMock)
    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })

    await expect(
      oauth.createAuthorizationRequest({
        redirectUri: "http://127.0.0.1:8151/callback",
        scopes: [],
      }),
    ).rejects.toThrow(
      "OpenSea OAuth scopes cannot be empty; omit scopes to request all default scopes",
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("createAuthorizationRequest explicitly requests every role by default", async () => {
    mockDiscovery(fetchMock)
    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })

    const req = await oauth.createAuthorizationRequest({
      redirectUri: "http://127.0.0.1:8151/callback",
    })

    const scopes = new URL(req.url).searchParams.get("scope")?.split(" ") ?? []
    const roleScopes = scopes.filter(scope =>
      scope.startsWith("urn:zitadel:iam:org:project:role:"),
    )
    expect(roleScopes).toHaveLength(13)
    expect(roleScopes).toContain(
      "urn:zitadel:iam:org:project:role:read:favorites",
    )
    expect(roleScopes).toContain("urn:zitadel:iam:org:project:role:read:social")
    expect(roleScopes).toContain(
      "urn:zitadel:iam:org:project:role:write:social",
    )
    expect(roleScopes).toContain(
      "urn:zitadel:iam:org:project:role:write:wallets",
    )
    // Agent relationship writes take write:wallets but listing your own takes
    // read:wallets, so the default grant has to carry both.
    expect(roleScopes).toContain(
      "urn:zitadel:iam:org:project:role:read:wallets",
    )
  })

  test("exchangeCode posts the code + verifier and normalizes the token", async () => {
    mockDiscovery(fetchMock)
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      const body = new URLSearchParams(init.body as string)
      expect(body.get("grant_type")).toBe("authorization_code")
      expect(body.get("code")).toBe("the-code")
      expect(body.get("code_verifier")).toBe("the-verifier")
      expect(body.get("client_id")).toBe(CLIENT_ID)
      return Promise.resolve(
        jsonResponse({
          access_token: "at",
          refresh_token: "rt",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "read:eligibility write:orders",
        }),
      )
    })

    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })
    const token = await oauth.exchangeCode({
      code: "the-code",
      codeVerifier: "the-verifier",
      redirectUri: "http://127.0.0.1:8151/callback",
    })

    expect(token.accessToken).toBe("at")
    expect(token.refreshToken).toBe("rt")
    expect(token.scopes).toEqual(["read:eligibility", "write:orders"])
    expect(token.scopeSource).toBe("authorization_server")
    expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  test("exchangeCode throws on a token endpoint error", async () => {
    mockDiscovery(fetchMock)
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({ error: "invalid_grant" }, { ok: false, status: 400 }),
      ),
    )
    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })
    await expect(
      oauth.exchangeCode({
        code: "x",
        codeVerifier: "y",
        redirectUri: "http://127.0.0.1:8151/callback",
      }),
    ).rejects.toThrow(/Token request failed/)
  })

  test("exchangeCode requires the refresh token requested by offline_access", async () => {
    mockDiscovery(fetchMock)
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          access_token: "at",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      ),
    )
    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })

    await expect(
      oauth.exchangeCode({
        code: "the-code",
        codeVerifier: "the-verifier",
        redirectUri: "http://127.0.0.1:8151/callback",
      }),
    ).rejects.toThrow("missing a refresh token")
  })

  test("reads OpenSea scopes from the access token when scope is omitted", async () => {
    mockDiscovery(fetchMock)
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          access_token: jwt({
            opensea_scopes:
              "write:orders read:eligibility read:rewards unknown:scope",
          }),
          refresh_token: "rt",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      ),
    )

    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })
    const token = await oauth.exchangeCode({
      code: "the-code",
      codeVerifier: "the-verifier",
      redirectUri: "http://127.0.0.1:8151/callback",
    })

    expect(token.scopes).toEqual(["read:eligibility", "write:orders"])
    expect(token.scopeSource).toBe("jwt_claim")
  })

  test("reads array OpenSea scope claims in canonical API order", async () => {
    mockDiscovery(fetchMock)
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          access_token: jwt({
            opensea_scopes: ["write:favorites", "read:favorites"],
          }),
          refresh_token: "rt",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      ),
    )

    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })
    const token = await oauth.exchangeCode({
      code: "the-code",
      codeVerifier: "the-verifier",
      redirectUri: "http://127.0.0.1:8151/callback",
    })

    expect(token.scopes).toEqual(["read:favorites", "write:favorites"])
    expect(token.scopeSource).toBe("jwt_claim")
  })

  test("filters token response scopes through the OpenAPI catalog", async () => {
    mockDiscovery(fetchMock)
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          access_token: "opaque-token",
          refresh_token: "rt",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "read:eligibility read:rewards unknown:scope",
        }),
      ),
    )

    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })
    const token = await oauth.exchangeCode({
      code: "the-code",
      codeVerifier: "the-verifier",
      redirectUri: "http://127.0.0.1:8151/callback",
    })

    expect(token.scopes).toEqual(["read:eligibility"])
    expect(token.scopeSource).toBe("authorization_server")
  })

  test.each([
    ["a JWT without the claim", jwt({ wallet: "0xabc" })],
    [
      "a JWT with only unknown claims",
      jwt({ opensea_scopes: "unknown:scope" }),
    ],
  ])("returns no scopes for %s", async (_label, accessToken) => {
    mockDiscovery(fetchMock)
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          access_token: accessToken,
          refresh_token: "rt",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      ),
    )

    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })
    const token = await oauth.exchangeCode({
      code: "the-code",
      codeVerifier: "the-verifier",
      redirectUri: "http://127.0.0.1:8151/callback",
    })

    expect(token.scopes).toEqual([])
    expect(token.scopeSource).toBe("jwt_claim")
  })

  test("refresh uses the refresh_token grant", async () => {
    mockDiscovery(fetchMock)
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      const body = new URLSearchParams(init.body as string)
      expect(body.get("grant_type")).toBe("refresh_token")
      expect(body.get("refresh_token")).toBe("old-rt")
      return Promise.resolve(
        jsonResponse({
          access_token: "at2",
          refresh_token: "rt2",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      )
    })
    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })
    const token = await oauth.refresh("old-rt")
    expect(token.accessToken).toBe("at2")
    expect(token.refreshToken).toBe("rt2")
    expect(token.scopes).toEqual([])
    expect(token.scopeSource).toBe("jwt_claim")
  })

  test("refresh retains the previous token when rotation omits one", async () => {
    mockDiscovery(fetchMock)
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          access_token: "at2",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      ),
    )
    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })

    const token = await oauth.refresh("old-rt")

    expect(token.refreshToken).toBe("old-rt")
  })

  test("revoke posts the token to the revocation endpoint", async () => {
    mockDiscovery(fetchMock)
    fetchMock.mockImplementationOnce((url: string, init: RequestInit) => {
      expect(url).toBe(`${ISSUER}/oauth/v2/revoke`)
      const body = new URLSearchParams(init.body as string)
      expect(body.get("token")).toBe("some-token")
      return Promise.resolve(jsonResponse({}))
    })
    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })
    await expect(oauth.revoke("some-token")).resolves.toBeUndefined()
  })

  test("revoke rejects an insecure revocation endpoint", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          ...DISCOVERY,
          revocation_endpoint: "http://auth.example.com/oauth/v2/revoke",
        }),
      ),
    )
    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })
    await expect(oauth.revoke("some-token")).rejects.toThrow(
      /revocation_endpoint/,
    )
  })

  test("requestDeviceAuthorization rejects an insecure device endpoint", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          ...DISCOVERY,
          device_authorization_endpoint:
            "http://auth.example.com/oauth/v2/device_authorization",
        }),
      ),
    )
    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })
    await expect(oauth.requestDeviceAuthorization()).rejects.toThrow(
      /device_authorization_endpoint/,
    )
  })

  test("requestDeviceAuthorization returns the device response", async () => {
    mockDiscovery(fetchMock)
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      const body = new URLSearchParams(init.body as string)
      expect(body.get("scope")?.split(" ")).toEqual([
        "openid",
        "offline_access",
        "read:eligibility",
        "urn:zitadel:iam:org:project:role:read:eligibility",
      ])
      return Promise.resolve(
        jsonResponse({
          device_code: "dc",
          user_code: "WXYZ-1234",
          verification_uri: `${ISSUER}/device`,
          verification_uri_complete: `${ISSUER}/device?user_code=WXYZ-1234`,
          expires_in: 600,
          interval: 5,
        }),
      )
    })
    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })
    const device = await oauth.requestDeviceAuthorization({
      scopes: ["read:eligibility"],
    })
    expect(device.user_code).toBe("WXYZ-1234")
    expect(device.device_code).toBe("dc")
  })

  test("requestDeviceAuthorization rejects an explicit empty scope list", async () => {
    mockDiscovery(fetchMock)
    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })

    await expect(
      oauth.requestDeviceAuthorization({ scopes: [] }),
    ).rejects.toThrow(
      "OpenSea OAuth scopes cannot be empty; omit scopes to request all default scopes",
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("pollDeviceToken waits through authorization_pending then succeeds", async () => {
    vi.useFakeTimers()
    mockDiscovery(fetchMock)
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse(
            { error: "authorization_pending" },
            { ok: false, status: 400 },
          ),
        ),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            access_token: "device-at",
            refresh_token: "device-rt",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "read:eligibility",
          }),
        ),
      )

    const oauth = new OpenSeaOAuth({ clientId: CLIENT_ID, issuer: ISSUER })
    const promise = oauth.pollDeviceToken({
      device_code: "dc",
      user_code: "WXYZ-1234",
      verification_uri: `${ISSUER}/device`,
      expires_in: 600,
      interval: 1,
    })
    await vi.advanceTimersByTimeAsync(3000)
    const token = await promise
    expect(token.accessToken).toBe("device-at")
    vi.useRealTimers()
  })
})

describe("decodeJwtPayload", () => {
  test("decodes the payload of a JWT without verifying", () => {
    const payload = {
      sub: "acct-1",
      wallet: "0xabc",
      scope: "read:eligibility",
    }
    const encoded = Buffer.from(JSON.stringify(payload))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
    const jwt = `header.${encoded}.signature`
    const decoded = decodeJwtPayload(jwt)
    expect(decoded.sub).toBe("acct-1")
    expect(decoded.wallet).toBe("0xabc")
  })

  test("throws when the token is not a JWT", () => {
    expect(() => decodeJwtPayload("not-a-jwt")).toThrow(/Not a JWT/)
  })

  test("decodes a payload whose base64url length needs re-padding", () => {
    // Choose a payload whose base64 encoding length is not a multiple of 4
    // (so it would require padding). `atob` rejects unpadded input.
    const payload = { wallet: "0xabcd" }
    const encoded = Buffer.from(JSON.stringify(payload))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
    expect(encoded.length % 4).not.toBe(0)
    const decoded = decodeJwtPayload(`header.${encoded}.signature`)
    expect(decoded.wallet).toBe("0xabcd")
  })
})

describe("extractWalletAddress", () => {
  test("prefers the top-level wallet claim", () => {
    expect(extractWalletAddress({ wallet: "0xabc", sub: "acct-1" })).toBe(
      "0xabc",
    )
  })

  test("does not treat the account subject as a wallet address", () => {
    expect(extractWalletAddress({ sub: "acct-1" })).toBeUndefined()
  })

  test("returns undefined when neither claim is present", () => {
    expect(extractWalletAddress({})).toBeUndefined()
    expect(extractWalletAddress({ wallet: "" })).toBeUndefined()
  })
})

/**
 * These mirror the cases the claim's producer already pins in os2-core
 * (`WalletIdentityJwtVerifierTest`), so the SDK and the server agree on what
 * the claim means rather than each guessing.
 */
describe("extractLinkedWallets", () => {
  const EVM = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
  const SOLANA = "5FHwkrdxntdK24hgQU8qgBjn35Y1zwhz1GZwCkP2UJnM"

  test("returns every linked wallet, including the token's own", () => {
    const token = jwt({ wallet: EVM, linked_wallets: [EVM, SOLANA] })

    expect(extractLinkedWallets(token)).toEqual([EVM, SOLANA])
    // The primary is already in the claim, so a caller must not add it back.
    expect(extractLinkedWallets(token)).toContain(
      extractWalletAddress({ wallet: EVM }),
    )
  })

  test("de-duplicates repeated addresses", () => {
    expect(
      extractLinkedWallets(jwt({ linked_wallets: [EVM, SOLANA, EVM] })),
    ).toEqual([EVM, SOLANA])
  })

  test("keeps Solana addresses that differ only by case", () => {
    const lowercased = SOLANA.toLowerCase()

    expect(
      extractLinkedWallets(jwt({ linked_wallets: [SOLANA, lowercased] })),
    ).toEqual([SOLANA, lowercased])
  })

  test("drops entries that are not non-empty strings", () => {
    const token = jwt({
      linked_wallets: [EVM, 42, "", "   ", null, { k: "v" }, SOLANA],
    })

    expect(extractLinkedWallets(token)).toEqual([EVM, SOLANA])
  })

  test("treats an absent or non-array claim as no linked wallets", () => {
    expect(extractLinkedWallets(jwt({ wallet: EVM }))).toEqual([])
    expect(extractLinkedWallets(jwt({ linked_wallets: EVM }))).toEqual([])
    expect(extractLinkedWallets(jwt({ linked_wallets: null }))).toEqual([])
  })

  test("returns empty for a token that is not a JWT", () => {
    expect(extractLinkedWallets("opaque-access-token")).toEqual([])
  })
})

/**
 * The claim extractors return `[]` for a token they cannot read, which is
 * indistinguishable from a token that genuinely carries nothing. That is the
 * same silent under-report `extractLinkedWallets` exists to prevent, one level
 * up, so callers need a way to tell the two apart.
 */
describe("tryDecodeJwtPayload", () => {
  test("returns the payload for a JWT, matching decodeJwtPayload", () => {
    const token = jwt({ wallet: "0xabc", linked_wallets: ["0xabc"] })

    expect(tryDecodeJwtPayload(token)).toEqual(decodeJwtPayload(token))
  })

  test("returns null where decodeJwtPayload throws", () => {
    // The pair disagreed before: one threw on an opaque token while the
    // extractors quietly returned [] for the same input.
    expect(() => decodeJwtPayload("opaque-access-token")).toThrow()
    expect(tryDecodeJwtPayload("opaque-access-token")).toBeNull()
  })

  test("distinguishes an unreadable token from one with no linked wallets", () => {
    const empty = jwt({ wallet: "0xabc", linked_wallets: [] })

    expect(extractLinkedWallets(empty)).toEqual([])
    expect(extractLinkedWallets("opaque-access-token")).toEqual([])
    // Identical results above; only the decoder separates them.
    expect(tryDecodeJwtPayload(empty)).not.toBeNull()
    expect(tryDecodeJwtPayload("opaque-access-token")).toBeNull()
  })

  test("both extractors still degrade rather than throw on an opaque token", () => {
    expect(extractLinkedWallets("opaque-access-token")).toEqual([])
    expect(extractOpenSeaScopes("opaque-access-token")).toEqual([])
  })

  test("treats a malformed JWT the same as an opaque token", () => {
    // Three segments, so it looks like a JWT, but the payload is not decodable.
    // This is the dangerous case the comments call out: an opaque token is a
    // deliberate choice, a corrupted one is indistinguishable from an account
    // with a single wallet.
    const malformed = "header.!!!not-base64!!!.signature"

    expect(tryDecodeJwtPayload(malformed)).toBeNull()
    expect(extractLinkedWallets(malformed)).toEqual([])
    expect(extractOpenSeaScopes(malformed)).toEqual([])
  })

  test("treats a JWT whose payload is valid base64 but not JSON as unreadable", () => {
    const notJson = `header.${Buffer.from("plain text").toString("base64url")}.sig`

    expect(tryDecodeJwtPayload(notJson)).toBeNull()
    expect(extractLinkedWallets(notJson)).toEqual([])
    expect(extractOpenSeaScopes(notJson)).toEqual([])
  })

  // JSON.parse returns these happily, so before validation decodeJwtPayload
  // asserted a number or an array to Record<string, unknown> and
  // tryDecodeJwtPayload reported a readable token. The `=== null` guidance
  // documented on extractLinkedWallets was wrong for exactly these inputs.
  test.each([
    ["a number", "123"],
    ["a string", '"not-an-object"'],
    ["an array", "[1,2]"],
    ["a boolean", "true"],
    ["null", "null"],
  ])("treats a JWT whose payload is %s as unreadable", (_label, payload) => {
    const token = `header.${Buffer.from(payload).toString("base64url")}.sig`

    expect(tryDecodeJwtPayload(token)).toBeNull()
    expect(() => decodeJwtPayload(token)).toThrow()
    expect(extractLinkedWallets(token)).toEqual([])
    expect(extractOpenSeaScopes(token)).toEqual([])
  })
})
