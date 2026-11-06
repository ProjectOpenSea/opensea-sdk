import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenSeaAPI } from "../../src/api/api"
import type { WalletAuthFetcher } from "../../src/api/fetcher"
import { WalletAuthAPI } from "../../src/api/walletAuth"

describe("WalletAuthAPI", () => {
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

  it("routes every scoped write helper to the documented method and path", async () => {
    const body = {} as never
    const cases: [string, string, () => Promise<unknown>][] = [
      ["POST", "/api/v2/watchlist", () => api.addWatchlistEntry(body)],
      ["DELETE", "/api/v2/watchlist", () => api.removeWatchlistEntry(body)],
      [
        "POST",
        "/api/v2/accounts/alice%2Fexample/follow",
        () => api.followAccount("alice/example"),
      ],
      [
        "DELETE",
        "/api/v2/accounts/alice%2Fexample/follow",
        () => api.unfollowAccount("alice/example"),
      ],
      [
        "POST",
        "/api/v2/accounts/alice%2Fexample/watch",
        () => api.watchAccount("alice/example"),
      ],
      [
        "DELETE",
        "/api/v2/accounts/alice%2Fexample/watch",
        () => api.unwatchAccount("alice/example"),
      ],
      ["POST", "/api/v2/saved-tools", () => api.saveTool(body)],
      [
        "DELETE",
        "/api/v2/saved-tools?tool_id=tool%2F1&registry_chain=base&registry_addr=0xabc&toolkit_name=my+tools",
        () =>
          api.removeSavedTool({
            toolId: "tool/1",
            registryChain: "base",
            registryAddr: "0xabc",
            toolkitName: "my tools",
          }),
      ],
      [
        "POST",
        "/api/v2/orders/chain/base/protocol/0xabc/order-1/cancel",
        () => api.cancelOrder("base", "0xabc", "order-1", body),
      ],
      [
        "POST",
        "/api/v2/orders/chain/base/protocol/0xabc/order-1/cancel",
        () => api.cancelOrder("base", "0xabc", "order-1"),
      ],
      [
        "POST",
        "/api/v2/drops/my%20drop",
        () => api.saveDropEdits("my drop", body),
      ],
      [
        "POST",
        "/api/v2/drops/drop/prereveal-item",
        () => api.savePrerevealDropItem("drop", body),
      ],
      [
        "POST",
        "/api/v2/drops/drop/items",
        () => api.saveSelfMintDropItem("drop", body),
      ],
      [
        "PUT",
        "/api/v2/drops/drop/items/1",
        () => api.updateSelfMintDropItem("drop", 1, body),
      ],
      [
        "PATCH",
        "/api/v2/drops/drop/items/1",
        () => api.updateDropItem("drop", 1, body),
      ],
      [
        "POST",
        "/api/v2/drops/drop/items/media",
        () => api.createDropItemMediaUpload("drop", body),
      ],
      [
        "POST",
        "/api/v2/drops/my%20drop/items/media/save-batch",
        () => api.saveDropItemMediaBatch("my drop", body),
      ],
      [
        "POST",
        "/api/v2/drops/drop/allowlist",
        () => api.createDropAllowlistUpload("drop"),
      ],
      [
        "POST",
        "/api/v2/drops/drop/allowlist/validate",
        () => api.validateDropAllowlist("drop", body),
      ],
      [
        "POST",
        "/api/v2/drops/my%20drop/items/manifest",
        () => api.createDropCollectionManifestUpload("my drop"),
      ],
      [
        "POST",
        "/api/v2/drops/my%20drop/publish",
        () => api.buildDropPublishTransaction("my drop"),
      ],
      [
        "POST",
        "/api/v2/drops/my%20drop/unpublish",
        () => api.buildDropUnpublishTransaction("my drop"),
      ],
      [
        "POST",
        "/api/v2/drops/my%20drop/metadata/ipfs",
        () => api.uploadDropMetadataToIpfs("my drop"),
      ],
      [
        "PATCH",
        "/api/v2/collections/collection",
        () => api.modifyCollection("collection", body),
      ],
      [
        "PATCH",
        "/api/v2/collections/collection/metadata",
        () => api.updateCollectionMetadata("collection", body),
      ],
      [
        "PATCH",
        "/api/v2/collections/collection/visibility",
        () => api.setCollectionVisibility("collection", body),
      ],
      [
        "POST",
        "/api/v2/collections/collection/images/banner?content_type=image%2Fpng",
        () =>
          api.createCollectionImageUpload("collection", "banner", "image/png"),
      ],
      [
        "POST",
        "/api/v2/collections/my%20collection/media/hero_desktop?content_type=video%2Fmp4",
        () =>
          api.createCollectionPageMediaUpload(
            "my collection",
            "hero_desktop",
            "video/mp4",
          ),
      ],
      [
        "POST",
        "/api/v2/collections/my%20collection/pricing_currency",
        () => api.setCollectionPricingCurrency("my collection", body),
      ],
      [
        "POST",
        "/api/v2/collections/my%20collection/creator_fee_enforcement",
        () => api.buildCreatorFeeEnforcementTransactions("my collection", body),
      ],
      [
        "POST",
        "/api/v2/collections/my%20collection/refresh",
        () => api.refreshCollectionMetadata("my collection"),
      ],
      ["PATCH", "/api/v2/profile", () => api.updateProfileSettings(body)],
      [
        "POST",
        "/api/v2/profile/username",
        () => api.claimProfileUsername(body),
      ],
      [
        "POST",
        "/api/v2/profile/images",
        () => api.createProfileImageUpload(body),
      ],
      ["POST", "/api/v2/profile/nft-pfp", () => api.setProfileNftPfp(body)],
      ["DELETE", "/api/v2/profile/nft-pfp", () => api.clearProfileNftPfp()],
      ["POST", "/api/v2/profile/shelves", () => api.createProfileShelf(body)],
      [
        "PATCH",
        "/api/v2/profile/shelves",
        () => api.reorderProfileShelves(body),
      ],
      [
        "PATCH",
        "/api/v2/profile/shelves/shelf-1",
        () => api.updateProfileShelf("shelf-1", body),
      ],
      [
        "DELETE",
        "/api/v2/profile/shelves/shelf-1",
        () => api.deleteProfileShelf("shelf-1"),
      ],
      [
        "POST",
        "/api/v2/accounts/wallets/siwx/nonce",
        () => api.getWalletLinkNonce(),
      ],
      ["POST", "/api/v2/accounts/wallets/siwx", () => api.linkWallet(body)],
      [
        "DELETE",
        "/api/v2/accounts/wallets/0xabc",
        () => api.unlinkWallet("0xabc"),
      ],
      [
        "PUT",
        "/api/v2/accounts/wallets/0xabc/private",
        () => api.makeWalletPrivate("0xabc"),
      ],
      [
        "DELETE",
        "/api/v2/accounts/wallets/0xabc/private",
        () => api.makeWalletPublic("0xabc"),
      ],
      ["PUT", "/api/v2/accounts/agent", () => api.declareAgentAccount()],
      [
        "DELETE",
        "/api/v2/accounts/agent",
        () => api.withdrawAgentAccountDeclaration(),
      ],
      [
        "POST",
        "/api/v2/accounts/agent-relationships",
        () => api.proposeAgentRelationship(body),
      ],
      [
        "POST",
        "/api/v2/accounts/agent-relationships/confirm",
        () => api.confirmAgentRelationship(body),
      ],
      [
        "DELETE",
        "/api/v2/accounts/agent-relationships?counterparty_address=0xabc&caller_role=AGENT",
        () =>
          api.revokeAgentRelationship({
            counterpartyAddress: "0xabc",
            callerRole: "AGENT",
          }),
      ],
    ]

    for (const [method, path, run] of cases) {
      request.mockClear()
      await run()
      expect(request.mock.calls[0]?.slice(0, 2)).toEqual([method, path])
    }
  })

  it("forwards the request body and returns the response for nft pfp helpers", async () => {
    // camelCase, matching SetNftPfpRequest in the OpenAPI spec. This fixture
    // used to be snake_case, which is why the body-casing bug went unnoticed —
    // see walletAuthCasing.spec.ts.
    const settings = {
      contractAddress: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
      tokenId: "1",
      chain: "ethereum",
    }
    request.mockResolvedValueOnce(settings)
    await expect(api.setProfileNftPfp(settings as never)).resolves.toBe(
      settings,
    )
    expect(request).toHaveBeenLastCalledWith(
      "POST",
      "/api/v2/profile/nft-pfp",
      settings,
      undefined,
      { snakeizeBody: false },
    )

    request.mockResolvedValueOnce({ success: true })
    await expect(api.clearProfileNftPfp()).resolves.toEqual({ success: true })
    expect(request).toHaveBeenLastCalledWith(
      "DELETE",
      "/api/v2/profile/nft-pfp",
    )
  })

  it("routes scoped reads with query support", async () => {
    await api.getDropEligibility("drop")
    expect(get).toHaveBeenLastCalledWith("/api/v2/drops/drop/eligibility")

    await api.getFavorites("0xabc", { limit: 1 })
    expect(get).toHaveBeenLastCalledWith("/api/v2/account/0xabc/favorites", {
      limit: 1,
    })

    await api.getTokenWatchlist("0xabc")
    expect(get).toHaveBeenLastCalledWith(
      "/api/v2/account/0xabc/token_watchlist",
    )

    await api.getPerpetualWatchlist("0xabc")
    expect(get).toHaveBeenLastCalledWith(
      "/api/v2/account/0xabc/perpetual_watchlist",
    )

    await api.getAccountRelationship("alice/example")
    expect(get).toHaveBeenLastCalledWith(
      "/api/v2/accounts/alice%2Fexample/relationship",
    )

    await api.getAccountFollowing("alice", { limit: 10, cursor: "next" })
    expect(get).toHaveBeenLastCalledWith("/api/v2/accounts/alice/following", {
      limit: 10,
      cursor: "next",
    })

    await api.getAccountFollowers("alice", { limit: 20 })
    expect(get).toHaveBeenLastCalledWith("/api/v2/accounts/alice/followers", {
      limit: 20,
    })

    await api.listDropItems("my drop", { limit: 5, next: "cursor-1" })
    expect(get).toHaveBeenLastCalledWith("/api/v2/drops/my%20drop/items", {
      limit: 5,
      next: "cursor-1",
    })
    await api.getProfileShelves("0xabc")
    expect(get).toHaveBeenLastCalledWith("/api/v2/profile/shelves", {
      address: "0xabc",
    })

    await api.getDropMetadataIpfsProgress("my drop", "run/1")
    expect(get).toHaveBeenLastCalledWith(
      "/api/v2/drops/my%20drop/metadata/ipfs/run%2F1",
    )

    await api.getCollectionMetadata("my collection")
    expect(get).toHaveBeenLastCalledWith(
      "/api/v2/collections/my%20collection/metadata",
    )

    await api.listSavedTools({ toolkitName: "trading", limit: 5 })
    expect(get).toHaveBeenLastCalledWith("/api/v2/saved-tools", {
      toolkitName: "trading",
      limit: 5,
    })
  })

  it("sends the drop publish, unpublish and IPFS writes without a body", async () => {
    const calls: [string, () => Promise<unknown>][] = [
      [
        "/api/v2/drops/drop/publish",
        () => api.buildDropPublishTransaction("drop"),
      ],
      [
        "/api/v2/drops/drop/unpublish",
        () => api.buildDropUnpublishTransaction("drop"),
      ],
      [
        "/api/v2/drops/drop/metadata/ipfs",
        () => api.uploadDropMetadataToIpfs("drop"),
      ],
    ]
    for (const [path, run] of calls) {
      request.mockClear()
      await run()
      // No body and no options, so the default camelized response applies.
      expect(request).toHaveBeenLastCalledWith("POST", path)
    }
  })

  describe("agent accounts", () => {
    it("sends the caller's own side in the propose and confirm bodies", async () => {
      const proposal = {
        counterpartyAddress: "0xowner",
        callerRole: "AGENT",
      } as const

      await api.proposeAgentRelationship(proposal)
      expect(request).toHaveBeenLastCalledWith(
        "POST",
        "/api/v2/accounts/agent-relationships",
        proposal,
      )

      await api.confirmAgentRelationship(proposal)
      expect(request).toHaveBeenLastCalledWith(
        "POST",
        "/api/v2/accounts/agent-relationships/confirm",
        proposal,
      )
    })

    it("puts revoke arguments in the query string, not a DELETE body", async () => {
      await api.revokeAgentRelationship({
        counterpartyAddress: "0xagent",
        callerRole: "OWNER",
      })

      const [method, path, body] = request.mock.calls.at(-1) ?? []
      expect(method).toBe("DELETE")
      expect(path).toBe(
        "/api/v2/accounts/agent-relationships?counterparty_address=0xagent&caller_role=OWNER",
      )
      // fetch, OkHttp and urllib all drop DELETE bodies, so there must not be one.
      expect(body).toBeUndefined()
    })

    it("percent-encodes revoke query values", async () => {
      await api.revokeAgentRelationship({
        counterpartyAddress: "0x a&b",
        callerRole: "AGENT",
      })

      expect(request.mock.calls.at(-1)?.[1]).toBe(
        "/api/v2/accounts/agent-relationships?counterparty_address=0x+a%26b&caller_role=AGENT",
      )
    })

    it("serializes a counterparty account id in the revoke query", async () => {
      await api.revokeAgentRelationship({
        counterpartyAccountId: "acct_1",
        callerRole: "OWNER",
      })

      expect(request.mock.calls.at(-1)?.[1]).toBe(
        "/api/v2/accounts/agent-relationships?counterparty_account_id=acct_1&caller_role=OWNER",
      )
    })

    it("reads the caller's own relationships over GET", async () => {
      await api.listOwnAgentRelationships()
      expect(get).toHaveBeenLastCalledWith(
        "/api/v2/accounts/agent-relationships",
      )
    })

    it("declares and withdraws without a request body", async () => {
      await api.declareAgentAccount()
      expect(request).toHaveBeenLastCalledWith("PUT", "/api/v2/accounts/agent")

      await api.withdrawAgentAccountDeclaration()
      expect(request).toHaveBeenLastCalledWith(
        "DELETE",
        "/api/v2/accounts/agent",
      )
    })
  })
})

