import {
  APPROVE_ABI,
  ERC20_ABI,
  ERC721_ABI,
  ERC1155_ABI,
  SET_APPROVAL_FOR_ALL_ABI,
  TRANSFER_HELPER_ABI,
} from "../abi/abis"
import { MAX_UINT256, TRANSFER_HELPER_ADDRESS } from "../constants"
import {
  type Amount,
  type AssetWithTokenStandard,
  EventType,
  TokenStandard,
} from "../types"
import { getDefaultConduit } from "../utils/utils"
import type { SDKContext } from "./context"

type TransferHelperItem = {
  itemType: number
  token: string
  identifier: string
  amount: string
}

/**
 * Combines entries for the same ERC20 (compared case-insensitively) into one
 * entry with the summed amount, keeping first-seen order. The conduit pulls the
 * total, so an allowance check per entry passes two transfers of 60 against an
 * allowance of 100 that then revert onchain.
 */
function mergeErc20Amounts<
  T extends { asset: AssetWithTokenStandard; amount?: Amount },
>(entries: T[]): T[] {
  const merged: T[] = []
  const erc20Index = new Map<string, number>()
  for (const entry of entries) {
    if (entry.asset.tokenStandard !== TokenStandard.ERC20 || !entry.amount) {
      merged.push(entry)
      continue
    }
    const key = entry.asset.tokenAddress.toLowerCase()
    const index = erc20Index.get(key)
    if (index === undefined) {
      erc20Index.set(key, merged.length)
      merged.push(entry)
      continue
    }
    const existing = merged[index]
    merged[index] = {
      ...existing,
      amount: (
        BigInt(String(existing.amount)) + BigInt(String(entry.amount))
      ).toString(),
    }
  }
  return merged
}

/**
 * Asset transfer and approval operations
 */
export class AssetsManager {
  constructor(private context: SDKContext) {}

  /**
   * Get an account's balance of any Asset. This asset can be an ERC20, ERC1155, or ERC721.
   * @param options
   * @param options.accountAddress Account address to check
   * @param options.asset The Asset to check balance for. tokenStandard must be set.
   * @returns The balance of the asset for the account.
   *
   * @throws Error if the token standard does not support balanceOf.
   */
  async getBalance({
    accountAddress,
    asset,
  }: {
    accountAddress: string
    asset: AssetWithTokenStandard
  }): Promise<bigint> {
    const cc = this.context.contractCaller

    switch (asset.tokenStandard) {
      case TokenStandard.ERC20: {
        return (await cc.readContract({
          address: asset.tokenAddress,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [accountAddress],
        })) as bigint
      }
      case TokenStandard.ERC1155: {
        if (asset.tokenId === undefined || asset.tokenId === null) {
          throw new Error("Missing ERC1155 tokenId for getBalance")
        }
        return (await cc.readContract({
          address: asset.tokenAddress,
          abi: ERC1155_ABI,
          functionName: "balanceOf",
          args: [accountAddress, asset.tokenId],
        })) as bigint
      }
      case TokenStandard.ERC721: {
        if (asset.tokenId === undefined || asset.tokenId === null) {
          throw new Error("Missing ERC721 tokenId for getBalance")
        }
        try {
          const owner = (await cc.readContract({
            address: asset.tokenAddress,
            abi: ERC721_ABI,
            functionName: "ownerOf",
            args: [asset.tokenId],
          })) as string
          return BigInt(owner.toLowerCase() === accountAddress.toLowerCase())
        } catch (error: any) {
          this.context.logger(
            `Failed to get ownerOf ERC721: ${error.message ?? error}`,
          )
          return 0n
        }
      }
      default:
        throw new Error("Unsupported token standard for getBalance")
    }
  }

