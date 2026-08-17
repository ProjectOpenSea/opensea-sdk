import { describe, expect, it, vi } from "vitest"
import { createViemWallet } from "../../src/provider/viem-adapter"

describe("createViemWallet", () => {
  it("does not pass NaN when typed-data domain omits chainId", async () => {
    const signTypedData = vi.fn().mockResolvedValue("0xsignature")
    const wallet = createViemWallet({
      publicClient: {
        waitForTransactionReceipt: vi.fn(),
      } as any,
      walletClient: {
        account: {
          address: "0x0000000000000000000000000000000000000001",
        },
        signTypedData,
      } as any,
    })

    if (!("signer" in wallet)) {
      throw new Error("expected wallet signer")
    }

    await wallet.signer.signTypedData(
      {
        name: "OpenSea",
        version: "1",
        verifyingContract: "0x0000000000000000000000000000000000000002",
      } as any,
      {
        Test: [{ name: "value", type: "string" }],
      },
      { value: "hello" },
    )

    const call = signTypedData.mock.calls[0][0]
    expect(call.domain.chainId).toBeUndefined()
    expect(Number.isNaN(call.domain.chainId)).toBe(false)
  })
})
