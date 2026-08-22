/**
 * Bridge that wraps viem clients as an ethers-compatible Signer for seaport-js.
 * seaport-js only accepts ethers Signer | JsonRpcProvider, so we need this shim.
 */
import {
  AbstractSigner,
  JsonRpcProvider,
  type TransactionRequest,
  type TransactionResponse,
} from "ethers"
import type { ViemAdapterParams } from "./viem-adapter"

/**
 * Creates an ethers-compatible Signer from viem clients, for use with seaport-js.
 * If only a publicClient is provided (no walletClient), returns a read-only JsonRpcProvider.
 */
export function createSeaportBridge(
  params: ViemAdapterParams,
  logger?: (msg: string) => void,
): AbstractSigner | JsonRpcProvider {
  const { publicClient, walletClient, rpcUrl: explicitRpcUrl } = params

  // We need the chain's RPC URL to create an ethers provider for seaport-js.
  // Prefer an explicit rpcUrl if provided (needed for non-HTTP transports).
  // Otherwise, extract it from the viem transport's internal properties.
  // NOTE: transport.url / transport.value.url are viem internals that may
  // change across viem versions.
  const transport = (publicClient as any).transport
  const detectedUrl = transport?.url ?? transport?.value?.url
  const rpcUrl = explicitRpcUrl ?? detectedUrl
  if (!rpcUrl) {
    throw new Error(
      "OpenSeaSDK viem entry point requires an HTTP RPC URL. " +
        "Either use `http(url)` when creating your publicClient, or pass " +
        "`rpcUrl` explicitly in the constructor params.",
    )
  }
  if (!explicitRpcUrl && detectedUrl && logger) {
    logger(
      "Seaport bridge: auto-detected RPC URL from viem transport internals. " +
        "Pass `rpcUrl` explicitly for stability across viem versions.",
    )
  }

  const ethersProvider = new JsonRpcProvider(rpcUrl)

  if (!walletClient) {
    return ethersProvider
  }

  return new ViemEthersSigner(walletClient, ethersProvider)
}

/** Infer the EIP-712 root struct: the named type no other struct references. */
function inferPrimaryType(types: Record<string, Array<{ type: string }>>): string {
  const namedTypes = Object.keys(types).filter(key => key !== "EIP712Domain")
  const referencedTypes = new Set<string>()

  for (const fields of Object.values(types)) {
    for (const field of fields) {
      // Strip any array suffix before checking whether this field references a
      // named struct (e.g. Person[] -> Person).
      const referencedType = field.type.replace(/\[[^\]]*\]$/g, "")
      if (namedTypes.includes(referencedType)) {
        referencedTypes.add(referencedType)
      }
    }
  }

  return namedTypes.find(type => !referencedTypes.has(type)) ?? namedTypes[0] ?? ""
}

/**
 * Minimal ethers AbstractSigner implementation backed by a viem WalletClient.
 * Implements the methods that seaport-js calls: getAddress, sendTransaction,
 * signMessage, and signTypedData.
 *
 * sendTransaction is overridden to use viem's walletClient.sendTransaction directly,
 * bypassing ethers' default signTransaction + broadcastTransaction flow (similar to
 * how ethers' own JsonRpcSigner overrides it to use eth_sendTransaction).
 */
class ViemEthersSigner extends AbstractSigner {
  private _walletClient: any

  constructor(walletClient: any, provider: JsonRpcProvider) {
    super(provider)
    this._walletClient = walletClient
  }

  async getAddress(): Promise<string> {
    if (!this._walletClient.account) {
      throw new Error("WalletClient must have an account")
    }
    return this._walletClient.account.address
  }

  // seaport-js checks `.address` property directly on the signer.
  // Throw if no account is set rather than returning empty string,
  // which could cause subtle bugs in truthy checks.
  get address(): string {
    if (!this._walletClient.account?.address) {
      throw new Error(
        "WalletClient must have an account. Use `createWalletClient` with an `account` parameter.",
      )
    }
    return this._walletClient.account.address
  }

  /**
   * Override sendTransaction to delegate to viem's walletClient.sendTransaction.
   * This bypasses AbstractSigner's default flow (signTransaction → broadcastTransaction)
   * since viem handles signing internally via the wallet.
   */
  async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
    const hash = await this._walletClient.sendTransaction({
      to: tx.to as `0x${string}`,
      data: tx.data as `0x${string}` | undefined,
      value: tx.value != null ? BigInt(tx.value.toString()) : undefined,
      // Forward gas parameters when provided by seaport-js or callers
      gas: tx.gasLimit != null ? BigInt(tx.gasLimit.toString()) : undefined,
      gasPrice:
        tx.gasPrice != null ? BigInt(tx.gasPrice.toString()) : undefined,
      maxFeePerGas:
        tx.maxFeePerGas != null
          ? BigInt(tx.maxFeePerGas.toString())
          : undefined,
      maxPriorityFeePerGas:
        tx.maxPriorityFeePerGas != null
          ? BigInt(tx.maxPriorityFeePerGas.toString())
          : undefined,
      nonce: tx.nonce != null ? Number(tx.nonce) : undefined,
      account: this._walletClient.account,
      chain: this._walletClient.chain,
    })

    // Return an ethers-compatible TransactionResponse by fetching from the provider
    const provider = this.provider
    if (!provider) {
      throw new Error("Provider is required to fetch transaction response")
    }
    const response = await provider.getTransaction(hash)
    if (!response) {
      // Fallback: construct minimal response if the tx isn't indexed yet
      return {
        hash,
        wait: () => provider.waitForTransaction(hash),
      } as unknown as TransactionResponse
    }
    return response
  }

  async signTransaction(): Promise<string> {
    throw new Error(
      "signTransaction is not supported via the viem bridge. " +
        "sendTransaction is overridden to delegate to viem directly.",
    )
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    return this._walletClient.signMessage({
      message: typeof message === "string" ? message : { raw: message as any },
      account: this._walletClient.account,
    })
  }

  async signTypedData(domain: any, types: any, value: any): Promise<string> {
    const primaryType = inferPrimaryType(types)

    return this._walletClient.signTypedData({
      domain: {
        ...domain,
        chainId: domain.chainId ? Number(domain.chainId) : undefined,
      },
      types,
      primaryType,
      message: value,
      account: this._walletClient.account,
    })
  }

  connect(): ViemEthersSigner {
    return this
  }
}
