import { afterEach, describe, expect, test, vi } from "vitest"
import type { FetchImpl } from "../../src"
import { linkWalletWithSiwx, OpenSeaAuth, requestSiwxNonce } from "../../src"
import { OpenSeaOAuth } from "../../src/auth/oauth"

/**
 * The auth helpers take the same transport seam as `OpenSeaAPIConfig.fetch`, so a consumer that
 * installs one cache, rate limiter or instrumentation wrapper covers the login flow as well as
 * the API client. These assert the two halves that are easy to get wrong: every call site reads
 * the configured transport, and the transport is invoked with the receiver that unbound native
 * fetch requires.
 */

const API_BASE = "https://api.test.invalid"
const ISSUER = "https://auth.test.invalid"

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  })

/** A SIWE verify response carrying the session cookies `extractSessionCookies` requires. */
const sessionResponse = () =>
  new Response("{}", {
    status: 200,
    headers: [
      ["content-type", "application/json"],
      ["set-cookie", "access_token=at; Path=/"],
      ["set-cookie", "refresh_token=rt; Path=/"],
    ],
  })

const signer = {
  getAddress: () =>
    Promise.resolve("0xA0Cf798816D4b9b9866b5330EEa46a18382f251e"),
  signMessage: () => Promise.resolve("0xsignature"),
}

/**
 * A transport that fails the way browsers do when native fetch runs with anything but the global
 * as its receiver, so the fix is pinned rather than assumed.
 */
function receiverStrict(response: () => Response): FetchImpl {
  return function (this: unknown) {
    if (this !== globalThis) {
      throw new TypeError("Illegal invocation")
    }
    return Promise.resolve(response())
  } as unknown as FetchImpl
}

