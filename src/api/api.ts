import { API_BASE_MAINNET } from "../constants"
import {
  Chain,
  type OpenSeaAPIConfig,
  type OpenSeaApiError,
  type RawResponseOptions,
  type RequestOptions,
} from "../types"
import {
  type Camelize,
  camelizeKeysDeep,
  snakeizeKeysDeep,
} from "../utils/case"
import { type FetchImpl, fetchWith } from "../utils/fetchTransport"
import { executeWithRateLimit } from "../utils/rateLimit"
import { AccountsAPI } from "./accounts"
import { getInstantApiKeyPath } from "./apiPaths"
import { AssetsAPI } from "./assets"
import { ChainsAPI } from "./chains"
import { CollectionsAPI } from "./collections"
import { DropsAPI } from "./drops"
import { EventsAPI } from "./events"
import type { HttpMethod, PostOptions } from "./fetcher"
import { ListingsAPI } from "./listings"
import { NFTsAPI } from "./nfts"
import { OffersAPI } from "./offers"
import { OrdersAPI } from "./orders"
import { SearchAPI } from "./search"
import { SignalsAPI } from "./signals"
import { TokensAPI } from "./tokens"
import { ToolsAPI } from "./tools"
import { TransactionsAPI } from "./transactions"
import type {
  RequestInstantApiKeyResponse,
  SearchArgs,
  SearchResponse,
} from "./types"
import { WalletAuthAPI } from "./walletAuth"

/**
 * The API class for the OpenSea SDK.
 *
 * Every method returns the camelCase view of the response. The API sends
 * snake_case, and the `@opensea/api-types` type of the same name describes
 * that wire shape, so annotating a return value here with one of those types
 * leaves every renamed field `undefined` at runtime, while single-word keys
 * survive the rewrite and still read correctly. Use the camelized type this
 * package exports, or `Camelize<WireType>`. {@link RequestOptions.camelizeResponse}
 * turns the rewrite off where the response keys are data rather than field
 * names; written as the literal `false` on {@link OpenSeaAPI.get},
 * {@link OpenSeaAPI.post} or {@link OpenSeaAPI.request}, it also selects the
 * signature that returns the raw `T` instead of `Camelize<T>`.
 *
 * @category Main Classes
 */
export class OpenSeaAPI {
  /**
   * Base url for the API
   */
  public readonly apiBaseUrl: string
  /**
   * Default size to use for fetching orders
   */
  public pageSize = 20
  /**
   * Logger function to use when debugging
   */
  public logger: (arg: string) => void

  private apiKey: string | undefined
  private authToken: string | undefined
  /** Transport for every instance request. See {@link OpenSeaAPIConfig.fetch}. */
  private readonly fetchImpl: FetchImpl | undefined
  private chain: Chain

  /**
   * Per-domain clients. Every endpoint is reached through one of these, for example
   * `api.collections.getCollection(slug)`.
   *
   * `search` is absent because `SearchAPI` holds a single method also called `search`, so the
   * property and the existing `search()` method want the same name and only one can be added
   * without a break. Call it as `api.search(args)`.
   */
  public readonly orders: OrdersAPI
  public readonly offers: OffersAPI
  public readonly listings: ListingsAPI
  public readonly collections: CollectionsAPI
  public readonly nfts: NFTsAPI
  public readonly accounts: AccountsAPI
  public readonly events: EventsAPI
  public readonly tokens: TokensAPI
  public readonly chains: ChainsAPI
  public readonly drops: DropsAPI
  public readonly transactions: TransactionsAPI
  public readonly assets: AssetsAPI
  /** Public OpenSea signals. Creating and deleting them is on `walletAuth`. */
  public readonly signals: SignalsAPI
  /** Tool registry endpoints. Beta: they may change without notice. */
  public readonly tools: ToolsAPI
  /** Wallet-authenticated scoped REST helpers. */
  public readonly walletAuth: WalletAuthAPI

  /** See the note above: this one stays private, and `api.search(args)` is the call. */
  private searchAPI: SearchAPI

