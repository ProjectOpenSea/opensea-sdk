import { SeaportABI } from "@opensea/seaport-js/lib/abi/Seaport"
import type {
  EvmTransactionRequest,
  EvmWalletAdapter,
  SignTypedDataRequest,
} from "@opensea/wallet-adapters"
import { walletAdapterToEthersSigner } from "@opensea/wallet-adapters/ethers"
import {
  ethers,
  type JsonRpcPayload,
  JsonRpcProvider,
  type JsonRpcResult,
  Signature,
  verifyTypedData,
} from "ethers"
import { describe, expect, test, vi } from "vitest"
import { OpenSeaSDK } from "../../src"
import type { Listing } from "../../src/api/types"
import { OrderType, type OrderV2 } from "../../src/orders/types"
import { Chain } from "../../src/types"
import { camelizeKeysDeep } from "../../src/utils/case"
import {
  getDefaultConduit,
  getOfferPaymentToken,
  getSeaportAddress,
} from "../../src/utils/chain"
import { mockCollection } from "../fixtures/collections"
import basicNative from "../fixtures/fulfillment/basic-order-native.json"
import { mockNFT } from "../fixtures/nfts"

/**
 * `@opensea/wallet-adapters/ethers` documents its bridge as a standard ethers Signer, and the
 * marketplace skill passes it straight to `new OpenSeaSDK(...)`. This drives the real SDK and the
 * real seaport-js through the bridge, with only the RPC transport and the OpenSea API stubbed, and
 * checks what reaches the adapter on both paths: EIP-712 signing for order creation and offchain
 * cancellation, and `sendTransaction` for approvals, fulfillment and onchain cancellation.
 */

const CHAIN = Chain.Mainnet
const CHAIN_ID = 1
const SEAPORT = getSeaportAddress(CHAIN)
const CONDUIT = getDefaultConduit(CHAIN).address
const WETH = getOfferPaymentToken(CHAIN)
const NFT_CONTRACT = "0x5555555555555555555555555555555555555555"
const TX_HASH = `0x${"ab".repeat(32)}`

const erc = new ethers.Interface([
  "function ownerOf(uint256) view returns (address)",
  "function isApprovedForAll(address,address) view returns (bool)",
  "function getApproved(uint256) view returns (address)",
  "function setApprovalForAll(address,bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function getCounter(address) view returns (uint256)",
])
const seaportInterface = new ethers.Interface(SeaportABI)

/** Answers the reads seaport-js and the SDK make, and fails loudly on anything else. */
class StubProvider extends JsonRpcProvider {
  nftApproved = true

  constructor(private owner: string) {
    super("http://127.0.0.1:1", CHAIN_ID, { staticNetwork: true })
  }

  async _send(
    payload: JsonRpcPayload | JsonRpcPayload[],
  ): Promise<JsonRpcResult[]> {
    const payloads = Array.isArray(payload) ? payload : [payload]
    return payloads.map(p => ({ id: p.id, result: this.answer(p) }))
  }

  private answer({ method, params }: JsonRpcPayload): unknown {
    const args = (params ?? []) as Array<Record<string, string>>
    switch (method) {
      case "eth_blockNumber":
        return "0x10"
      case "eth_call":
        return this.ethCall(args[0].data)
      case "eth_getTransactionByHash":
        return null
      case "eth_getTransactionReceipt":
        return {
          transactionHash: args[0],
          transactionIndex: "0x0",
          blockHash: `0x${"cd".repeat(32)}`,
          blockNumber: "0x10",
          from: this.owner,
          to: SEAPORT,
          contractAddress: null,
          cumulativeGasUsed: "0x5208",
          gasUsed: "0x5208",
          effectiveGasPrice: "0x1",
          logs: [],
          logsBloom: `0x${"00".repeat(256)}`,
          status: "0x1",
          type: "0x2",
        }
    }
    throw new Error(`StubProvider: unexpected ${method}`)
  }

  private ethCall(data: string): string {
    const fragment = erc.getFunction(data.slice(0, 10))
    switch (fragment?.name) {
      case "ownerOf":
        return erc.encodeFunctionResult(fragment, [this.owner])
      case "isApprovedForAll":
        return erc.encodeFunctionResult(fragment, [this.nftApproved])
      case "getApproved":
        return erc.encodeFunctionResult(fragment, [ethers.ZeroAddress])
      case "balanceOf":
      case "allowance":
        return erc.encodeFunctionResult(fragment, [10n ** 30n])
      case "getCounter":
        return erc.encodeFunctionResult(fragment, [0n])
    }
    throw new Error(`StubProvider: unexpected eth_call ${data.slice(0, 10)}`)
  }
}

