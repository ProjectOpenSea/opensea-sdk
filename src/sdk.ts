import { Seaport } from "@opensea/seaport-js"
import type { JsonRpcProvider, Signer } from "ethers"
import { OpenSeaAPI } from "./api/api"
import {
  createEthersContractCaller,
  createEthersWallet,
  getEthersAccounts,
} from "./provider/ethers-adapter"
import type { EthersSignerOrProvider } from "./provider/ethers-types"
import { BaseOpenSeaSDK } from "./sdk/base"
import { Chain, type OpenSeaAPIConfig } from "./types"
import {
  getDefaultConduit,
  getDefaultPaymentTokenDecimals,
  getSeaportAddress,
} from "./utils/utils"

/**
 * The OpenSea SDK main class (ethers entry point).
 *
 * @example
 * ```ts
 * import { ethers } from 'ethers'
 * import { OpenSeaSDK, Chain } from '@opensea/sdk'
 *
 * const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io')
 * const sdk = new OpenSeaSDK(provider, { chain: Chain.Mainnet, apiKey: 'YOUR_KEY' })
 * ```
 *
 * @category Main Classes
 */
export class OpenSeaSDK extends BaseOpenSeaSDK {
  /**
   * Create a new instance of OpenSeaSDK.
   * @param signerOrProvider Signer or provider to use for transactions, from either the CommonJS or
   * the ESM build of ethers.
   * @param apiConfig configuration options, including `chain`
   * @param logger optional function for logging debug strings. defaults to no logging
   */
  constructor(
    signerOrProvider: EthersSignerOrProvider,
    apiConfig: OpenSeaAPIConfig = {},
    logger?: (arg: string) => void,
  ) {
    // The ESM build's classes are the same objects at runtime; see EthersSignerOrProvider.
    const runner = signerOrProvider as Signer | JsonRpcProvider
    apiConfig.chain ??= Chain.Mainnet
    const chain = apiConfig.chain
    const api = new OpenSeaAPI(apiConfig)
    const resolvedLogger = logger ?? ((arg: string) => arg)

    const wallet = createEthersWallet(runner)
    const contractCaller = createEthersContractCaller(runner)

    const defaultConduit = getDefaultConduit(chain)
    const seaportAddress = getSeaportAddress(chain)
    const seaport = new Seaport(runner, {
      conduitKeyToConduit: {
        [defaultConduit.key]: defaultConduit.address,
      },
      overrides: {
        defaultConduitKey: defaultConduit.key,
        contractAddress: seaportAddress,
      },
    })

    super({
      wallet,
      contractCaller,
      seaport,
      api,
      chain,
      logger: resolvedLogger,
      getAvailableAccounts: () => getEthersAccounts(runner, resolvedLogger),
      cachedPaymentTokenDecimals: getDefaultPaymentTokenDecimals(chain),
    })
  }
}
