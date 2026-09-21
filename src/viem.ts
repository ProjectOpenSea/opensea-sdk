/**
 * Viem entry point for the OpenSea SDK.
 *
 * @example
 * ```ts
 * import { createPublicClient, createWalletClient, http } from 'viem'
 * import { mainnet } from 'viem/chains'
 * import { OpenSeaSDK, Chain } from '@opensea/sdk/viem'
 *
 * const publicClient = createPublicClient({ chain: mainnet, transport: http() })
 * const walletClient = createWalletClient({ chain: mainnet, transport: http(), account: '0x...' })
 *
 * const sdk = new OpenSeaSDK(
 *   { publicClient, walletClient },
 *   { chain: Chain.Mainnet, apiKey: 'YOUR_API_KEY' },
 * )
 * ```
 */

// seaport-js has a hard dependency on ethers, so importing it pulls ethers
// into the bundle. This is a known tradeoff — see FAQ for details.
import { Seaport } from "@opensea/seaport-js"
import { OpenSeaAPI } from "./api/api"
import { createSeaportBridge } from "./provider/seaport-bridge"
import {
  createViemContractCaller,
  createViemWallet,
  type ViemAdapterParams,
} from "./provider/viem-adapter"
import { BaseOpenSeaSDK } from "./sdk/base"
import { Chain, type OpenSeaAPIConfig } from "./types"
import { checksumAddress } from "./utils/address"
import {
  getDefaultConduit,
  getListingPaymentToken,
  getOfferPaymentToken,
  getOfferPaymentTokenDecimals,
  getSeaportAddress,
} from "./utils/utils"

// Re-export everything from the main entry point
export { OpenSeaAPI } from "./api/api"
export * from "./api/types"
export * from "./api/walletAuth"
export * from "./auth"
export * from "./constants"
export * from "./orders/types"
export type {
  ContractCaller,
  OpenSeaProvider,
  OpenSeaSigner,
  OpenSeaWallet,
  TransactionResponse,
} from "./provider/types"
export * from "./types"
export * from "./utils"

/**
 * OpenSea SDK for use with viem.
 *
 * Accepts viem `PublicClient` and optional `WalletClient` instead of ethers types.
 * The public API surface is identical to the ethers entry point.
 *
 * @category Main Classes
 */
export class OpenSeaSDK extends BaseOpenSeaSDK {
  /**
   * Create a new instance of OpenSeaSDK using viem clients.
   * @param viemClients The viem PublicClient and optional WalletClient
   * @param apiConfig Configuration options, including `chain`
   * @param logger Optional function for logging debug strings
   */
  constructor(
    viemClients: ViemAdapterParams,
    apiConfig: OpenSeaAPIConfig = {},
    logger?: (arg: string) => void,
  ) {
    apiConfig.chain ??= Chain.Mainnet
    const chain = apiConfig.chain
    const api = new OpenSeaAPI(apiConfig)
    const resolvedLogger = logger ?? ((arg: string) => arg)

    const wallet = createViemWallet(viemClients)
    const contractCaller = createViemContractCaller(viemClients)

    // Create ethers-compatible signer/provider for seaport-js
    const seaportSignerOrProvider = createSeaportBridge(
      viemClients,
      resolvedLogger,
    )

    const defaultConduit = getDefaultConduit(chain)
    const seaportAddress = getSeaportAddress(chain)
    const seaport = new Seaport(seaportSignerOrProvider, {
      conduitKeyToConduit: {
        [defaultConduit.key]: defaultConduit.address,
      },
      overrides: {
        defaultConduitKey: defaultConduit.key,
        contractAddress: seaportAddress,
      },
    })

    const cachedPaymentTokenDecimals: { [address: string]: number } = {}
    cachedPaymentTokenDecimals[getOfferPaymentToken(chain).toLowerCase()] =
      getOfferPaymentTokenDecimals(chain)
    cachedPaymentTokenDecimals[getListingPaymentToken(chain).toLowerCase()] = 18

    super({
      wallet,
      contractCaller,
      seaport,
      api,
      chain,
      logger: resolvedLogger,
      getAvailableAccounts: async () => {
        if ("signer" in wallet) {
          try {
            const address = await wallet.signer.getAddress()
            return [checksumAddress(address)]
          } catch {
            return []
          }
        }
        return []
      },
      cachedPaymentTokenDecimals,
    })
  }
}
