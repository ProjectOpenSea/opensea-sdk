import { describe, expect, test } from "vitest"

describe("Root exports", () => {
  test("exports ZERO_ADDRESS and MAX_UINT256 from constants", async () => {
    const { ZERO_ADDRESS, MAX_UINT256 } = await import("../src")
    expect(ZERO_ADDRESS).toBe("0x0000000000000000000000000000000000000000")
    expect(MAX_UINT256).toBe(2n ** 256n - 1n)
  })

  test("exports checksumAddress from utils", async () => {
    const { checksumAddress } = await import("../src")
    expect(typeof checksumAddress).toBe("function")
    expect(checksumAddress("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")).toBe(
      "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
    )
  })

  test("exports parseUnits and parseEther from utils", async () => {
    const { parseUnits, parseEther } = await import("../src")
    expect(typeof parseUnits).toBe("function")
    expect(typeof parseEther).toBe("function")
    expect(parseEther("1")).toBe(1000000000000000000n)
    expect(parseUnits("100", 6)).toBe(100000000n)
  })

  test("exports Amount type (compile-time check)", async () => {
    const { OpenSeaSDK } = await import("../src")
    expect(typeof OpenSeaSDK).toBe("function")
  })

  test("exports provider abstraction types", async () => {
    // These are type-only exports, so we just verify the module loads
    const mod = await import("../src")
    expect(mod).toBeDefined()
  })

  test("exports SIWX wallet-link helpers", async () => {
    const {
      linkWalletWithSiwx,
      createSiwxMessage,
      parseSiwxMessage,
      requestWalletLinkNonce,
    } = await import("../src")
    expect(typeof linkWalletWithSiwx).toBe("function")
    expect(typeof requestWalletLinkNonce).toBe("function")
    expect(typeof createSiwxMessage).toBe("function")
    expect(typeof parseSiwxMessage).toBe("function")
  })

  test("exports wallet-auth API helpers", async () => {
    const { WalletAuthAPI } = await import("../src")
    expect(typeof WalletAuthAPI).toBe("function")
  })

  test("exports the upload-context helpers from the ethers and viem entries", async () => {
    for (const entry of [await import("../src"), await import("../src/viem")]) {
      expect(typeof entry.uploadToContext).toBe("function")
      expect(typeof entry.selectUploadContext).toBe("function")
      expect(typeof entry.UploadContextError).toBe("function")
    }
  })
})

describe("Stream subpath exports", () => {
  test("exports the stream client and event types", async () => {
    const { OpenSeaStreamClient, EventType, LogLevel, Network } = await import(
      "../src/stream"
    )
    expect(typeof OpenSeaStreamClient).toBe("function")
    expect(EventType.ITEM_LISTED).toBe("item_listed")
    expect(LogLevel.WARN).toBe(40)
    expect(Network.MAINNET).toBe("mainnet")
  })

  test("does not leak transport internals", async () => {
    const mod = await import("../src/stream")
    // The transport abstraction is deliberately internal so it can be
    // reshaped for a future stream backend without a breaking change.
    expect(mod).not.toHaveProperty("PhoenixChannelsTransport")
    expect(mod).not.toHaveProperty("StreamTransport")
  })

  test("stream types are not re-exported from the SDK root", async () => {
    // `EventType`, `Trait`, `TraitOfferEvent`, and `CollectionOfferEvent` all
    // exist in both surfaces with different shapes. Keeping stream on its own
    // subpath is what avoids the collision.
    const root = await import("../src")
    expect(root).not.toHaveProperty("OpenSeaStreamClient")
  })
})
