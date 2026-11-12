import type { OrderComponents } from "@opensea/seaport-js/lib/types"
import { expect, inject } from "vitest"
import type { OpenSeaSDK } from "../../src/sdk"
import { type Chain, TokenStandard } from "../../src/types"
import { getNativeWrapTokenAddress } from "../../src/utils/chain"
import {
  FIXTURE_CHAIN,
  FIXTURE_CONTRACT_ADDRESS,
  FIXTURE_TOKEN_ID,
  getReadOnlySdkForChain,
} from "./setupIntegration"

declare module "vitest" {
  export interface ProvidedContext {
    /** Set by integrationGlobalSetup.ts when the buyer top-up failed. */
    fixtureSetupError: string
  }
}

export const fixtureAsset = (tokenId: string = FIXTURE_TOKEN_ID) => ({
  tokenAddress: FIXTURE_CONTRACT_ADDRESS,
  tokenId,
})

export const fixtureAssetWithStandard = (
  tokenId: string = FIXTURE_TOKEN_ID,
) => ({
  ...fixtureAsset(tokenId),
  tokenStandard: TokenStandard.ERC1155,
})

export const wethAsset = () => ({
  tokenAddress: getNativeWrapTokenAddress(FIXTURE_CHAIN),
  tokenId: null,
  tokenStandard: TokenStandard.ERC20,
})

export const getFixtureBalance = (
  sdk: OpenSeaSDK,
  accountAddress: string,
  tokenId: string = FIXTURE_TOKEN_ID,
) =>
  sdk.getBalance({ accountAddress, asset: fixtureAssetWithStandard(tokenId) })

let fixtureSlug: Promise<string> | undefined

/** OpenSea collection slug of the fixture contract, read from its NFT. */
export const getFixtureCollectionSlug = (): Promise<string> => {
  fixtureSlug ??= getReadOnlySdkForChain(FIXTURE_CHAIN)
    .api.nfts.getNFT(FIXTURE_CONTRACT_ADDRESS, FIXTURE_TOKEN_ID, FIXTURE_CHAIN)
    .then(({ nft }) => nft.collection)
  return fixtureSlug
}

/** Throws in a spec's beforeAll when the global top-up failed. */
export const requireFixtureReady = () => {
  const error = inject("fixtureSetupError")
  if (error) {
    throw new Error(`Fixture setup failed: ${error}`)
  }
}

/**
 * Polls `probe` until it returns a non-undefined value. The API indexes a
 * posted order asynchronously for some read endpoints.
 */
export const pollUntil = async <T>(
  label: string,
  probe: () => Promise<T | undefined>,
  { timeoutMs = 30_000, intervalMs = 2_000 } = {},
): Promise<T> => {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const value = await probe()
      if (value !== undefined) {
        return value
      }
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${label}${lastError ? `: ${lastError}` : ""}`,
  )
}

/**
 * Waits until the API serves `order` by hash. Posting returns before the order
 * is indexed, and fulfillment data, offchain cancels and private-listing
 * signatures all fail with "Order not found" until it is.
 */
export const waitForIndexed = (
  sdk: OpenSeaSDK,
  order: { orderHash?: string | null; protocolAddress?: string | null },
  chain: Chain,
) =>
  pollUntil(`order ${order.orderHash} to be indexed`, () =>
    sdk.api.orders.getOrderByHash(
      order.orderHash!,
      order.protocolAddress!,
      chain,
    ),
  )

type TrackableOrder = {
  orderHash?: string | null
  protocolData?: { parameters: OrderComponents } | null
} | null

/**
 * Collects the orders a spec creates so afterAll can cancel them onchain in
 * one transaction. Offchain cancellation is refused for recently created
 * orders and is not assured once a fulfillment signature has been vended, so
 * cleanup does not rely on it. Orders already filled or cancelled are skipped.
 */
export class OrderTracker {
  private readonly orders = new Map<string, OrderComponents>()

  track(order: TrackableOrder) {
    if (!order?.orderHash || !order.protocolData) {
      throw new Error(
        "Cannot track an order without orderHash and protocolData",
      )
    }
    this.orders.set(order.orderHash, order.protocolData.parameters)
  }

  trackComponents(orderHash: string, components: OrderComponents) {
    this.orders.set(orderHash, components)
  }

  /** Drop an order that was cancelled some other way. */
  forget(orderHash: string) {
    this.orders.delete(orderHash)
  }

  async cancelAll(sdk: OpenSeaSDK, accountAddress: string) {
    const open: Array<[string, OrderComponents]> = []
    for (const [orderHash, components] of this.orders) {
      const status = await sdk.seaport.getOrderStatus(orderHash)
      const filled =
        status.totalSize > 0n && status.totalFilled >= status.totalSize
      if (!status.isCancelled && !filled) {
        open.push([orderHash, components])
      }
    }
    this.orders.clear()
    if (open.length === 0) {
      return
    }

    await sdk.cancelOrders({
      orders: open.map(([, components]) => components),
      accountAddress,
    })
    for (const [orderHash] of open) {
      const status = await sdk.seaport.getOrderStatus(orderHash)
      expect(status.isCancelled, `order ${orderHash} cancelled`).toBe(true)
    }
  }
}