  /**
   * Create an instance of the OpenSeaAPI
   * @param config OpenSeaAPIConfig for setting up the API, including an optional API key, Chain name, and base URL
   * @param logger Optional function for logging debug strings before and after requests are made. Defaults to no logging
   */
  constructor(config: OpenSeaAPIConfig, logger?: (arg: string) => void) {
    // Stored as given, including undefined: fetchWith falls back to globalThis.fetch at call
    // time, so a caller who swaps globalThis.fetch after construction still takes effect.
    this.fetchImpl = config.fetch
    this.apiKey = config.apiKey
    this.authToken = config.authToken
    this.chain = config.chain ?? Chain.Mainnet

    if (config.apiBaseUrl) {
      this.apiBaseUrl = config.apiBaseUrl
    } else {
      this.apiBaseUrl = API_BASE_MAINNET
    }

    // Debugging: default to nothing
    this.logger = logger ?? ((arg: string) => arg)

    // Create fetcher context
    const fetcher = {
      get: this.get.bind(this),
      post: this.post.bind(this),
      request: this.request.bind(this),
    }

    // Initialize specialized API clients
    this.orders = new OrdersAPI(fetcher, this.chain)
    this.offers = new OffersAPI(fetcher, this.chain)
    this.listings = new ListingsAPI(fetcher)
    this.collections = new CollectionsAPI(fetcher)
    this.nfts = new NFTsAPI(fetcher, this.chain)
    this.accounts = new AccountsAPI(fetcher, this.chain)
    this.events = new EventsAPI(fetcher)
    this.searchAPI = new SearchAPI(fetcher)
    this.tokens = new TokensAPI(fetcher)
    this.chains = new ChainsAPI(fetcher)
    this.drops = new DropsAPI(fetcher)
    this.transactions = new TransactionsAPI(fetcher)
    this.assets = new AssetsAPI(fetcher)
    this.signals = new SignalsAPI(fetcher)
    this.tools = new ToolsAPI(fetcher)
    this.walletAuth = new WalletAuthAPI(fetcher)
  }

  /**
   * Search across collections, tokens, NFTs, and accounts.
   * Results are ranked by relevance.
   * @param args Query parameters including query text, optional chain/asset type filters, and limit.
   * @returns The {@link SearchResponse} returned by the API.
   */
  public async search(args: SearchArgs): Promise<SearchResponse> {
    return this.searchAPI.search(args)
  }

  /**
   * Generic fetch method for any API endpoint with automatic rate limit retry,
   * with the response left in its wire shape.
   *
   * Selected by writing `camelizeResponse: false` as a literal. The rewrite is
   * skipped at runtime and the return type is the raw `T`, so a snake_case `T`
   * stays snake_case in both.
   *
   * @param apiPath Path to URL endpoint under API
   * @param query URL query params. Will be used to create a URLSearchParams object.
   * @param options Request options, with `camelizeResponse` set to `false`.
   * @returns @typeParam T The un-camelized response from the API.
   */
  public get<T>(
    apiPath: string,
    query: object | undefined,
    options: RawResponseOptions,
  ): Promise<T>
  /**
   * Generic fetch method for any API endpoint with automatic rate limit retry
   * @param apiPath Path to URL endpoint under API
   * @param query URL query params. Will be used to create a URLSearchParams object.
   * @param options Request options like timeout and abort signal.
   * @returns @typeParam T The response from the API.
   */
  public get<T>(
    apiPath: string,
    query?: object,
    options?: RequestOptions,
  ): Promise<Camelize<T>>
  public async get<T>(
    apiPath: string,
    query: object = {},
    options?: RequestOptions,
  ): Promise<Camelize<T> | T> {
    return executeWithRateLimit(
      async () => {
        // Snakeize query keys so consumers can pass camelCase args even
        // though the API expects snake_case URL params.
        const qs = this.objectToSearchParams(snakeizeKeysDeep(query))
        const url = qs
          ? `${this.apiBaseUrl}${apiPath}?${qs}`
          : `${this.apiBaseUrl}${apiPath}`
        const raw = await this._fetch(url, "GET", undefined, undefined, options)
        return this.camelizeResponseBody<T>(raw, options)
      },
      { logger: this.logger, signal: options?.signal },
    )
  }

