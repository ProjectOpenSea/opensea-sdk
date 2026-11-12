import { type FetchImpl, fetchWith } from "../utils/fetchTransport"
import { createSiwxMessage, parseSiwxMessage } from "./siwx"
import type {
  AuthenticateOptions,
  AuthNonceResponse,
  AuthSigner,
  AuthToken,
  OpenSeaAuthConfig,
} from "./types"

export type {
  AccountType,
  ChainArch,
  CreateSiwxMessageOptions,
  LinkWalletWithSiwxOptions,
  ParseSiwxMessageResult,
  RequestWalletLinkNonceOptions,
} from "./siwx"
export {
  chainArchToAccountType,
  createSiwxMessage,
  linkWalletWithSiwx,
  parseSiwxMessage,
  requestSiwxNonce,
  requestWalletLinkNonce,
} from "./siwx"
export type {
  AuthenticateOptions,
  AuthNonceResponse,
  AuthSigner,
  AuthToken,
  OpenSeaAuthConfig,
}

const DEFAULT_API_BASE_URL = "https://api.opensea.io"
const DEFAULT_TOKEN_TTL_SECONDS = 3600
const SCOPED_TOKEN_CLEANUP_ATTEMPTS = 2
const REFRESH_BUFFER_MS = 60_000
const SIWE_STATEMENT =
  "Click to sign in and accept the Platform Terms of Service (https://opensea.io/tos) and Privacy Policy (https://opensea.io/privacy)."
const SESSION_COOKIE_NAMES = ["access_token", "refresh_token"]

interface ScopedTokenCreatedResponse {
  id: string
  token: string
  scopes: string[]
}

interface ScopedTokenExchangeResponse {
  accessToken: string
  expiresIn?: number
  tokenScopes?: string[]
}

/**
 * SIWE-based authentication helper for OpenSea.
 *
 * Establishes a browser-style wallet session, creates a one-day scoped token,
 * and exchanges that token for the short-lived JWT used by REST and MCP. Token
 * management remains bound to the wallet session, while automatic JWT refresh
 * uses the scoped token.
 *
 * @example
 * ```ts
 * import { OpenSeaAuth } from "@opensea/sdk"
 *
 * const auth = new OpenSeaAuth()
 * const token = await auth.authenticate(signer, {
 *   scopes: ["read:eligibility", "write:orders"],
 * })
 * const freshToken = await auth.getValidToken()
 * await auth.revoke(freshToken.accessToken)
 * ```
 *
 * @category Authentication
 */
export class OpenSeaAuth {
  private readonly apiBaseUrl: string
  /** Transport for every request this instance makes. See {@link OpenSeaAuthConfig.fetch}. */
  private readonly fetchImpl: FetchImpl | undefined
  private cachedToken: AuthToken | undefined
  private scopedTokenId: string | undefined
  private sessionCookies: string | undefined

