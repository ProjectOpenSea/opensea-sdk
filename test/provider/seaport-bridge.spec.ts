import { describe, expect, test, vi } from "vitest"
import { createSeaportBridge } from "../../src/provider/seaport-bridge"

describe("createSeaportBridge", () => {
  test("infers the EIP-712 root primaryType instead of using the first type key", async () => {
    const signTypedData = vi.fn().mockResolvedValue("0xsignature")
    const walletClient = {
      account: {
        address: "0x0000000000000000000000000000000000000001",
      },
      chain: { id: 1 },
      signTypedData,
    }
    const publicClient = {
      transport: { url: "http://127.0.0.1:8545" },
    }

    const signer = createSeaportBridge({
      publicClient,
      walletClient,
    } as any)

    const types = {
      Person: [
        { name: "name", type: "string" },
        { name: "wallet", type: "address" },
      ],
      Mail: [
        { name: "from", type: "Person" },
        { name: "to", type: "Person" },
        { name: "contents", type: "string" },
      ],
    }

    await (signer as any).signTypedData(
      { name: "Ether Mail", version: "1", chainId: 1 },
      types,
      {
        from: {
          name: "Cow",
          wallet: "0x0000000000000000000000000000000000000002",
        },
        to: {
          name: "Bob",
          wallet: "0x0000000000000000000000000000000000000003",
        },
        contents: "Hello, Bob!",
      },
    )

    expect(signTypedData).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryType: "Mail",
      }),
    )
  })
})
