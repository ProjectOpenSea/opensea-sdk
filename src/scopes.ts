import type { AuthScope } from "@opensea/api-types"

/**
 * OAuth-style scopes recognized by the OpenSea API.
 *
 * The set of valid scopes is defined by the `AuthScope` schema in the
 * OpenAPI spec (via `@opensea/api-types`). The compile-time assertions
 * below fail the build if this runtime constant drifts from the spec
 * in either direction.
 * @category Auth
 */
export const OPENSEA_SCOPES = {
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
} as const satisfies Record<string, AuthScope>

/**
 * Union of all valid OpenSea API scope strings, derived from the
 * OpenAPI spec's `AuthScope` schema.
 * @category Auth
 */
export type OpenSeaScope = AuthScope

type _AssertAllAuthScopesCovered =
  AuthScope extends (typeof OPENSEA_SCOPES)[keyof typeof OPENSEA_SCOPES]
    ? true
    : never

const _assertAllAuthScopesCovered: _AssertAllAuthScopesCovered = true

/**
 * All OpenSea API scopes as a readonly list.
 * @category Auth
 */
export const ALL_SCOPES: readonly OpenSeaScope[] = Object.values(OPENSEA_SCOPES)
