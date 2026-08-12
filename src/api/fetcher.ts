import type { RequestOptions } from "../types"
import type { Camelize } from "../utils/case"

/**
 * Options for the {@link Fetcher.post} method.
 *
 * Extends {@link RequestOptions} with a `snakeizeBody` opt-out so callers
 * with mixed-casing wire bodies (e.g. Seaport order structs whose inner
 * keys are camelCase on-wire) can disable the automatic camel→snake key
 * rewrite and submit the body verbatim.
 *
 * @category API Models
 */
export interface PostOptions extends RequestOptions {
  /**
   * Whether to recursively rewrite the body's keys from camelCase to
   * snake_case before sending. Defaults to `true`.
   *
   * Set to `false` when the body contains Seaport-shaped structs or other
   * mixed-casing payloads where some keys (`parameters.startTime`,
   * `numericTraits`, `offererSignature`, …) must remain camelCase on the
   * wire per the OpenSea OpenAPI spec. The caller is then responsible
   * for emitting the body in exact wire shape.
   */
  snakeizeBody?: boolean
}

export type HttpMethod = "POST" | "PUT" | "PATCH" | "DELETE"

/**
 * Fetcher context interface for making HTTP requests to the OpenSea API.
 * This interface abstracts the HTTP methods used by specialized API clients.
 *
 * Responses are camelized at this boundary — pass the API's snake_case shape
 * (e.g. an api-types response type) as `T` and the return is the camelCase
 * view. See `utils/case.ts`. Endpoints whose response keys are data rather
 * than field names opt out with {@link RequestOptions.camelizeResponse}.
 */
export interface Fetcher {
  /**
   * Generic fetch method for GET requests with automatic rate limit retry
   * @param apiPath Path to URL endpoint under API
   * @param query URL query params. Will be used to create a URLSearchParams object.
   * @param options Request options like timeout and abort signal. Includes the
   *                {@link RequestOptions.camelizeResponse} opt-out for endpoints
   *                whose response keys are data (e.g. trait names).
   * @returns The camelCase view of the API response.
   */
  get<T>(
    apiPath: string,
    query?: object,
    options?: RequestOptions,
  ): Promise<Camelize<T>>

  /**
   * Generic post method for POST requests with automatic rate limit retry
   * @param apiPath Path to URL endpoint under API
   * @param body Data to send.
   * @param headers Additional headers to send with the request.
   * @param options Request options. Includes the {@link PostOptions.snakeizeBody}
   *                opt-out for callers that need to emit the body in exact wire
   *                shape (e.g. Seaport-shaped POSTs).
   * @returns The camelCase view of the API response.
   */
  post<T>(
    apiPath: string,
    body?: object,
    headers?: object,
    options?: PostOptions,
  ): Promise<Camelize<T>>
}

/** Fetcher used by scoped wallet helpers that need every write verb. */
export interface WalletAuthFetcher extends Fetcher {
  request<T>(
    method: HttpMethod,
    apiPath: string,
    body?: object,
    headers?: object,
    options?: PostOptions,
  ): Promise<Camelize<T>>
}
