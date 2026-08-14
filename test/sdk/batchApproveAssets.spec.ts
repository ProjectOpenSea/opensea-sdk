import { describe, expect, test, vi } from "vitest"
import { AssetsManager } from "../../src/sdk/assets"
import { Chain, EventType, TokenStandard } from "../../src/types"

describe("AssetsManager: batchApproveAssets", () => {
  test("deduplicates approvals for the same ERC20 contract case-insensitively", async () => {
    const tokenAddress = "0x0f5d2fb29fb7d3cfee444a200298f468908cc942"
    const fromAddress = "0x0000000000000000000000000000000000000001"

    const readContract = vi.fn().mockResolvedValue(0n)
    const encodeFunctionData = vi.fn().mockReturnValue("0xapproval")
    const writeContract = vi.fn().mockResolvedValue({
      hash: "0xtest",
      wait: async () => {},
    })
    const sendTransaction = vi.fn().mockResolvedValue({
      hash: "0xtest",
      wait: async () => {},
    })
    const confirmTransaction = vi.fn().mockResolvedValue(undefined)

    const manager = new AssetsManager({
      chain: Chain.Mainnet,
      wallet: {
        signer: {
          getAddress: async () => fromAddress,
          sendTransaction,
          signTypedData: async () => "0xsignature",
        },
        provider: {
          waitForTransaction: async () => {},
        },
      },
      contractCaller: {
        readContract,
        writeContract,
        encodeFunctionData,
      },
      api: {} as any,
      seaport: {} as any,
      logger: vi.fn(),
      dispatch: vi.fn(),
      confirmTransaction,
      requireAccountIsAvailable: vi.fn().mockResolvedValue(undefined),
    })

    await manager.batchApproveAssets({
      assets: [
        {
          asset: {
            tokenAddress,
            tokenId: null,
            tokenStandard: TokenStandard.ERC20,
          },
          amount: "1",
        },
        {
          asset: {
            tokenAddress: tokenAddress.toUpperCase(),
            tokenId: null,
            tokenStandard: TokenStandard.ERC20,
          },
          amount: "2",
        },
      ],
      fromAddress,
    })

    expect(sendTransaction).toHaveBeenCalledTimes(1)
    expect(writeContract).not.toHaveBeenCalled()
    expect(encodeFunctionData).toHaveBeenCalledTimes(1)
    expect(confirmTransaction).toHaveBeenCalledWith(
      "0xtest",
      EventType.ApproveAllAssets,
      "Approving asset for transfer",
    )
  })
})