describe("drop IPFS metadata responses", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("camelizes the upload id and progress fields at the fetch boundary", async () => {
    const responses: unknown[] = [
      { workflow_execution_id: "run-1" },
      {
        status: "failed",
        media_upload_progress: 100,
        metadata_upload_progress: 40,
        failure_reason: "pin failed",
      },
    ]
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(responses.shift()), { status: 200 }),
      ),
    )
    const api = new OpenSeaAPI({ apiKey: "key", authToken: "jwt" })

    const started = await api.walletAuth.uploadDropMetadataToIpfs("drop")
    const progress = await api.walletAuth.getDropMetadataIpfsProgress(
      "drop",
      started.workflowExecutionId,
    )

    expect(started).toEqual({ workflowExecutionId: "run-1" })
    expect(progress).toEqual({
      status: "failed",
      mediaUploadProgress: 100,
      metadataUploadProgress: 40,
      failureReason: "pin failed",
    })
  })
})

describe("collection management writes", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("puts snake_case bodies on the wire and camelizes the responses", async () => {
    const responses: unknown[] = [
      { success: true, workflow_id: "reprice-1" },
      {
        transactions: [
          { to: "0xcontract", from: "0xowner", data: "0x", value: "0" },
        ],
      },
      { success: true },
    ]
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(responses.shift()), { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const api = new OpenSeaAPI({ apiKey: "key", authToken: "jwt" })

    const pricing = await api.walletAuth.setCollectionPricingCurrency("drop", {
      useStablecoin: true,
    })
    const enforcement =
      await api.walletAuth.buildCreatorFeeEnforcementTransactions("drop", {
        enabled: false,
      })
    const refresh = await api.walletAuth.refreshCollectionMetadata("drop")

    const sent = fetchMock.mock.calls.map(call => {
      const [url, init] = call as unknown as [string, RequestInit]
      return {
        path: new URL(url).pathname,
        method: init.method,
        body:
          init.body === undefined ? undefined : JSON.parse(String(init.body)),
      }
    })
    expect(sent).toEqual([
      {
        path: "/api/v2/collections/drop/pricing_currency",
        method: "POST",
        body: { use_stablecoin: true },
      },
      {
        path: "/api/v2/collections/drop/creator_fee_enforcement",
        method: "POST",
        body: { enabled: false },
      },
      {
        path: "/api/v2/collections/drop/refresh",
        method: "POST",
        body: undefined,
      },
    ])
    expect(pricing).toEqual({ success: true, workflowId: "reprice-1" })
    expect(enforcement.transactions[0].from).toBe("0xowner")
    expect(refresh).toEqual({ success: true })
  })
})