  /**
   * Generic post method for any API endpoint with automatic rate limit retry,
   * with the response left in its wire shape. Selected by writing
   * `camelizeResponse: false` as a literal.
   *
   * @param apiPath Path to URL endpoint under API
   * @param body Data to send.
   * @param headers Additional headers to send with the request.
   * @param options Request options, with `camelizeResponse` set to `false`.
   * @returns @typeParam T The un-camelized response from the API.
   */
  public post<T>(
    apiPath: string,
    body: object | undefined,
    headers: object | undefined,
    options: RawResponseOptions<PostOptions>,
  ): Promise<T>
  /**
   * Generic post method for any API endpoint with automatic rate limit retry
   * @param apiPath Path to URL endpoint under API
   * @param body Data to send.
   * @param headers Additional headers to send with the request.
   * @param options Request options. Includes the {@link PostOptions.snakeizeBody}
   *                opt-out (defaults to `true`) for callers that need to emit
   *                the body in exact wire shape (e.g. Seaport-shaped POSTs
   *                whose inner keys are camelCase on the wire).
   * @returns @typeParam T The response from the API.
   */
  public post<T>(
    apiPath: string,
    body?: object,
    headers?: object,
    options?: PostOptions,
  ): Promise<Camelize<T>>
  public async post<T>(
    apiPath: string,
    body?: object,
    headers?: object,
    options?: PostOptions,
  ): Promise<Camelize<T> | T> {
    return this.request<T>("POST", apiPath, body, headers, options)
  }

  /**
   * Send a typed JSON request to a write endpoint, with the response left in
   * its wire shape. Selected by writing `camelizeResponse: false` as a literal.
   */
  public request<T>(
    method: HttpMethod,
    apiPath: string,
    body: object | undefined,
    headers: object | undefined,
    options: RawResponseOptions<PostOptions>,
  ): Promise<T>
  /** Send a typed JSON request to a write endpoint. */
  public request<T>(
    method: HttpMethod,
    apiPath: string,
    body?: object,
    headers?: object,
    options?: PostOptions,
  ): Promise<Camelize<T>>
  public async request<T>(
    method: HttpMethod,
    apiPath: string,
    body?: object,
    headers?: object,
    options?: PostOptions,
  ): Promise<Camelize<T> | T> {
    return executeWithRateLimit(
      async () => {
        const url = `${this.apiBaseUrl}${apiPath}`
        // Snakeize the body so consumers can pass camelCase even though the
        // API expects snake_case JSON. Opt-out via `snakeizeBody: false` for
        // Seaport-shaped bodies whose inner keys must remain camelCase on the
        // wire (the OpenSea OpenAPI spec uses mixed casing for these).
        const shouldSnakeize = options?.snakeizeBody !== false
        const wireBody =
          body == null || !shouldSnakeize ? body : snakeizeKeysDeep(body)
        const raw = await this._fetch(url, method, headers, wireBody, options)
        return this.camelizeResponseBody<T>(raw, options)
      },
      { logger: this.logger, signal: options?.signal },
    )
  }

  /**
   * Camelize a response body unless the caller opted out via
   * {@link RequestOptions.camelizeResponse}, which endpoints keyed by data
   * rather than field names (e.g. traits) rely on to keep their keys intact.
   *
   * Shared by `get` and `request` so the option cannot silently do nothing on
   * one verb.
   */
  private camelizeResponseBody<T>(
    raw: unknown,
    options?: RequestOptions,
  ): Camelize<T> | T {
    return options?.camelizeResponse === false
      ? (raw as T)
      : (camelizeKeysDeep(raw) as Camelize<T>)
  }

