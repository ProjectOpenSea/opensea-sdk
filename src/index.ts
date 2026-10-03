import { OpenSeaAPI } from "./api/api"
import { OpenSeaAuth } from "./auth"
import { OpenSeaOAuth } from "./auth/oauth"
import { OpenSeaSDK } from "./sdk"

export * from "./api/types"
export * from "./api/walletAuth"
export * from "./auth"
export * from "./auth/oauth"
export * from "./auth/oauth-types"
export * from "./constants"
export * from "./orders/types"
export type {
  ContractCaller,
  OpenSeaProvider,
  OpenSeaSigner,
  OpenSeaWallet,
  TransactionResponse,
} from "./provider/types"
export * from "./scopes"
export * from "./types"
export * from "./utils"
/**
 * @example
 * // Example Setup
 * ```ts
 * import { ethers } from 'ethers'
 * import { OpenSeaSDK, Chain } from '@opensea/sdk'
 * const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io')
 * const client = new OpenSeaSDK(provider, {
 *   chain: Chain.Mainnet,
 *   apiKey: 'YOUR_OPENSEA_API_KEY',
 * })
 * ```
 */
export {
  // API client (for direct use or accessing static helpers like
  // `OpenSeaAPI.requestInstantApiKey()`)
  OpenSeaAPI,
  // Auth helper for SIWE-based wallet authentication
  OpenSeaAuth,
  // OAuth 2.1 (code + PKCE / device) helper for keyless login
  OpenSeaOAuth,
  // Main SDK export
  OpenSeaSDK,
}
