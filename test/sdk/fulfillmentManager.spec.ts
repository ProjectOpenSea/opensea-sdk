import { describe, expect, test, vi } from "vitest"
import { DEFAULT_SEAPORT_CONTRACT_ADDRESS } from "../../src/orders/utils"
import { FulfillmentManager } from "../../src/sdk/fulfillment"
import { Chain, EventType } from "../../src/types"
import { createMockContext } from "../fixtures/context"
import { mockListing, mockListingPartiallyFilled } from "../fixtures/listings"
import {
  mockOfferOrderV2,
  mockOrderComponents,
  mockOrderV2,
  mockPrivateListingOrderV2,
} from "../fixtures/orders"

describe("SDK: FulfillmentManager", () => {
  let mockOrdersManager: any
  let mockAPI: any
  let mockSeaport: any
  let mockDispatch: ReturnType<typeof vi.fn>
  let mockConfirmTransaction: ReturnType<typeof vi.fn>
  let mockRequireAccountIsAvailable: ReturnType<typeof vi.fn>
  let mockContext: ReturnType<typeof createMockContext>
  let fulfillmentManager: FulfillmentManager

  let mockTransaction: { hash: string; wait: ReturnType<typeof vi.fn> }
  let mockSigner: { sendTransaction: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockTransaction = {
      hash: "0xTxHash",
      wait: vi.fn().mockResolvedValue({ hash: "0xTxHash" }),
    }

    mockSigner = {
      sendTransaction: vi.fn().mockResolvedValue({ hash: "0xFulfillTxHash" }),
    }

    // Mock OrdersManager
    mockOrdersManager = {
      buildListingOrderComponents: vi
        .fn()
        .mockResolvedValue(mockOrderComponents),
      buildOfferOrderComponents: vi.fn().mockResolvedValue(mockOrderComponents),
    }

    // Mock OpenSeaAPI with full transaction data
    mockAPI = {
      generateFulfillmentData: vi.fn().mockResolvedValue({
        fulfillmentData: {
          transaction: {
            to: "0xSeaportAddress",
            value: 0,
            function:
              "fulfillAdvancedOrder(((address,address,(uint8,address,uint256,uint256,uint256)[],(uint8,address,uint256,uint256,uint256,address)[],uint8,uint256,uint256,bytes32,uint256,bytes32,uint256),uint120,uint120,bytes,bytes),(uint256,uint8,uint256,uint256,bytes32[])[],bytes32,address)",
            inputData: {
              advancedOrder: {
                parameters: {
                  offerer: "0xfba662e1a8e91a350702cf3b87d0c2d2fb4ba57f",
                  zone: "0x0000000000000000000000000000000000000000",
                  offer: [
                    {
                      itemType: 3,
                      token: "0x88d381e3c65221abea498c69e990d1deb7bd3863",
                      identifierOrCriteria: "1",
                      startAmount: "10000",
                      endAmount: "10000",
                    },
                  ],
                  consideration: [
                    {
                      itemType: 0,
                      token: "0x0000000000000000000000000000000000000000",
                      identifierOrCriteria: "0",
                      startAmount: "99000000",
                      endAmount: "99000000",
                      recipient: "0xfba662e1a8e91a350702cf3b87d0c2d2fb4ba57f",
                    },
                  ],
                  orderType: 1,
                  startTime: "1759963495",
                  endTime: "1775515495",
                  zoneHash:
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                  salt: "27855337018906766782546881864045825683096516384821792734247163280454785126732",
                  conduitKey:
                    "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
                  totalOriginalConsiderationItems: "2",
                },
                numerator: 1,
                denominator: 1,
                signature: "0x",
                extraData: "0x",
              },
              criteriaResolvers: [],
              fulfillerConduitKey:
                "0x0000000000000000000000000000000000000000000000000000000000000000",
              recipient: "0x0000000000000000000000000000000000000000",
            },
          },
          orders: [{ signature: "0xNewSignature" }],
        },
      }),
    }

    // Mock Seaport
    mockSeaport = {
      fulfillOrder: vi.fn().mockReturnValue({
        executeAllActions: vi.fn().mockResolvedValue("0xFulfillTxHash"),
      }),
      matchOrders: vi.fn().mockReturnValue({
        transact: vi.fn().mockResolvedValue(mockTransaction),
      }),
      validate: vi.fn().mockReturnValue({
        staticCall: vi.fn().mockResolvedValue(true),
        transact: vi.fn().mockResolvedValue(mockTransaction),
      }),
    }

    // Mock callback functions
    mockDispatch = vi.fn()
    mockConfirmTransaction = vi.fn().mockResolvedValue(undefined)
    mockRequireAccountIsAvailable = vi.fn().mockResolvedValue(undefined)

    // Create SDKContext mock using fixture
    mockContext = createMockContext({
      chain: Chain.Mainnet,
      api: mockAPI,
      seaport: mockSeaport,
      dispatch: mockDispatch,
      confirmTransaction: mockConfirmTransaction,
      requireAccountIsAvailable: mockRequireAccountIsAvailable,
      wallet: { signer: mockSigner, provider: {} },
      contractCaller: {
        encodeFunctionData: vi.fn().mockReturnValue("0xEncodedData"),
        readContract: vi.fn(),
        writeContract: vi.fn(),
      },
    })

    // Create FulfillmentManager instance
    fulfillmentManager = new FulfillmentManager(mockContext, mockOrdersManager)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("fulfillOrder", () => {
    test("fulfills a listing order successfully", async () => {
      const result = await fulfillmentManager.fulfillOrder({
        order: mockOrderV2,
        accountAddress: "0xBuyer",
      })

      expect(mockRequireAccountIsAvailable).toHaveBeenCalledTimes(1)
      expect(mockAPI.generateFulfillmentData).toHaveBeenCalledTimes(1)
      expect(mockSigner.sendTransaction).toHaveBeenCalledTimes(1)
      expect(mockConfirmTransaction).toHaveBeenCalledTimes(1)
      expect(result).toBe("0xFulfillTxHash")
    })

    test("fulfills an offer order successfully", async () => {
      const result = await fulfillmentManager.fulfillOrder({
        order: mockOfferOrderV2,
        accountAddress: "0xSeller",
      })

      expect(mockSigner.sendTransaction).toHaveBeenCalledTimes(1)
      expect(result).toBe("0xFulfillTxHash")
    })

    test("fulfills criteria order with contract and tokenId", async () => {
      await fulfillmentManager.fulfillOrder({
        order: mockOrderV2,
        accountAddress: "0xBuyer",
        assetContractAddress: "0xNFT",
        tokenId: "123",
      })

      expect(mockAPI.generateFulfillmentData).toHaveBeenCalledTimes(1)
      const apiCall = mockAPI.generateFulfillmentData.mock.calls[0]
      expect(apiCall[4]).toBe("0xNFT")
      expect(apiCall[5]).toBe("123")
    })

    test("includes extraData when order has offer protection", async () => {
      mockAPI.generateFulfillmentData.mockResolvedValue({
        fulfillmentData: {
          transaction: {
            to: "0xSeaportAddress",
            value: 0,
            function:
              "fulfillAdvancedOrder(((address,address,(uint8,address,uint256,uint256,uint256)[],(uint8,address,uint256,uint256,uint256,address)[],uint8,uint256,uint256,bytes32,uint256,bytes32,uint256),uint120,uint120,bytes,bytes),(uint256,uint8,uint256,uint256,bytes32[])[],bytes32,address)",
            inputData: {
              advancedOrder: {
                parameters: {
                  offerer: "0xfba662e1a8e91a350702cf3b87d0c2d2fb4ba57f",
                  zone: "0x0000000000000000000000000000000000000000",
                  offer: [
                    {
                      itemType: 3,
                      token: "0x88d381e3c65221abea498c69e990d1deb7bd3863",
                      identifierOrCriteria: "1",
                      startAmount: "10000",
                      endAmount: "10000",
                    },
                  ],
                  consideration: [
                    {
                      itemType: 0,
                      token: "0x0000000000000000000000000000000000000000",
                      identifierOrCriteria: "0",
                      startAmount: "99000000",
                      endAmount: "99000000",
                      recipient: "0xfba662e1a8e91a350702cf3b87d0c2d2fb4ba57f",
                    },
                  ],
                  orderType: 1,
                  startTime: "1759963495",
                  endTime: "1775515495",
                  zoneHash:
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                  salt: "27855337018906766782546881864045825683096516384821792734247163280454785126732",
                  conduitKey:
                    "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
                  totalOriginalConsiderationItems: "2",
                },
                numerator: 1,
                denominator: 1,
                signature: "0x",
                extraData: "0x1234567890abcdef",
              },
              criteriaResolvers: [],
              fulfillerConduitKey:
                "0x0000000000000000000000000000000000000000000000000000000000000000",
              recipient: "0x0000000000000000000000000000000000000000",
            },
          },
          orders: [{ signature: "0xNewSignature" }],
        },
      })

      await fulfillmentManager.fulfillOrder({
        order: mockOrderV2,
        accountAddress: "0xBuyer",
      })

      expect(mockSigner.sendTransaction).toHaveBeenCalledTimes(1)
    })

    test("fulfills order with recipient address", async () => {
      const recipientAddress = "0xRecipient123"
      await fulfillmentManager.fulfillOrder({
        order: mockOrderV2,
        accountAddress: "0xBuyer",
        recipientAddress,
      })

      expect(mockAPI.generateFulfillmentData).toHaveBeenCalledTimes(1)
      const apiCall = mockAPI.generateFulfillmentData.mock.calls[0]
      expect(apiCall[7]).toBe(recipientAddress)
    })

    test("encodes fulfillBasicOrder alias using supported fragment", async () => {
      mockAPI.generateFulfillmentData.mockResolvedValue({
        fulfillmentData: {
          transaction: {
            to: "0xSeaportAddress",
            value: 0,
            function: "fulfillBasicOrder_efficient_6GL6yc((uint256))",
            inputData: {
              basicOrderParameters: {
                offerer: "0xOfferer",
                zone: "0x0000000000000000000000000000000000000000",
              },
            },
          },
          orders: [{ signature: "0xAliasSignature" }],
        },
      })

      // Get the mock contractCaller from context
      const mockContractCaller = (fulfillmentManager as any).context
        .contractCaller
      mockContractCaller.encodeFunctionData.mockReturnValue("0xAliasEncoded")

      const result = await fulfillmentManager.fulfillOrder({
        order: mockOrderV2,
        accountAddress: "0xBuyer",
      })

      expect(result).toBe("0xFulfillTxHash")
      expect(mockSigner.sendTransaction).toHaveBeenCalledTimes(1)
      expect(
        mockContractCaller.encodeFunctionData.mock.calls[0][0],
      ).toMatchObject({ functionName: "fulfillBasicOrder" })
      expect(mockSigner.sendTransaction.mock.calls[0][0].data).toBe(
        "0xAliasEncoded",
      )
    })

    test("encodes fulfillOrder with exactly 2 params (no recipient)", async () => {
      mockAPI.generateFulfillmentData.mockResolvedValue({
        fulfillmentData: {
          transaction: {
            to: "0xSeaportAddress",
            value: 0,
            function:
              "fulfillOrder(((address,address,(uint8,address,uint256,uint256,uint256)[],(uint8,address,uint256,uint256,uint256,address)[],uint8,uint256,uint256,bytes32,uint256,bytes32,uint256),bytes),bytes32)",
            inputData: {
              order: {
                parameters: {
                  offerer: "0xOfferer",
                  zone: "0x0000000000000000000000000000000000000000",
                  offer: [],
                  consideration: [],
                  orderType: 0,
                  startTime: "0",
                  endTime: "9999999999",
                  zoneHash:
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                  salt: "0",
                  conduitKey:
                    "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
                  totalOriginalConsiderationItems: 0,
                },
                signature: "0x",
              },
              fulfillerConduitKey:
                "0x0000000000000000000000000000000000000000000000000000000000000000",
              recipient: "0xSomeRecipient",
            },
          },
          orders: [{ signature: "0xOrderSignature" }],
        },
      })

      // Get the mock contractCaller from context
      const mockContractCaller = (fulfillmentManager as any).context
        .contractCaller
      mockContractCaller.encodeFunctionData.mockReturnValue(
        "0xFulfillOrderEncoded",
      )

      await fulfillmentManager.fulfillOrder({
        order: mockOrderV2,
        accountAddress: "0xBuyer",
      })

      expect(mockContractCaller.encodeFunctionData).toHaveBeenCalledTimes(1)
      expect(
        mockContractCaller.encodeFunctionData.mock.calls[0][0],
      ).toMatchObject({ functionName: "fulfillOrder" })
      // fulfillOrder ABI only accepts 2 params: order and fulfillerConduitKey
      // recipient must NOT be passed
      const encodedArgs =
        mockContractCaller.encodeFunctionData.mock.calls[0][0].args
      expect(encodedArgs).toHaveLength(2)
    })

    test("fulfills private listing successfully", async () => {
      const result = await fulfillmentManager.fulfillOrder({
        order: mockPrivateListingOrderV2,
        accountAddress: "0xPrivateBuyer",
      })

      expect(mockSeaport.matchOrders).toHaveBeenCalledTimes(1)
      expect(mockSeaport.fulfillOrder).not.toHaveBeenCalled()
      expect(result).toBe("0xTxHash")
    })

    test("throws when account is not available", async () => {
      mockRequireAccountIsAvailable.mockRejectedValue(
        new Error("Account not available"),
      )

      try {
        await fulfillmentManager.fulfillOrder({
          order: mockOrderV2,
          accountAddress: "0xBuyer",
        })
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Account not available")
      }
    })

    test("throws when protocol is invalid", async () => {
      const invalidOrder = {
        ...mockOrderV2,
        protocolAddress: "0xInvalidProtocol",
      }

      try {
        await fulfillmentManager.fulfillOrder({
          order: invalidOrder,
          accountAddress: "0xBuyer",
        })
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Unsupported protocol")
      }
    })

    test("handles transaction response as ContractTransactionResponse", async () => {
      const result = await fulfillmentManager.fulfillOrder({
        order: mockOrderV2,
        accountAddress: "0xBuyer",
      })

      expect(result).toBe("0xFulfillTxHash")
    })
  })

  describe("fulfillOrder with an ERC20-priced listing", () => {
    // Mainnet's default conduit, which the OpenSea API returns as the fulfiller
    // conduit key. The buyer approves this address, not Seaport.
    const CONDUIT_KEY =
      "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000"
    const CONDUIT_ADDRESS = "0x1e0049783f008a0085193e00003d00cd54003c71"
    const USDG = "0x1234567890123456789012345678901234567890"
    const SELLER = "0xfba662e1a8e91a350702cf3b87d0c2d2fb4ba57f"

    /** Price the mock listing in USDG: 351 to the seller plus a 9 USDG fee. */
    function priceInErc20({
      fulfillerConduitKey = CONDUIT_KEY,
      numerator = 1,
      denominator = 1,
      seller = "351000000",
      fee = "9000000",
    }: {
      fulfillerConduitKey?: string
      numerator?: number
      denominator?: number
      seller?: string
      fee?: string
    } = {}) {
      mockAPI.generateFulfillmentData.mockResolvedValue({
        fulfillmentData: {
          transaction: {
            to: "0xSeaportAddress",
            value: "0",
            function: "fulfillAdvancedOrder(...)",
            inputData: {
              advancedOrder: {
                parameters: {
                  offerer: SELLER,
                  consideration: [
                    {
                      itemType: 1,
                      token: USDG,
                      identifierOrCriteria: "0",
                      startAmount: seller,
                      endAmount: seller,
                      recipient: SELLER,
                    },
                    {
                      itemType: 1,
                      token: USDG,
                      identifierOrCriteria: "0",
                      startAmount: fee,
                      endAmount: fee,
                      recipient: "0x0000a26b00c1f0df003000390027140000faa719",
                    },
                  ],
                },
                numerator,
                denominator,
                signature: "0x",
                extraData: "0x",
              },
              criteriaResolvers: [],
              fulfillerConduitKey,
              recipient: "0xBuyer",
            },
          },
        },
      })
    }

    /** Stub balanceOf/allowance, and getConduit for a non-default conduit key. */
    function stubErc20Reads({
      balance,
      allowance,
    }: {
      balance: bigint
      allowance: bigint
    }) {
      const readContract = (
        mockContext.contractCaller as unknown as {
          readContract: ReturnType<typeof vi.fn>
        }
      ).readContract
      readContract.mockImplementation(
        async ({ functionName }: { functionName: string }) => {
          switch (functionName) {
            case "balanceOf":
              return balance
            case "allowance":
              return allowance
            case "getConduit":
              return [CONDUIT_ADDRESS, true]
            default:
              throw new Error(`Unexpected read: ${functionName}`)
          }
        },
      )
      return readContract
    }

    test("submits when the buyer has balance and allowance to spare", async () => {
      priceInErc20()
      stubErc20Reads({ balance: 500000000n, allowance: 360000000n })

      const result = await fulfillmentManager.fulfillOrder({
        order: mockOrderV2,
        accountAddress: "0xBuyer",
      })

      expect(result).toBe("0xFulfillTxHash")
      expect(mockSigner.sendTransaction).toHaveBeenCalledTimes(1)
    })

    test("throws before sending when the allowance is short of the total", async () => {
      priceInErc20()
      // Covers the seller's 351 but not the 9 USDG fee on top.
      stubErc20Reads({ balance: 500000000n, allowance: 351000000n })

      await expect(
        fulfillmentManager.fulfillOrder({
          order: mockOrderV2,
          accountAddress: "0xBuyer",
        }),
      ).rejects.toThrow(/not approved/)
      expect(mockSigner.sendTransaction).not.toHaveBeenCalled()
    })

    test("names the conduit and the amount to approve in the error", async () => {
      priceInErc20()
      stubErc20Reads({ balance: 500000000n, allowance: 0n })

      await expect(
        fulfillmentManager.fulfillOrder({
          order: mockOrderV2,
          accountAddress: "0xBuyer",
        }),
      ).rejects.toThrow(`approve(${CONDUIT_ADDRESS}, 360000000)`)
    })

    test("reports insufficient balance ahead of the allowance", async () => {
      priceInErc20()
      stubErc20Reads({ balance: 1n, allowance: 0n })

      await expect(
        fulfillmentManager.fulfillOrder({
          order: mockOrderV2,
          accountAddress: "0xBuyer",
        }),
      ).rejects.toThrow(/Insufficient/)
      expect(mockSigner.sendTransaction).not.toHaveBeenCalled()
    })

    test("checks the allowance against Seaport for a zero conduit key", async () => {
      priceInErc20({ fulfillerConduitKey: `0x${"0".repeat(64)}` })
      const readContract = stubErc20Reads({
        balance: 500000000n,
        allowance: 0n,
      })

      await expect(
        fulfillmentManager.fulfillOrder({
          order: mockOrderV2,
          accountAddress: "0xBuyer",
        }),
      ).rejects.toThrow("0xSeaportAddress")

      // A zero key means Seaport transfers directly, so no conduit is resolved.
      expect(
        readContract.mock.calls.some(
          ([params]) => params.functionName === "getConduit",
        ),
      ).toBe(false)
    })

    test("resolves an unrecognized conduit key through the ConduitController", async () => {
      priceInErc20({ fulfillerConduitKey: `0x${"a".repeat(64)}` })
      const readContract = stubErc20Reads({
        balance: 500000000n,
        allowance: 0n,
      })

      await expect(
        fulfillmentManager.fulfillOrder({
          order: mockOrderV2,
          accountAddress: "0xBuyer",
        }),
      ).rejects.toThrow(CONDUIT_ADDRESS)

      expect(
        readContract.mock.calls.some(
          ([params]) => params.functionName === "getConduit",
        ),
      ).toBe(true)
    })

    test("submits anyway when the allowance cannot be read", async () => {
      priceInErc20()
      const readContract = (
        mockContext.contractCaller as unknown as {
          readContract: ReturnType<typeof vi.fn>
        }
      ).readContract
      readContract.mockRejectedValue(new Error("RPC unavailable"))

      const result = await fulfillmentManager.fulfillOrder({
        order: mockOrderV2,
        accountAddress: "0xBuyer",
      })

      // A failed preflight read must never block a purchase that would succeed.
      expect(result).toBe("0xFulfillTxHash")
    })

    test("reads nothing onchain for a native-priced listing", async () => {
      const readContract = (
        mockContext.contractCaller as unknown as {
          readContract: ReturnType<typeof vi.fn>
        }
      ).readContract

      await fulfillmentManager.fulfillOrder({
        order: mockOrderV2,
        accountAddress: "0xBuyer",
      })

      expect(readContract).not.toHaveBeenCalled()
    })

    test("does not falsely reject a partial fill whose fraction lowers the payment", async () => {
      // A 1/4 fill of seller 80 + fee 20 really costs 25, and the buyer has
      // exactly that. The preflight must skip rather than demand the full 100.
      priceInErc20({ numerator: 1, denominator: 4, seller: "80", fee: "20" })

      const result = await fulfillmentManager.fulfillOrder({
        order: mockOrderV2,
        accountAddress: "0xBuyer",
      })

      expect(result).toBe("0xFulfillTxHash")
      expect(mockSigner.sendTransaction).toHaveBeenCalledTimes(1)

      // Skipping the preflight means no onchain balance/allowance reads.
      const readContract = (
        mockContext.contractCaller as unknown as {
          readContract: ReturnType<typeof vi.fn>
        }
      ).readContract
      expect(readContract).not.toHaveBeenCalled()
    })

    test("still preflights an equal positive fraction (2/2) as a full fill", async () => {
      // 2/2 represents a full fill, so the full 360000000 is required and the
      // preflight must still reject an insufficient allowance.
      priceInErc20({ numerator: 2, denominator: 2 })
      stubErc20Reads({ balance: 500000000n, allowance: 100n })

      await expect(
        fulfillmentManager.fulfillOrder({
          order: mockOrderV2,
          accountAddress: "0xBuyer",
        }),
      ).rejects.toThrow(/not approved/)
      expect(mockSigner.sendTransaction).not.toHaveBeenCalled()
    })
  })

  describe("fulfillOrder with remaining_quantity", () => {
    test("defaults to 1 when unitsToFill not specified for Listing", async () => {
      await fulfillmentManager.fulfillOrder({
        order: mockListing,
        accountAddress: "0xBuyer",
      })

      // SDK defaults unitsToFill to "1" for both listings and offers
      expect(mockSigner.sendTransaction).toHaveBeenCalledTimes(1)
      const apiCall = mockAPI.generateFulfillmentData.mock.calls[0]
      expect(apiCall[6]).toBe("1") // unitsToFill defaults to "1"
    })

    test("defaults to 1 when unitsToFill not specified for partially filled Listing", async () => {
      await fulfillmentManager.fulfillOrder({
        order: mockListingPartiallyFilled,
        accountAddress: "0xBuyer",
      })

      // SDK defaults unitsToFill to "1" for both listings and offers
      expect(mockSigner.sendTransaction).toHaveBeenCalledTimes(1)
      const apiCall = mockAPI.generateFulfillmentData.mock.calls[0]
      expect(apiCall[6]).toBe("1") // unitsToFill defaults to "1"
    })

    test("defaults to 1 when unitsToFill not specified for OrderV2", async () => {
      await fulfillmentManager.fulfillOrder({
        order: mockOrderV2,
        accountAddress: "0xBuyer",
      })

      // SDK defaults unitsToFill to "1" for both listings and offers
      expect(mockSigner.sendTransaction).toHaveBeenCalledTimes(1)
      const apiCall = mockAPI.generateFulfillmentData.mock.calls[0]
      expect(apiCall[6]).toBe("1") // unitsToFill defaults to "1"
    })

    test("passes unitsToFill when specified", async () => {
      const order = {
        orderHash: "0x789",
        chain: "ethereum",
        protocolData: {
          parameters: mockOrderComponents,
          signature: "0xSignature",
        },
        protocolAddress: mockOrderV2.protocolAddress,
        price: {
          currency: "ETH",
          decimals: 18,
          value: "1000000000000000000",
        },
        // Set high so we can verify the explicit unitsToFill (5) is what
        // the SDK forwards to the API, not this value.
        remainingQuantity: 999,
      }

      await fulfillmentManager.fulfillOrder({
        order,
        accountAddress: "0xBuyer",
        unitsToFill: 5,
      })

      expect(mockSigner.sendTransaction).toHaveBeenCalledTimes(1)
      const apiCall = mockAPI.generateFulfillmentData.mock.calls[0]
      expect(apiCall[6]).toBe("5") // unitsToFill passed to API
    })
  })

  describe("isOrderFulfillable", () => {
    test("returns true when order is fulfillable", async () => {
      const result = await fulfillmentManager.isOrderFulfillable({
        order: mockOrderV2,
        accountAddress: "0xBuyer",
      })

      expect(mockSeaport.validate).toHaveBeenCalledTimes(1)
      expect(result).toBe(true)
    })

    test("returns false when order is not fulfillable", async () => {
      mockSeaport.validate.mockReturnValue({
        staticCall: vi.fn().mockResolvedValue(false),
      })

      const result = await fulfillmentManager.isOrderFulfillable({
        order: mockOrderV2,
        accountAddress: "0xBuyer",
      })

      expect(result).toBe(false)
    })

    test("returns false on CALL_EXCEPTION error", async () => {
      const error = new Error("CALL_EXCEPTION") as unknown as {
        code: string
        message: string
      }
      error.code = "CALL_EXCEPTION"

      mockSeaport.validate.mockReturnValue({
        staticCall: vi.fn().mockRejectedValue(error),
      })

      const result = await fulfillmentManager.isOrderFulfillable({
        order: mockOrderV2,
        accountAddress: "0xBuyer",
      })

      expect(result).toBe(false)
    })

    test("throws other errors", async () => {
      mockSeaport.validate.mockReturnValue({
        staticCall: vi.fn().mockRejectedValue(new Error("Unknown error")),
      })

      try {
        await fulfillmentManager.isOrderFulfillable({
          order: mockOrderV2,
          accountAddress: "0xBuyer",
        })
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Unknown error")
      }
    })

    test("throws when protocol is invalid", async () => {
      const invalidOrder = {
        ...mockOrderV2,
        protocolAddress: "0xInvalidProtocol",
      }

      try {
        await fulfillmentManager.isOrderFulfillable({
          order: invalidOrder,
          accountAddress: "0xBuyer",
        })
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Unsupported protocol")
      }
    })
  })

  describe("approveOrder", () => {
    test("approves an order successfully", async () => {
      const result = await fulfillmentManager.approveOrder(mockOrderV2)

      expect(mockRequireAccountIsAvailable).toHaveBeenCalledTimes(1)
      expect(mockDispatch).toHaveBeenCalledTimes(1)
      expect(mockDispatch.mock.calls[0][0]).toBe(EventType.ApproveOrder)
      expect(mockSeaport.validate).toHaveBeenCalledTimes(1)
      expect(mockConfirmTransaction).toHaveBeenCalledTimes(1)
      expect(result).toBe("0xTxHash")
    })

    test("approves order with domain", async () => {
      await fulfillmentManager.approveOrder(mockOrderV2, "opensea.io")

      const validateCall = mockSeaport.validate.mock.calls[0]
      expect(validateCall[2]).toBe("opensea.io")
    })

    test("dispatches ApproveOrder event", async () => {
      await fulfillmentManager.approveOrder(mockOrderV2)

      expect(mockDispatch).toHaveBeenCalledTimes(1)
      const eventData = mockDispatch.mock.calls[0][1]
      expect(eventData.orderV2).toBe(mockOrderV2)
      expect(eventData.accountAddress).toBe("0xMaker")
    })

    test("throws when account is not available", async () => {
      mockRequireAccountIsAvailable.mockRejectedValue(
        new Error("Account not available"),
      )

      try {
        await fulfillmentManager.approveOrder(mockOrderV2)
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Account not available")
      }
    })

    test("throws when protocol is invalid", async () => {
      const invalidOrder = {
        ...mockOrderV2,
        protocolAddress: "0xInvalidProtocol",
      }

      try {
        await fulfillmentManager.approveOrder(invalidOrder)
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Unsupported protocol")
      }
    })
  })

  describe("validateOrderOnchain", () => {
    test("validates order components onchain successfully", async () => {
      const result = await fulfillmentManager.validateOrderOnchain(
        mockOrderComponents,
        "0xValidator",
      )

      expect(mockRequireAccountIsAvailable).toHaveBeenCalledTimes(1)
      expect(mockDispatch).toHaveBeenCalledTimes(1)
      expect(mockDispatch.mock.calls[0][0]).toBe(EventType.ApproveOrder)
      expect(mockSeaport.validate).toHaveBeenCalledTimes(1)
      expect(mockConfirmTransaction).toHaveBeenCalledTimes(1)
      expect(result).toBe("0xTxHash")
    })

    test("dispatches ApproveOrder event with order components", async () => {
      await fulfillmentManager.validateOrderOnchain(
        mockOrderComponents,
        "0xValidator",
      )

      const eventData = mockDispatch.mock.calls[0][1]
      expect(eventData.orderV2.protocolData).toBe(mockOrderComponents)
      expect(eventData.accountAddress).toBe("0xValidator")
    })

    test("calls validate with correct parameters", async () => {
      await fulfillmentManager.validateOrderOnchain(
        mockOrderComponents,
        "0xValidator",
      )

      const validateCall = mockSeaport.validate.mock.calls[0]
      expect(validateCall[0][0].parameters).toBe(mockOrderComponents)
      expect(validateCall[0][0].signature).toBe("0x")
      expect(validateCall[1]).toBe("0xValidator")
    })

    test("throws when account is not available", async () => {
      mockRequireAccountIsAvailable.mockRejectedValue(
        new Error("Account not available"),
      )

      try {
        await fulfillmentManager.validateOrderOnchain(
          mockOrderComponents,
          "0xValidator",
        )
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Account not available")
      }
    })

    test("defaults to a supported protocol when the argument is omitted", async () => {
      // Locks in that the default protocolAddress clears requireValidProtocol.
      // Swapping it for an unsupported address fails here; swapping it for
      // another supported one is not observable, since getSeaportInstance
      // returns the SDK's single Seaport instance either way.
      const result = await fulfillmentManager.validateOrderOnchain(
        mockOrderComponents,
        "0xValidator",
      )

      expect(mockSeaport.validate).toHaveBeenCalledTimes(1)
      expect(result).toBe("0xTxHash")
    })

    test("accepts an explicit supported protocol address", async () => {
      const result = await fulfillmentManager.validateOrderOnchain(
        mockOrderComponents,
        "0xValidator",
        DEFAULT_SEAPORT_CONTRACT_ADDRESS,
      )

      expect(mockSeaport.validate).toHaveBeenCalledTimes(1)
      expect(result).toBe("0xTxHash")
    })

    test("throws for an unsupported protocol address", async () => {
      await expect(
        fulfillmentManager.validateOrderOnchain(
          mockOrderComponents,
          "0xValidator",
          "0x0000000000000000000000000000000000000bad",
        ),
      ).rejects.toThrow("Unsupported protocol")

      expect(mockSeaport.validate).not.toHaveBeenCalled()
    })
  })

  describe("createListingAndValidateOnchain", () => {
    test("creates and validates a listing successfully", async () => {
      const result = await fulfillmentManager.createListingAndValidateOnchain({
        asset: { tokenAddress: "0xNFT", tokenId: "123" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
      })

      expect(
        mockOrdersManager.buildListingOrderComponents,
      ).toHaveBeenCalledTimes(1)
      expect(mockSeaport.validate).toHaveBeenCalledTimes(1)
      expect(result).toBe("0xTxHash")
    })

    test("forwards all listing parameters", async () => {
      await fulfillmentManager.createListingAndValidateOnchain({
        asset: { tokenAddress: "0xNFT", tokenId: "123" },
        accountAddress: "0xSeller",
        amount: "2000000000000000000",
        quantity: 5,
        domain: "opensea.io",
        salt: "12345",
        listingTime: 1000000,
        expirationTime: 2000000,
        buyerAddress: "0xBuyer",
        includeOptionalCreatorFees: true,
        zone: "0xZone",
      })

      const buildCall =
        mockOrdersManager.buildListingOrderComponents.mock.calls[0][0]
      expect(buildCall.asset.tokenAddress).toBe("0xNFT")
      expect(buildCall.amount).toBe("2000000000000000000")
      expect(buildCall.quantity).toBe(5)
      expect(buildCall.domain).toBe("opensea.io")
      expect(buildCall.buyerAddress).toBe("0xBuyer")
    })
  })

  describe("createOfferAndValidateOnchain", () => {
    test("creates and validates an offer successfully", async () => {
      const result = await fulfillmentManager.createOfferAndValidateOnchain({
        asset: { tokenAddress: "0xNFT", tokenId: "123" },
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
      })

      expect(mockOrdersManager.buildOfferOrderComponents).toHaveBeenCalledTimes(
        1,
      )
      expect(mockSeaport.validate).toHaveBeenCalledTimes(1)
      expect(result).toBe("0xTxHash")
    })

    test("forwards all offer parameters", async () => {
      await fulfillmentManager.createOfferAndValidateOnchain({
        asset: { tokenAddress: "0xNFT", tokenId: "123" },
        accountAddress: "0xBuyer",
        amount: "1500000000000000000",
        quantity: 3,
        domain: "test.io",
        salt: "67890",
        expirationTime: 3000000,
        zone: "0xSignedZone",
      })

      const buildCall =
        mockOrdersManager.buildOfferOrderComponents.mock.calls[0][0]
      expect(buildCall.asset.tokenAddress).toBe("0xNFT")
      expect(buildCall.amount).toBe("1500000000000000000")
      expect(buildCall.quantity).toBe(3)
      expect(buildCall.domain).toBe("test.io")
    })
  })

  describe("Constructor", () => {
    test("initializes with all required dependencies", () => {
      const mockContext = createMockContext({
        chain: Chain.Mainnet,
        api: mockAPI,
        seaport: mockSeaport,
        dispatch: mockDispatch,
        confirmTransaction: mockConfirmTransaction,
        requireAccountIsAvailable: mockRequireAccountIsAvailable,
      })

      const manager = new FulfillmentManager(mockContext, mockOrdersManager)

      expect(manager).toBeInstanceOf(FulfillmentManager)
    })
  })
})
