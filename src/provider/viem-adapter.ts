/**
 * Viem adapter — wraps viem WalletClient/PublicClient into the SDK's abstract interfaces.
 *
 * viem is an optional peerDependency and a devDependency (for type-checking).
 * This module is only executed at runtime by code importing from "@opensea/sdk/viem",
 * which requires viem to be installed.
 */
import {
  type PublicClient,
  encodeFunctionData as viemEncodeFunctionData,
  type WalletClient,
} from "viem"
import type {
  ContractCaller,
  OpenSeaProvider,
  OpenSeaSigner,
  OpenSeaWallet,
  TransactionResponse,
} from "./types"

export interface ViemAdapterParams {
  publicClient: PublicClient
  walletClient?: WalletClient
  /**
   * Explicit RPC URL for seaport-js (which requires an ethers provider internally).
   * If not provided, the SDK attempts to extract the URL from the publicClient's
   * HTTP transport. Required when using non-HTTP transports (WebSocket, custom).
   */
  rpcUrl?: string
}

/**
 * Creates an OpenSeaWallet from viem clients.
 */
export function createViemWallet(params: ViemAdapterParams): OpenSeaWallet {
  const provider = createViemProvider(params.publicClient)

  if (params.walletClient) {
    return {
      signer: createViemSigner(params.walletClient, params.publicClient),
      provider,
    }
  }

  return { provider }
}

function createViemSigner(
  walletClient: WalletClient,
  publicClient: PublicClient,
): OpenSeaSigner {
  return {
    async getAddress() {
      if (!walletClient.account) {
        throw new Error(
          "WalletClient must have an account. Use `createWalletClient` with an `account` parameter.",
        )
      }
      return walletClient.account.address
    },

    async sendTransaction(tx) {
      if (!walletClient.account) {
        throw new Error(
          "WalletClient must have an account. Use `createWalletClient` with an `account` parameter.",
        )
      }
      const hash = await walletClient.sendTransaction({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}` | undefined,
        value: tx.value,
        account: walletClient.account,
        chain: walletClient.chain,
        ...(tx.overrides as any),
      })
      return {
        hash,
        async wait() {
          await publicClient.waitForTransactionReceipt({ hash })
        },
      }
    },

    async signTypedData(domain, types, value) {
      if (!walletClient.account) {
        throw new Error(
          "WalletClient must have an account. Use `createWalletClient` with an `account` parameter.",
        )
      }
      return walletClient.signTypedData({
        domain: {
          chainId: domain.chainId != null ? Number(domain.chainId) : undefined,
          name: domain.name,
          version: domain.version,
          verifyingContract: domain.verifyingContract as `0x${string}`,
        },
        types,
        primaryType:
          Object.keys(types).find(key => key !== "EIP712Domain") ||
          Object.keys(types)[0],
        message: value,
        account: walletClient.account,
      })
    },
  }
}

function createViemProvider(publicClient: PublicClient): OpenSeaProvider {
  return {
    async waitForTransaction(hash: string) {
      await publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`,
      })
    },
  }
}

/**
 * Creates a ContractCaller using viem clients.
 */
export function createViemContractCaller(
  params: ViemAdapterParams,
): ContractCaller {
  const { publicClient, walletClient } = params

  return {
    async readContract({ address, abi, functionName, args }) {
      return publicClient.readContract({
        address: address as `0x${string}`,
        abi: abi as any,
        functionName,
        args: args as any,
      })
    },

    async writeContract({
      address,
      abi,
      functionName,
      args,
      value,
      overrides,
    }): Promise<TransactionResponse> {
      if (!walletClient) {
        throw new Error("A WalletClient is required for write operations")
      }
      if (!walletClient.account) {
        throw new Error(
          "WalletClient must have an account. Use `createWalletClient` with an `account` parameter.",
        )
      }
      const hash = await walletClient.writeContract({
        address: address as `0x${string}`,
        abi: abi as any,
        functionName,
        args: args as any,
        value,
        account: walletClient.account,
        chain: walletClient.chain,
        ...(overrides as any),
      })
      return {
        hash,
        async wait() {
          await publicClient.waitForTransactionReceipt({
            hash: hash as `0x${string}`,
          })
        },
      }
    },

    encodeFunctionData({ abi, functionName, args }) {
      return viemEncodeFunctionData({
        abi: abi as any,
        functionName,
        args: args as any,
      })
    },
  }
}
