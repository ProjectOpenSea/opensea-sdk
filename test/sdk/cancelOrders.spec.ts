import { CROSS_CHAIN_SEAPORT_V1_6_ADDRESS } from "@opensea/seaport-js/lib/constants"
import type { OrderComponents } from "@opensea/seaport-js/lib/types"
import { ethers } from "ethers"
import { describe, expect, test, vi } from "vitest"
import { ALTERNATE_SEAPORT_V1_6_ADDRESS } from "../../src/constants"
import type { OrderV2 } from "../../src/orders/types"
import { DEFAULT_SEAPORT_CONTRACT_ADDRESS } from "../../src/orders/utils"
import { CancellationManager } from "../../src/sdk/cancellation"
import { EventType } from "../../src/types"
import { createMockContext } from "../fixtures/context"
import { sdk } from "../utils/sdk"

const buildMockOrderV2 = (): OrderV2 =>
  ({
    orderHash: "0x123",
    chain: "ethereum",
    type: "basic",
    price: {
      current: {
        currency: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        value: "1000000000000000000",
      },
    },
    protocolAddress: DEFAULT_SEAPORT_CONTRACT_ADDRESS,
    protocolData: {
      parameters: {
        offerer: "0x0000000000000000000000000000000000000001",
        zone: "0x0000000000000000000000000000000000000000",
        offer: [],
        consideration: [],
        orderType: 0,
        startTime: "0",
        endTime: "0",
        zoneHash:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        salt: "0",
        conduitKey:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        totalOriginalConsiderationItems: 0,
        counter: 0,
      },
      signature: "0x",
    },
  }) as unknown as OrderV2

