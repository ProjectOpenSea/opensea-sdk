import { afterEach, describe, expect, it, vi } from "vitest"
import { OpenSeaAPI } from "../../src/api/api"
import type { WalletAuthFetcher } from "../../src/api/fetcher"
import { WalletAuthAPI, type WalletAuthRequest } from "../../src/api/walletAuth"

const uploadContext = {
  url: "https://uploads.example.com/",
  method: "POST",
  fields: {
    key: "uploads/example.png",
    "Content-Type": "image/png",
    success_action_status: "201",
  },
  token: "upload-token-example",
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("wallet-auth upload context response casing", () => {
  it("preserves signed multipart field names through the real fetch boundary", async () => {
    const responses = [uploadContext, [uploadContext]]
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(responses.shift()), { status: 200 }),
      ),
    )
    const api = new OpenSeaAPI({ apiKey: "key", authToken: "jwt" })

    const profile = await api.walletAuth.createProfileImageUpload({
      imageType: "PROFILE",
      contentType: "image/png",
    })
    const dropMedia = await api.walletAuth.createDropItemMediaUpload("drop", {
      filenames: [],
    })

    expect(profile.fields).toEqual(uploadContext.fields)
    expect(dropMedia[0].fields).toEqual(uploadContext.fields)
  })

  it("opts every UploadContext helper out of response camelization", async () => {
    const request = vi.fn().mockResolvedValue({})
    const api = new WalletAuthAPI({
      get: vi.fn(),
      request,
    } as unknown as WalletAuthFetcher)
    const dropMediaBody: WalletAuthRequest<"upload_drop_item_media"> = {
      filenames: [],
    }
    const profileImageBody: WalletAuthRequest<"upload_profile_image"> = {
      imageType: "PROFILE",
      contentType: "image/png",
    }
    const calls = [
      () => api.createDropItemMediaUpload("drop", dropMediaBody),
      () => api.createDropAllowlistUpload("drop"),
      () =>
        api.createCollectionImageUpload("collection", "banner", "image/png"),
      () => api.createProfileImageUpload(profileImageBody),
    ]

    for (const call of calls) {
      request.mockClear()
      await call()
      expect(request.mock.calls[0]?.[4]).toMatchObject({
        camelizeResponse: false,
      })
    }
  })
})
