/**
 * Ethers v6 adapter: wraps an ethers Signer/Provider in the SDK's abstract interfaces.
 */
import {
  Contract,
  ethers as ethersLib,
  type JsonRpcProvider,
  type Signer,
} from "ethers"
import type {
  ContractCaller,
  OpenSeaProvider,
  OpenSeaSigner,
  OpenSeaWallet,
  TransactionResponse,
} from "./types"

/**
 * Creates an OpenSeaWallet from an ethers Signer or JsonRpcProvider.
 */
export function createEthersWallet(
  signerOrProvider: Signer | JsonRpcProvider,
): OpenSeaWallet {
  const provider = createEthersProvider(signerOrProvider)

  if (isEthersSigner(signerOrProvider)) {
    return {
      signer: createEthersSigner(signerOrProvider),
      provider,
    }
  }

  return { provider }
}

/**
 * Creates an OpenSeaSigner from an ethers Signer.
 */
function createEthersSigner(signer: Signer): OpenSeaSigner {
  return {
    async getAddress(): Promise<string> {
      if ("address" in signer) {
        return signer.address as string
      }
      return signer.getAddress()
    },

    async sendTransaction(tx) {
      const ethTx = await signer.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value,
        from: tx.from,
        ...tx.overrides,
      })
      return {
        hash: ethTx.hash,
        async wait() {
          await ethTx.wait()
        },
      }
    },

    async signTypedData(domain, types, value) {
      if (typeof (signer as any).signTypedData !== "function") {
        throw new Error(
          "The provided signer does not support signTypedData. Please use an ethers Signer that supports EIP-712 signing.",
        )
      }
      return (signer as any).signTypedData(domain, types, value)
    },
  }
}

/**
 * Creates an OpenSeaProvider from an ethers Signer or JsonRpcProvider.
 */
function createEthersProvider(
  signerOrProvider: Signer | JsonRpcProvider,
): OpenSeaProvider {
  const provider = isEthersSigner(signerOrProvider)
    ? (signerOrProvider.provider as JsonRpcProvider)
    : signerOrProvider

  if (!provider) {
    throw new Error(
      "Signer must be connected to a provider. " +
        "Use `signer.connect(provider)` or pass a JsonRpcProvider directly.",
    )
  }

  return {
    async waitForTransaction(hash: string) {
      await provider.waitForTransaction(hash)
    },
  }
}

/**
 * Creates a ContractCaller using ethers Contract.
 */
export function createEthersContractCaller(
  signerOrProvider: Signer | JsonRpcProvider,
): ContractCaller {
  const readProvider = isEthersSigner(signerOrProvider)
    ? (signerOrProvider.provider as JsonRpcProvider)
    : signerOrProvider

  if (!readProvider) {
    throw new Error(
      "Signer must be connected to a provider. " +
        "Use `signer.connect(provider)` or pass a JsonRpcProvider directly.",
    )
  }

  return {
    async readContract({ address, abi, functionName, args }) {
      const contract = new Contract(address, abi as any[], readProvider)
      return contract[functionName].staticCall(...args)
    },

    async writeContract({
      address,
      abi,
      functionName,
      args,
      value,
      overrides,
    }): Promise<TransactionResponse> {
      const contract = new Contract(address, abi as any[], signerOrProvider)
      const txArgs = [...args]
      if (value !== undefined || overrides) {
        txArgs.push({ ...overrides, value })
      }
      const tx = await contract[functionName](...txArgs)
      return {
        hash: tx.hash,
        async wait() {
          await tx.wait()
        },
      }
    },

    encodeFunctionData({ abi, functionName, args }) {
      const iface = new ethersLib.Interface(abi as any[])
      return iface.encodeFunctionData(functionName, args)
    },
  }
}

/**
 * Get available accounts from an ethers Signer or JsonRpcProvider.
 */
export async function getEthersAccounts(
  signerOrProvider: Signer | JsonRpcProvider,
  logger: (msg: string) => void,
): Promise<string[]> {
  const accounts: string[] = []
  try {
    if ("address" in signerOrProvider) {
      accounts.push(signerOrProvider.address as string)
    } else if ("listAccounts" in signerOrProvider) {
      const listed = (
        await (signerOrProvider as JsonRpcProvider).listAccounts()
      ).map(acct => acct.address)
      accounts.push(...listed)
    } else if ("getAddress" in signerOrProvider) {
      accounts.push(await (signerOrProvider as Signer).getAddress())
    }
  } catch (error) {
    logger(
      `Failed to get available accounts: ${error instanceof Error ? error.message : error}`,
    )
  }
  return accounts
}

function isEthersSigner(
  signerOrProvider: Signer | JsonRpcProvider,
): signerOrProvider is Signer {
  return "signTransaction" in signerOrProvider
}
