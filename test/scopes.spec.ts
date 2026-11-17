import { describe, expect, it } from "vitest"
import { ALL_SCOPES, OPENSEA_SCOPES } from "../src/scopes.js"

describe("OpenSea auth scopes", () => {
  it("matches the production wallet auth scope set", () => {
    expect(OPENSEA_SCOPES).toEqual({
      READ_ELIGIBILITY: "read:eligibility",
      READ_FAVORITES: "read:favorites",
      READ_SOCIAL: "read:social",
      READ_TOOLS: "read:tools",
      READ_WALLETS: "read:wallets",
      WRITE_FAVORITES: "write:favorites",
      WRITE_POSTS: "write:posts",
      WRITE_SOCIAL: "write:social",
      WRITE_TOOLS: "write:tools",
      WRITE_ORDERS: "write:orders",
      WRITE_DROPS: "write:drops",
      WRITE_COLLECTIONS: "write:collections",
      WRITE_PROFILE: "write:profile",
      WRITE_WALLETS: "write:wallets",
    })
    expect(ALL_SCOPES).toEqual(Object.values(OPENSEA_SCOPES))
  })
})
