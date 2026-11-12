import { AUTH_SCOPES } from "@opensea/api-types"
import { type FetchImpl, fetchWith } from "../utils/fetchTransport"
import type {
  DeviceAuthorizationResponse,
  OAuthDiscoveryDocument,
  OAuthToken,
  OAuthTokenResponse,
  OpenSeaOAuthConfig,
} from "./oauth-types"

const DEFAULT_ISSUER = "https://auth.opensea.io"

/** Grant type for the OAuth 2.0 device authorization flow (RFC 8628). */
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code"

/** Default per-request network timeout for authorization-server calls. */
const DEFAULT_TIMEOUT_MS = 30_000

/**
 * OAuth 2.1 authorization-code + PKCE helper for OpenSea (OS2-33722).
 *
 * Runs the standard flow against the OpenSea authorization server (Zitadel at
 * `auth.opensea.io`) as a public client: no client secret, no private key,
 * no SIWE message signing. This is the same flow spec-compliant MCP clients
 * discover via the MCP server's Protected Resource Metadata, exposed here for
 * programmatic consumers (the CLI's keyless `opensea login` is built on it).
 *
 * Endpoints are resolved from OIDC discovery
 * (`/.well-known/openid-configuration`) rather than hardcoded.
 *
 * @example
 * ```ts
 * const oauth = new OpenSeaOAuth({ clientId: "..." })
 *
 * // Authorization code + PKCE (browser-capable environments)
 * const req = await oauth.createAuthorizationRequest({
 *   redirectUri: "http://127.0.0.1:8151/callback",
 *   scopes: ["read:eligibility"],
 * })
 * // ...direct the user to req.url, receive `code` + `state` on the redirect...
 * const token = await oauth.exchangeCode({
 *   code,
 *   codeVerifier: req.codeVerifier,
 *   redirectUri: "http://127.0.0.1:8151/callback",
 * })
 *
 * // Device flow (headless environments)
 * const device = await oauth.requestDeviceAuthorization()
 * // ...show device.user_code + device.verification_uri to the user...
 * const token2 = await oauth.pollDeviceToken(device)
 * ```
 *
 * @category Authentication
 */
export class OpenSeaOAuth {
  private readonly issuer: string
  private readonly clientId: string
  private readonly timeoutMs: number
  /** Transport for every request this instance makes. See {@link OpenSeaOAuthConfig.fetch}. */
  private readonly fetchImpl: FetchImpl | undefined
  private discovery: OAuthDiscoveryDocument | undefined

  constructor(config: OpenSeaOAuthConfig) {
    if (!config.clientId) {
      throw new Error("OpenSeaOAuth requires a clientId")
    }
    const issuer = (config.issuer ?? DEFAULT_ISSUER).replace(/\/+$/, "")
    assertSecureUrl(issuer, "issuer")
    this.issuer = issuer
    this.clientId = config.clientId
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    // Stored as given, including undefined: fetchWith falls back to globalThis.fetch at call
    // time, so a caller who swaps globalThis.fetch after construction still takes effect.
    this.fetchImpl = config.fetch
  }

  /**
   * Fetch (and cache) the OIDC discovery document for the issuer, then
   * validate it: the advertised `issuer` must match the configured issuer
   * (OpenID Connect Discovery §4.3 / OAuth 2.1 mix-up defense) and the
   * authorization/token endpoints must be secure (`https:`, or loopback for
   * local testing). This prevents a compromised discovery response from
   * redirecting the flow to an attacker-controlled endpoint.
   */
  async getDiscovery(): Promise<OAuthDiscoveryDocument> {
    if (this.discovery) return this.discovery
    const discovery = await this.fetchWithTimeout(
      `${this.issuer}/.well-known/openid-configuration`,
      { headers: { Accept: "application/json" } },
      async response => {
        if (!response.ok) {
          throw new Error(
            `OAuth discovery failed (${response.status}): ${response.statusText}`,
          )
        }
        return (await response.json()) as OAuthDiscoveryDocument
      },
    )
    const advertisedIssuer = discovery.issuer?.replace(/\/+$/, "")
    if (advertisedIssuer !== this.issuer) {
      throw new Error(
        `OAuth discovery issuer mismatch: expected ${this.issuer}, got ${discovery.issuer}`,
      )
    }
    assertSecureUrl(discovery.authorization_endpoint, "authorization_endpoint")
    assertSecureUrl(discovery.token_endpoint, "token_endpoint")
    this.discovery = discovery
    return discovery
  }

