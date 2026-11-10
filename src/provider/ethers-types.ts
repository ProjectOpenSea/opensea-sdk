/**
 * Structural types for the ethers values `OpenSeaSDK` accepts.
 *
 * ethers v6 ships separate ESM (`lib.esm`) and CommonJS (`lib.commonjs`) declarations. Their
 * classes carry private fields, so TypeScript treats a `Signer` or `JsonRpcProvider` from one build
 * as unrelated to the same type from the other, even though both describe the same objects. This
 * package is CommonJS, so its `ethers` types are the CommonJS copy, while an ESM project, or an ESM
 * library such as `@opensea/wallet-adapters/ethers`, hands over the ESM copy. See
 * https://github.com/ProjectOpenSea/opensea-sdk/issues/2039.
 *
 * The types below accept either build. Each picks the members whose declarations agree across the
 * two builds and writes the rest of what the SDK and seaport-js call without naming a
 * build-specific class. Neither the SDK nor seaport-js checks class identity at runtime.
 */
import type {
  JsonRpcProvider,
  Provider,
  Signer,
  TransactionRequest,
} from "ethers"

/** Provider members whose declarations are identical in both ethers builds. */
type SharedProviderMembers =
  | "getBlockNumber"
  | "getFeeData"
  | "getBalance"
  | "getTransactionCount"
  | "getCode"
  | "estimateGas"
  | "call"
  | "resolveName"
  | "lookupAddress"

/** Signer members whose declarations are identical in both ethers builds. */
type SharedSignerMembers =
  | "getAddress"
  | "estimateGas"
  | "call"
  | "resolveName"
  | "signTransaction"
  | "signMessage"
  | "signTypedData"

/** An ethers v6 `Provider` from either build. */
export interface EthersProviderLike
  extends Pick<Provider, SharedProviderMembers> {
  getNetwork(): Promise<{ readonly chainId: bigint }>
  waitForTransaction(
    hash: string,
    confirms?: number,
    timeout?: number,
  ): Promise<unknown>
}

/** An ethers v6 `Signer` from either build, such as `walletAdapterToEthersSigner(...)`. */
export interface EthersSignerLike extends Pick<Signer, SharedSignerMembers> {
  readonly provider: EthersProviderLike | null
  sendTransaction(tx: TransactionRequest): Promise<{
    readonly hash: string
    wait(confirms?: number, timeout?: number): Promise<unknown>
  }>
}

/**
 * An ethers v6 `JsonRpcProvider` from either build. seaport-js asks it for a signer when it is
 * given a provider rather than a signer.
 */
export interface EthersJsonRpcProviderLike
  extends EthersProviderLike,
    Pick<JsonRpcProvider, "send"> {
  getSigner(address?: number | string): Promise<EthersSignerLike>
}

/**
 * What `new OpenSeaSDK(...)` accepts: an ethers v6 `Signer` or `JsonRpcProvider` from either the
 * CommonJS or the ESM build.
 */
export type EthersSignerOrProvider =
  | Signer
  | JsonRpcProvider
  | EthersSignerLike
  | EthersJsonRpcProviderLike
