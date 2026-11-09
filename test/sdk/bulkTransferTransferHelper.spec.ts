import { Interface } from "ethers"
import { describe, expect, test, vi } from "vitest"
import { TRANSFER_HELPER_ABI } from "../../src/abi/abis"
import { TRANSFER_HELPER_ADDRESS } from "../../src/constants"
import { AssetsManager } from "../../src/sdk/assets"
import type { SDKContext } from "../../src/sdk/context"
import { Chain, TokenStandard } from "../../src/types"

const FROM = "0x0000000000000000000000000000000000000001"
const ALICE = "0x000000000000000000000000000000000000a11c"
const BOB = "0x0000000000000000000000000000000000000b0b"
const TOKEN = "0x0f5d2fb29fb7d3cfee444a200298f468908cc942"
const NFT = "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d"

// Seaport's TransferHelper at TRANSFER_HELPER_ADDRESS exposes only this
// signature; the deployed bytecode on Ethereum and Base contains 0x32389b71.
const SEAPORT_BULK_TRANSFER =
  "bulkTransfer(((uint8,address,uint256,uint256)[],address,bool)[],bytes32)"

/**
 * Builds the context members bulkTransfer and batchApproveAssets touch. Every
 * NFT reads as approved; each ERC20 allowance is `allowance`.
 */
function harness({ allowance = 0n }: { allowance?: bigint } = {}) {
  const writeContract = vi.fn().mockResolvedValue({ hash: "0xtransfer" })
  const sendTransaction = vi.fn().mockResolvedValue({ hash: "0xapprove" })
  const readContract = vi.fn(async ({ functionName }) =>
    functionName === "allowance" ? allowance : true,
  )
  const context = {
    chain: Chain.Mainnet,
    wallet: { signer: { sendTransaction } },
    contractCaller: {
      readContract,
      writeContract,
      encodeFunctionData: vi.fn().mockReturnValue("0xapproval"),
    },
    confirmTransaction: vi.fn().mockResolvedValue(undefined),
    requireAccountIsAvailable: vi.fn().mockResolvedValue(undefined),
    dispatch: vi.fn(),
    logger: vi.fn(),
  } as unknown as SDKContext
  return { manager: new AssetsManager(context), writeContract, sendTransaction }
}

const erc20 = (amount: string, tokenAddress = TOKEN) => ({
  asset: { tokenAddress, tokenId: null, tokenStandard: TokenStandard.ERC20 },
  amount,
})
const erc721 = (tokenId: string) => ({
  asset: { tokenAddress: NFT, tokenId, tokenStandard: TokenStandard.ERC721 },
})

describe("TRANSFER_HELPER_ABI", () => {
  test("encodes the selector Seaport's TransferHelper exposes", () => {
    const fn = new Interface(TRANSFER_HELPER_ABI).getFunction("bulkTransfer")
    expect(fn?.format("sighash")).toBe(SEAPORT_BULK_TRANSFER)
    expect(fn?.selector).toBe("0x32389b71")
  })
})

describe("AssetsManager.bulkTransfer", () => {
  test("sends one entry per recipient, case-insensitively, in first-seen order", async () => {
    const { manager, writeContract } = harness({ allowance: 10n ** 30n })

    const hash = await manager.bulkTransfer({
      assets: [
        { ...erc721("1"), toAddress: ALICE },
        { ...erc20("60"), toAddress: BOB },
        { ...erc721("2"), toAddress: ALICE.toUpperCase().replace("0X", "0x") },
      ],
      fromAddress: FROM,
    })

    expect(hash).toBe("0xtransfer")
    const call = writeContract.mock.calls[0][0]
    expect(call.address).toBe(TRANSFER_HELPER_ADDRESS)
    expect(call.functionName).toBe("bulkTransfer")
    const [items] = call.args
    expect(items).toEqual([
      {
        recipient: ALICE,
        validateERC721Receiver: false,
        items: [
          { itemType: 2, token: NFT, identifier: "1", amount: "1" },
          { itemType: 2, token: NFT, identifier: "2", amount: "1" },
        ],
      },
      {
        recipient: BOB,
        validateERC721Receiver: false,
        items: [{ itemType: 1, token: TOKEN, identifier: "0", amount: "60" }],
      },
    ])

    const data = new Interface(TRANSFER_HELPER_ABI).encodeFunctionData(
      "bulkTransfer",
      call.args,
    )
    expect(data.slice(0, 10)).toBe("0x32389b71")
  })

  test("rejects two ERC20 entries whose total exceeds the allowance", async () => {
    const { manager, writeContract } = harness({ allowance: 100n })

    await expect(
      manager.bulkTransfer({
        assets: [
          { ...erc20("60"), toAddress: ALICE },
          {
            ...erc20("60", TOKEN.toUpperCase().replace("0X", "0x")),
            toAddress: BOB,
          },
        ],
        fromAddress: FROM,
      }),
    ).rejects.toThrow("not approved for transfer to the OpenSea conduit")
    expect(writeContract).not.toHaveBeenCalled()
  })

  test("accepts two ERC20 entries whose total equals the allowance", async () => {
    const { manager, writeContract } = harness({ allowance: 120n })

    await manager.bulkTransfer({
      assets: [
        { ...erc20("60"), toAddress: ALICE },
        { ...erc20("60"), toAddress: BOB },
      ],
      fromAddress: FROM,
    })
    expect(writeContract).toHaveBeenCalledOnce()
  })
})

describe("AssetsManager.batchApproveAssets ERC20 totals", () => {
  test("approves when the total exceeds the allowance though each entry fits", async () => {
    const { manager, sendTransaction } = harness({ allowance: 100n })

    const hash = await manager.batchApproveAssets({
      assets: [erc20("60"), erc20("60")],
      fromAddress: FROM,
    })

    expect(hash).toBe("0xapprove")
    expect(sendTransaction).toHaveBeenCalledOnce()
  })

  test("skips the approval when the total equals the allowance", async () => {
    const { manager, sendTransaction } = harness({ allowance: 120n })

    const hash = await manager.batchApproveAssets({
      assets: [erc20("60"), erc20("60")],
      fromAddress: FROM,
    })

    expect(hash).toBeUndefined()
    expect(sendTransaction).not.toHaveBeenCalled()
  })
})
