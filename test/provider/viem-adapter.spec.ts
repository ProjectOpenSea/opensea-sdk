import { describe, expect, test, vi } from "vitest"
import { createViemWallet } from "../../src/provider/viem-adapter"

describe("createViemWallet", () => {
  test("infers the EIP-712 root primaryType instead of using the first type key", async () => {
    const signTypedData = vi.fn().mockResolvedValue("0xsignature")
    const walletClient = {
      account: { address: "0x0000000000000000000000000000000000000001" },
      chain: { id: 1 },
      signTypedData,
    }
    const publicClient = {
      waitForTransactionReceipt: vi.fn(),
    }

    const wallet = createViemWallet({
      publicClient: publicClient as never,
      walletClient: walletClient as never,
    })
    if (!("signer" in wallet)) {
      throw new Error("expected signer")
    }

    const types = {
      Person: [{ name: "wallet", type: "address" }],
      Mail: [
        { name: "from", type: "Person" },
        { name: "contents", type: "string" },
      ],
    }

    await wallet.signer.signTypedData(
      {
        name: "Example",
        version: "1",
        chainId: 1,
        verifyingContract: "0x0000000000000000000000000000000000000002",
      },
      types,
      {
        from: { wallet: walletClient.account.address },
        contents: "hello",
      },
    )

    expect(signTypedData).toHaveBeenCalledWith(
      expect.objectContaining({ primaryType: "Mail" }),
    )
  })
})