  /**
   * Build an authorization request for the code + PKCE flow. Returns the URL
   * to open in a browser plus the `codeVerifier` and `state` the caller must
   * hold on to for {@link exchangeCode} and redirect validation.
   */
  async createAuthorizationRequest(options: {
    redirectUri: string
    scopes?: string[]
  }): Promise<{ url: string; codeVerifier: string; state: string }> {
    const discovery = await this.getDiscovery()
    const codeVerifier = randomUrlSafeString(64)
    const state = randomUrlSafeString(32)
    const codeChallenge = await sha256Base64Url(codeVerifier)

    const url = new URL(discovery.authorization_endpoint)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("client_id", this.clientId)
    url.searchParams.set("redirect_uri", options.redirectUri)
    url.searchParams.set("scope", buildScopeParam(options.scopes))
    url.searchParams.set("state", state)
    url.searchParams.set("code_challenge", codeChallenge)
    url.searchParams.set("code_challenge_method", "S256")

    return { url: url.toString(), codeVerifier, state }
  }

  /** Exchange an authorization code (plus PKCE verifier) for tokens. */
  async exchangeCode(options: {
    code: string
    codeVerifier: string
    redirectUri: string
  }): Promise<OAuthToken> {
    const discovery = await this.getDiscovery()
    const response = await this.postToken(discovery.token_endpoint, {
      grant_type: "authorization_code",
      code: options.code,
      code_verifier: options.codeVerifier,
      redirect_uri: options.redirectUri,
      client_id: this.clientId,
    })
    return toOAuthToken(response)
  }

