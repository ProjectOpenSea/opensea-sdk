import { afterEach, describe, expect, test, vi } from "vitest"
import { OpenSeaAPI } from "../../src/api/api"

const SIGNAL = {
  signal_id: "sig_v1_abc/def",
  author_address: "0xauthor",
  text: "gm",
  created_at: "2026-11-06T00:00:00Z",
  updated_at: "2026-11-06T00:00:00Z",
  edited_at: null,
  subject_price_usd: "1.23",
  subject: {
    type: "item",
    chain: "base",
    contract: "0xcontract",
    token_id: "7",
    collection: null,
  },
}

const CAMEL_SIGNAL = {
  signalId: "sig_v1_abc/def",
  authorAddress: "0xauthor",
  text: "gm",
  createdAt: "2026-11-06T00:00:00Z",
  updatedAt: "2026-11-06T00:00:00Z",
  editedAt: null,
  subjectPriceUsd: "1.23",
  subject: {
    type: "item",
    chain: "base",
    contract: "0xcontract",
    tokenId: "7",
    collection: null,
  },
}

const setup = (status: number, body?: unknown) => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  )
  const api = new OpenSeaAPI({ apiKey: "signals-key", authToken: "jwt", fetch })
  const call = () => {
    const [url, init] = fetch.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body?: string },
    ]
    return { url: new URL(url), init }
  }
  return { api, call }
}

describe("API: SignalsAPI", () => {
  test("getSignal GETs the encoded signal id and camelizes the signal", async () => {
    const { api, call } = setup(200, SIGNAL)

    const result = await api.signals.getSignal("sig_v1_abc/def")

    const { url, init } = call()
    expect(init.method).toBe("GET")
    expect(url.pathname).toBe("/api/v2/signals/sig_v1_abc%2Fdef")
    expect(init.headers["X-API-KEY"]).toBe("signals-key")
    expect(result).toEqual(CAMEL_SIGNAL)
  })

  test("listSignals sends the subject as snake_case query params", async () => {
    const { api, call } = setup(200, { signals: [SIGNAL], next: "c2" })

    const result = await api.signals.listSignals({
      chain: "base",
      contract: "0xcontract",
      tokenId: "7",
      limit: 100,
      cursor: "c1",
    })

    const { url, init } = call()
    expect(init.method).toBe("GET")
    expect(url.pathname).toBe("/api/v2/signals")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      chain: "base",
      contract: "0xcontract",
      token_id: "7",
      limit: "100",
      cursor: "c1",
    })
    expect(result).toEqual({ signals: [CAMEL_SIGNAL], next: "c2" })
  })

  test("listSignals passes a collection subject alone and keeps an empty page's cursor", async () => {
    const { api, call } = setup(200, { signals: [], next: "c3" })

    const result = await api.signals.listSignals({ collection: "doodles" })

    expect(Object.fromEntries(call().url.searchParams)).toEqual({
      collection: "doodles",
    })
    expect(result).toEqual({ signals: [], next: "c3" })
  })
})

describe("WalletAuthAPI signals", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("createSignal POSTs a snake_case body with the bearer token", async () => {
    const { api, call } = setup(200, { signal_id: "sig_v1_new" })

    const result = await api.walletAuth.createSignal({
      text: "gm",
      chain: "base",
      contract: "0xcontract",
      tokenId: "7",
      authorAddress: "0xauthor",
    })

    const { url, init } = call()
    expect(init.method).toBe("POST")
    expect(url.pathname).toBe("/api/v2/signals")
    expect(JSON.parse(String(init.body))).toEqual({
      text: "gm",
      chain: "base",
      contract: "0xcontract",
      token_id: "7",
      author_address: "0xauthor",
    })
    expect(init.headers.Authorization).toBe("Bearer jwt")
    expect(init.headers["X-API-KEY"]).toBe("signals-key")
    expect(result).toEqual({ signalId: "sig_v1_new" })
  })

  test("deleteSignal DELETEs the encoded signal id and resolves on 204", async () => {
    const { api, call } = setup(204)

    await expect(
      api.walletAuth.deleteSignal("sig_v1_abc/def"),
    ).resolves.toBeUndefined()

    const { url, init } = call()
    expect(init.method).toBe("DELETE")
    expect(url.pathname).toBe("/api/v2/signals/sig_v1_abc%2Fdef")
    expect(init.body).toBeUndefined()
    expect(init.headers.Authorization).toBe("Bearer jwt")
  })
})