describe("drop item media upload batches", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sends uploadBatchId as upload_batch_id on the upload and the batch save", async () => {
    const uploadBatchId = "5f0c2b1e-7a4d-4e8b-9c3f-2d6a1b0e9f47"
    const responses: unknown[] = [[], { success: true }]
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(responses.shift()), { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const api = new OpenSeaAPI({ apiKey: "key", authToken: "jwt" })

    await api.walletAuth.createDropItemMediaUpload("drop", {
      filenames: ["1.png", "2.png"],
      uploadBatchId,
    })
    const saved = await api.walletAuth.saveDropItemMediaBatch("drop", {
      uploadBatchId,
      filenames: ["1.png", "2.png"],
    })

    const bodies = fetchMock.mock.calls.map(call => {
      const [url, init] = call as unknown as [string, RequestInit]
      return { url, body: JSON.parse(String(init.body)) }
    })
    expect(bodies).toEqual([
      {
        url: expect.stringContaining("/api/v2/drops/drop/items/media"),
        body: { filenames: ["1.png", "2.png"], upload_batch_id: uploadBatchId },
      },
      {
        url: expect.stringContaining(
          "/api/v2/drops/drop/items/media/save-batch",
        ),
        body: { upload_batch_id: uploadBatchId, filenames: ["1.png", "2.png"] },
      },
    ])
    expect(saved).toEqual({ success: true })
  })
})

