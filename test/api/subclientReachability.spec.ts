import { describe, expect, test } from "vitest"
import type { AccountsAPI } from "../../src/api/accounts"
import { OpenSeaAPI } from "../../src/api/api"
import type { AssetsAPI } from "../../src/api/assets"
import type { ChainsAPI } from "../../src/api/chains"
import type { CollectionsAPI } from "../../src/api/collections"
import type { DropsAPI } from "../../src/api/drops"
import type { EventsAPI } from "../../src/api/events"
import type { ListingsAPI } from "../../src/api/listings"
import type { NFTsAPI } from "../../src/api/nfts"
import type { OffersAPI } from "../../src/api/offers"
import type { OrdersAPI } from "../../src/api/orders"
import type { SignalsAPI } from "../../src/api/signals"
import type { TokensAPI } from "../../src/api/tokens"
import type { ToolsAPI } from "../../src/api/tools"
import type { TransactionsAPI } from "../../src/api/transactions"
import type { WalletAuthAPI } from "../../src/api/walletAuth"
import {
  DEPRECATED_FLAT_SURFACE,
  isMethodOn,
  NAMESPACED,
  NOT_NAMESPACED,
  subClientFields,
} from "../utils/forwarderContract"

/**
 * Reachability of the sub-clients through `OpenSeaAPI`.
 *
 * Every sub-client is now a public property, so a method added to `CollectionsAPI` is reachable as
 * soon as it exists. That is what closed
 * [opensea-sdk#2007](https://github.com/ProjectOpenSea/opensea-sdk/issues/2007), where
 * `getCollectionTraitFloors` had shipped with no way to call it, and it closes the class rather
 * than the instance: there is no second edit left to forget.
 *
 * So these tests guard the two things construction does not: that a sub-client is actually exposed
 * rather than left private, and that the deprecated flat surface has not lost a method before the
 * major that removes it.
 */

/**
 * The namespaces a consumer can reach, with the sub-client each must hold.
 *
 * This is the compile-time half, and it is not redundant with the runtime assertions below.
 * TypeScript's `private` is erased, so marking `collections` private would keep every runtime
 * check green while removing the property from the published type: the exact shape of
 * opensea-sdk#2007, one level up. `Pick` fails to compile when a listed key is not public, and the
 * annotation fails when a namespace holds the wrong sub-client.
 */
type Namespaces = {
  accounts: AccountsAPI
  assets: AssetsAPI
  chains: ChainsAPI
  collections: CollectionsAPI
  drops: DropsAPI
  events: EventsAPI
  listings: ListingsAPI
  nfts: NFTsAPI
  offers: OffersAPI
  orders: OrdersAPI
  signals: SignalsAPI
  tokens: TokensAPI
  tools: ToolsAPI
  transactions: TransactionsAPI
  walletAuth: WalletAuthAPI
}

const namespacesArePublic: Namespaces = {} as Pick<OpenSeaAPI, keyof Namespaces>
void namespacesArePublic

describe("sub-client reachability", () => {
  test("finds the sub-clients to check", () => {
    // Guards the enumeration itself. If the constructor stops assigning sub-clients to own
    // properties, every assertion below passes over an empty set.
    const found = subClientFields()

    expect([...found.keys()]).toContain("CollectionsAPI")
    expect(found.size).toBeGreaterThanOrEqual(14)
  })

  test("the compile-time namespace list matches the runtime map", () => {
    // `Namespaces` is written by hand, because types are erased and no runtime read can recover
    // it. If it and NAMESPACED disagree, one of them is checking a surface that does not exist.
    const declared: (keyof Namespaces)[] = [
      "accounts",
      "assets",
      "chains",
      "collections",
      "drops",
      "events",
      "listings",
      "nfts",
      "offers",
      "orders",
      "signals",
      "tokens",
      "tools",
      "transactions",
      "walletAuth",
    ]

    expect(declared.slice().sort()).toEqual(Object.values(NAMESPACED).sort())
  })

  test("every sub-client is either namespaced or a documented exception", () => {
    const undocumented = [...subClientFields().keys()].filter(
      name => !(name in NAMESPACED) && !(name in NOT_NAMESPACED),
    )

    expect(undocumented).toEqual([])
  })

  test("each namespace is a public property holding its sub-client", () => {
    const api = new OpenSeaAPI({ apiKey: "key" })
    const fields = subClientFields()

    const wrong = Object.entries(NAMESPACED).filter(([client, property]) => {
      const value = (api as unknown as Record<string, unknown>)[property]
      return (
        fields.get(client) !== property ||
        !value ||
        (value as object).constructor?.name !== client
      )
    })

    expect(wrong).toEqual([])
  })

  test("the search exception still describes reality", () => {
    // Otherwise NOT_NAMESPACED becomes a place to record an exception that no longer applies, and
    // the reason attached to it goes stale without anything noticing.
    const namespaceProperties = new Set(Object.values(NAMESPACED))

    for (const client of Object.keys(NOT_NAMESPACED)) {
      const field = subClientFields().get(client)

      expect(field, `${client} is not installed at all`).toBeDefined()
      // Not reachable under any name we document as a namespace.
      expect(namespaceProperties.has(field as string)).toBe(false)
    }

    // And the call the exception exists to protect still works.
    expect(isMethodOn(OpenSeaAPI.prototype, "search")).toBe(true)
  })

  test("the deprecated flat surface has not lost a method", () => {
    // These stay callable until the major that removes them. Dropping one early breaks anyone
    // still on the flat style, and nothing else here would notice: the namespaces would still
    // work and every other test would still pass.
    const missing = DEPRECATED_FLAT_SURFACE.filter(
      name => !isMethodOn(OpenSeaAPI.prototype, name),
    )

    expect(missing).toEqual([])
  })
})