  /** Refresh an access token using a refresh token. */
  async refresh(refreshToken: string): Promise<OAuthToken> {
    const discovery = await this.getDiscovery()
    const response = await this.postToken(discovery.token_endpoint, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.clientId,
    })
    return toOAuthToken(response, refreshToken)
  }

  /** Revoke an access or refresh token. */
  async revoke(token: string): Promise<void> {
    const discovery = await this.getDiscovery()
    if (!discovery.revocation_endpoint) {
      throw new Error("Authorization server does not support revocation")
    }
    assertSecureUrl(discovery.revocation_endpoint, "revocation_endpoint")
    await this.fetchWithTimeout(
      discovery.revocation_endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, client_id: this.clientId }),
      },
      async response => {
        if (!response.ok) {
          throw new Error(
            `Token revocation failed (${response.status}): ${response.statusText}`,
          )
        }
      },
    )
  }

  /**
   * Start a device authorization flow (RFC 8628), for headless environments
   * where a browser redirect is not possible.
   */
  async requestDeviceAuthorization(options?: {
    scopes?: string[]
  }): Promise<DeviceAuthorizationResponse> {
    const discovery = await this.getDiscovery()
    if (!discovery.device_authorization_endpoint) {
      throw new Error(
        "Authorization server does not support the device authorization flow",
      )
    }
    assertSecureUrl(
      discovery.device_authorization_endpoint,
      "device_authorization_endpoint",
    )
    return this.fetchWithTimeout(
      discovery.device_authorization_endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.clientId,
          scope: buildScopeParam(options?.scopes),
        }),
      },
      async response => {
        if (!response.ok) {
          throw new Error(
            `Device authorization failed (${response.status}): ${response.statusText}`,
          )
        }
        return (await response.json()) as DeviceAuthorizationResponse
      },
    )
  }

  /**
   * Poll the token endpoint until the user completes device authorization.
   * Respects the server-provided `interval` and `slow_down` responses, and
   * stops when `expires_in` elapses.
   */
  async pollDeviceToken(
    device: DeviceAuthorizationResponse,
  ): Promise<OAuthToken> {
    const discovery = await this.getDiscovery()
    const deadline = Date.now() + device.expires_in * 1000
    let intervalMs = (device.interval ?? 5) * 1000

    // Poll first, then sleep between attempts: the user may complete
    // authorization quickly, so waiting a full interval before the first
    // poll only adds latency.
    while (Date.now() < deadline) {
      const poll = await this.fetchWithTimeout(
        discovery.token_endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: DEVICE_GRANT_TYPE,
            device_code: device.device_code,
            client_id: this.clientId,
          }),
        },
        async (
          response,
        ): Promise<
          | { token: OAuthTokenResponse }
          | { error: string | undefined; status: number }
        > => {
          if (response.ok) {
            return { token: (await response.json()) as OAuthTokenResponse }
          }
          const body = (await response.json().catch(() => ({}))) as {
            error?: string
          }
          return { error: body.error, status: response.status }
        },
      )
      if ("token" in poll) {
        return toOAuthToken(poll.token)
      }
      if (poll.error === "slow_down") {
        intervalMs += 5000
      } else if (poll.error !== "authorization_pending") {
        throw new Error(
          `Device authorization failed: ${poll.error ?? poll.status}`,
        )
      }
      await sleep(intervalMs)
    }
    throw new Error("Device authorization timed out")
  }

  private async postToken(
    tokenEndpoint: string,
    params: Record<string, string>,
  ): Promise<OAuthTokenResponse> {
    return this.fetchWithTimeout(
      tokenEndpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params),
      },
      async response => {
        if (!response.ok) {
          const body = await response.text().catch(() => "")
          throw new Error(
            `Token request failed (${response.status}): ${body || response.statusText}`,
          )
        }
        return (await response.json()) as OAuthTokenResponse
      },
    )
  }

  /**
   * `fetch` wrapper that aborts the request after `this.timeoutMs`, so a hung
   * authorization server can't stall the flow indefinitely. The deadline
   * covers `read` as well, since a server can send headers and then stall the
   * body.
   */
  private async fetchWithTimeout<T>(
    input: string,
    init: RequestInit,
    read: (response: Response) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetchWith(this.fetchImpl, input, {
        ...init,
        signal: controller.signal,
      })
      const result = await read(response)
      // A read that swallows its own failure, like `.text().catch(() => "")`,
      // can still resolve after the abort.
      if (controller.signal.aborted) throw new Error("aborted")
      return result
    } catch (error) {
      // Detect our own timeout via the controller rather than the error type:
      // an aborted fetch rejects with a `DOMException` in browsers (not always
      // `instanceof Error`) and an `AbortError` in Node, so `signal.aborted`
      // is the portable signal.
      if (controller.signal.aborted) {
        throw new Error(
          `OAuth request to ${input} timed out after ${this.timeoutMs}ms`,
        )
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * Assert a URL is safe to use as an OAuth endpoint: `https:`, or an `http:`
 * loopback address (`127.0.0.1`/`localhost`/`[::1]`) to support local testing.
 */
function assertSecureUrl(value: string | undefined, label: string): void {
  let url: URL
  try {
    url = new URL(value ?? "")
  } catch {
    throw new Error(`OAuth ${label} is not a valid URL: ${value}`)
  }
  const isLoopback =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "[::1]" ||
    url.hostname === "::1"
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new Error(
      `OAuth ${label} must use https (or http on loopback): ${value}`,
    )
  }
}

/**
 * OIDC scopes requested alongside OpenSea scopes: `openid` for an ID token
 * and `offline_access` for a refresh token.
 */
const BASE_OIDC_SCOPES = ["openid", "offline_access"]
const ZITADEL_PROJECT_ROLE_SCOPE_PREFIX = "urn:zitadel:iam:org:project:role:"
const OPENAPI_AUTH_SCOPE_NAMES = AUTH_SCOPES.map(({ name }) => name)
const OPENAPI_AUTH_SCOPE_NAME_SET = new Set<string>(OPENAPI_AUTH_SCOPE_NAMES)

function buildScopeParam(scopes?: string[]): string {
  if (scopes?.length === 0) {
    throw new Error(
      "OpenSea OAuth scopes cannot be empty; omit scopes to request all default scopes",
    )
  }
  const requestedScopes = [...new Set(scopes ?? OPENAPI_AUTH_SCOPE_NAMES)]
  const unknownScopes = requestedScopes.filter(
    scope => !OPENAPI_AUTH_SCOPE_NAME_SET.has(scope),
  )
  if (unknownScopes.length > 0) {
    throw new Error(`Unknown OpenSea OAuth scopes: ${unknownScopes.join(", ")}`)
  }
  // Zitadel treats project roles as reserved URN scopes. Without at least one
  // role-specific scope it expands the request to every role in the project.
  // Keep the public OpenSea scope names too so OAuth diagnostics stay useful.
  const projectRoleScopes = requestedScopes.map(
    scope => `${ZITADEL_PROJECT_ROLE_SCOPE_PREFIX}${scope}`,
  )
  return [...BASE_OIDC_SCOPES, ...requestedScopes, ...projectRoleScopes].join(
    " ",
  )
}

/** Fallback access-token lifetime when the server omits `expires_in`. */
const DEFAULT_EXPIRES_IN_SECONDS = 3600

function canonicalOpenSeaScopes(scopes: string[]): string[] {
  const granted = new Set(scopes)
  return OPENAPI_AUTH_SCOPE_NAMES.filter(scope => granted.has(scope))
}

/**
 * Read OpenSea API scopes from a JWT access token for client-side display and
 * persistence. This does not verify the token and must not be used to make an
 * authorization decision.
 */
export function extractOpenSeaScopes(accessToken: string): string[] {
  // An opaque token has no claims, and a malformed one cannot be read; either way
  // there is no scope fallback here.
  const claim = tryDecodeJwtPayload(accessToken)?.opensea_scopes
  if (typeof claim === "string") {
    return canonicalOpenSeaScopes(claim.split(/\s+/).filter(Boolean))
  }
  if (Array.isArray(claim)) {
    return canonicalOpenSeaScopes(
      claim.filter((scope): scope is string => typeof scope === "string"),
    )
  }
  return []
}

function tokenOpenSeaScopes(response: OAuthTokenResponse): {
  scopes: string[]
  scopeSource: OAuthToken["scopeSource"]
} {
  const responseScopes = response.scope
    ? canonicalOpenSeaScopes(response.scope.split(/\s+/).filter(Boolean))
    : []
  return responseScopes.length > 0
    ? { scopes: responseScopes, scopeSource: "authorization_server" }
    : {
        scopes: extractOpenSeaScopes(response.access_token),
        scopeSource: "jwt_claim",
      }
}

function toOAuthToken(
  response: OAuthTokenResponse,
  previousRefreshToken?: string,
): OAuthToken {
  const expiresIn =
    typeof response.expires_in === "number" &&
    Number.isFinite(response.expires_in)
      ? response.expires_in
      : DEFAULT_EXPIRES_IN_SECONDS
  const refreshToken = response.refresh_token || previousRefreshToken
  if (!refreshToken) {
    throw new Error("OAuth token response is missing a refresh token")
  }
  const { scopes, scopeSource } = tokenOpenSeaScopes(response)
  return {
    accessToken: response.access_token,
    refreshToken,
    idToken: response.id_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scopes,
    scopeSource,
  }
}

/**
 * Read the wallet address from decoded JWT claims. Zitadel injects it as a
 * top-level `wallet` claim (plaintext) via the `inject_wallet_claim` action,
 * the same claim `opensea-mcp` and the os2-core REST API read. The `sub` claim
 * is an account identifier, not a wallet address, so it must never be used as
 * a fallback. Returns `undefined` when the wallet claim is absent.
 */
export function extractWalletAddress(
  claims: Record<string, unknown>,
): string | undefined {
  if (typeof claims.wallet === "string" && claims.wallet.length > 0) {
    return claims.wallet
  }
  return undefined
}

/**
 * Read every wallet address the token's account has registered, from the
 * `linked_wallets` claim.
 *
 * Webauth mints the claim from the account's registered wallets and it always
 * contains the token's own {@link extractWalletAddress} wallet, so treat the
 * result as the complete set rather than as "the other wallets". Combining it
 * with the `wallet` claim double-counts the primary; using only the `wallet`
 * claim under-reports every account that has linked more than one.
 *
 * Addresses may be from any chain OpenSea supports, EVM and Solana alike, so
 * no format validation is applied here. An entry that is not a non-empty
 * string is dropped, and everything else is returned for the server to judge.
 * Returns an empty array when the claim is absent, is not an array, or the
 * token is not a JWT.
 *
 * This does not verify the token and must not be used to make an authorization
 * decision.
 */
export function extractLinkedWallets(accessToken: string): string[] {
  // An opaque token has no claims and a malformed one cannot be read, so `[]`
  // here means "nothing readable" as well as "no linked wallets". A caller that
  // must not silently under-report a portfolio should check
  // `tryDecodeJwtPayload(token) === null` to tell those apart before treating an
  // empty result as the whole picture. The malformed case is the dangerous one:
  // an opaque token is a deliberate choice, a corrupted one looks identical to
  // an account that simply has one wallet.
  const claim = tryDecodeJwtPayload(accessToken)?.linked_wallets
  if (!Array.isArray(claim)) return []
  const wallets = claim.filter(
    (wallet): wallet is string =>
      typeof wallet === "string" && wallet.trim().length > 0,
  )
  // Exact dedupe, not case-folded: EVM addresses differ only by checksum
  // casing, but Solana base58 addresses are case-sensitive, so lowercasing
  // to compare would risk collapsing two distinct Solana wallets into one.
  return [...new Set(wallets)]
}

/**
 * Decode a JWT payload without verifying the signature, or return `null` when
 * the token is not a readable JWT.
 *
 * OpenSea issues both JWT and opaque access tokens, so "not a JWT" is an
 * expected input here rather than an error. Prefer this over wrapping
 * {@link decodeJwtPayload} in a try/catch, and use it to tell "no claim to
 * read" apart from "claim read, and it was empty": {@link extractLinkedWallets}
 * and {@link extractOpenSeaScopes} both return `[]` for either case.
 */
export function tryDecodeJwtPayload(
  token: string,
): Record<string, unknown> | null {
  try {
    return decodeJwtPayload(token)
  } catch {
    return null
  }
}

/**
 * Decode a JWT payload without verifying the signature. Intended for reading
 * claims from a token the authorization server just issued to us over TLS,
 * NOT for validating inbound tokens.
 *
 * Throws when `token` is not a JWT. {@link tryDecodeJwtPayload} is the
 * non-throwing form, and is what the claim extractors in this module use.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".")
  if (parts.length !== 3) {
    throw new Error("Not a JWT")
  }
  // JWT segments are base64url without padding; restore `+`/`/` and re-pad
  // to a multiple of 4 so `atob` (which is strict about length) won't throw.
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  )
  const json =
    typeof atob === "function"
      ? new TextDecoder().decode(
          Uint8Array.from(atob(padded), c => c.charCodeAt(0)),
        )
      : Buffer.from(padded, "base64").toString("utf-8")
  const payload: unknown = JSON.parse(json)
  // `JSON.parse` happily returns a number, string, boolean, array or null, and
  // asserting any of those to Record<string, unknown> would be a lie that only
  // shows up as `undefined` at the claim read. Rejecting them here is what lets
  // tryDecodeJwtPayload returning null be the complete "unreadable" signal.
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new Error("JWT payload is not an object")
  }
  return payload as Record<string, unknown>
}

function randomUrlSafeString(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  )
  return base64UrlEncode(new Uint8Array(digest))
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) {
    binary += String.fromCharCode(b)
  }
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64")
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