describe("SDK: cancelOrders", () => {
  const wallet = ethers.Wallet.createRandom()
  const accountAddress = wallet.address

  test("Should throw an error when neither orders nor orderHashes is provided", async () => {
    try {
      await sdk.cancelOrders({
        accountAddress,
      })
      throw new Error("should have thrown")
    } catch (e) {
      expect((e as Error).message).toContain(
        "Either orders or orderHashes must be provided",
      )
    }
  })

  test("Should throw an error when orders array is empty", async () => {
    try {
      await sdk.cancelOrders({
        orders: [],
        accountAddress,
      })
      throw new Error("should have thrown")
    } catch (e) {
      expect((e as Error).message).toContain(
        "At least one order must be provided",
      )
    }
  })

  test("Should throw an error when orderHashes array is empty", async () => {
    try {
      await sdk.cancelOrders({
        orderHashes: [],
        accountAddress,
      })
      throw new Error("should have thrown")
    } catch (e) {
      expect((e as Error).message).toContain(
        "At least one order hash must be provided",
      )
    }
  })

  test("Should throw an error when both orders and orderHashes are provided", async () => {
    const mockOrderComponents: OrderComponents = {
      offerer: "0x0000000000000000000000000000000000000001",
      zone: "0x0000000000000000000000000000000000000000",
      offer: [],
      consideration: [],
      orderType: 0,
      startTime: "0",
      endTime: "0",
      zoneHash:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      salt: "0",
      conduitKey:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      totalOriginalConsiderationItems: 0,
      counter: 0,
    }

    try {
      await sdk.cancelOrders({
        orders: [mockOrderComponents],
        orderHashes: [
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        ],
        accountAddress,
      })
      throw new Error("should have thrown")
    } catch (e) {
      expect((e as Error).message).toContain(
        "Cannot provide both orders and orderHashes",
      )
    }
  })

  test("Should attempt to fetch orders from API when using orderHashes", async () => {
    const getOrder = vi
      .spyOn(sdk.api.orders, "getOrderByHash")
      .mockRejectedValueOnce(new Error("Not found"))

    await expect(
      sdk.cancelOrders({
        orderHashes: ["0x123"],
        accountAddress,
        protocolAddress: DEFAULT_SEAPORT_CONTRACT_ADDRESS,
      }),
    ).rejects.toThrow("Not found")
    expect(getOrder).toHaveBeenCalledWith(
      "0x123",
      DEFAULT_SEAPORT_CONTRACT_ADDRESS,
      "ethereum",
    )
    getOrder.mockRestore()
  })

  test("Should throw an error when using cancelOrders without wallet", async () => {
    const mockOrderV2: OrderV2 = {
      orderHash: "0x123",
      chain: "ethereum",
      type: "basic",
      price: {
        current: {
          currency: "0x0000000000000000000000000000000000000000",
          decimals: 18,
          value: "1000000000000000000",
        },
      },
      protocolAddress: DEFAULT_SEAPORT_CONTRACT_ADDRESS,
      protocolData: {
        parameters: {
          offerer: "0x0000000000000000000000000000000000000001",
          zone: "0x0000000000000000000000000000000000000000",
          offer: [],
          consideration: [],
          orderType: 0,
          startTime: "0",
          endTime: "0",
          zoneHash:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          salt: "0",
          conduitKey:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          totalOriginalConsiderationItems: 0,
          counter: 0,
        },
        signature: "0x",
      },
    } as any

    try {
      await sdk.cancelOrders({
        orders: [mockOrderV2],
        accountAddress,
      })
      throw new Error("should have thrown")
    } catch (e) {
      // Should fail when checking wallet availability
      // Either proper wallet check error or RPC auth error if provider is misconfigured
      expect((e as Error).message).toSatisfy(
        (msg: string) =>
          msg.includes("accountAddress is not available") ||
          msg.includes("Unauthorized") ||
          msg.includes("Must be authenticated"),
      )
    }
  })

  test("Should accept OrderComponents directly", async () => {
    const mockOrderComponents: OrderComponents = {
      offerer: "0x0000000000000000000000000000000000000001",
      zone: "0x0000000000000000000000000000000000000000",
      offer: [],
      consideration: [],
      orderType: 0,
      startTime: "0",
      endTime: "0",
      zoneHash:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      salt: "0",
      conduitKey:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      totalOriginalConsiderationItems: 0,
      counter: 0,
    }

    try {
      await sdk.cancelOrders({
        orders: [mockOrderComponents],
        accountAddress,
      })
      throw new Error("should have thrown wallet error")
    } catch (e) {
      // We expect it to fail on wallet check, not on input validation
      // Either proper wallet check error or RPC auth error if provider is misconfigured
      expect((e as Error).message).toSatisfy(
        (msg: string) =>
          msg.includes("accountAddress is not available") ||
          msg.includes("Unauthorized") ||
          msg.includes("Must be authenticated"),
      )
    }
  })

  test("Should reject mixed protocol addresses before account availability check", async () => {
    const requireAccountIsAvailable = vi
      .fn()
      .mockRejectedValue(new Error("account check should not run"))
    const cancellationManager = new CancellationManager(
      createMockContext({
        requireAccountIsAvailable,
      }),
    )
    const mockOrder = (protocolAddress: string): OrderV2 =>
      ({
        orderHash: "0x123",
        chain: "ethereum",
        type: "basic",
        price: {
          current: {
            currency: "0x0000000000000000000000000000000000000000",
            decimals: 18,
            value: "1000000000000000000",
          },
        },
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
            zoneHash:
              "0x0000000000000000000000000000000000000000000000000000000000000000",
            salt: "0",
            conduitKey:
              "0x0000000000000000000000000000000000000000000000000000000000000000",
            totalOriginalConsiderationItems: 0,
            counter: 0,
          },
          signature: "0x",
        },
      }) as unknown as OrderV2

    await expect(
      cancellationManager.cancelOrders({
        orders: [
          mockOrder(CROSS_CHAIN_SEAPORT_V1_6_ADDRESS),
          mockOrder(ALTERNATE_SEAPORT_V1_6_ADDRESS),
        ],
        accountAddress,
      }),
    ).rejects.toThrow(
      "All orders in a cancelOrders batch must share the same protocolAddress. Cancel each protocol separately.",
    )
    expect(requireAccountIsAvailable).not.toHaveBeenCalled()
  })

  test("Should accept the same protocol address in different letter cases", async () => {
    // Orders arrive from different sources and are not consistently cased. A
    // Set keyed on the raw string counted one protocol as two and rejected a
    // batch that was fine.
    const requireAccountIsAvailable = vi.fn().mockResolvedValue(undefined)
    const cancellationManager = new CancellationManager(
      createMockContext({
        requireAccountIsAvailable,
      }),
    )
    const mockOrder = (protocolAddress: string): OrderV2 =>
      ({
        orderHash: "0x123",
        chain: "ethereum",
        type: "basic",
        price: {
          current: {
            currency: "0x0000000000000000000000000000000000000000",
            decimals: 18,
            value: "1000000000000000000",
          },
        },
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
            zoneHash:
              "0x0000000000000000000000000000000000000000000000000000000000000000",
            salt: "0",
            conduitKey:
              "0x0000000000000000000000000000000000000000000000000000000000000000",
            totalOriginalConsiderationItems: 0,
            counter: 0,
          },
          signature: "0x",
        },
      }) as unknown as OrderV2

    await expect(
      cancellationManager.cancelOrders({
        orders: [
          mockOrder(CROSS_CHAIN_SEAPORT_V1_6_ADDRESS.toLowerCase()),
          mockOrder(
            CROSS_CHAIN_SEAPORT_V1_6_ADDRESS.toUpperCase().replace("0X", "0x"),
          ),
        ],
        accountAddress,
      }),
    ).rejects.not.toThrow(/must share the same protocolAddress/)
    // It got past the protocol grouping, which is what this pins.
    expect(requireAccountIsAvailable).toHaveBeenCalled()
  })

  test("Should reject mixed protocol order hashes before account availability check", async () => {
    const requireAccountIsAvailable = vi
      .fn()
      .mockRejectedValue(new Error("account check should not run"))
    const getOrderByHash = vi
      .fn()
      .mockResolvedValueOnce({
        orderHash: "0x111",
        protocolAddress: CROSS_CHAIN_SEAPORT_V1_6_ADDRESS,
        protocolData: {
          parameters: {
            offerer: "0x0000000000000000000000000000000000000001",
            zone: "0x0000000000000000000000000000000000000000",
            offer: [],
            consideration: [],
            orderType: 0,
            startTime: "0",
            endTime: "0",
            zoneHash:
              "0x0000000000000000000000000000000000000000000000000000000000000000",
            salt: "0",
            conduitKey:
              "0x0000000000000000000000000000000000000000000000000000000000000000",
            totalOriginalConsiderationItems: 0,
            counter: 0,
          },
          signature: "0x",
        },
      })
      .mockResolvedValueOnce({
        orderHash: "0x222",
        protocolAddress: ALTERNATE_SEAPORT_V1_6_ADDRESS,
        protocolData: {
          parameters: {
            offerer: "0x0000000000000000000000000000000000000001",
            zone: "0x0000000000000000000000000000000000000000",
            offer: [],
            consideration: [],
            orderType: 0,
            startTime: "0",
            endTime: "0",
            zoneHash:
              "0x0000000000000000000000000000000000000000000000000000000000000000",
            salt: "0",
            conduitKey:
              "0x0000000000000000000000000000000000000000000000000000000000000000",
            totalOriginalConsiderationItems: 0,
            counter: 0,
          },
          signature: "0x",
        },
      })
    const cancellationManager = new CancellationManager(
      createMockContext({
        api: {
          orders: { getOrderByHash },
        },
        requireAccountIsAvailable,
      }),
    )

    await expect(
      cancellationManager.cancelOrders({
        orderHashes: ["0x111", "0x222"],
        accountAddress,
        protocolAddress: DEFAULT_SEAPORT_CONTRACT_ADDRESS,
      }),
    ).rejects.toThrow(
      "All orders in a cancelOrders batch must share the same protocolAddress. Cancel each protocol separately.",
    )
    expect(requireAccountIsAvailable).not.toHaveBeenCalled()
  })
})