  /**
   * Transfer an asset. This asset can be an ERC20, ERC1155, or ERC721.
   * @param options
   * @param options.asset The Asset to transfer. tokenStandard must be set.
   * @param options.amount Amount of asset to transfer. Not used for ERC721.
   * @param options.fromAddress The address to transfer from
   * @param options.toAddress The address to transfer to
   * @param options.overrides Transaction overrides, ignored if not set.
   */
  async transfer({
    asset,
    amount,
    fromAddress,
    toAddress,
    overrides,
  }: {
    asset: AssetWithTokenStandard
    amount?: Amount
    fromAddress: string
    toAddress: string
    overrides?: Record<string, unknown>
  }): Promise<void> {
    const cc = this.context.contractCaller
    const txOverrides = { ...overrides, from: fromAddress }

    let txPromise: Promise<{ hash: string; wait(): Promise<void> }>

    switch (asset.tokenStandard) {
      case TokenStandard.ERC20: {
        if (!amount) {
          throw new Error("Missing ERC20 amount for transfer")
        }
        txPromise = cc.writeContract({
          address: asset.tokenAddress,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [toAddress, amount],
          overrides: txOverrides,
        })
        break
      }
      case TokenStandard.ERC1155: {
        if (asset.tokenId === undefined || asset.tokenId === null) {
          throw new Error("Missing ERC1155 tokenId for transfer")
        }
        if (!amount) {
          throw new Error("Missing ERC1155 amount for transfer")
        }
        txPromise = cc.writeContract({
          address: asset.tokenAddress,
          abi: ERC1155_ABI,
          functionName: "safeTransferFrom",
          args: [fromAddress, toAddress, asset.tokenId, amount, "0x"],
          overrides: txOverrides,
        })
        break
      }
      case TokenStandard.ERC721: {
        if (asset.tokenId === undefined || asset.tokenId === null) {
          throw new Error("Missing ERC721 tokenId for transfer")
        }
        txPromise = cc.writeContract({
          address: asset.tokenAddress,
          abi: ERC721_ABI,
          functionName: "transferFrom",
          args: [fromAddress, toAddress, asset.tokenId],
          overrides: txOverrides,
        })
        break
      }
      default:
        throw new Error("Unsupported token standard for transfer")
    }

    try {
      const transactionResponse = await txPromise
      await this.context.confirmTransaction(
        transactionResponse.hash,
        EventType.Transfer,
        "Transferring asset",
      )
    } catch (error) {
      console.error(error)
      this.context.dispatch(EventType.TransactionDenied, {
        error,
        accountAddress: fromAddress,
      })
    }
  }

