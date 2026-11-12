import { generateRandomSalt } from "@opensea/seaport-js/lib/utils/order"
import { keccak256, toUtf8Bytes, ZeroAddress, ZeroHash } from "ethers"
import { describe, expect, test, vi } from "vitest"
import { ZERO_ADDRESS } from "../../src/constants"
import { OrdersManager } from "../../src/sdk/orders"
import { Chain, OrderSide } from "../../src/types"
import {
  getCurrentUnixTimestamp,
  getUnixTimestampInSeconds,
  TimeInSeconds,
} from "../../src/utils"
import { createMockContext } from "../fixtures/context"

describe("SDK: OrdersManager", () => {
  let mockSeaport: any
  let mockAPI: any
  let mockRequireAccountIsAvailable: ReturnType<typeof vi.fn>
  let mockGetPriceParameters: any
  let ordersManager: OrdersManager

  const mockNFT = {
    identifier: "1234",
    collection: "test-collection",
    contract: "0xNFTContract",
    tokenStandard: "erc721",
    name: "Test NFT",
  }

  const mockCollection = {
    collection: "test-collection",
    name: "Test Collection",
    fees: [
      { recipient: "0xCreator", fee: 250, required: true }, // 2.5%
    ],
    requiredZone: undefined,
  }

  const mockOrder = {
    parameters: {
      offerer: "0xOfferer",
      offer: [],
      consideration: [],
      orderType: 0,
      startTime: "0",
      endTime: "1000000000000",
      zone: ZeroAddress,
      zoneHash: "0x",
      salt: "0",
      conduitKey: "0x",
      totalOriginalConsiderationItems: 0,
    },
    signature: "0xSignature",
  }

  /** The order seaport-js builds, now exposed directly on the create action. */
  const mockOrderComponents = {
    offerer: "0x1111111111111111111111111111111111111111",
    zone: ZeroAddress,
    offer: [
      {
        itemType: 2,
        token: "0x2222222222222222222222222222222222222222",
        identifierOrCriteria: "1234",
        startAmount: "1",
        endAmount: "1",
      },
    ],
    consideration: [
      {
        itemType: 1,
        token: "0x3333333333333333333333333333333333333333",
        identifierOrCriteria: "0",
        startAmount: "975000000000000000",
        endAmount: "975000000000000000",
        recipient: "0x1111111111111111111111111111111111111111",
      },
    ],
    orderType: 2,
    startTime: "0",
    endTime: "1000000000000",
    zoneHash: ZeroHash,
    salt: "0x000000000000000000000000000000000000000000000000f1a2b3c400003039",
    conduitKey: ZeroHash,
    counter: "7",
    totalOriginalConsiderationItems: 1,
  }

  let mockExecuteApprovals: ReturnType<typeof vi.fn>
  let mockCreateOrderAction: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockExecuteApprovals = vi.fn().mockResolvedValue(undefined)
    mockCreateOrderAction = vi.fn().mockResolvedValue(mockOrder)

    // Mock Seaport
    mockSeaport = {
      contract: {
        target: "0xSeaportAddress",
      },
      createOrder: vi.fn().mockResolvedValue({
        actions: [
          { type: "approval" },
          {
            type: "create",
            orderComponents: mockOrderComponents,
            getMessageToSign: vi.fn(),
            createOrder: mockCreateOrderAction,
          },
        ],
        executeApprovals: mockExecuteApprovals,
        executeAllActions: vi.fn().mockResolvedValue(mockOrder),
      }),
    }

    // Mock API
    mockAPI = {
      nfts: {
        getNFT: vi.fn().mockResolvedValue({ nft: mockNFT }),
      },
      collections: {
        getCollection: vi.fn().mockResolvedValue(mockCollection),
      },
      orders: {
        postOffer: vi.fn().mockResolvedValue({
          orderHash: "0xOrderHash",
          protocolData: mockOrder,
          protocolAddress: "0xProtocol",
        }),
        postListing: vi.fn().mockResolvedValue({
          orderHash: "0xOrderHash",
          protocolData: mockOrder,
          protocolAddress: "0xProtocol",
        }),
      },
      offers: {
        buildOffer: vi.fn().mockResolvedValue({
          partialParameters: {
            consideration: [
              {
                itemType: 2,
                token: "0xNFTContract",
                identifierOrCriteria: "0",
                amount: "1",
                endAmount: "1",
              },
            ],
            zone: "0xSignedZone",
          },
          criteria: { collection: { slug: "test-collection" } },
        }),
        postCollectionOffer: vi.fn().mockResolvedValue({
          protocolData: mockOrder,
          protocolAddress: "0xProtocol",
        }),
      },
    }

    // Mock callback functions
    mockRequireAccountIsAvailable = vi.fn().mockResolvedValue(undefined)
    mockGetPriceParameters = vi.fn().mockResolvedValue({
      basePrice: BigInt("1000000000000000000"), // 1 ETH
    })

    // Create SDKContext mock using fixture
    const mockContext = createMockContext({
      chain: Chain.Mainnet,
      api: mockAPI,
      seaport: mockSeaport,
      requireAccountIsAvailable: mockRequireAccountIsAvailable,
    })

    // Create OrdersManager instance with new signature
    ordersManager = new OrdersManager(mockContext, mockGetPriceParameters)
  })

  const createOrdersManagerForChain = (chain: Chain) =>
    new OrdersManager(
      createMockContext({
        chain,
        api: mockAPI,
        seaport: mockSeaport,
        requireAccountIsAvailable: mockRequireAccountIsAvailable,
      }),
      mockGetPriceParameters,
    )

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("createOffer", () => {
    test("creates an offer successfully", async () => {
      const result = await ordersManager.createOffer({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
      })

      expect(mockRequireAccountIsAvailable).toHaveBeenCalledTimes(1)
      expect(mockRequireAccountIsAvailable.mock.calls[0][0]).toBe("0xBuyer")
      expect(mockAPI.nfts.getNFT).toHaveBeenCalledTimes(1)
      expect(mockAPI.collections.getCollection).toHaveBeenCalledTimes(1)
      expect(mockSeaport.createOrder).toHaveBeenCalledTimes(1)
      expect(mockAPI.orders.postOffer).toHaveBeenCalledTimes(1)
      expect(result.orderHash).toBe("0xOrderHash")
    })

    test("creates offer with custom quantity", async () => {
      await ordersManager.createOffer({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 5,
      })

      expect(mockSeaport.createOrder).toHaveBeenCalledTimes(1)
    })

    test("creates offer with expiration time", async () => {
      const expirationTime = getUnixTimestampInSeconds(TimeInSeconds.DAY)

      await ordersManager.createOffer({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        expirationTime,
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.endTime).toBe(BigInt(expirationTime).toString())
    })

    test("creates offer with custom zone", async () => {
      await ordersManager.createOffer({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        zone: "0xCustomZone",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.zone).toBe("0xCustomZone")
    })

    test("creates offer with domain and salt", async () => {
      await ordersManager.createOffer({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        domain: "opensea.io",
        salt: "12345",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.domain).toBe("opensea.io")
      expect(createOrderCall.salt).toBe("12345")
    })

    test("throws when account is not available", async () => {
      mockRequireAccountIsAvailable.mockRejectedValue(
        new Error("Account not available"),
      )

      try {
        await ordersManager.createOffer({
          asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
          accountAddress: "0xBuyer",
          amount: "1000000000000000000",
        })
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Account not available")
      }
    })

    test("uses collection's required zone when specified", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        requiredZone: "0xRequiredZone",
      })

      await ordersManager.createOffer({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.zone).toBe("0xRequiredZone")
    })

    test("uses collection's offer pricing currency when no explicit token", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        pricingCurrencies: {
          offerCurrency: {
            name: "USDC",
            symbol: "USDC",
            decimals: 6,
            address: "0xUSDC",
            chain: "ethereum",
          },
        },
      })

      await ordersManager.createOffer({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.offer[0].token).toBe("0xUSDC")
    })

    test("falls back to chain default when no pricing currencies", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        pricingCurrencies: undefined,
      })

      await ordersManager.createOffer({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      // Chain default for Mainnet offers is WETH
      expect(createOrderCall.offer[0].token).toBe(
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      )
    })

    test("normalizes native Stable Chain offer currency to USDT0", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        pricingCurrencies: {
          offerCurrency: {
            name: "gUSDT0",
            symbol: "gUSDT0",
            decimals: 18,
            address: ZERO_ADDRESS,
            chain: "stable_chain",
          },
        },
      })
      const stableChainOrdersManager = createOrdersManagerForChain(
        Chain.StableChain,
      )

      await stableChainOrdersManager.createOffer({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1.5",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.offer[0].token).toBe(
        "0x779ded0c9e1022225f8e0630b35a9b54be713736",
      )
    })

    test("normalizes native Arc offer currency to USDC", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        pricingCurrencies: {
          offerCurrency: {
            name: "USDC",
            symbol: "USDC",
            decimals: 18,
            address: ZERO_ADDRESS,
            chain: "arc",
          },
        },
      })
      const arcOrdersManager = createOrdersManagerForChain(Chain.Arc)

      await arcOrdersManager.createOffer({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1.5",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.offer[0].token).toBe(
        "0x3600000000000000000000000000000000000000",
      )
    })

    test("passes through an explicit Stable Chain offer mirror", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        pricingCurrencies: {
          offerCurrency: {
            name: "USDT0",
            symbol: "USDT0",
            decimals: 6,
            address: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
            chain: "stable_chain",
          },
        },
      })
      const stableChainOrdersManager = createOrdersManagerForChain(
        Chain.StableChain,
      )

      await stableChainOrdersManager.createOffer({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1.5",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.offer[0].token).toBe(
        "0x779ded0c9e1022225f8e0630b35a9b54be713736",
      )
    })

    test("falls back to the Stable Chain offer mirror without pricing currencies", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        pricingCurrencies: undefined,
      })
      const stableChainOrdersManager = createOrdersManagerForChain(
        Chain.StableChain,
      )

      await stableChainOrdersManager.createOffer({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1.5",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.offer[0].token).toBe(
        "0x779ded0c9e1022225f8e0630b35a9b54be713736",
      )
    })

    test("falls back to the Stable Chain offer mirror for a null currency address", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        pricingCurrencies: {
          offerCurrency: {
            name: "gUSDT0",
            symbol: "gUSDT0",
            decimals: 18,
            address: null,
            chain: "stable_chain",
          },
        },
      })
      const stableChainOrdersManager = createOrdersManagerForChain(
        Chain.StableChain,
      )

      await stableChainOrdersManager.createOffer({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1.5",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.offer[0].token).toBe(
        "0x779ded0c9e1022225f8e0630b35a9b54be713736",
      )
    })
  })

  describe("createListing", () => {
    test("creates a listing successfully", async () => {
      const result = await ordersManager.createListing({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
      })

      expect(mockRequireAccountIsAvailable).toHaveBeenCalledTimes(1)
      expect(mockAPI.nfts.getNFT).toHaveBeenCalledTimes(1)
      expect(mockAPI.collections.getCollection).toHaveBeenCalledTimes(1)
      expect(mockSeaport.createOrder).toHaveBeenCalledTimes(1)
      expect(mockAPI.orders.postListing).toHaveBeenCalledTimes(1)
      expect(result.orderHash).toBe("0xOrderHash")
    })

    test("creates listing with buyer address (private listing)", async () => {
      await ordersManager.createListing({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
        buyerAddress: "0xPrivateBuyer",
      })

      expect(mockSeaport.createOrder).toHaveBeenCalledTimes(1)
    })

    test("creates listing with listing time and expiration", async () => {
      const listingTime = getCurrentUnixTimestamp()
      const expirationTime = getUnixTimestampInSeconds(TimeInSeconds.DAY)

      await ordersManager.createListing({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
        listingTime,
        expirationTime,
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.startTime).toBe(listingTime.toString())
      expect(createOrderCall.endTime).toBe(expirationTime.toString())
    })

    test("creates listing with optional creator fees", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        fees: [
          { recipient: "0xCreator", fee: 250, required: true },
          { recipient: "0xCreator2", fee: 100, required: false },
        ],
      })

      await ordersManager.createListing({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
        includeOptionalCreatorFees: true,
      })

      expect(mockSeaport.createOrder).toHaveBeenCalledTimes(1)
    })

    test("creates listing with custom zone", async () => {
      await ordersManager.createListing({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
        zone: "0xCustomZone",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.zone).toBe("0xCustomZone")
    })

    test("uses collection's required zone when specified", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        requiredZone: "0xRequiredZone",
      })

      await ordersManager.createListing({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.zone).toBe("0xRequiredZone")
    })

    test("creates listing with quantity for semi-fungible tokens", async () => {
      await ordersManager.createListing({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
        quantity: 10,
      })

      expect(mockSeaport.createOrder).toHaveBeenCalledTimes(1)
    })

    test("uses collection's listing pricing currency when no explicit token", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        pricingCurrencies: {
          listingCurrency: {
            name: "USDC",
            symbol: "USDC",
            decimals: 6,
            address: "0xUSDC",
            chain: "ethereum",
          },
        },
      })

      await ordersManager.createListing({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      // The listing consideration's first item (seller payment) should use the resolved token
      expect(createOrderCall.consideration[0].token).toBe("0xUSDC")
    })
  })

  describe("getNFTItems (via createListing)", () => {
    test("defaults amount to '1' when quantity is not provided", async () => {
      await ordersManager.createListing({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.offer[0].amount).toBe("1")
    })

    test("uses provided quantity as amount", async () => {
      await ordersManager.createListing({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
        quantity: 5,
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.offer[0].amount).toBe("5")
    })

    test("uses provided quantity of 1 as amount", async () => {
      await ordersManager.createListing({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
        quantity: 1,
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.offer[0].amount).toBe("1")
    })
  })

  describe("createCollectionOffer", () => {
    test("creates a collection offer successfully", async () => {
      const result = await ordersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 1,
      })

      expect(mockRequireAccountIsAvailable).toHaveBeenCalledTimes(1)
      expect(mockAPI.collections.getCollection).toHaveBeenCalledTimes(1)
      expect(mockAPI.offers.buildOffer).toHaveBeenCalledTimes(1)
      expect(mockSeaport.createOrder).toHaveBeenCalledTimes(1)
      expect(mockAPI.offers.postCollectionOffer).toHaveBeenCalledTimes(1)
      expect(result).not.toBeNull()
    })

    test("creates collection offer with offer protection enabled", async () => {
      await ordersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 1,
        offerProtectionEnabled: true,
      })

      expect(mockAPI.offers.buildOffer).toHaveBeenCalledTimes(1)
      const buildOfferArgs = mockAPI.offers.buildOffer.mock.calls[0]
      expect(buildOfferArgs[3]).toBe(true) // offerProtectionEnabled
    })

    test("creates collection offer with offer protection disabled", async () => {
      await ordersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 1,
        offerProtectionEnabled: false,
      })

      const buildOfferArgs = mockAPI.offers.buildOffer.mock.calls[0]
      expect(buildOfferArgs[3]).toBe(false)
    })

    test("creates collection offer with trait type and value", async () => {
      await ordersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 1,
        traitType: "Background",
        traitValue: "Blue",
      })

      const buildOfferArgs = mockAPI.offers.buildOffer.mock.calls[0]
      expect(buildOfferArgs[4]).toBe("Background")
      expect(buildOfferArgs[5]).toBe("Blue")

      const postOfferArgs = mockAPI.offers.postCollectionOffer.mock.calls[0]
      expect(postOfferArgs[2]).toBe("Background")
      expect(postOfferArgs[3]).toBe("Blue")
    })

    test("creates collection offer with multiple traits", async () => {
      const traits = [
        { type: "Background", value: "Blue" },
        { type: "Hat", value: "Beanie" },
      ]

      await ordersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 1,
        traits,
      })

      const buildOfferArgs = mockAPI.offers.buildOffer.mock.calls[0]
      expect(buildOfferArgs[6]).toEqual(traits)

      const postOfferArgs = mockAPI.offers.postCollectionOffer.mock.calls[0]
      expect(postOfferArgs[4]).toEqual(traits)
    })

    test("creates collection offer with expiration time", async () => {
      const expirationTime = getUnixTimestampInSeconds(TimeInSeconds.DAY)

      await ordersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 1,
        expirationTime,
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.endTime).toBe(expirationTime.toString())
    })

    test("creates collection offer with domain and salt", async () => {
      await ordersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 1,
        domain: "opensea.io",
        salt: "67890",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.domain).toBe("opensea.io")
      expect(createOrderCall.salt).toBe("67890")
    })

    test("creates collection offer with multiple quantity", async () => {
      await ordersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 5,
      })

      const buildOfferArgs = mockAPI.offers.buildOffer.mock.calls[0]
      expect(buildOfferArgs[1]).toBe(5)
    })

    test("throws when account is not available", async () => {
      mockRequireAccountIsAvailable.mockRejectedValue(
        new Error("Account not available"),
      )

      try {
        await ordersManager.createCollectionOffer({
          collectionSlug: "test-collection",
          accountAddress: "0xBuyer",
          amount: "1000000000000000000",
          quantity: 1,
        })
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Account not available")
      }
    })

    test("uses collection's offer pricing currency", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        pricingCurrencies: {
          offerCurrency: {
            name: "USDC",
            symbol: "USDC",
            decimals: 6,
            address: "0xUSDC",
            chain: "ethereum",
          },
        },
      })

      await ordersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 1,
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.offer[0].token).toBe("0xUSDC")
    })

    test("falls back to chain default when no pricing currencies", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        pricingCurrencies: undefined,
      })

      await ordersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 1,
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      // Chain default for Mainnet offers is WETH
      expect(createOrderCall.offer[0].token).toBe(
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      )
    })

    test("normalizes native Stable Chain offer currency to USDT0", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        pricingCurrencies: {
          offerCurrency: {
            name: "gUSDT0",
            symbol: "gUSDT0",
            decimals: 18,
            address: ZERO_ADDRESS,
            chain: "stable_chain",
          },
        },
      })
      const stableChainOrdersManager = createOrdersManagerForChain(
        Chain.StableChain,
      )

      await stableChainOrdersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1.5",
        quantity: 1,
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.offer[0].token).toBe(
        "0x779ded0c9e1022225f8e0630b35a9b54be713736",
      )
    })

    test("passes through an explicit Stable Chain offer mirror", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        pricingCurrencies: {
          offerCurrency: {
            name: "USDT0",
            symbol: "USDT0",
            decimals: 6,
            address: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
            chain: "stable_chain",
          },
        },
      })
      const stableChainOrdersManager = createOrdersManagerForChain(
        Chain.StableChain,
      )

      await stableChainOrdersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1.5",
        quantity: 1,
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.offer[0].token).toBe(
        "0x779ded0c9e1022225f8e0630b35a9b54be713736",
      )
    })

    test("falls back to the Stable Chain offer mirror without pricing currencies", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        pricingCurrencies: undefined,
      })
      const stableChainOrdersManager = createOrdersManagerForChain(
        Chain.StableChain,
      )

      await stableChainOrdersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1.5",
        quantity: 1,
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.offer[0].token).toBe(
        "0x779ded0c9e1022225f8e0630b35a9b54be713736",
      )
    })

    test("passes OrderSide.OFFER to price parameters callback", async () => {
      await ordersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 1,
      })

      expect(mockGetPriceParameters).toHaveBeenCalledTimes(1)
      expect(mockGetPriceParameters.mock.calls[0][0]).toBe(OrderSide.OFFER)
    })

    test("creates collection offer with numeric traits", async () => {
      const numericTraits = [
        { type: "Level", min: 1, max: 10 },
        { type: "Power", min: 50 },
      ]

      await ordersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 1,
        numericTraits,
      })

      const buildOfferArgs = mockAPI.offers.buildOffer.mock.calls[0]
      expect(buildOfferArgs[7]).toEqual(numericTraits)

      const postOfferArgs = mockAPI.offers.postCollectionOffer.mock.calls[0]
      expect(postOfferArgs[5]).toEqual(numericTraits)
    })

    test("creates collection offer with both string traits and numeric traits", async () => {
      const traits = [{ type: "Background", value: "Blue" }]
      const numericTraits = [{ type: "Level", min: 1, max: 10 }]

      await ordersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 1,
        traits,
        numericTraits,
      })

      const buildOfferArgs = mockAPI.offers.buildOffer.mock.calls[0]
      expect(buildOfferArgs[6]).toEqual(traits)
      expect(buildOfferArgs[7]).toEqual(numericTraits)

      const postOfferArgs = mockAPI.offers.postCollectionOffer.mock.calls[0]
      expect(postOfferArgs[4]).toEqual(traits)
      expect(postOfferArgs[5]).toEqual(numericTraits)
    })
  })

  describe("buildOfferOrderComponents", () => {
    test("builds offer order components successfully", async () => {
      const result = await ordersManager.buildOfferOrderComponents({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
      })

      expect(mockRequireAccountIsAvailable).toHaveBeenCalledTimes(1)
      expect(mockAPI.nfts.getNFT).toHaveBeenCalledTimes(1)
      expect(mockAPI.collections.getCollection).toHaveBeenCalledTimes(1)
      expect(mockSeaport.createOrder).toHaveBeenCalledTimes(1)
      expect(result).toEqual(mockOrderComponents)
    })

    test("builds offer components with custom parameters", async () => {
      const result = await ordersManager.buildOfferOrderComponents({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 3,
        domain: "test.io",
        salt: "999",
        expirationTime: 1000000,
        zone: "0xZone",
      })

      expect(result).toEqual(mockOrderComponents)
      expect(mockSeaport.createOrder).toHaveBeenCalledTimes(1)
    })

    test("does not post to API", async () => {
      await ordersManager.buildOfferOrderComponents({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
      })

      expect(mockAPI.orders.postOffer).not.toHaveBeenCalled()
      expect(mockAPI.orders.postListing).not.toHaveBeenCalled()
    })

    test("runs approvals but does not request a signature", async () => {
      await ordersManager.buildOfferOrderComponents({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
      })

      expect(mockExecuteApprovals).toHaveBeenCalledTimes(1)
      expect(mockCreateOrderAction).not.toHaveBeenCalled()
    })
  })

  describe("buildListingOrderComponents", () => {
    test("builds listing order components successfully", async () => {
      const result = await ordersManager.buildListingOrderComponents({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
      })

      expect(mockRequireAccountIsAvailable).toHaveBeenCalledTimes(1)
      expect(mockAPI.nfts.getNFT).toHaveBeenCalledTimes(1)
      expect(mockAPI.collections.getCollection).toHaveBeenCalledTimes(1)
      expect(mockSeaport.createOrder).toHaveBeenCalledTimes(1)
      expect(result).toEqual(mockOrderComponents)
    })

    test("builds listing components with all parameters", async () => {
      const listingTime = getCurrentUnixTimestamp()
      const expirationTime = getUnixTimestampInSeconds(TimeInSeconds.DAY)

      const result = await ordersManager.buildListingOrderComponents({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "2000000000000000000",
        quantity: 5,
        domain: "opensea.io",
        salt: "12345",
        listingTime,
        expirationTime,
        buyerAddress: "0xBuyer",
        includeOptionalCreatorFees: true,
        zone: "0xZone",
      })

      expect(result).toEqual(mockOrderComponents)
      expect(mockSeaport.createOrder).toHaveBeenCalledTimes(1)
    })

    test("does not post to API", async () => {
      await ordersManager.buildListingOrderComponents({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
      })

      expect(mockAPI.orders.postOffer).not.toHaveBeenCalled()
      expect(mockAPI.orders.postListing).not.toHaveBeenCalled()
    })

    test("runs approvals but does not request a signature", async () => {
      await ordersManager.buildListingOrderComponents({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
      })

      expect(mockExecuteApprovals).toHaveBeenCalledTimes(1)
      expect(mockCreateOrderAction).not.toHaveBeenCalled()
    })
  })

  describe("createBulkListings", () => {
    test("creates multiple listings successfully with bulk signature", async () => {
      const mockBulkOrders = [
        {
          parameters: mockOrder.parameters,
          signature: "0xBulkSignature1",
        },
        {
          parameters: {
            ...mockOrder.parameters,
            salt: "1",
          },
          signature: "0xBulkSignature2",
        },
      ]

      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue(mockBulkOrders),
      })

      const result = await ordersManager.createBulkListings({
        listings: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
            amount: "1000000000000000000",
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "5678" },
            amount: "2000000000000000000",
          },
        ],
        accountAddress: "0xSeller",
      })

      expect(mockRequireAccountIsAvailable).toHaveBeenCalledTimes(1)
      expect(mockAPI.nfts.getNFT).toHaveBeenCalledTimes(2)
      expect(mockAPI.collections.getCollection).toHaveBeenCalledTimes(2)
      expect(mockSeaport.createBulkOrders).toHaveBeenCalledTimes(1)
      expect(mockAPI.orders.postListing).toHaveBeenCalledTimes(2)
      expect(result.successful).toHaveLength(2)
      expect(result.failed).toHaveLength(0)
    })

    test("creates single listing with normal signature (not bulk)", async () => {
      const result = await ordersManager.createBulkListings({
        listings: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
            amount: "1000000000000000000",
          },
        ],
        accountAddress: "0xSeller",
      })

      // Should use createListing, not createBulkOrders
      expect(mockSeaport.createOrder).toHaveBeenCalledTimes(1)
      expect(mockSeaport.createBulkOrders).toBeUndefined()
      expect(mockAPI.orders.postListing).toHaveBeenCalledTimes(1)
      expect(result.successful).toHaveLength(1)
      expect(result.failed).toHaveLength(0)
    })

    test("throws error for empty listings array", async () => {
      try {
        await ordersManager.createBulkListings({
          listings: [],
          accountAddress: "0xSeller",
        })
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain(
          "Listings array cannot be empty",
        )
      }
    })

    test("creates bulk listings with different prices", async () => {
      const mockBulkOrders = [
        {
          parameters: mockOrder.parameters,
          signature: "0xBulkSignature1",
        },
        {
          parameters: {
            ...mockOrder.parameters,
            salt: "1",
          },
          signature: "0xBulkSignature2",
        },
        {
          parameters: {
            ...mockOrder.parameters,
            salt: "2",
          },
          signature: "0xBulkSignature3",
        },
      ]

      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue(mockBulkOrders),
      })

      const result = await ordersManager.createBulkListings({
        listings: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1" },
            amount: "1000000000000000000",
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "2" },
            amount: "2000000000000000000",
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "3" },
            amount: "3000000000000000000",
          },
        ],
        accountAddress: "0xSeller",
      })

      expect(result.successful).toHaveLength(3)
      expect(result.failed).toHaveLength(0)
      expect(mockSeaport.createBulkOrders).toHaveBeenCalledTimes(1)
      expect(mockAPI.orders.postListing).toHaveBeenCalledTimes(3)
    })

    test("creates bulk listings with different parameters", async () => {
      const mockBulkOrders = [
        {
          parameters: mockOrder.parameters,
          signature: "0xBulkSignature1",
        },
        {
          parameters: {
            ...mockOrder.parameters,
            salt: "1",
          },
          signature: "0xBulkSignature2",
        },
      ]

      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue(mockBulkOrders),
      })

      const expirationTime = getUnixTimestampInSeconds(TimeInSeconds.DAY)

      await ordersManager.createBulkListings({
        listings: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1" },
            amount: "1000000000000000000",
            domain: "opensea.io",
            expirationTime,
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "2" },
            amount: "2000000000000000000",
            quantity: 5,
            includeOptionalCreatorFees: true,
          },
        ],
        accountAddress: "0xSeller",
      })

      expect(mockSeaport.createBulkOrders).toHaveBeenCalledTimes(1)
    })

    test("throws when account is not available", async () => {
      mockRequireAccountIsAvailable.mockRejectedValue(
        new Error("Account not available"),
      )

      try {
        await ordersManager.createBulkListings({
          listings: [
            {
              asset: { tokenAddress: "0xNFTContract", tokenId: "1" },
              amount: "1000000000000000000",
            },
            {
              asset: { tokenAddress: "0xNFTContract", tokenId: "2" },
              amount: "2000000000000000000",
            },
          ],
          accountAddress: "0xSeller",
        })
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Account not available")
      }
    })

    test("creates bulk listings with private buyers", async () => {
      const mockBulkOrders = [
        {
          parameters: mockOrder.parameters,
          signature: "0xBulkSignature1",
        },
        {
          parameters: {
            ...mockOrder.parameters,
            salt: "1",
          },
          signature: "0xBulkSignature2",
        },
      ]

      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue(mockBulkOrders),
      })

      await ordersManager.createBulkListings({
        listings: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1" },
            amount: "1000000000000000000",
            buyerAddress: "0xBuyer1",
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "2" },
            amount: "2000000000000000000",
            buyerAddress: "0xBuyer2",
          },
        ],
        accountAddress: "0xSeller",
      })

      expect(mockSeaport.createBulkOrders).toHaveBeenCalledTimes(1)
    })

    test("handles bulk operations with more than 20 orders", async () => {
      // Create 25 mock orders
      const mockBulkOrders = Array.from({ length: 25 }, (_, i) => ({
        parameters: {
          ...mockOrder.parameters,
          salt: i.toString(),
        },
        signature: `0xBulkSignature${i}`,
      }))

      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue(mockBulkOrders),
      })

      const listings = Array.from({ length: 25 }, (_, i) => ({
        asset: { tokenAddress: "0xNFTContract", tokenId: i.toString() },
        amount: "1000000000000000000",
      }))

      const result = await ordersManager.createBulkListings({
        listings,
        accountAddress: "0xSeller",
      })

      expect(result.successful).toHaveLength(25)
      expect(result.failed).toHaveLength(0)
      expect(mockSeaport.createBulkOrders).toHaveBeenCalledTimes(1)
      expect(mockAPI.orders.postListing.mock.calls.length).toBe(25)
    })

    test("handles network failures during bulk submission", async () => {
      const mockBulkOrders = [
        {
          parameters: mockOrder.parameters,
          signature: "0xBulkSignature1",
        },
        {
          parameters: {
            ...mockOrder.parameters,
            salt: "1",
          },
          signature: "0xBulkSignature2",
        },
        {
          parameters: {
            ...mockOrder.parameters,
            salt: "2",
          },
          signature: "0xBulkSignature3",
        },
      ]

      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue(mockBulkOrders),
      })

      // Make the second API call fail
      mockAPI.orders.postListing
        .mockResolvedValueOnce({
          orderHash: "0xOrderHash1",
          protocolData: mockOrder,
          protocolAddress: "0xProtocol",
        })
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          orderHash: "0xOrderHash3",
          protocolData: mockOrder,
          protocolAddress: "0xProtocol",
        })

      try {
        await ordersManager.createBulkListings({
          listings: [
            {
              asset: { tokenAddress: "0xNFTContract", tokenId: "1" },
              amount: "1000000000000000000",
            },
            {
              asset: { tokenAddress: "0xNFTContract", tokenId: "2" },
              amount: "2000000000000000000",
            },
            {
              asset: { tokenAddress: "0xNFTContract", tokenId: "3" },
              amount: "3000000000000000000",
            },
          ],
          accountAddress: "0xSeller",
        })
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Network error")
        // Should have called postOrder twice before failing
        expect(mockAPI.orders.postListing.mock.calls.length).toBe(2)
      }
    })
  })

  describe("createBulkOffers", () => {
    test("normalizes native Stable Chain offer currency to USDT0", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        pricingCurrencies: {
          offerCurrency: {
            name: "gUSDT0",
            symbol: "gUSDT0",
            decimals: 18,
            address: ZERO_ADDRESS,
            chain: "stable_chain",
          },
        },
      })
      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue([mockOrder, mockOrder]),
      })
      const stableChainOrdersManager = createOrdersManagerForChain(
        Chain.StableChain,
      )

      await stableChainOrdersManager.createBulkOffers({
        offers: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
            amount: "1.5",
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "5678" },
            amount: "2.5",
          },
        ],
        accountAddress: "0xBuyer",
      })

      const createBulkOrdersCall = mockSeaport.createBulkOrders.mock.calls[0][0]
      expect(createBulkOrdersCall[0].offer[0].token).toBe(
        "0x779ded0c9e1022225f8e0630b35a9b54be713736",
      )
    })

    test("creates multiple offers successfully with bulk signature", async () => {
      const mockBulkOrders = [
        {
          parameters: mockOrder.parameters,
          signature: "0xBulkSignature1",
        },
        {
          parameters: {
            ...mockOrder.parameters,
            salt: "1",
          },
          signature: "0xBulkSignature2",
        },
      ]

      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue(mockBulkOrders),
      })

      const result = await ordersManager.createBulkOffers({
        offers: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
            amount: "1000000000000000000",
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "5678" },
            amount: "2000000000000000000",
          },
        ],
        accountAddress: "0xBuyer",
      })

      expect(mockRequireAccountIsAvailable).toHaveBeenCalledTimes(1)
      expect(mockAPI.nfts.getNFT).toHaveBeenCalledTimes(2)
      expect(mockAPI.collections.getCollection).toHaveBeenCalledTimes(2)
      expect(mockSeaport.createBulkOrders).toHaveBeenCalledTimes(1)
      expect(mockAPI.orders.postOffer).toHaveBeenCalledTimes(2)
      expect(result.successful).toHaveLength(2)
      expect(result.failed).toHaveLength(0)
    })

    test("creates single offer with normal signature (not bulk)", async () => {
      const result = await ordersManager.createBulkOffers({
        offers: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
            amount: "1000000000000000000",
          },
        ],
        accountAddress: "0xBuyer",
      })

      // Should use createOffer, not createBulkOrders
      expect(mockSeaport.createOrder).toHaveBeenCalledTimes(1)
      expect(mockSeaport.createBulkOrders).toBeUndefined()
      expect(mockAPI.orders.postOffer).toHaveBeenCalledTimes(1)
      expect(result.successful).toHaveLength(1)
      expect(result.failed).toHaveLength(0)
    })

    test("throws error for empty offers array", async () => {
      try {
        await ordersManager.createBulkOffers({
          offers: [],
          accountAddress: "0xBuyer",
        })
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain(
          "Offers array cannot be empty",
        )
      }
    })

    test("creates bulk offers with different prices", async () => {
      const mockBulkOrders = [
        {
          parameters: mockOrder.parameters,
          signature: "0xBulkSignature1",
        },
        {
          parameters: {
            ...mockOrder.parameters,
            salt: "1",
          },
          signature: "0xBulkSignature2",
        },
        {
          parameters: {
            ...mockOrder.parameters,
            salt: "2",
          },
          signature: "0xBulkSignature3",
        },
      ]

      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue(mockBulkOrders),
      })

      const result = await ordersManager.createBulkOffers({
        offers: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1" },
            amount: "1000000000000000000",
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "2" },
            amount: "2000000000000000000",
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "3" },
            amount: "3000000000000000000",
          },
        ],
        accountAddress: "0xBuyer",
      })

      expect(result.successful).toHaveLength(3)
      expect(result.failed).toHaveLength(0)
      expect(mockSeaport.createBulkOrders).toHaveBeenCalledTimes(1)
      expect(mockAPI.orders.postOffer).toHaveBeenCalledTimes(3)
    })

    test("creates bulk offers with different parameters", async () => {
      const mockBulkOrders = [
        {
          parameters: mockOrder.parameters,
          signature: "0xBulkSignature1",
        },
        {
          parameters: {
            ...mockOrder.parameters,
            salt: "1",
          },
          signature: "0xBulkSignature2",
        },
      ]

      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue(mockBulkOrders),
      })

      const expirationTime = getUnixTimestampInSeconds(TimeInSeconds.DAY)

      await ordersManager.createBulkOffers({
        offers: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1" },
            amount: "1000000000000000000",
            domain: "opensea.io",
            expirationTime,
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "2" },
            amount: "2000000000000000000",
            quantity: 5,
          },
        ],
        accountAddress: "0xBuyer",
      })

      expect(mockSeaport.createBulkOrders).toHaveBeenCalledTimes(1)
    })

    test("throws when account is not available", async () => {
      mockRequireAccountIsAvailable.mockRejectedValue(
        new Error("Account not available"),
      )

      try {
        await ordersManager.createBulkOffers({
          offers: [
            {
              asset: { tokenAddress: "0xNFTContract", tokenId: "1" },
              amount: "1000000000000000000",
            },
            {
              asset: { tokenAddress: "0xNFTContract", tokenId: "2" },
              amount: "2000000000000000000",
            },
          ],
          accountAddress: "0xBuyer",
        })
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Account not available")
      }
    })

    test("creates bulk offers with custom zones", async () => {
      const mockBulkOrders = [
        {
          parameters: mockOrder.parameters,
          signature: "0xBulkSignature1",
        },
        {
          parameters: {
            ...mockOrder.parameters,
            salt: "1",
          },
          signature: "0xBulkSignature2",
        },
      ]

      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue(mockBulkOrders),
      })

      await ordersManager.createBulkOffers({
        offers: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1" },
            amount: "1000000000000000000",
            zone: "0xCustomZone1",
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "2" },
            amount: "2000000000000000000",
            zone: "0xCustomZone2",
          },
        ],
        accountAddress: "0xBuyer",
      })

      expect(mockSeaport.createBulkOrders).toHaveBeenCalledTimes(1)
    })

    test("uses collection's required zone when specified", async () => {
      mockAPI.collections.getCollection.mockResolvedValue({
        ...mockCollection,
        requiredZone: "0xRequiredZone",
      })

      const mockBulkOrders = [
        {
          parameters: mockOrder.parameters,
          signature: "0xBulkSignature1",
        },
        {
          parameters: {
            ...mockOrder.parameters,
            salt: "1",
          },
          signature: "0xBulkSignature2",
        },
      ]

      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue(mockBulkOrders),
      })

      await ordersManager.createBulkOffers({
        offers: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1" },
            amount: "1000000000000000000",
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "2" },
            amount: "2000000000000000000",
          },
        ],
        accountAddress: "0xBuyer",
      })

      expect(mockSeaport.createBulkOrders).toHaveBeenCalledTimes(1)
    })

    test("handles bulk operations with more than 20 orders", async () => {
      // Create 25 mock orders
      const mockBulkOrders = Array.from({ length: 25 }, (_, i) => ({
        parameters: {
          ...mockOrder.parameters,
          salt: i.toString(),
        },
        signature: `0xBulkSignature${i}`,
      }))

      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue(mockBulkOrders),
      })

      const offers = Array.from({ length: 25 }, (_, i) => ({
        asset: { tokenAddress: "0xNFTContract", tokenId: i.toString() },
        amount: "1000000000000000000",
      }))

      const result = await ordersManager.createBulkOffers({
        offers,
        accountAddress: "0xBuyer",
      })

      expect(result.successful).toHaveLength(25)
      expect(result.failed).toHaveLength(0)
      expect(mockSeaport.createBulkOrders).toHaveBeenCalledTimes(1)
      expect(mockAPI.orders.postOffer.mock.calls.length).toBe(25)
    })

    test("handles network failures during bulk submission", async () => {
      const mockBulkOrders = [
        {
          parameters: mockOrder.parameters,
          signature: "0xBulkSignature1",
        },
        {
          parameters: {
            ...mockOrder.parameters,
            salt: "1",
          },
          signature: "0xBulkSignature2",
        },
        {
          parameters: {
            ...mockOrder.parameters,
            salt: "2",
          },
          signature: "0xBulkSignature3",
        },
      ]

      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue(mockBulkOrders),
      })

      // Make the second API call fail
      mockAPI.orders.postOffer
        .mockResolvedValueOnce({
          orderHash: "0xOrderHash1",
          protocolData: mockOrder,
          protocolAddress: "0xProtocol",
        })
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          orderHash: "0xOrderHash3",
          protocolData: mockOrder,
          protocolAddress: "0xProtocol",
        })

      try {
        await ordersManager.createBulkOffers({
          offers: [
            {
              asset: { tokenAddress: "0xNFTContract", tokenId: "1" },
              amount: "1000000000000000000",
            },
            {
              asset: { tokenAddress: "0xNFTContract", tokenId: "2" },
              amount: "2000000000000000000",
            },
            {
              asset: { tokenAddress: "0xNFTContract", tokenId: "3" },
              amount: "3000000000000000000",
            },
          ],
          accountAddress: "0xBuyer",
        })
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toContain("Network error")
        // Should have called postOrder twice before failing
        expect(mockAPI.orders.postOffer.mock.calls.length).toBe(2)
      }
    })
  })

  describe("salt forwarding", () => {
    /**
     * seaport-js is the thing that turns an absent salt into a random,
     * domain-tagged one, so the SDK's job is to leave the field absent.
     * These two assertions pin the dependency behaviour the fix relies on.
     */
    describe("the seaport-js contract this relies on", () => {
      test("a generated salt is random and carries the domain tag", () => {
        const domain = "api.opensea.io"
        const tag = keccak256(toUtf8Bytes(domain)).slice(0, 10)

        expect(generateRandomSalt(domain).startsWith(tag)).toBe(true)
        expect(generateRandomSalt()).not.toBe(generateRandomSalt())
      })
    })

    const setupBulkOrders = (count: number) => {
      const orders = Array.from({ length: count }, (_, i) => ({
        parameters: { ...mockOrder.parameters, salt: i.toString() },
        signature: `0xBulkSignature${i}`,
      }))
      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue(orders),
      })
    }

    test("createListing leaves an omitted salt undefined so seaport tags it", async () => {
      await ordersManager.createListing({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
        domain: "api.opensea.io",
      })

      const createOrderCall = mockSeaport.createOrder.mock.calls[0][0]
      expect(createOrderCall.salt).toBeUndefined()
      expect(createOrderCall.domain).toBe("api.opensea.io")
    })

    test("createOffer leaves an omitted salt undefined", async () => {
      await ordersManager.createOffer({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
      })

      expect(mockSeaport.createOrder.mock.calls[0][0].salt).toBeUndefined()
    })

    test("createCollectionOffer leaves an omitted salt undefined", async () => {
      await ordersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 1,
      })

      expect(mockSeaport.createOrder.mock.calls[0][0].salt).toBeUndefined()
    })

    test("createBulkOffers leaves an omitted salt undefined", async () => {
      setupBulkOrders(2)

      await ordersManager.createBulkOffers({
        offers: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
            amount: "1000000000000000000",
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "5678" },
            amount: "2000000000000000000",
          },
        ],
        accountAddress: "0xBuyer",
      })

      const inputs = mockSeaport.createBulkOrders.mock.calls[0][0]
      expect(inputs[0].salt).toBeUndefined()
      expect(inputs[1].salt).toBeUndefined()
    })

    test.each([
      ["number", 0],
      ["string", "0"],
      ["bigint", 0n],
    ])("createListing keeps an explicit zero salt (%s)", async (_label, salt) => {
      await ordersManager.createListing({
        asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
        accountAddress: "0xSeller",
        amount: "1000000000000000000",
        salt,
      })

      expect(mockSeaport.createOrder.mock.calls[0][0].salt).toBe("0")
    })

    test("createCollectionOffer keeps an explicit zero salt", async () => {
      await ordersManager.createCollectionOffer({
        collectionSlug: "test-collection",
        accountAddress: "0xBuyer",
        amount: "1000000000000000000",
        quantity: 1,
        salt: 0,
      })

      expect(mockSeaport.createOrder.mock.calls[0][0].salt).toBe("0")
    })

    test("createBulkListings keeps an explicit zero salt", async () => {
      setupBulkOrders(2)

      await ordersManager.createBulkListings({
        listings: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
            amount: "1000000000000000000",
            salt: 0,
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "5678" },
            amount: "2000000000000000000",
            salt: "99",
          },
        ],
        accountAddress: "0xSeller",
      })

      const inputs = mockSeaport.createBulkOrders.mock.calls[0][0]
      expect(inputs[0].salt).toBe("0")
      expect(inputs[1].salt).toBe("99")
    })

    test("createBulkOffers keeps an explicit zero salt", async () => {
      setupBulkOrders(2)

      await ordersManager.createBulkOffers({
        offers: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1234" },
            amount: "1000000000000000000",
            salt: 0,
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "5678" },
            amount: "2000000000000000000",
            salt: "99",
          },
        ],
        accountAddress: "0xBuyer",
      })

      const inputs = mockSeaport.createBulkOrders.mock.calls[0][0]
      expect(inputs[0].salt).toBe("0")
      expect(inputs[1].salt).toBe("99")
    })
  })

  describe("shared bulk plumbing", () => {
    const setupBulkOrders = (count: number) => {
      const orders = Array.from({ length: count }, (_, i) => ({
        parameters: { ...mockOrder.parameters, salt: i.toString() },
        signature: `0xBulkSignature${i}`,
      }))
      mockSeaport.createBulkOrders = vi.fn().mockResolvedValue({
        executeAllActions: vi.fn().mockResolvedValue(orders),
      })
      return orders
    }

    const listingsOfLength = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        asset: { tokenAddress: "0xNFTContract", tokenId: i.toString() },
        amount: `${i + 1}000000000000000000`,
      }))

    test("prices each listing once rather than once per pass", async () => {
      setupBulkOrders(3)

      await ordersManager.createBulkListings({
        listings: listingsOfLength(3),
        accountAddress: "0xSeller",
      })

      expect(mockGetPriceParameters).toHaveBeenCalledTimes(3)
    })

    test("a bad amount throws on the first offending listing, in input order", async () => {
      setupBulkOrders(3)
      mockGetPriceParameters.mockImplementation(
        (_side: OrderSide, _token: string, amount: string) => {
          if (amount.startsWith("bad")) {
            return Promise.reject(new Error(`unpriceable: ${amount}`))
          }
          return Promise.resolve({ basePrice: BigInt("1000000000000000000") })
        },
      )

      await expect(
        ordersManager.createBulkListings({
          listings: [
            {
              asset: { tokenAddress: "0xNFTContract", tokenId: "0" },
              amount: "1000000000000000000",
            },
            {
              asset: { tokenAddress: "0xNFTContract", tokenId: "1" },
              amount: "bad-at-index-1",
            },
            {
              asset: { tokenAddress: "0xNFTContract", tokenId: "2" },
              amount: "bad-at-index-2",
            },
          ],
          accountAddress: "0xSeller",
        }),
      ).rejects.toThrow("unpriceable: bad-at-index-1")

      // Index 2 is never reached, so the error cannot come from a race between
      // the two bad listings.
      expect(mockGetPriceParameters).toHaveBeenCalledTimes(2)
      expect(mockSeaport.createBulkOrders).not.toHaveBeenCalled()
    })

    test("a private bulk listing still gets its buyer consideration", async () => {
      setupBulkOrders(2)

      await ordersManager.createBulkListings({
        listings: [
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "1" },
            amount: "1000000000000000000",
            buyerAddress: "0xBuyer1",
          },
          {
            asset: { tokenAddress: "0xNFTContract", tokenId: "2" },
            amount: "2000000000000000000",
          },
        ],
        accountAddress: "0xSeller",
      })

      const inputs = mockSeaport.createBulkOrders.mock.calls[0][0]
      expect(
        inputs[0].consideration.some(
          (item: { recipient?: string }) => item.recipient === "0xBuyer1",
        ),
      ).toBe(true)
      expect(
        inputs[1].consideration.some(
          (item: { recipient?: string }) => item.recipient === "0xBuyer1",
        ),
      ).toBe(false)
    })

    test("listings and offers report submission identically apart from the noun", async () => {
      const logger = vi.fn()
      const manager = new OrdersManager(
        createMockContext({
          chain: Chain.Mainnet,
          api: mockAPI,
          seaport: mockSeaport,
          logger,
          requireAccountIsAvailable: mockRequireAccountIsAvailable,
        }),
        mockGetPriceParameters,
      )

      setupBulkOrders(2)
      await manager.createBulkListings({
        listings: listingsOfLength(2),
        accountAddress: "0xSeller",
      })
      const listingLines = logger.mock.calls.map(call => call[0])

      logger.mockClear()
      setupBulkOrders(2)
      await manager.createBulkOffers({
        offers: listingsOfLength(2),
        accountAddress: "0xBuyer",
      })
      const offerLines = logger.mock.calls.map(call => call[0])

      expect(listingLines).toEqual([
        "Starting submission of 2 bulk-signed listings to OpenSea API...",
        "Submitting listing 1/2...",
        "Completed listing 1/2",
        "Submitting listing 2/2...",
        "Completed listing 2/2",
        "Successfully submitted 2/2 listings",
      ])
      expect(
        offerLines.map(line => line.replaceAll("offer", "listing")),
      ).toEqual(listingLines)
    })

    test("a failed submission is reported the same way on both sides", async () => {
      const logger = vi.fn()
      const manager = new OrdersManager(
        createMockContext({
          chain: Chain.Mainnet,
          api: mockAPI,
          seaport: mockSeaport,
          logger,
          requireAccountIsAvailable: mockRequireAccountIsAvailable,
        }),
        mockGetPriceParameters,
      )

      setupBulkOrders(2)
      mockAPI.orders.postListing.mockRejectedValueOnce(
        new Error("rate limited"),
      )
      const listingResult = await manager.createBulkListings({
        listings: listingsOfLength(2),
        accountAddress: "0xSeller",
        continueOnError: true,
      })
      const listingLines = logger.mock.calls.map(call => call[0])

      logger.mockClear()
      setupBulkOrders(2)
      mockAPI.orders.postOffer.mockRejectedValueOnce(new Error("rate limited"))
      const offerResult = await manager.createBulkOffers({
        offers: listingsOfLength(2),
        accountAddress: "0xBuyer",
        continueOnError: true,
      })
      const offerLines = logger.mock.calls.map(call => call[0])

      expect(listingResult.failed.map(failure => failure.index)).toEqual([0])
      expect(offerResult.failed.map(failure => failure.index)).toEqual([0])
      expect(listingResult.successful).toHaveLength(1)
      expect(offerResult.successful).toHaveLength(1)
      expect(listingLines).toEqual([
        "Starting submission of 2 bulk-signed listings to OpenSea API...",
        "Submitting listing 1/2...",
        "Failed listing 1/2: rate limited",
        "Submitting listing 2/2...",
        "Completed listing 2/2",
        "Successfully submitted 1/2 listing",
        "Failed to submit 1/2 listing",
      ])
      expect(
        offerLines.map(line => line.replaceAll("offer", "listing")),
      ).toEqual(listingLines)
    })

    test.each([
      ["listing", "0xSeller"],
      ["offer", "0xBuyer"],
    ])("a single %s reports a creation failure at index 0 under continueOnError", async (kind, accountAddress) => {
      mockRequireAccountIsAvailable.mockRejectedValue(
        new Error("Account not available"),
      )

      const single = {
        asset: { tokenAddress: "0xNFTContract", tokenId: "1" },
        amount: "1000000000000000000",
      }
      const result =
        kind === "listing"
          ? await ordersManager.createBulkListings({
              listings: [single],
              accountAddress,
              continueOnError: true,
            })
          : await ordersManager.createBulkOffers({
              offers: [single],
              accountAddress,
              continueOnError: true,
            })

      expect(result.successful).toHaveLength(0)
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0].index).toBe(0)
      expect(result.failed[0].order).toEqual({})
      expect(result.failed[0].error.message).toBe("Account not available")
    })
  })

  describe("Constructor", () => {
    test("initializes with all required dependencies", () => {
      const mockContextPolygon = createMockContext({
        chain: Chain.Polygon,
        api: mockAPI,
        seaport: mockSeaport,
        requireAccountIsAvailable: mockRequireAccountIsAvailable,
      })

      const manager = new OrdersManager(
        mockContextPolygon,
        mockGetPriceParameters,
      )

      expect(manager).toBeInstanceOf(OrdersManager)
    })
  })
})