describe("drop item listing", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("GETs a page of items with the wallet token and camelizes them", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                token_id: "7",
                image_url: "https://example.com/7.png",
                media_token: "media-7",
                contract_standard: "erc721",
                contract_address: "0xabc",
                chain: "base",
                attributes: [],
              },
            ],
            next: "cursor-2",
          }),
          { status: 200 },
        ),
    )
    vi.stubGlobal("fetch", fetchMock)
    const api = new OpenSeaAPI({ apiKey: "key", authToken: "jwt" })

    const page = await api.walletAuth.listDropItems("my/drop", {
      limit: 5,
      next: "cursor-1",
    })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    const parsed = new URL(url)
    expect(init.method ?? "GET").toBe("GET")
    expect(init.body).toBeUndefined()
    expect(parsed.pathname).toBe("/api/v2/drops/my%2Fdrop/items")
    expect(parsed.searchParams.get("limit")).toBe("5")
    expect(parsed.searchParams.get("next")).toBe("cursor-1")
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer jwt",
    )
    expect(page).toEqual({
      items: [
        {
          tokenId: "7",
          imageUrl: "https://example.com/7.png",
          mediaToken: "media-7",
          contractStandard: "erc721",
          contractAddress: "0xabc",
          chain: "base",
          attributes: [],
        },
      ],
      next: "cursor-2",
    })
  })
})