  /**
   * Bulk transfer multiple assets using OpenSea's TransferHelper contract.
   * Uses less gas than calling transfer() for each asset.
   * All assets must be approved for transfer to the OpenSea conduit first.
   * @param options
   * @param options.assets Array of assets to transfer. Each asset must have tokenStandard set.
   * @param options.fromAddress The address to transfer from
   * @param options.overrides Transaction overrides, ignored if not set.
   * @returns Transaction hash of the bulk transfer
   *
   * @throws Error if any asset is missing required fields (tokenId for NFTs, amount for ERC20/ERC1155).
   * @throws Error if any asset is not approved for transfer to the OpenSea conduit.
   * @throws Error if the fromAddress is not available through wallet or provider.
   */
  async bulkTransfer({
    assets,
    fromAddress,
    overrides,
  }: {
    assets: Array<{
      asset: AssetWithTokenStandard
      toAddress: string
      amount?: Amount
    }>
    fromAddress: string
    overrides?: Record<string, unknown>
  }): Promise<string> {
    // Validate basic parameters before making any blockchain calls
    if (assets.length === 0) {
      throw new Error("At least one asset must be provided")
    }

    // Validate asset data and group transfer items per recipient, the shape
    // TransferHelper.bulkTransfer takes. This validation happens before any
    // blockchain calls to ensure proper error messages.
    const itemsByRecipient = new Map<
      string,
      {
        items: TransferHelperItem[]
        recipient: string
        validateERC721Receiver: boolean
      }
    >()

    for (const { asset, toAddress, amount } of assets) {
      let itemType: number
      let identifier: string
      let transferAmount: string

      switch (asset.tokenStandard) {
        case TokenStandard.ERC20:
          itemType = 1 // ERC20
          identifier = "0"
          if (!amount) {
            throw new Error("Missing ERC20 amount for bulk transfer")
          }
          transferAmount = amount.toString()
          break

        case TokenStandard.ERC721:
          itemType = 2 // ERC721
          if (asset.tokenId === undefined || asset.tokenId === null) {
            throw new Error("Missing ERC721 tokenId for bulk transfer")
          }
          identifier = asset.tokenId.toString()
          transferAmount = "1"
          break

        case TokenStandard.ERC1155:
          itemType = 3 // ERC1155
          if (asset.tokenId === undefined || asset.tokenId === null) {
            throw new Error("Missing ERC1155 tokenId for bulk transfer")
          }
          if (!amount) {
            throw new Error("Missing ERC1155 amount for bulk transfer")
          }
          identifier = asset.tokenId.toString()
          transferAmount = amount.toString()
          break

        default:
          throw new Error(
            `Unsupported token standard for bulk transfer: ${asset.tokenStandard}`,
          )
      }

      const recipientKey = toAddress.toLowerCase()
      let group = itemsByRecipient.get(recipientKey)
      if (!group) {
        // false matches transfer(), which sends ERC721s with transferFrom.
        // true would also call onERC721Received on any recipient with code,
        // including EIP-7702 delegated EOAs whose delegate lacks the hook.
        group = {
          items: [],
          recipient: toAddress,
          validateERC721Receiver: false,
        }
        itemsByRecipient.set(recipientKey, group)
      }
      group.items.push({
        itemType,
        token: asset.tokenAddress,
        identifier,
        amount: transferAmount,
      })
    }
    const transferItems = [...itemsByRecipient.values()]

    // Check account availability after parameter validation
    await this.context.requireAccountIsAvailable(fromAddress)

    // Get the chain-specific default conduit
    const defaultConduit = getDefaultConduit(this.context.chain)

    // Check approvals for all assets before attempting transfer
    const unapprovedAssets: string[] = []
    for (const { asset, amount } of mergeErc20Amounts(assets)) {
      const isApproved = await this.checkAssetApproval(
        asset,
        fromAddress,
        defaultConduit.address,
        amount,
      )
      if (!isApproved) {
        const assetIdentifier =
          asset.tokenId !== undefined
            ? `${asset.tokenAddress}:${asset.tokenId}`
            : asset.tokenAddress
        unapprovedAssets.push(assetIdentifier)
      }
    }

    if (unapprovedAssets.length > 0) {
      throw new Error(
        `The following asset(s) are not approved for transfer to the OpenSea conduit:\n${unapprovedAssets.join("\n")}\n\n` +
          `Please approve these assets before transferring. You can use the batchApproveAssets() method to approve them.`,
      )
    }

    this.context.dispatch(EventType.Transfer, {
      accountAddress: fromAddress,
      assets,
    })

    try {
      const transaction = await this.context.contractCaller.writeContract({
        address: TRANSFER_HELPER_ADDRESS,
        abi: TRANSFER_HELPER_ABI,
        functionName: "bulkTransfer",
        args: [transferItems, defaultConduit.key],
        overrides: { ...overrides, from: fromAddress },
      })

      await this.context.confirmTransaction(
        transaction.hash,
        EventType.Transfer,
        `Bulk transferring ${assets.length} asset(s)`,
      )

      return transaction.hash
    } catch (error) {
      console.error(error)
      this.context.dispatch(EventType.TransactionDenied, {
        error,
        accountAddress: fromAddress,
      })
      throw error
    }
  }

