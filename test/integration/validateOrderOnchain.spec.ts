import type { OrderComponents } from "@opensea/seaport-js/lib/types"
import { beforeAll, describe, expect, test } from "vitest"
import type { OpenSeaSDK } from "../../src/sdk"
import { OFFER_AMOUNT } from "../utils/env"
import { requireFixtureReady } from "../utils/fixture"
import { normalizeChainName } from "../utils/runtime"
import {
  CREATE_LISTING_2_CHAIN,
  CREATE_LISTING_2_CONTRACT_ADDRESS,
  CREATE_LISTING_2_TOKEN_ID,
  getOwnerWallet,
  getSdkForChain,
  getWalletAddress,
  hasWallet,
  LISTING_AMOUNT,
} from "../utils/setupIntegration"
import { getRandomExpiration, getRandomSalt } from "../utils/utils"

/**
 * Reads the order a validate() transaction approved from its OrderValidated
 * event, so the test can check its onchain status and cancel it.
 */
const readValidatedOrder = async (sdk: OpenSeaSDK, txHash: string) => {
  const receipt = await getOwnerWallet(
    sdk.chain,
  ).provider!.getTransactionReceipt(txHash)
  expect(receipt, "validate() receipt").toBeTruthy()
  const contract = sdk.seaport.contract
  const validated = receipt!.logs
    .filter(
      log =>
        log.address.toLowerCase() === String(contract.target).toLowerCase(),
    )
    .map(log => contract.interface.parseLog(log))
    .find(parsed => parsed?.name === "OrderValidated")
  expect(validated, "OrderValidated event").toBeTruthy()

  const orderHash = validated!.args.orderHash as string
  const p = validated!.args.orderParameters
  const counter = await sdk.seaport.getCounter(p.offerer)
  const components: OrderComponents = {
    offerer: p.offerer,
    zone: p.zone,
    offer: p.offer.map((item: OrderComponents["offer"][number]) => ({
      itemType: Number(item.itemType),
      token: item.token,
      identifierOrCriteria: item.identifierOrCriteria.toString(),
      startAmount: item.startAmount.toString(),
      endAmount: item.endAmount.toString(),
    })),
    consideration: p.consideration.map(
      (item: OrderComponents["consideration"][number]) => ({
        itemType: Number(item.itemType),
        token: item.token,
        identifierOrCriteria: item.identifierOrCriteria.toString(),
        startAmount: item.startAmount.toString(),
        endAmount: item.endAmount.toString(),
        recipient: item.recipient,
      }),
    ),
    orderType: Number(p.orderType),
    startTime: p.startTime.toString(),
    endTime: p.endTime.toString(),
    zoneHash: p.zoneHash,
    salt: p.salt.toString(),
    conduitKey: p.conduitKey,
    totalOriginalConsiderationItems: Number(p.totalOriginalConsiderationItems),
    counter: counter.toString(),
  }
  expect(sdk.seaport.getOrderHash(components)).toBe(orderHash)
  return { orderHash, components }
}

/** Asserts the order is validated onchain, cancels it, asserts it is cancelled. */
const expectValidatedThenCancel = async (sdk: OpenSeaSDK, txHash: string) => {
  const { orderHash, components } = await readValidatedOrder(sdk, txHash)
  const statusAfterValidate = await sdk.seaport.getOrderStatus(orderHash)
  expect(statusAfterValidate.isValidated).toBe(true)
  expect(statusAfterValidate.isCancelled).toBe(false)

  await sdk.cancelOrders({
    orders: [components],
    accountAddress: getWalletAddress(),
  })
  const statusAfterCancel = await sdk.seaport.getOrderStatus(orderHash)
  expect(statusAfterCancel.isCancelled).toBe(true)
}

describe.skipIf(!hasWallet)(
  `SDK: validateOrderOnchain - ${normalizeChainName(CREATE_LISTING_2_CHAIN)}`,
  () => {
    beforeAll(requireFixtureReady)

    test("Create listing, validate onchain, then cancel", async () => {
      const sdk = getSdkForChain(CREATE_LISTING_2_CHAIN)

      const txHash = await sdk.createListingAndValidateOnchain({
        accountAddress: getWalletAddress(),
        amount: LISTING_AMOUNT,
        asset: {
          tokenAddress: CREATE_LISTING_2_CONTRACT_ADDRESS,
          tokenId: CREATE_LISTING_2_TOKEN_ID,
        },
        expirationTime: getRandomExpiration(),
        salt: getRandomSalt(),
      })

      expect(txHash).toMatch(/^0x[0-9a-fA-F]{64}$/)
      await expectValidatedThenCancel(sdk, txHash)
    }, 120_000)

    test("Create offer, validate onchain, then cancel", async () => {
      const sdk = getSdkForChain(CREATE_LISTING_2_CHAIN)

      const txHash = await sdk.createOfferAndValidateOnchain({
        accountAddress: getWalletAddress(),
        amount: +OFFER_AMOUNT,
        asset: {
          tokenAddress: CREATE_LISTING_2_CONTRACT_ADDRESS,
          tokenId: CREATE_LISTING_2_TOKEN_ID,
        },
        expirationTime: getRandomExpiration(),
        salt: getRandomSalt(),
      })

      expect(txHash).toMatch(/^0x[0-9a-fA-F]{64}$/)
      await expectValidatedThenCancel(sdk, txHash)
    }, 120_000)
  },
)
