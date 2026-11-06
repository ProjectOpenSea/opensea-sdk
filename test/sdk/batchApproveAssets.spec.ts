import { describe, expect, test, vi } from "vitest"
import { AssetsManager } from "../../src/sdk/assets"
import type { SDKContext } from "../../src/sdk/context"
import { Chain, EventType, TokenStandard } from "../../src/types"

const TOKEN = "0x0f5d2fb29fb7d3cfee444a200298f468908cc942"
const FROM = "0x0000000000000000000000000000000000000001"

/**
 * batchApproveAssets only touches a handful of context members, so build the
 * minimum and cast. Allowance reads return 0 so every asset looks unapproved.
 */
function harness({ signer = true }: { signer?: boolean } = {}) {
  const sendTransaction = vi.fn().mockResolvedValue({ hash: "0xtest" })
  const writeContract = vi.fn().mockResolvedValue({ hash: "0xmulticall" })
  const encodeFunctionData = vi.fn().mockReturnValue("0xapproval")
  const confirmTransaction = vi.fn().mockResolvedValue(undefined)
  const dispatch = vi.fn()

  const context = {
    chain: Chain.Mainnet,
    wallet: signer ? { signer: { sendTransaction } } : {},
    contractCaller: {
      readContract: vi.fn().mockResolvedValue(0n),
      writeContract,
      encodeFunctionData,
    },
    confirmTransaction,
    requireAccountIsAvailable: vi.fn().mockResolvedValue(undefined),
    dispatch,
    logger: vi.fn(),
  } as unknown as SDKContext

  return {
    manager: new AssetsManager(context),
    sendTransaction,
    writeContract,
    encodeFunctionData,
    confirmTransaction,
    dispatch,
  }
}

const erc20 = (tokenAddress: string, amount: string) => ({
  asset: { tokenAddress, tokenId: null, tokenStandard: TokenStandard.ERC20 },
  amount,
})

describe("AssetsManager: batchApproveAssets", () => {
  test("sends one approval for the same ERC20 contract, matching case-insensitively", async () => {
    const h = harness()

    await h.manager.batchApproveAssets({
      assets: [erc20(TOKEN, "1"), erc20(TOKEN.toUpperCase(), "2")],
      fromAddress: FROM,
    })

    expect(h.encodeFunctionData).toHaveBeenCalledTimes(1)
    expect(h.sendTransaction).toHaveBeenCalledTimes(1)
    expect(h.writeContract).not.toHaveBeenCalled()
    expect(h.confirmTransaction).toHaveBeenCalledWith(
      "0xtest",
      EventType.ApproveAllAssets,
      "Approving asset for transfer",
    )
  })

  test("sends one approval per distinct ERC20 contract, each from the owner", async () => {
    const h = harness()
    const other = "0x1111111111111111111111111111111111111111"
    h.sendTransaction
      .mockResolvedValueOnce({ hash: "0xfirst" })
      .mockResolvedValueOnce({ hash: "0xsecond" })

    const hash = await h.manager.batchApproveAssets({
      assets: [erc20(TOKEN, "1"), erc20(other, "2")],
      fromAddress: FROM,
    })

    expect(h.encodeFunctionData).toHaveBeenCalledTimes(2)
    // A token approves msg.sender, so a batching contract in between would be
    // approved instead of the owner.
    expect(h.writeContract).not.toHaveBeenCalled()
    expect(
      h.sendTransaction.mock.calls.map(([tx]) => [tx.to, tx.from]),
    ).toEqual([
      [TOKEN, FROM],
      [other, FROM],
    ])
    expect(
      h.confirmTransaction.mock.calls.map(([hash, , message]) => [
        hash,
        message,
      ]),
    ).toEqual([
      ["0xfirst", "Approving asset 1 of 2 for transfer"],
      ["0xsecond", "Approving asset 2 of 2 for transfer"],
    ])
    expect(hash).toBe("0xsecond")
  })

  test("sends an ERC721 and an ERC1155 approval directly from the owner", async () => {
    const h = harness()
    const erc721 = "0x2222222222222222222222222222222222222222"
    const erc1155 = "0x3333333333333333333333333333333333333333"

    await h.manager.batchApproveAssets({
      assets: [
        {
          asset: {
            tokenAddress: erc721,
            tokenId: "1",
            tokenStandard: TokenStandard.ERC721,
          },
        },
        {
          asset: {
            tokenAddress: erc1155,
            tokenId: "2",
            tokenStandard: TokenStandard.ERC1155,
          },
        },
      ],
      fromAddress: FROM,
    })

    expect(h.writeContract).not.toHaveBeenCalled()
    expect(h.sendTransaction.mock.calls.map(([tx]) => tx.to)).toEqual([
      erc721,
      erc1155,
    ])
  })

  test("dispatches TransactionDenied and stops when an approval fails", async () => {
    const h = harness()
    const other = "0x1111111111111111111111111111111111111111"
    const denied = new Error("user rejected")
    h.sendTransaction.mockRejectedValueOnce(denied)
    vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(
      h.manager.batchApproveAssets({
        assets: [erc20(TOKEN, "1"), erc20(other, "2")],
        fromAddress: FROM,
      }),
    ).rejects.toBe(denied)

    expect(h.sendTransaction).toHaveBeenCalledTimes(1)
    expect(h.dispatch).toHaveBeenCalledWith(EventType.TransactionDenied, {
      error: denied,
      accountAddress: FROM,
    })
  })

  test("requires a signer when approvals are needed", async () => {
    const h = harness({ signer: false })
    const other = "0x1111111111111111111111111111111111111111"

    await expect(
      h.manager.batchApproveAssets({
        assets: [erc20(TOKEN, "1"), erc20(other, "2")],
        fromAddress: FROM,
      }),
    ).rejects.toThrow("A signer is required to approve assets")
    expect(h.writeContract).not.toHaveBeenCalled()
  })
})
