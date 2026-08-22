import { CROSS_CHAIN_SEAPORT_V1_6_ADDRESS } from "@opensea/seaport-js/lib/constants"
import type { OrderV2 } from "../../src/orders/types"
import { CancellationManager } from "../../src/sdk/cancellation"
import { createMockContext } from "../fixtures/context"
import { describe, expect, test, vi } from "vitest"

const orderWithProtocol = (protocolAddress: string): OrderV2 =>
  ({
    orderHash: "0x123",
    chain: "ethereum",
    type: "basic",
    protocolAddress,
    protocolData: {
      parameters: {
        offerer: "0x0000000000000000000000000000000000000001",
        zone: "0x0000000000000000000000000000000000000000",
        offer: [],
        consideration: [],
        orderType: 0,
        startTime: "0",
        endTime: "0",
        zoneHash: `0x${"00".repeat(32)}`,
        salt: "0",
        conduitKey: `0x${"00".repeat(32)}`,
        totalOriginalConsiderationItems: 0,
        counter: 0,
      },
      signature: "0x",
    },
  }) as unknown as OrderV2

describe("CancellationManager protocol address casing", () => {
  test("treats differently-cased forms of the same protocol address as one protocol", async () => {
    const accountCheck = new Error("account check reached")
    const requireAccountIsAvailable = vi.fn().mockRejectedValue(accountCheck)
    const manager = new CancellationManager(
      createMockContext({ requireAccountIsAvailable }),
    )

    const upperCaseProtocol =
      `0x${CROSS_CHAIN_SEAPORT_V1_6_ADDRESS.slice(2).toUpperCase()}`

    await expect(
      manager.cancelOrders({
        orders: [
          orderWithProtocol(CROSS_CHAIN_SEAPORT_V1_6_ADDRESS),
          orderWithProtocol(upperCaseProtocol),
        ],
        accountAddress: "0x0000000000000000000000000000000000000001",
      }),
    ).rejects.toThrow(accountCheck)

    expect(requireAccountIsAvailable).toHaveBeenCalledTimes(1)
  })
})
