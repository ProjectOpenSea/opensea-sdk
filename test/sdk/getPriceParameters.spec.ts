import { ethers } from "ethers"
import { createPublicClient, defineChain, http } from "viem"
import { describe, expect, test, vi } from "vitest"
import { OpenSeaSDK } from "../../src"
import { ZERO_ADDRESS } from "../../src/constants"
import { Chain, OrderSide } from "../../src/types"
import { getChainId, getOfferPaymentToken } from "../../src/utils"
import { OpenSeaSDK as ViemSDK } from "../../src/viem"
import { sdk } from "../utils/sdk"

describe("SDK: _getPriceParameters", () => {
  test("throws the intended validation error when amount is null", async () => {
    await expect(
      (sdk as any)._getPriceParameters(OrderSide.LISTING, ZERO_ADDRESS, null),
    ).rejects.toThrow("Starting price must be a number >= 0")
  })

  test("uses payment token decimals and rejects excess precision", async () => {
    vi.spyOn(sdk.api, "getPaymentToken").mockResolvedValue({
      decimals: 6,
    } as never)
    const mirrorAddress = "0x779ded0c9e1022225f8e0630b35a9b54be713736"

    await expect(
      (sdk as any)._getPriceParameters(OrderSide.OFFER, mirrorAddress, "1.5"),
    ).resolves.toEqual({ basePrice: 1500000n })
    await expect(
      (sdk as any)._getPriceParameters(
        OrderSide.OFFER,
        mirrorAddress,
        "1.0000001",
      ),
    ).rejects.toThrow("Too many decimal places")
  })

  describe.each([
    ["Arc", Chain.Arc],
    ["Stable Chain", Chain.StableChain],
  ])("%s default offer currency", (_name, chain) => {
    const chainId = Number(getChainId(chain))
    const rpcUrl = "http://127.0.0.1:1"

    test.each([
      [
        "ethers",
        () =>
          new OpenSeaSDK(
            new ethers.JsonRpcProvider(rpcUrl, chainId, {
              staticNetwork: true,
            }),
            { chain },
          ),
      ],
      [
        "viem",
        () => {
          const viemChain = defineChain({
            id: chainId,
            name: chain,
            nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
            rpcUrls: { default: { http: [rpcUrl] } },
          })
          return new ViemSDK(
            {
              publicClient: createPublicClient({
                chain: viemChain,
                transport: http(rpcUrl),
              }),
              rpcUrl,
            },
            { chain },
          )
        },
      ],
    ])("uses six decimals with the %s entrypoint", async (_entrypoint, createSDK) => {
      const chainSDK = createSDK()
      const getPaymentToken = vi.spyOn(chainSDK.api, "getPaymentToken")

      await expect(
        (chainSDK as any)._getPriceParameters(
          OrderSide.OFFER,
          getOfferPaymentToken(chain),
          "1.5",
        ),
      ).resolves.toEqual({ basePrice: 1500000n })
      expect(getPaymentToken).not.toHaveBeenCalled()
    })
  })
})
