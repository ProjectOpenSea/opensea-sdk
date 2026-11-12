import { ethers } from "ethers"
import { createPublicClient, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { afterEach, describe, expect, test, vi } from "vitest"
import { OpenSeaSDK as EthersSDK } from "../../src"
import { ZERO_ADDRESS } from "../../src/constants"
import { Chain, OrderSide } from "../../src/types"
import { getChainId } from "../../src/utils/chain"
import { OpenSeaSDK as ViemSDK } from "../../src/viem"
import { sdk } from "../utils/sdk"

const OFFLINE_RPC_URL = "http://127.0.0.1:1"
const OFFERER_PRIVATE_KEY = `0x${"1".repeat(64)}` as const
const OFFERER = privateKeyToAccount(OFFERER_PRIVATE_KEY).address

const createEthersSDK = (chain: Chain) =>
  new EthersSDK(
    new ethers.Wallet(
      OFFERER_PRIVATE_KEY,
      new ethers.JsonRpcProvider(OFFLINE_RPC_URL, Number(getChainId(chain)), {
        staticNetwork: true,
      }),
    ),
    { chain },
  )

const createViemSDK = (chain: Chain) =>
  new ViemSDK(
    {
      publicClient: createPublicClient({ transport: http(OFFLINE_RPC_URL) }),
      walletClient: createWalletClient({
        account: privateKeyToAccount(OFFERER_PRIVATE_KEY),
        transport: http(OFFLINE_RPC_URL),
      }),
      rpcUrl: OFFLINE_RPC_URL,
    },
    { chain },
  )

type AnySDK = EthersSDK | ViemSDK

/**
 * Stub every dependency of `createOffer` except pricing, so the offer amount
 * handed to Seaport reflects the constructor-seeded decimals cache alone. The
 * collection carries no fees and no pricing currencies, so the offer uses the
 * chain's default offer currency.
 */
const stubOfferDependencies = (chainSDK: AnySDK) => {
  vi.spyOn(chainSDK.api.nfts, "getNFT").mockResolvedValue({
    nft: {
      identifier: "1234",
      collection: "test-collection",
      contract: "0x2222222222222222222222222222222222222222",
      tokenStandard: "erc721",
    },
  } as never)
  vi.spyOn(chainSDK.api.collections, "getCollection").mockResolvedValue({
    collection: "test-collection",
    fees: [],
  } as never)
  vi.spyOn(chainSDK.api.orders, "postOffer").mockResolvedValue({} as never)
  const createOrder = vi
    .spyOn(chainSDK.seaport, "createOrder")
    .mockResolvedValue({ executeAllActions: async () => ({}) } as never)
  const getPaymentToken = vi.spyOn(chainSDK.api.accounts, "getPaymentToken")
  return { createOrder, getPaymentToken }
}

const createDefaultCurrencyOffer = (chainSDK: AnySDK, amount: string) =>
  chainSDK.createOffer({
    asset: {
      tokenAddress: "0x2222222222222222222222222222222222222222",
      tokenId: "1234",
    },
    accountAddress: OFFERER,
    amount,
  })

describe("SDK: _getPriceParameters", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("throws the intended validation error when amount is null", async () => {
    await expect(
      (sdk as any)._getPriceParameters(OrderSide.LISTING, ZERO_ADDRESS, null),
    ).rejects.toThrow("Starting price must be a number >= 0")
  })

  test("uses payment token decimals and rejects excess precision", async () => {
    vi.spyOn(sdk.api.accounts, "getPaymentToken").mockResolvedValue({
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

  // Both entrypoints seed the decimals cache with the chain's default offer
  // currency, so the seed must carry the token's real precision: a wrong seed
  // is never corrected because the cache is consulted before token metadata.
  describe.each([
    ["ethers", createEthersSDK],
    ["viem", createViemSDK],
  ])("%s createOffer in the default offer currency", (_entrypoint, createSDK) => {
    test.each([
      [Chain.Arc, "0x3600000000000000000000000000000000000000"],
      [Chain.StableChain, "0x779ded0c9e1022225f8e0630b35a9b54be713736"],
    ])("offers 1.5 on %s as 1,500,000 base units of the six-decimal mirror", async (chain, mirrorAddress) => {
      const chainSDK = createSDK(chain)
      const { createOrder, getPaymentToken } = stubOfferDependencies(chainSDK)

      await createDefaultCurrencyOffer(chainSDK, "1.5")

      expect(createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          offer: [{ token: mirrorAddress, amount: "1500000" }],
        }),
        OFFERER,
      )
      expect(getPaymentToken).not.toHaveBeenCalled()
    })

    test("rejects more than six decimal places on Stable Chain", async () => {
      const chainSDK = createSDK(Chain.StableChain)
      stubOfferDependencies(chainSDK)

      await expect(
        createDefaultCurrencyOffer(chainSDK, "1.0000001"),
      ).rejects.toThrow("Too many decimal places")
    })

    test("offers 1.5 WETH on Mainnet as 1.5e18 base units", async () => {
      const chainSDK = createSDK(Chain.Mainnet)
      const { createOrder, getPaymentToken } = stubOfferDependencies(chainSDK)

      await createDefaultCurrencyOffer(chainSDK, "1.5")

      expect(createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          offer: [
            {
              token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
              amount: "1500000000000000000",
            },
          ],
        }),
        OFFERER,
      )
      expect(getPaymentToken).not.toHaveBeenCalled()
    })

    test("offers 1.5 WETH on Polygon as 1.5e18 base units", async () => {
      const chainSDK = createSDK(Chain.Polygon)
      const { createOrder, getPaymentToken } = stubOfferDependencies(chainSDK)

      await createDefaultCurrencyOffer(chainSDK, "1.5")

      expect(createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          offer: [
            {
              token: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
              amount: "1500000000000000000",
            },
          ],
        }),
        OFFERER,
      )
      expect(getPaymentToken).not.toHaveBeenCalled()
    })
  })
})
