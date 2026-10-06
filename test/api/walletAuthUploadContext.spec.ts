import { afterEach, describe, expect, it, vi } from "vitest"
import { OpenSeaAPI } from "../../src/api/api"
import type { WalletAuthFetcher } from "../../src/api/fetcher"
import { WalletAuthAPI, type WalletAuthRequest } from "../../src/api/walletAuth"

/**
 * `success_action_status` is a real S3 POST policy field, and the API's
 * `UploadContext` schema tells callers to submit every entry unchanged. It is
 * the shortest example of a signed field name that blanket camelization
 * rewrites into something the storage endpoint rejects.
 */
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

describe("wallet-auth upload contexts", () => {
  it("preserves signed multipart field names through the fetch boundary", async () => {
    // Both response shapes the upload operations return: one context, and an
    // array of them for drop item media.
    const responses: unknown[] = [uploadContext, [uploadContext], uploadContext]
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(responses.shift()), { status: 200 }),
      ),
    )
    const api = new OpenSeaAPI({ apiKey: "key", authToken: "jwt" })

    const profile = await api.walletAuth.createProfileImageUpload({
      imageType: "profile_picture",
      contentType: "image/png",
    })
    const dropMedia = await api.walletAuth.createDropItemMediaUpload("drop", {
      filenames: [],
    })

    const manifest =
      await api.walletAuth.createDropCollectionManifestUpload("drop")

    expect(profile.fields).toEqual(uploadContext.fields)
    expect(dropMedia[0].fields).toEqual(uploadContext.fields)
    expect(manifest.fields).toEqual(uploadContext.fields)
  })

  it("opts every UploadContext helper out of response camelization", async () => {
    const request = vi.fn().mockResolvedValue({})
    const api = new WalletAuthAPI({
      get: vi.fn(),
      post: vi.fn(),
      request,
    } as unknown as WalletAuthFetcher)
    const dropMediaBody: WalletAuthRequest<"upload_drop_item_media"> = {
      filenames: [],
    }
    const profileImageBody: WalletAuthRequest<"upload_profile_image"> = {
      imageType: "profile_picture",
      contentType: "image/png",
    }
    const calls = [
      () => api.createDropItemMediaUpload("drop", dropMediaBody),
      () => api.createDropAllowlistUpload("drop"),
      () => api.createDropCollectionManifestUpload("drop"),
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