describe("SDK: cancelOrder (singular)", () => {
  const wallet = ethers.Wallet.createRandom()
  const accountAddress = wallet.address

  test("Should throw an error when neither order nor orderHash is provided", async () => {
    try {
      await sdk.cancelOrder({
        accountAddress,
      })
      throw new Error("should have thrown")
    } catch (e) {
      expect((e as Error).message).toContain(
        "Either order or orderHash must be provided",
      )
    }
  })

  test("Should attempt to fetch order from API when using orderHash", async () => {
    try {
      await sdk.cancelOrder({
        orderHash: "0x123",
        accountAddress,
        protocolAddress: DEFAULT_SEAPORT_CONTRACT_ADDRESS,
      })
      throw new Error("should have thrown")
    } catch (e) {
      // Should fail when trying to fetch the order from the API
      // Either "Not found" or network error depending on the API state
      expect((e as Error).message).toSatisfy(
        (msg: string) =>
          msg.includes("Not found") ||
          msg.includes("Server Error") ||
          msg.includes("Unauthorized") ||
          msg.includes("accountAddress is not available"),
      )
    }
  })

  test("Should throw an error when using cancelOrder with OrderV2 without wallet", async () => {
    const mockOrderV2: OrderV2 = {
      orderHash: "0x123",
      chain: "ethereum",
      type: "basic",
      price: {
        current: {
          currency: "0x0000000000000000000000000000000000000000",
          decimals: 18,
          value: "1000000000000000000",
        },
      },
      protocolAddress: DEFAULT_SEAPORT_CONTRACT_ADDRESS,
      protocolData: {
        parameters: {
          offerer: "0x0000000000000000000000000000000000000001",
          zone: "0x0000000000000000000000000000000000000000",
          offer: [],
          consideration: [],
          orderType: 0,
          startTime: "0",
          endTime: "0",
          zoneHash:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          salt: "0",
          conduitKey:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          totalOriginalConsiderationItems: 0,
          counter: 0,
        },
        signature: "0x",
      },
    } as any

    try {
      await sdk.cancelOrder({
        order: mockOrderV2,
        accountAddress,
      })
      throw new Error("should have thrown")
    } catch (e) {
      // Should fail when checking wallet availability
      // Either proper wallet check error or RPC auth error if provider is misconfigured
      expect((e as Error).message).toSatisfy(
        (msg: string) =>
          msg.includes("accountAddress is not available") ||
          msg.includes("Unauthorized") ||
          msg.includes("Must be authenticated"),
      )
    }
  })

  test("Should return the transaction hash when cancelling an OrderV2", async () => {
    const transact = vi.fn().mockResolvedValue({ hash: "0xcancelhash" })
    const mockSeaport = {
      cancelOrders: vi.fn().mockReturnValue({ transact }),
    }
    const confirmTransaction = vi.fn().mockResolvedValue(undefined)
    const cancellationManager = new CancellationManager(
      createMockContext({ seaport: mockSeaport, confirmTransaction }),
    )

    const transactionHash = await cancellationManager.cancelOrder({
      order: buildMockOrderV2(),
      accountAddress,
    })

    expect(transactionHash).toBe("0xcancelhash")
    expect(confirmTransaction).toHaveBeenCalledWith(
      "0xcancelhash",
      EventType.CancelOrder,
      "Cancelling order",
    )
  })

  test("Should return the transaction hash when cancelling by orderHash", async () => {
    const transact = vi.fn().mockResolvedValue({ hash: "0xfetchedhash" })
    const mockSeaport = {
      cancelOrders: vi.fn().mockReturnValue({ transact }),
    }
    const getOrderByHash = vi.fn().mockResolvedValue(buildMockOrderV2())
    const cancellationManager = new CancellationManager(
      createMockContext({
        seaport: mockSeaport,
        api: { orders: { getOrderByHash } },
      }),
    )

    const transactionHash = await cancellationManager.cancelOrder({
      orderHash: "0x123",
      accountAddress,
      protocolAddress: DEFAULT_SEAPORT_CONTRACT_ADDRESS,
    })

    expect(transactionHash).toBe("0xfetchedhash")
    expect(getOrderByHash).toHaveBeenCalledWith(
      "0x123",
      DEFAULT_SEAPORT_CONTRACT_ADDRESS,
      "ethereum",
    )
  })
})