  constructor(config: OpenSeaAuthConfig = {}) {
    this.apiBaseUrl = (config.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(
      /\/$/,
      "",
    )
    // Stored as given, including undefined: fetchWith falls back to globalThis.fetch at call
    // time, so a caller who swaps globalThis.fetch after construction still takes effect.
    this.fetchImpl = config.fetch
  }

  /** Run the current SIWE, scoped-token creation, and token-exchange flow. */
  async authenticate(
    signer: AuthSigner,
    options: AuthenticateOptions = {},
  ): Promise<AuthToken> {
    const scopes = options.scopes ?? []
    const address = await signer.getAddress()
    const { nonce } = await this.requestNonce()
    // Webauth uses SIWE only to establish the wallet session. Including PAT
    // scopes here does not round-trip through its signature reconstruction;
    // scope entitlement is enforced by the session-authorized token request.
    const message = generateSiweMessage(address, [], nonce, this.apiBaseUrl)
    const signature = await signer.signMessage(message)
    const cookie = await this.verifySignature(message, signature)
    const scopedToken = await this.createScopedToken(cookie, scopes)

    let exchange: ScopedTokenExchangeResponse
    try {
      exchange = await this.exchangeScopedToken(scopedToken.token)
    } catch (error) {
      await this.cleanupScopedToken(cookie, scopedToken.id)
      throw error
    }

    const token = toAuthToken(exchange, scopedToken)
    this.cachedToken = token
    this.scopedTokenId = scopedToken.id
    this.sessionCookies = cookie
    return token
  }

  /** Return a valid JWT, exchanging the stored scoped token when needed. */
  async getValidToken(): Promise<AuthToken> {
    if (!this.cachedToken) {
      throw new Error(
        "No auth token available. Call authenticate() with a signer first.",
      )
    }

    if (this.cachedToken.expiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS) {
      const exchange = await this.exchangeScopedToken(
        this.cachedToken.refreshToken,
      )
      this.cachedToken = toAuthToken(exchange, {
        id: this.scopedTokenId ?? "",
        token: this.cachedToken.refreshToken,
        scopes: this.cachedToken.scopes,
      })
    }

    return this.cachedToken
  }

  /** Revoke the scoped token backing the current JWT. */
  async revoke(accessToken: string): Promise<void> {
    if (
      !this.cachedToken ||
      !this.scopedTokenId ||
      !this.sessionCookies ||
      this.cachedToken.accessToken !== accessToken
    ) {
      throw new Error(
        "The access token is not managed by this OpenSeaAuth instance",
      )
    }

    const refreshedCookies = await this.refreshSession(this.sessionCookies)
    // The refresh token rotates, so retain the replacement if DELETE needs a
    // retry after a transient failure.
    this.sessionCookies = refreshedCookies
    const response = await fetchWith(
      this.fetchImpl,
      `${this.apiBaseUrl}/api/v2/auth/tokens/${this.scopedTokenId}`,
      { method: "DELETE", headers: { Cookie: refreshedCookies } },
    )
    await requireOk(response, "Scoped token revocation")
    this.cachedToken = undefined
    this.scopedTokenId = undefined
    this.sessionCookies = undefined
  }

  /** Request a single-use SIWE nonce. */
  async requestNonce(): Promise<AuthNonceResponse> {
    const response = await fetchWith(
      this.fetchImpl,
      `${this.apiBaseUrl}/api/v2/auth/siwe/nonce`,
      { method: "POST", headers: { Accept: "application/json" } },
    )
    await requireOk(response, "Nonce request")
    return response.json() as Promise<AuthNonceResponse>
  }

  private async verifySignature(
    message: string,
    signature: string,
  ): Promise<string> {
    const response = await fetchWith(
      this.fetchImpl,
      `${this.apiBaseUrl}/api/v2/auth/siwe/verify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: parseSiwxMessage(message),
          signature,
          chainArch: "EVM",
        }),
      },
    )
    await requireOk(response, "SIWE verification")
    return extractSessionCookies(response.headers)
  }

  private async createScopedToken(
    cookie: string,
    scopes: string[],
  ): Promise<ScopedTokenCreatedResponse> {
    const response = await fetchWith(
      this.fetchImpl,
      `${this.apiBaseUrl}/api/v2/auth/tokens`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          label: `opensea-sdk-${Date.now()}`,
          scopes,
          expiresInDays: 1,
        }),
      },
    )
    await requireOk(response, "Scoped token creation")
    return response.json() as Promise<ScopedTokenCreatedResponse>
  }

  private async exchangeScopedToken(
    scopedToken: string,
  ): Promise<ScopedTokenExchangeResponse> {
    const response = await fetchWith(
      this.fetchImpl,
      `${this.apiBaseUrl}/api/v2/auth/tokens/exchange`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectToken: scopedToken,
          subjectTokenType: "ACCESS_TOKEN",
        }),
      },
    )
    await requireOk(response, "Token exchange")
    return response.json() as Promise<ScopedTokenExchangeResponse>
  }

  private async cleanupScopedToken(cookie: string, id: string): Promise<void> {
    for (let attempt = 0; attempt < SCOPED_TOKEN_CLEANUP_ATTEMPTS; attempt++) {
      try {
        const response = await fetchWith(
          this.fetchImpl,
          `${this.apiBaseUrl}/api/v2/auth/tokens/${id}`,
          { method: "DELETE", headers: { Cookie: cookie } },
        )
        if (response.ok || response.status === 404) return
      } catch {
        // Retry once, then preserve the original exchange failure.
      }
    }
  }

  private async refreshSession(cookie: string): Promise<string> {
    const response = await fetchWith(
      this.fetchImpl,
      `${this.apiBaseUrl}/api/v2/auth/session/refresh`,
      { method: "POST", headers: { Cookie: cookie } },
    )
    await requireOk(response, "Session refresh")
    return extractSessionCookies(response.headers)
  }
}

/**
 * Build the SIWE message accepted by the current OpenSea wallet-auth API.
 * The scopes argument remains for compatibility; webauth authorizes PAT scopes
 * on token creation and does not accept them in this session proof.
 */
export function generateSiweMessage(
  address: string,
  _scopes: string[],
  nonce: string,
  _apiBaseUrl: string,
  chainId = 1,
): string {
  return createSiwxMessage({
    address,
    chainArch: "EVM",
    chainId,
    nonce,
    statement: SIWE_STATEMENT,
    issuedAt: new Date(),
  })
}

async function requireOk(response: Response, operation: string): Promise<void> {
  if (response.ok) return
  const body = await response.text().catch(() => "")
  throw new Error(`${operation} failed (${response.status}): ${body}`)
}

function splitSetCookieHeader(header: string): string[] {
  const segments = header.split(", ")
  const cookies: string[] = []
  let current = ""
  for (const segment of segments) {
    const trimmed = segment.trim()
    const equals = trimmed.indexOf("=")
    const name = equals > 0 ? trimmed.slice(0, equals).trim() : ""
    if (SESSION_COOKIE_NAMES.includes(name) && current) {
      cookies.push(current)
      current = trimmed
    } else if (SESSION_COOKIE_NAMES.includes(name)) {
      current = trimmed
    } else {
      current = current ? `${current}, ${trimmed}` : trimmed
    }
  }
  if (current) cookies.push(current)
  return cookies
}

function extractSessionCookies(headers: Headers): string {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie
  const raw =
    getSetCookie?.call(headers) ??
    splitSetCookieHeader(headers.get("set-cookie") ?? "")
  const cookies = new Map<string, string>()
  for (const cookie of raw) {
    const pair = cookie.split(";")[0]
    const equals = pair.indexOf("=")
    if (equals < 0) continue
    const name = pair.slice(0, equals).trim()
    if (SESSION_COOKIE_NAMES.includes(name)) {
      cookies.set(name, pair.slice(equals + 1).trim())
    }
  }
  if (!cookies.has("access_token") || !cookies.has("refresh_token")) {
    throw new Error("SIWE verification did not create a session")
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ")
}

function toAuthToken(
  exchange: ScopedTokenExchangeResponse,
  scopedToken: ScopedTokenCreatedResponse,
): AuthToken {
  return {
    accessToken: exchange.accessToken,
    refreshToken: scopedToken.token,
    expiresAt: new Date(
      Date.now() + (exchange.expiresIn ?? DEFAULT_TOKEN_TTL_SECONDS) * 1000,
    ),
    scopes: exchange.tokenScopes ?? scopedToken.scopes,
  }
}