const DISCOVERY = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/oauth/v2/authorize`,
  token_endpoint: `${ISSUER}/oauth/v2/token`,
  device_authorization_endpoint: `${ISSUER}/oauth/v2/device_authorization`,
  code_challenge_methods_supported: ["S256"],
}

describe("auth transport injection", () => {
  // Restored in afterEach rather than after the assertions: a spy left installed by a failing
  // test contaminates every test that runs after it.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("OpenSeaAuth", () => {
    test("routes a request through the injected transport", async () => {
      const injected = vi.fn().mockResolvedValue(json({ nonce: "abcd1234" }))
      const globalFetch = vi.spyOn(globalThis, "fetch")

      const auth = new OpenSeaAuth({ apiBaseUrl: API_BASE, fetch: injected })
      await expect(auth.requestNonce()).resolves.toEqual({ nonce: "abcd1234" })

      expect(injected).toHaveBeenCalledTimes(1)
      expect(String(injected.mock.calls[0][0])).toBe(
        `${API_BASE}/api/v2/auth/siwe/nonce`,
      )
      expect(globalFetch).not.toHaveBeenCalled()
    })

    test("routes every leg of authenticate through it, never the global", async () => {
      const globalFetch = vi.spyOn(globalThis, "fetch")
      const injected = vi.fn((input: string | URL | Request) => {
        const url = String(input)
        if (url.endsWith("/auth/siwe/nonce")) {
          return Promise.resolve(json({ nonce: "abcd1234efgh5678" }))
        }
        if (url.endsWith("/auth/siwe/verify")) {
          return Promise.resolve(sessionResponse())
        }
        if (url.endsWith("/auth/tokens/exchange")) {
          return Promise.resolve(json({ accessToken: "jwt", expiresIn: 3600 }))
        }
        if (url.endsWith("/auth/tokens")) {
          return Promise.resolve(
            json({ id: "tok-1", token: "pat", scopes: ["read:eligibility"] }),
          )
        }
        throw new Error(`unexpected request: ${url}`)
      }) as unknown as FetchImpl

      const auth = new OpenSeaAuth({ apiBaseUrl: API_BASE, fetch: injected })
      const token = await auth.authenticate(signer, {
        scopes: ["read:eligibility"],
      })

      expect(token.accessToken).toBe("jwt")
      expect(token.refreshToken).toBe("pat")
      // Nonce, verify, scoped-token creation and exchange: all four private call sites.
      expect(vi.mocked(injected)).toHaveBeenCalledTimes(4)
      expect(globalFetch).not.toHaveBeenCalled()
    })

    test("calls the transport with globalThis as its receiver", async () => {
      const auth = new OpenSeaAuth({
        apiBaseUrl: API_BASE,
        fetch: receiverStrict(() => json({ nonce: "abcd1234" })),
      })

      await expect(auth.requestNonce()).resolves.toEqual({ nonce: "abcd1234" })
    })

    test("does not clobber the receiver of a deliberately bound transport", async () => {
      const owner = { marker: "owner" as const }
      const bound = vi
        .fn(function (this: typeof owner) {
          expect(this.marker).toBe("owner")
          return Promise.resolve(json({ nonce: "abcd1234" }))
        })
        .bind(owner) as unknown as FetchImpl

      const auth = new OpenSeaAuth({ apiBaseUrl: API_BASE, fetch: bound })

      await expect(auth.requestNonce()).resolves.toEqual({ nonce: "abcd1234" })
    })

    test("falls back to the global fetch when none is injected", async () => {
      const globalFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(json({ nonce: "abcd1234" }))

      const auth = new OpenSeaAuth({ apiBaseUrl: API_BASE })
      await auth.requestNonce()

      expect(globalFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe("OpenSeaOAuth", () => {
    test("routes discovery and the token request through the injected transport", async () => {
      const globalFetch = vi.spyOn(globalThis, "fetch")
      const injected = vi
        .fn()
        .mockResolvedValueOnce(json(DISCOVERY))
        .mockResolvedValueOnce(
          json({
            access_token: "jwt",
            refresh_token: "refresh",
            token_type: "Bearer",
            expires_in: 3600,
          }),
        )

      const oauth = new OpenSeaOAuth({
        clientId: "client",
        issuer: ISSUER,
        fetch: injected,
      })
      const token = await oauth.exchangeCode({
        code: "code",
        codeVerifier: "verifier",
        redirectUri: "http://127.0.0.1:8151/callback",
      })

      expect(token.accessToken).toBe("jwt")
      expect(injected).toHaveBeenCalledTimes(2)
      expect(globalFetch).not.toHaveBeenCalled()
    })

    test("still applies the per-request timeout signal to the injected transport", async () => {
      // The timeout is built before the transport runs, so a transport that ignores the signal
      // is the consumer's choice rather than a silently dropped guard.
      const injected = vi.fn().mockResolvedValue(json(DISCOVERY))

      const oauth = new OpenSeaOAuth({
        clientId: "client",
        issuer: ISSUER,
        fetch: injected,
      })
      await oauth.getDiscovery()

      const init = injected.mock.calls[0][1] as RequestInit
      expect(init.signal).toBeInstanceOf(AbortSignal)
      expect(init.signal?.aborted).toBe(false)
    })

    test("calls the transport with globalThis as its receiver", async () => {
      const oauth = new OpenSeaOAuth({
        clientId: "client",
        issuer: ISSUER,
        fetch: receiverStrict(() => json(DISCOVERY)),
      })

      await expect(oauth.getDiscovery()).resolves.toMatchObject({
        issuer: ISSUER,
      })
    })

    test("falls back to the global fetch when none is injected", async () => {
      const globalFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(json(DISCOVERY))

      const oauth = new OpenSeaOAuth({ clientId: "client", issuer: ISSUER })
      await oauth.getDiscovery()

      expect(globalFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe("SIWX helpers", () => {
    test("requestSiwxNonce uses the injected transport", async () => {
      const injected = vi.fn().mockResolvedValue(json({ nonce: "abcd1234" }))
      const globalFetch = vi.spyOn(globalThis, "fetch")

      await expect(
        requestSiwxNonce(API_BASE, { fetch: injected }),
      ).resolves.toBe("abcd1234")

      expect(String(injected.mock.calls[0][0])).toBe(
        `${API_BASE}/api/v2/auth/siwe/nonce`,
      )
      expect(globalFetch).not.toHaveBeenCalled()
    })

    test("requestSiwxNonce falls back to the global fetch", async () => {
      const globalFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(json({ nonce: "abcd1234" }))

      await expect(requestSiwxNonce(API_BASE)).resolves.toBe("abcd1234")
      expect(globalFetch).toHaveBeenCalledTimes(1)
    })

    test("linkWalletWithSiwx routes the nonce and the link request through it", async () => {
      const globalFetch = vi.spyOn(globalThis, "fetch")
      const injected = vi
        .fn()
        .mockResolvedValueOnce(
          json({ nonce: "abcd1234efgh5678", statement: "Link this wallet." }),
        )
        .mockResolvedValueOnce(json({ success: true }))

      await linkWalletWithSiwx(signer, {
        apiBaseUrl: API_BASE,
        authToken: "jwt",
        chainArch: "EVM",
        chainId: 1,
        domain: "opensea.io",
        uri: "https://opensea.io/tools",
        fetch: injected,
      })

      expect(injected).toHaveBeenCalledTimes(2)
      expect(String(injected.mock.calls[0][0])).toBe(
        `${API_BASE}/api/v2/accounts/wallets/siwx/nonce`,
      )
      expect(String(injected.mock.calls[1][0])).toBe(
        `${API_BASE}/api/v2/accounts/wallets/siwx`,
      )
      expect(globalFetch).not.toHaveBeenCalled()
    })

    test("linkWalletWithSiwx calls the transport with globalThis as its receiver", async () => {
      const responses = [
        () =>
          json({ nonce: "abcd1234efgh5678", statement: "Link this wallet." }),
        () => json({ success: true }),
      ]
      const impl = receiverStrict(() => {
        const next = responses.shift()
        if (!next) throw new Error("unexpected extra request")
        return next()
      })

      await expect(
        linkWalletWithSiwx(signer, {
          apiBaseUrl: API_BASE,
          authToken: "jwt",
          chainArch: "EVM",
          chainId: 1,
          domain: "opensea.io",
          uri: "https://opensea.io/tools",
          fetch: impl,
        }),
      ).resolves.toMatchObject({ success: true })
    })
  })
})