describe("SDK: offchainCancelOrder", () => {
  const orderHash = `0x${"ab".repeat(32)}`

  const apiError = (message: string, statusCode = 400) =>
    Object.assign(new Error(message), {
      statusCode,
      responseBody: { errors: [message] },
    })

  test("names cancelOrder when the API refuses a recently created order", async () => {
    const refusal = apiError(
      "Server Error: Orders created recently must be cancelled onchain. Use the cancel order actions to build the onchain transaction",
    )
    const offchainCancelOrder = vi.fn().mockRejectedValue(refusal)
    const manager = new CancellationManager(
      createMockContext({ api: { orders: { offchainCancelOrder } } }),
    )

    const thrown = await manager
      .offchainCancelOrder(DEFAULT_SEAPORT_CONTRACT_ADDRESS, orderHash)
      .then(
        () => undefined,
        (e: unknown) => e,
      )

    expect(thrown).toBe(refusal)
    expect((thrown as Error).message).toContain(
      "Orders created recently must be cancelled onchain.",
    )
    expect((thrown as Error).message).toContain("sdk.cancelOrder(")
    expect(thrown).toMatchObject({
      statusCode: 400,
      responseBody: { errors: [expect.any(String)] },
    })
  })

  test("passes other API errors through unchanged", async () => {
    const other = apiError("Server Error: Order not found", 404)
    const offchainCancelOrder = vi.fn().mockRejectedValue(other)
    const manager = new CancellationManager(
      createMockContext({ api: { orders: { offchainCancelOrder } } }),
    )

    await expect(
      manager.offchainCancelOrder(DEFAULT_SEAPORT_CONTRACT_ADDRESS, orderHash),
    ).rejects.toThrow(/^Server Error: Order not found$/)
  })

  test("rethrows a non-Error rejection as is", async () => {
    const offchainCancelOrder = vi
      .fn()
      .mockRejectedValue("Orders created recently must be cancelled onchain")
    const manager = new CancellationManager(
      createMockContext({ api: { orders: { offchainCancelOrder } } }),
    )

    await expect(
      manager.offchainCancelOrder(DEFAULT_SEAPORT_CONTRACT_ADDRESS, orderHash),
    ).rejects.toBe("Orders created recently must be cancelled onchain")
  })

  test("returns the API response on success", async () => {
    const response = { lastSignatureIssuedValidUntil: null }
    const offchainCancelOrder = vi.fn().mockResolvedValue(response)
    const manager = new CancellationManager(
      createMockContext({ api: { orders: { offchainCancelOrder } } }),
    )

    await expect(
      manager.offchainCancelOrder(DEFAULT_SEAPORT_CONTRACT_ADDRESS, orderHash),
    ).resolves.toBe(response)
    expect(offchainCancelOrder).toHaveBeenCalledWith(
      DEFAULT_SEAPORT_CONTRACT_ADDRESS,
      orderHash,
      "ethereum",
      undefined,
    )
  })
})