function setup() {
  const key = ethers.Wallet.createRandom()
  const typedData: SignTypedDataRequest[] = []
  const signatures: string[] = []
  const transactions: EvmTransactionRequest[] = []
  const adapter: EvmWalletAdapter = {
    name: "mock",
    chainType: "evm",
    capabilities: {
      signMessage: true,
      signTypedData: true,
      managedGas: true,
      managedNonce: true,
    },
    // Lowercase, as PrivateKeyAdapter returns it.
    getAddress: async () => key.address.toLowerCase(),
    sendTransaction: async tx => {
      transactions.push(tx)
      return { hash: TX_HASH }
    },
    signMessage: async ({ message }) => key.signMessage(message),
    signTypedData: async request => {
      // Privy posts the request as JSON, so a bigint anywhere in it fails the real call.
      JSON.stringify(request)
      typedData.push(request)
      const signature = await key.signTypedData(
        request.domain,
        request.types,
        request.message,
      )
      signatures.push(signature)
      return signature
    },
  }

  const provider = new StubProvider(key.address)
  const signer = walletAdapterToEthersSigner(adapter, provider)
  const sdk = new OpenSeaSDK(signer, { chain: CHAIN, apiKey: "test" })
  vi.spyOn(sdk.api.nfts, "getNFT").mockResolvedValue({
    nft: { ...mockNFT, contract: NFT_CONTRACT, identifier: "1" },
  })
  vi.spyOn(sdk.api.collections, "getCollection").mockResolvedValue(
    mockCollection,
  )

  return {
    key,
    adapter,
    provider,
    signer,
    sdk,
    typedData,
    signatures,
    transactions,
  }
}

function recover(request: SignTypedDataRequest, signature: string): string {
  return verifyTypedData(
    request.domain,
    request.types,
    request.message,
    signature,
  )
}

/** seaport-js posts the adapter's signature in its EIP-2098 compact form. */
function expectAdapterSignature(
  posted: string | null | undefined,
  fromAdapter: string,
) {
  expect(posted).toBe(Signature.from(fromAdapter).compactSerialized)
}