describe("profile shelves read", () => {
  const ADDRESS = "0x8ba1f109551bd432803012645ac136c94c19d6e"
  const ITEM_OSID = "3f6e2a1c-9b7d-4c5e-8a2f-1d0b6c4e9a73"
  const wireShelf = {
    id: "shelf-1",
    account_address: ADDRESS,
    title: "Favorites",
    description: null,
    display_order: 0,
    items: [{ chain: "ethereum", contract_address: "0xabc", token_id: "1" }],
    icon: null,
    view: "GRID",
    single_item_shelf_side: null,
    shelf_item_metadata: { [ITEM_OSID]: { description: "first mint" } },
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubShelvesFetch() {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify([wireShelf]), { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  function lastCall(fetchMock: ReturnType<typeof stubShelvesFetch>) {
    const [url, init] = fetchMock.mock.lastCall as unknown as [
      string,
      RequestInit & { headers: Record<string, string> },
    ]
    return { url, init }
  }

  it("GETs the shelves for an address with only the API key and camelizes them", async () => {
    const fetchMock = stubShelvesFetch()
    const api = new OpenSeaAPI({ apiKey: "key" })

    const shelves = await api.walletAuth.getProfileShelves(ADDRESS)

    const { url, init } = lastCall(fetchMock)
    expect(url).toBe(
      `https://api.opensea.io/api/v2/profile/shelves?address=${ADDRESS}`,
    )
    expect(init.method).toBe("GET")
    expect(init.headers["X-API-KEY"]).toBe("key")
    expect(init.headers).not.toHaveProperty("Authorization")
    expect(shelves).toEqual([
      {
        id: "shelf-1",
        accountAddress: ADDRESS,
        title: "Favorites",
        description: null,
        displayOrder: 0,
        items: [{ chain: "ethereum", contractAddress: "0xabc", tokenId: "1" }],
        icon: null,
        view: "GRID",
        singleItemShelfSide: null,
        shelfItemMetadata: { [ITEM_OSID]: { description: "first mint" } },
      },
    ])
  })

  it("sends the wallet token alongside the API key when one is configured", async () => {
    const fetchMock = stubShelvesFetch()
    const api = new OpenSeaAPI({ apiKey: "key", authToken: "jwt" })

    await api.walletAuth.getProfileShelves(ADDRESS)

    const { init } = lastCall(fetchMock)
    expect(init.headers["X-API-KEY"]).toBe("key")
    expect(init.headers.Authorization).toBe("Bearer jwt")
  })
})