  private objectToSearchParams(params: object = {}) {
    const urlSearchParams = new URLSearchParams()

    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(item => {
          if (item != null) {
            urlSearchParams.append(key, String(item))
          }
        })
      } else if (value != null) {
        urlSearchParams.append(key, String(value))
      }
    })

    return urlSearchParams.toString()
  }

  /**
   * Fetch from an API Endpoint, sending auth token in headers
   * @param url The URL to fetch
   * @param method HTTP method to use.
   * @param headers Additional headers to send with the request
   * @param body Optional JSON body to send.
   * @param options Request options like timeout and abort signal
   */
  private async _fetch(
    url: string,
    method: "GET" | HttpMethod,
    headers?: object,
    body?: object,
    options?: RequestOptions,
  ) {
    const mergedHeaders: Record<string, string> = {
      // Kept as "opensea-js" for server-side analytics continuity after package rename
      "x-app-id": "opensea-js",
      ...(this.apiKey ? { "X-API-KEY": this.apiKey } : {}),
      ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      ...(body != null ? { "Content-Type": "application/json" } : {}),
      ...headers,
    }

    const sanitizedHeaders = { ...mergedHeaders }
    delete sanitizedHeaders["X-API-KEY"]
    delete sanitizedHeaders.Authorization
    this.logger(
      `Sending request: ${url} ${JSON.stringify({
        method,
        headers: sanitizedHeaders,
        body: body != null ? JSON.stringify(body, null, 2) : undefined,
      })}`,
    )

    // Build abort signal (merge timeout + user-provided signal)
    let controller: AbortController | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let userAbortHandler: (() => void) | undefined
    let signal = options?.signal
    if (options?.timeout !== undefined) {
      const ctrl = new AbortController()
      controller = ctrl
      timeoutId = setTimeout(() => ctrl.abort(), options.timeout)
      // If user provided their own signal, abort ours if theirs fires
      if (options.signal) {
        if (options.signal.aborted) {
          clearTimeout(timeoutId)
          throw new Error("Request aborted")
        }
        userAbortHandler = () => {
          ctrl.abort()
          clearTimeout(timeoutId)
        }
        options.signal.addEventListener("abort", userAbortHandler)
      }
      signal = controller.signal
    } else if (options?.signal?.aborted) {
      throw new Error("Request aborted")
    }

    try {
      // fetchWith, not a plain call: it supplies the global receiver that unbound native fetch
      // needs, and falls back to globalThis.fetch when no transport was configured.
      const response = await fetchWith(this.fetchImpl, url, {
        method,
        headers: mergedHeaders,
        body: body != null ? JSON.stringify(body) : undefined,
        signal,
      })

      if (!response.ok) {
        // Handle rate limit errors (429 Too Many Requests and 599 custom rate limit)
        if (response.status === 599 || response.status === 429) {
          throw await this._createRateLimitError(response)
        }
        const rawBody = await response.json().catch(() => ({}))
        const responseBody = camelizeKeysDeep(rawBody) as {
          errors?: { length?: number } | unknown[]
        }
        const errors = responseBody?.errors as
          | { length?: number }
          | unknown[]
          | undefined
        if (errors?.length !== undefined && errors.length > 0) {
          // Handle both string entries (`["not found"]`) and structured ones
          // (`[{code: "invalid_param", message: "..."}]`). String() on an
          // object yields "[object Object]", so JSON-stringify any non-string
          // element individually before joining.
          const errorMessage = Array.isArray(errors)
            ? errors
                .map(e => (typeof e === "string" ? e : JSON.stringify(e)))
                .join(", ")
            : typeof errors === "string"
              ? errors
              : JSON.stringify(errors)
          throw OpenSeaAPI._createApiError(
            response,
            `Server Error: ${errorMessage}`,
            responseBody,
          )
        }
        throw OpenSeaAPI._createApiError(
          response,
          `Server Error (${response.status}): ${response.statusText}`,
          responseBody,
        )
      }
      if (
        response.status === 204 ||
        response.headers.get("content-length") === "0"
      ) {
        return undefined
      }
      const text = await response.text()
      return text.length > 0 ? JSON.parse(text) : undefined
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
      if (userAbortHandler && options?.signal) {
        options.signal.removeEventListener("abort", userAbortHandler)
      }
    }
  }

  /**
   * Request a free-tier OpenSea API key without authentication. The returned
   * key is valid for 7 days and can be passed into the {@link OpenSeaAPI} or
   * {@link BaseOpenSeaSDK} constructors as `apiKey`.
   *
   * @example
   * ```ts
   * const { apiKey } = await OpenSeaAPI.requestInstantApiKey()
   * const api = new OpenSeaAPI({ apiKey })
   * ```
   *
   * @param apiBaseUrl Optional base URL override (defaults to mainnet).
   * @param options Optional `fetch` transport. This is a static method with no instance to read
   *                {@link OpenSeaAPIConfig.fetch} from, so a consumer that routes every request
   *                through its own transport passes it here. Defaults to the global `fetch`.
   * @returns The {@link RequestInstantApiKeyResponse} containing the new key,
   *          with response keys camelized to match SDK conventions.
   */
  public static async requestInstantApiKey(
    apiBaseUrl: string = API_BASE_MAINNET,
    options: { fetch?: FetchImpl } = {},
  ): Promise<RequestInstantApiKeyResponse> {
    const response = await fetchWith(
      options.fetch,
      `${apiBaseUrl}${getInstantApiKeyPath()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-id": "opensea-js",
        },
        body: "{}",
      },
    )
    if (!response.ok) {
      throw OpenSeaAPI._createApiError(
        response,
        `Server Error (${response.status}): ${response.statusText}`,
      )
    }
    const raw = await response.json()
    return camelizeKeysDeep(raw) as RequestInstantApiKeyResponse
  }

  /**
   * Maximum retry-after value in seconds (5 minutes).
   * Prevents excessively long waits from buggy or malicious servers.
   */
  private static readonly MAX_RETRY_AFTER_SECONDS = 300

  /**
   * Parses the retry-after header, tolerating missing or malformed values.
   * @param response The HTTP response object from the API
   * @returns The retry-after value in seconds (capped at 5 minutes), or undefined if not present or invalid
   */
  private _parseRetryAfter(response: Response): number | undefined {
    const retryAfterHeader = response.headers.get("retry-after")
    if (retryAfterHeader) {
      const trimmed = retryAfterHeader.trim()

      // If it starts with a digit or minus sign, treat as numeric
      if (/^-?\d/.test(trimmed)) {
        // Only accept fully numeric integer values, reject malformed inputs like "5s" or "1.5"
        if (!/^-?\d+$/.test(trimmed)) {
          return undefined
        }
        const parsedSeconds = Number(trimmed)
        if (!Number.isSafeInteger(parsedSeconds) || parsedSeconds <= 0) {
          return undefined
        }
        return Math.min(parsedSeconds, OpenSeaAPI.MAX_RETRY_AFTER_SECONDS)
      }

      // Otherwise, try to parse as HTTP-date
      const parsedDateMs = Date.parse(trimmed)
      if (Number.isNaN(parsedDateMs)) {
        return undefined
      }
      const diffSeconds = Math.ceil((parsedDateMs - Date.now()) / 1000)
      if (diffSeconds <= 0) {
        return undefined
      }
      return Math.min(diffSeconds, OpenSeaAPI.MAX_RETRY_AFTER_SECONDS)
    }
    return undefined
  }

  /**
   * Builds an error carrying the HTTP status. Every non-OK response goes through here or through
   * {@link _createRateLimitError}, so `statusCode` is present on every API error rather than only
   * on rate limits. A caller that scrubs remote error text still has the status to retry on.
   * @param response The HTTP response object from the API
   * @param message The error message
   * @param responseBody The already-parsed body, when the caller read one
   * @returns An Error with `statusCode` and, when available, `responseBody`
   */
  private static _createApiError(
    response: Response,
    message: string,
    responseBody?: unknown,
  ): OpenSeaApiError {
    const error = new Error(message) as OpenSeaApiError
    error.statusCode = response.status
    if (responseBody !== undefined) {
      error.responseBody = responseBody
    }
    return error
  }

  /**
   * Creates a rate limit error with status code and retry-after information.
   * This is async because it attempts to parse the response body. If the body
   * is malformed JSON, responseBody is undefined (on purpose: the error
   * matters more than the body).
   * @param response The HTTP response object from the API
   * @returns An enhanced Error object with statusCode, retryAfter and responseBody properties
   */
  private async _createRateLimitError(
    response: Response,
  ): Promise<OpenSeaApiError> {
    const retryAfter = this._parseRetryAfter(response)
    const error = new Error(
      `${response.status} ${response.statusText}`,
    ) as OpenSeaApiError

    // Add status code and retry-after information to the error object
    error.statusCode = response.status
    error.retryAfter = retryAfter
    const rawBody = await response.json().catch(() => undefined)
    error.responseBody =
      rawBody === undefined ? undefined : camelizeKeysDeep(rawBody)
    return error
  }
}
