import { afterEach, describe, expect, test, vi } from "vitest"
import { OpenSeaAPI } from "../../src/api/api"

/**
 * `OpenSeaAPIConfig.fetch` is the transport seam. Before it existed, wrapping requests for a
 * cache, a shared rate limiter or instrumentation meant subclassing `OpenSeaAPI` and overriding a
 * public method, which ties the wrapper to that method's signature and cannot carry extra
 * per-request context.
 */
describe("fetch injection", () => {
  // Restore in afterEach rather than after the assertions: a spy left installed by a failing
  // test contaminates every test that runs after it, turning one failure into several.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const ok = (body: unknown = {}) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    })

  test("routes instance requests through the injected transport", async () => {
    const injected = vi.fn().mockResolvedValue(ok({ collection: "azuki" }))
    const globalFetch = vi.spyOn(globalThis, "fetch")

    const api = new OpenSeaAPI({ apiKey: "key", fetch: injected })
    await api.collections.getCollection("azuki")

    expect(injected).toHaveBeenCalledTimes(1)
    expect(String(injected.mock.calls[0][0])).toBe(
      "https://api.opensea.io/api/v2/collections/azuki",
    )
    expect(globalFetch).not.toHaveBeenCalled()
  })

  test("sees the auth headers, so a cache key can account for them", async () => {
    const injected = vi.fn().mockResolvedValue(ok({ collection: "azuki" }))

    const api = new OpenSeaAPI({
      apiKey: "secret-key",
      authToken: "jwt",
      fetch: injected,
    })
    await api.collections.getCollection("azuki")

    const init = injected.mock.calls[0][1] as {
      headers: Record<string, string>
    }
    expect(init.headers["X-API-KEY"]).toBe("secret-key")
    expect(init.headers.Authorization).toBe("Bearer jwt")
  })

  test("a transport can answer without any network call", async () => {
    // The point of the seam: a caching consumer serves a hit without reaching the origin.
    const injected = vi
      .fn()
      .mockResolvedValue(ok({ collection: "from-cache", name: "Cached" }))

    const api = new OpenSeaAPI({ apiKey: "key", fetch: injected })
    const result = await api.collections.getCollection("azuki")

    expect(result.collection).toBe("from-cache")
  })

  test("calls the transport with globalThis as its receiver", async () => {
    // Native fetch in browsers throws "Illegal invocation" unless the global is its receiver, and
    // `fetch: globalThis.fetch` is the obvious thing for a caller to write. Stand-in that fails
    // the same way, so the fix is pinned rather than assumed.
    const receiverStrict = function (this: unknown) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation")
      }
      return Promise.resolve(ok({ collection: "azuki" }))
    } as unknown as typeof globalThis.fetch

    const api = new OpenSeaAPI({ apiKey: "key", fetch: receiverStrict })

    await expect(api.collections.getCollection("azuki")).resolves.toMatchObject(
      {
        collection: "azuki",
      },
    )
  })

  test("does not clobber the receiver of a deliberately bound transport", async () => {
    const owner = { marker: "owner" as const }
    const bound = vi
      .fn(function (this: typeof owner) {
        expect(this.marker).toBe("owner")
        return Promise.resolve(ok({ collection: "azuki" }))
      })
      .bind(owner) as unknown as typeof globalThis.fetch

    const api = new OpenSeaAPI({ apiKey: "key", fetch: bound })

    await expect(api.collections.getCollection("azuki")).resolves.toMatchObject(
      {
        collection: "azuki",
      },
    )
  })

  test("falls back to the global fetch when none is injected", async () => {
    const globalFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(ok({ collection: "azuki" }))

    const api = new OpenSeaAPI({ apiKey: "key" })
    await api.collections.getCollection("azuki")

    expect(globalFetch).toHaveBeenCalledTimes(1)
  })

  test("a transport that throws surfaces to the caller", async () => {
    const injected = vi.fn().mockRejectedValue(new Error("transport down"))

    const api = new OpenSeaAPI({ apiKey: "key", fetch: injected })

    await expect(api.collections.getCollection("azuki")).rejects.toThrow(
      "transport down",
    )
  })

  describe("requestInstantApiKey", () => {
    // The static has no instance to read `OpenSeaAPIConfig.fetch` from, so it takes a transport
    // of its own. Without it a consumer that routes everything through one transport has a hole
    // at the first call it makes.
    test("uses the transport passed to it", async () => {
      const injected = vi.fn().mockResolvedValue(ok({ api_key: "new-key" }))
      const globalFetch = vi.spyOn(globalThis, "fetch")

      const result = await OpenSeaAPI.requestInstantApiKey(
        "https://api.opensea.io",
        { fetch: injected },
      )

      expect(result.apiKey).toBe("new-key")
      expect(injected).toHaveBeenCalledTimes(1)
      expect(globalFetch).not.toHaveBeenCalled()
    })

    test("falls back to the global fetch when none is passed", async () => {
      const globalFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(ok({ api_key: "new-key" }))

      await OpenSeaAPI.requestInstantApiKey()

      expect(globalFetch).toHaveBeenCalledTimes(1)
    })
  })
})
