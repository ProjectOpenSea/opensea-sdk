import { OpenSeaAPI } from "../../src/api/api"

/**
 * The contract between the sub-clients and `OpenSeaAPI`, shared by the tests that enforce it.
 *
 * Each sub-client is a public property, so `api.collections.getCollectionTraitFloors(slug)` is the
 * supported call and a new sub-client method is reachable the moment it exists. That removes the
 * gap behind [opensea-sdk#2007](https://github.com/ProjectOpenSea/opensea-sdk/issues/2007) by
 * construction rather than by testing for it.
 */

/**
 * Sub-clients exposed as a public property, mapped to the field that exposes them.
 *
 * `search` is deliberately absent. `SearchAPI` holds one method also called `search`, so the
 * property and the existing `api.search()` method want the same name, and adding the property
 * would have to displace a working call, so `api.search(args)` is the call and `searchAPI` stays
 * private.
 */
export const NAMESPACED: Record<string, string> = {
  AccountsAPI: "accounts",
  AssetsAPI: "assets",
  ChainsAPI: "chains",
  CollectionsAPI: "collections",
  DropsAPI: "drops",
  EventsAPI: "events",
  ListingsAPI: "listings",
  NFTsAPI: "nfts",
  OffersAPI: "offers",
  OrdersAPI: "orders",
  SignalsAPI: "signals",
  TokensAPI: "tokens",
  ToolsAPI: "tools",
  TransactionsAPI: "transactions",
  WalletAuthAPI: "walletAuth",
}

/** Sub-clients with no namespace property, and why. */
export const NOT_NAMESPACED: Record<string, string> = {
  SearchAPI:
    "its only method is `search`, which collides with the `api.search()` method",
}

export const isMethodOn = (prototype: object, name: string) =>
  typeof (prototype as Record<string, unknown>)[name] === "function"

export const methodNames = (prototype: object) =>
  Object.getOwnPropertyNames(prototype).filter(
    name => name !== "constructor" && isMethodOn(prototype, name),
  )

/**
 * Every sub-client the `OpenSeaAPI` constructor installs, by class name, mapped to its prototype.
 *
 * Read off a live instance rather than a list, so a sub-client added and forgotten is still
 * covered. TypeScript's `private` is erased at runtime, so the constructor's assignments are
 * ordinary own properties here whether public or not.
 */
export const subClientPrototypes = (): Map<string, object> => {
  const api = new OpenSeaAPI({ apiKey: "key" })
  const found = new Map<string, object>()

  for (const value of Object.values(api)) {
    const name = value?.constructor?.name
    if (
      value &&
      typeof value === "object" &&
      typeof name === "string" &&
      name.endsWith("API")
    ) {
      found.set(name, Object.getPrototypeOf(value))
    }
  }

  return found
}

/** The field each sub-client instance is assigned to, by class name. */
export const subClientFields = (): Map<string, string> => {
  const api = new OpenSeaAPI({ apiKey: "key" })
  const found = new Map<string, string>()

  for (const [field, value] of Object.entries(api)) {
    const name = value?.constructor?.name
    if (
      value &&
      typeof value === "object" &&
      typeof name === "string" &&
      name.endsWith("API")
    ) {
      found.set(name, field)
    }
  }

  return found
}