  /**
   * Batch approve multiple assets for transfer to the OpenSea conduit.
   * Sends one approval transaction per token contract that is not yet
   * approved, skipping contracts that already are. Each approval is sent from
   * `fromAddress`, because a token grants an approval to `msg.sender`: routing
   * them through a batching contract such as Multicall3 would approve that
   * contract instead of the owner.
   *
   * @param options
   * @param options.assets Array of assets to approve for transfer
   * @param options.fromAddress The address that owns the assets
   * @param options.overrides Transaction overrides, ignored if not set.
   * @returns Hash of the last approval transaction, or undefined if no approvals needed
   *
   * @throws Error if the fromAddress is not available through wallet or provider.
   */
  async batchApproveAssets({
    assets,
    fromAddress,
    overrides,
  }: {
    assets: Array<{
      asset: AssetWithTokenStandard
      amount?: Amount
    }>
    fromAddress: string
    overrides?: Record<string, unknown>
  }): Promise<string | undefined> {
    // Validate basic parameters before making any blockchain calls
    if (assets.length === 0) {
      return undefined
    }

    // Validate ERC20 assets have amounts before making any blockchain calls
    for (const { asset, amount } of assets) {
      if (asset.tokenStandard === TokenStandard.ERC20 && !amount) {
        throw new Error(
          `Amount required for ERC20 approval: ${asset.tokenAddress}`,
        )
      }
    }

    // Check account availability after parameter validation
    await this.context.requireAccountIsAvailable(fromAddress)

    // Get the chain-specific default conduit
    const defaultConduit = getDefaultConduit(this.context.chain)
    const cc = this.context.contractCaller

    // Check which assets need approval and build approval calldata
    const approvalsNeeded: Array<{ target: string; callData: string }> = []
    const processedContracts = new Set<string>()

    for (const { asset, amount } of mergeErc20Amounts(assets)) {
      const isApproved = await this.checkAssetApproval(
        asset,
        fromAddress,
        defaultConduit.address,
        amount,
      )

      if (!isApproved) {
        // For ERC721/ERC1155, only approve once per contract
        if (
          asset.tokenStandard === TokenStandard.ERC721 ||
          asset.tokenStandard === TokenStandard.ERC1155
        ) {
          if (processedContracts.has(asset.tokenAddress.toLowerCase())) {
            continue
          }
          processedContracts.add(asset.tokenAddress.toLowerCase())

          // setApprovalForAll(operator, true)
          const callData = cc.encodeFunctionData({
            abi: SET_APPROVAL_FOR_ALL_ABI,
            functionName: "setApprovalForAll",
            args: [defaultConduit.address, true],
          })
          approvalsNeeded.push({
            target: asset.tokenAddress,
            callData,
          })
        } else if (asset.tokenStandard === TokenStandard.ERC20) {
          // One approval per contract, same as the ERC721/ERC1155 branch above.
          // The amount is always max uint256, so a second entry for the same
          // token would send an identical, wasted approval.
          const contractAddress = asset.tokenAddress.toLowerCase()
          if (processedContracts.has(contractAddress)) {
            continue
          }
          processedContracts.add(contractAddress)

          // approve(spender, amount) - use max uint256 for unlimited
          const callData = cc.encodeFunctionData({
            abi: APPROVE_ABI,
            functionName: "approve",
            args: [defaultConduit.address, MAX_UINT256],
          })
          approvalsNeeded.push({
            target: asset.tokenAddress,
            callData,
          })
        }
      }
    }

    // No approvals needed
    if (approvalsNeeded.length === 0) {
      return undefined
    }

    const wallet = this.context.wallet
    if (!("signer" in wallet)) {
      throw new Error("A signer is required to approve assets")
    }

    let lastHash: string | undefined
    try {
      for (const [index, { target, callData }] of approvalsNeeded.entries()) {
        const tx = await wallet.signer.sendTransaction({
          to: target,
          data: callData,
          from: fromAddress,
          overrides: overrides as Record<string, unknown>,
        })

        await this.context.confirmTransaction(
          tx.hash,
          EventType.ApproveAllAssets,
          approvalsNeeded.length === 1
            ? "Approving asset for transfer"
            : `Approving asset ${index + 1} of ${approvalsNeeded.length} for transfer`,
        )
        lastHash = tx.hash
      }
    } catch (error) {
      console.error(error)
      this.context.dispatch(EventType.TransactionDenied, {
        error,
        accountAddress: fromAddress,
      })
      throw error
    }

    return lastHash
  }

  /**
   * Check if an asset is approved for transfer to a specific operator (conduit).
   */
  private async checkAssetApproval(
    asset: AssetWithTokenStandard,
    owner: string,
    operator: string,
    amount?: Amount,
  ): Promise<boolean> {
    const cc = this.context.contractCaller

    try {
      switch (asset.tokenStandard) {
        case TokenStandard.ERC20: {
          const allowance = (await cc.readContract({
            address: asset.tokenAddress,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [owner, operator],
          })) as bigint
          if (!amount) {
            return false
          }
          return allowance >= BigInt(amount.toString())
        }

        case TokenStandard.ERC721: {
          const isApprovedForAll = (await cc.readContract({
            address: asset.tokenAddress,
            abi: ERC721_ABI,
            functionName: "isApprovedForAll",
            args: [owner, operator],
          })) as boolean
          if (isApprovedForAll) {
            return true
          }
          if (asset.tokenId !== undefined && asset.tokenId !== null) {
            const approved = (await cc.readContract({
              address: asset.tokenAddress,
              abi: ERC721_ABI,
              functionName: "getApproved",
              args: [asset.tokenId],
            })) as string
            return approved.toLowerCase() === operator.toLowerCase()
          }
          return false
        }

        case TokenStandard.ERC1155: {
          return (await cc.readContract({
            address: asset.tokenAddress,
            abi: ERC1155_ABI,
            functionName: "isApprovedForAll",
            args: [owner, operator],
          })) as boolean
        }

        default:
          return false
      }
    } catch (error) {
      this.context.logger(
        `Error checking approval for ${asset.tokenAddress}: ${error}`,
      )
      return false
    }
  }
}