describe("OpenSeaSDK with walletAdapterToEthersSigner", () => {
  test("getAddress is checksummed, so the SDK finds the account", async () => {
    const { key, signer } = setup()
    expect(await signer.getAddress()).toBe(key.address)
  })

  test("createListing sends the NFT approval and signs the order through the adapter", async () => {
    const { key, provider, signer, sdk, typedData, signatures, transactions } =
      setup()
    provider.nftApproved = false
    const postListing = vi
      .spyOn(sdk.api.orders, "postListing")
      .mockResolvedValue({} as Listing)

    await sdk.createListing({
      asset: { tokenAddress: NFT_CONTRACT, tokenId: "1" },
      accountAddress: await signer.getAddress(),
      amount: "0.5",
    })

    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({
      to: NFT_CONTRACT,
      data: erc.encodeFunctionData("setApprovalForAll", [CONDUIT, true]),
      value: "0",
      chainId: CHAIN_ID,
    })

    expect(typedData).toHaveLength(1)
    const [request] = typedData
    expect(request.primaryType).toBe("OrderComponents")
    expect(request.domain).toEqual({
      name: "Seaport",
      version: "1.6",
      chainId: CHAIN_ID,
      verifyingContract: SEAPORT,
    })
    expect(request.message.offerer).toBe(key.address)
    expect(request.message.offer).toEqual([
      expect.objectContaining({
        token: NFT_CONTRACT,
        identifierOrCriteria: "1",
      }),
    ])

    const [order, protocolAddress] = postListing.mock.calls[0]
    expect(protocolAddress).toBe(SEAPORT)
    expect(order.parameters.offerer).toBe(key.address)
    expectAdapterSignature(order.signature, signatures[0])
    expect(recover(request, order.signature as string)).toBe(key.address)
  })

  test("createOffer signs a WETH offer through the adapter", async () => {
    const { key, signer, sdk, typedData, signatures, transactions } = setup()
    const postOffer = vi
      .spyOn(sdk.api.orders, "postOffer")
      .mockResolvedValue({} as never)

    await sdk.createOffer({
      asset: { tokenAddress: NFT_CONTRACT, tokenId: "1" },
      accountAddress: await signer.getAddress(),
      amount: "0.4",
    })

    expect(transactions).toEqual([])
    const [request] = typedData
    expect(request.primaryType).toBe("OrderComponents")
    expect(request.domain.verifyingContract).toBe(SEAPORT)
    expect(request.message.offer).toEqual([
      expect.objectContaining({
        token: WETH,
        startAmount: (4n * 10n ** 17n).toString(),
      }),
    ])
    expect(request.message.consideration).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: NFT_CONTRACT,
          recipient: key.address,
        }),
      ]),
    )
    const { signature } = postOffer.mock.calls[0][0]
    expectAdapterSignature(signature, signatures[0])
    expect(recover(request, signature as string)).toBe(key.address)
  })

  test("fulfillOrder sends the API's fulfillment transaction through the adapter", async () => {
    const { signer, sdk, transactions } = setup()
    const response = camelizeKeysDeep(basicNative.response)
    vi.spyOn(sdk.api.orders, "generateFulfillmentData").mockResolvedValue(
      response as never,
    )
    const { transaction } = response.fulfillmentData

    const hash = await sdk.fulfillOrder({
      order: {
        orderHash: basicNative._capture.order_hash,
        protocolAddress: SEAPORT,
        type: OrderType.BASIC,
      } as unknown as Listing,
      accountAddress: await signer.getAddress(),
    })

    expect(hash).toBe(TX_HASH)
    expect(transactions).toHaveLength(1)
    const [sent] = transactions
    expect(sent.to.toLowerCase()).toBe(SEAPORT.toLowerCase())
    expect(sent.value).toBe(transaction.value)
    expect(sent.chainId).toBe(CHAIN_ID)
    const decoded = seaportInterface.parseTransaction({ data: sent.data })
    expect(decoded?.name).toBe("fulfillBasicOrder")
    expect(decoded?.args[0].offerer.toLowerCase()).toBe(
      transaction.inputData.parameters.offerer,
    )
  })

  test("cancelOrder sends Seaport's cancel through the adapter", async () => {
    const { key, signer, sdk, transactions } = setup()
    const postListing = vi
      .spyOn(sdk.api.orders, "postListing")
      .mockResolvedValue({} as Listing)
    const accountAddress = await signer.getAddress()
    await sdk.createListing({
      asset: { tokenAddress: NFT_CONTRACT, tokenId: "1" },
      accountAddress,
      amount: "0.5",
    })
    const protocolData = postListing.mock.calls[0][0]

    const hash = await sdk.cancelOrder({
      order: { protocolAddress: SEAPORT, protocolData } as OrderV2,
      accountAddress,
    })

    expect(hash).toBe(TX_HASH)
    expect(transactions).toHaveLength(1)
    const [sent] = transactions
    expect(sent.to).toBe(SEAPORT)
    expect(sent.value).toBe("0")
    const decoded = seaportInterface.parseTransaction({ data: sent.data })
    expect(decoded?.name).toBe("cancel")
    expect(decoded?.args[0][0].offerer).toBe(key.address)
    expect(decoded?.args[0][0].salt).toBe(BigInt(protocolData.parameters.salt))
  })

  test("offchainCancelOrder signs the OrderHash struct through the adapter", async () => {
    const { key, sdk, typedData, signatures } = setup()
    const offchainCancel = vi
      .spyOn(sdk.api.orders, "offchainCancelOrder")
      .mockResolvedValue({} as never)
    const orderHash = `0x${"12".repeat(32)}`

    await sdk.offchainCancelOrder(SEAPORT, orderHash, CHAIN, undefined, true)

    const [request] = typedData
    expect(request.primaryType).toBe("OrderHash")
    expect(request.domain).toMatchObject({
      name: "Seaport",
      verifyingContract: SEAPORT,
    })
    expect(Number(request.domain.chainId)).toBe(CHAIN_ID)
    expect(request.message).toEqual({ orderHash })
    expect(offchainCancel).toHaveBeenCalledWith(
      SEAPORT,
      orderHash,
      CHAIN,
      signatures[0],
    )
    expect(recover(request, signatures[0])).toBe(key.address)
  })
})
