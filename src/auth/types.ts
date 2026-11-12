import type { FetchImpl } from "../utils/fetchTransport"

/**
 * A scoped JWT token returned by the auth server.
 */
export interface AuthToken {
  /** JWT access token */
  accessToken: string
  /** Scoped token (PAT) used to exchange for a new access token */
  refreshToken: string
  /** When the access token expires */
  expiresAt: Date
  /** Scopes granted to this token */
  scopes: string[]
}

/**
 * Options for the {@link OpenSeaAuth.authenticate} method.
 */
export interface AuthenticateOptions {
  /** Scopes to request (e.g. `["read:eligibility", "write:orders"]`) */
  scopes?: string[]
}

/**
 * Configuration for the {@link OpenSeaAuth} class.
 */
export interface OpenSeaAuthConfig {
  /** OpenSea API base URL. Defaults to `https://api.opensea.io`. */
  apiBaseUrl?: string
  /**
   * Transport used for every request this instance makes, defaulting to the global `fetch`.
   * Same seam as {@link OpenSeaAPIConfig.fetch}, so one wrapper can cover the auth flow and the
   * API client.
   *
   * It sees the session cookie, the scoped token and the exchanged JWT, so anything it logs or
   * caches is a credential. Nothing here is a cacheable representation: every call either
   * mints, exchanges or revokes a token.
   */
  fetch?: FetchImpl
}

/**
 * Signer interface compatible with both ethers and viem signers.
 * Requires `getAddress()` and `signMessage(message)`.
 */
export interface AuthSigner {
  getAddress(): Promise<string>
  signMessage(message: string): Promise<string>
}

/**
 * Response from the SIWE nonce endpoint.
 */
export interface AuthNonceResponse {
  nonce: string
}
