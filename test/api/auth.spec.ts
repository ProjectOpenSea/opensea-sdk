import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { OpenSeaAPI } from "../../src/api/api"
import {
  type AuthSigner,
  generateSiweMessage,
  OpenSeaAuth,
} from "../../src/auth"

const ADDRESS = "0xabcdef1234567890abcdef1234567890abcdef12"

function mockSigner(address = ADDRESS): AuthSigner {
  return {
    getAddress: vi.fn().mockResolvedValue(address),
    signMessage: vi.fn().mockResolvedValue("0xmocksignature"),
  }
}

function sessionResponse(): Response {
  const headers = new Headers()
  headers.append("set-cookie", "access_token=session-access; Path=/; HttpOnly")
  headers.append(
    "set-cookie",
    "refresh_token=session-refresh; Path=/; HttpOnly",
  )
  return new Response("{}", { status: 200, headers })
}

function exchangeResponse(
  accessToken = "eyJ.mock.token",
  expiresIn = 3600,
): Response {
  return new Response(
    JSON.stringify({
      accessToken,
      expiresIn,
      tokenScopes: ["read:eligibility"],
    }),
    { status: 200 },
  )
}

describe("OpenSeaAuth", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Vitest fetch overloads
  let fetchSpy: any

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("authenticate performs the current session, PAT, and exchange flow", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ nonce: "testnonce123" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "pat-id",
            token: "pat-value",
            scopes: ["read:eligibility"],
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(exchangeResponse())

    const auth = new OpenSeaAuth({ apiBaseUrl: "https://api.example.com" })
    const signer = mockSigner()
    const token = await auth.authenticate(signer, {
      scopes: ["read:eligibility"],
    })

    expect(token).toMatchObject({
      accessToken: "eyJ.mock.token",
      refreshToken: "pat-value",
      scopes: ["read:eligibility"],
    })
    expect(
      fetchSpy.mock.calls.map(
        (call: [RequestInfo | URL, RequestInit?]) => call[0],
      ),
    ).toEqual([
      "https://api.example.com/api/v2/auth/siwe/nonce",
      "https://api.example.com/api/v2/auth/siwe/verify",
      "https://api.example.com/api/v2/auth/tokens",
      "https://api.example.com/api/v2/auth/tokens/exchange",
    ])
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: "POST" })

    const verifyInit = fetchSpy.mock.calls[1][1] as RequestInit
    expect(JSON.parse(verifyInit.body as string)).toMatchObject({
      signature: "0xmocksignature",
      chainArch: "EVM",
      message: {
        nonce: "testnonce123",
        accountType: "Ethereum",
      },
    })
    expect(
      JSON.parse(verifyInit.body as string).message.resources,
    ).toBeUndefined()
    const createInit = fetchSpy.mock.calls[2][1] as RequestInit & {
      headers: Record<string, string>
    }
    expect(createInit.headers.Cookie).toContain("access_token=session-access")
    expect(JSON.parse(createInit.body as string)).toMatchObject({
      scopes: ["read:eligibility"],
      expiresInDays: 1,
    })
    expect(JSON.parse(fetchSpy.mock.calls[3][1]?.body as string)).toEqual({
      subjectToken: "pat-value",
      subjectTokenType: "ACCESS_TOKEN",
    })
    expect(signer.signMessage).toHaveBeenCalledOnce()
  })

  test("reads both session cookies from a combined fallback header", async () => {
    const headers = new Headers({
      "set-cookie":
        "access_token=session-access; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT, refresh_token=session-refresh; Path=/; HttpOnly",
    })
    const verifyResponse = new Response("{}", { status: 200, headers })
    Object.defineProperty(verifyResponse.headers, "getSetCookie", {
      value: undefined,
    })

    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ nonce: "testnonce123" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(verifyResponse)
      .mockResolvedValueOnce(new Response("stop", { status: 400 }))

    await expect(new OpenSeaAuth().authenticate(mockSigner())).rejects.toThrow(
      "Scoped token creation failed (400)",
    )
    const createInit = fetchSpy.mock.calls[2][1] as RequestInit & {
      headers: Record<string, string>
    }
    expect(createInit.headers.Cookie).toBe(
      "access_token=session-access; refresh_token=session-refresh",
    )
  })

  test("getValidToken returns the cached JWT before expiry", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ nonce: "testnonce123" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "pat-id",
            token: "pat-value",
            scopes: ["read:eligibility"],
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(exchangeResponse())

    const auth = new OpenSeaAuth()
    await auth.authenticate(mockSigner())
    expect((await auth.getValidToken()).accessToken).toBe("eyJ.mock.token")
    expect(fetchSpy).toHaveBeenCalledTimes(4)
  })

  test("getValidToken re-exchanges the PAT near JWT expiry", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ nonce: "testnonce123" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "pat-id",
            token: "pat-value",
            scopes: ["read:eligibility"],
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(exchangeResponse("near-expiry", 30))
      .mockResolvedValueOnce(exchangeResponse("refreshed"))

    const auth = new OpenSeaAuth()
    await auth.authenticate(mockSigner())
    expect((await auth.getValidToken()).accessToken).toBe("refreshed")
    expect(fetchSpy.mock.calls[4][0]).toBe(
      "https://api.opensea.io/api/v2/auth/tokens/exchange",
    )
    expect(JSON.parse(fetchSpy.mock.calls[4][1]?.body as string)).toMatchObject(
      {
        subjectToken: "pat-value",
      },
    )
  })

  test("revoke refreshes the wallet session and never uses the JWT as admin auth", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ nonce: "testnonce123" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "pat-id",
            token: "pat-value",
            scopes: ["read:eligibility"],
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(exchangeResponse())
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const auth = new OpenSeaAuth()
    const token = await auth.authenticate(mockSigner())
    await auth.revoke(token.accessToken)

    expect(fetchSpy.mock.calls[4][0]).toBe(
      "https://api.opensea.io/api/v2/auth/session/refresh",
    )
    expect(fetchSpy.mock.calls[5]).toEqual([
      "https://api.opensea.io/api/v2/auth/tokens/pat-id",
      {
        method: "DELETE",
        headers: {
          Cookie: "access_token=session-access; refresh_token=session-refresh",
        },
      },
    ])
    const revokeHeaders = fetchSpy.mock.calls[5][1]?.headers as Record<
      string,
      string
    >
    expect(revokeHeaders.Authorization).toBeUndefined()
    await expect(auth.getValidToken()).rejects.toThrow(
      "No auth token available",
    )
  })

  test("cleans up a newly created PAT when exchange fails", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ nonce: "testnonce123" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "pat-id",
            token: "pat-value",
            scopes: ["read:eligibility"],
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(new OpenSeaAuth().authenticate(mockSigner())).rejects.toThrow(
      "Token exchange failed (502)",
    )
    expect(fetchSpy.mock.calls[4][0]).toBe(
      "https://api.opensea.io/api/v2/auth/tokens/pat-id",
    )
  })

  test("retries PAT cleanup without hiding the exchange failure", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ nonce: "testnonce123" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "pat-id",
            token: "pat-value",
            scopes: ["read:eligibility"],
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(new OpenSeaAuth().authenticate(mockSigner())).rejects.toThrow(
      "Token exchange failed (502)",
    )
    expect(fetchSpy).toHaveBeenCalledTimes(6)
    expect(fetchSpy.mock.calls[4][0]).toBe(
      "https://api.opensea.io/api/v2/auth/tokens/pat-id",
    )
    expect(fetchSpy.mock.calls[5][0]).toBe(
      "https://api.opensea.io/api/v2/auth/tokens/pat-id",
    )
  })

  test("surfaces nonce failures", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("unavailable", { status: 500 }))
    await expect(new OpenSeaAuth().authenticate(mockSigner())).rejects.toThrow(
      "Nonce request failed (500)",
    )
  })

  test("trims a trailing slash from apiBaseUrl", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("unavailable", { status: 500 }))
    const auth = new OpenSeaAuth({ apiBaseUrl: "https://api.example.com/" })
    await expect(auth.requestNonce()).rejects.toThrow("Nonce request failed")
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://api.example.com/api/v2/auth/siwe/nonce",
    )
  })
})

