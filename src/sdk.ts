import { Seaport } from "@opensea/seaport-js"
import type { JsonRpcProvider, Signer } from "ethers"
import { OpenSeaAPI } from "./api/api"
import {
  createEthersContractCaller,
  createEthersWallet,
  getEthersAccounts,
} from "./provider/ethers-adapter"
import { BaseOpenSeaSDK } from "./sdk/base"
import { Chain, type OpenSeaAPIConfig } from "./types"
import {
  getDefaultConduit,
  getListingPaymentToken,
  getOfferPaymentToken,
  getOfferPaymentTokenDecimals,
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
   * @param signerOrProvider Signer or provider to use for transactions.
   * @param apiConfig configuration options, including `chain`
   * @param logger optional function for logging debug strings. defaults to no logging
   */
  constructor(
    signerOrProvider: Signer | JsonRpcProvider,
    apiConfig: OpenSeaAPIConfig = {},
    logger?: (arg: string) => void,
  ) {
    apiConfig.chain ??= Chain.Mainnet
    const chain = apiConfig.chain
    const api = new OpenSeaAPI(apiConfig)
    const resolvedLogger = logger ?? ((arg: string) => arg)

    const wallet = createEthersWallet(signerOrProvider)
    const contractCaller = createEthersContractCaller(signerOrProvider)

    const defaultConduit = getDefaultConduit(chain)
    const seaportAddress = getSeaportAddress(chain)
    const seaport = new Seaport(signerOrProvider, {
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
      getAvailableAccounts: () =>
        getEthersAccounts(signerOrProvider, resolvedLogger),
      cachedPaymentTokenDecimals,
    })
  }
}