describe("generateSiweMessage", () => {
  test("produces the current OpenSea session proof without PAT scopes", () => {
    const message = generateSiweMessage(
      ADDRESS,
      ["read:eligibility", "write:orders"],
      "nonce123",
      "https://api.opensea.io",
    )

    expect(message).toContain(
      "opensea.io wants you to sign in with your Ethereum account:",
    )
    expect(message).toContain("URI: https://opensea.io")
    expect(message).toContain("Nonce: nonce123")
    expect(message).not.toContain("read:eligibility")
    expect(message).not.toContain("write:orders")
    expect(message).not.toContain("Expiration Time:")
  })
})

describe("OpenSeaAPI auth header", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Vitest fetch overloads
  let fetchSpy: any

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("includes Authorization header when authToken is set", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    )
    const api = new OpenSeaAPI({ authToken: "my-jwt-token" })
    const logs: string[] = []
    api.logger = message => logs.push(message)

    await api.get("/api/v2/collections/test")

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer my-jwt-token",
    )
    expect(logs.join(" ")).not.toContain("my-jwt-token")
  })

  test("does not include Authorization header when authToken is absent", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    )
    const api = new OpenSeaAPI({ apiKey: "test-key" })
    await api.get("/api/v2/collections/test")
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toBeUndefined()
  })
})
