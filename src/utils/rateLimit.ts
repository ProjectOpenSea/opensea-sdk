import type { OpenSeaRateLimitError } from "../types"
import { pluralize } from "./stringHelper"

/**
 * Default configuration for rate limit handling
 */
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BASE_RETRY_DELAY_MS = 1000
const EXPONENTIAL_BACKOFF_BASE = 2
const MILLISECONDS_PER_SECOND = 1000

/**
 * HTTP status codes that indicate rate limiting
 */
const RATE_LIMIT_STATUS_CODE = 429
const CUSTOM_RATE_LIMIT_STATUS_CODE = 599

/**
 * Options for handling rate-limited operations with retries.
 * This is exported for SDK consumers who may want to use executeWithRateLimit
 * for their own OpenSea API integrations.
 */
export interface RateLimitOptions {
  /** Logger function for logging progress */
  logger?: (message: string) => void
  /**
   * Abort signal for cancelling a pending retry delay. The operation itself
   * must handle cancellation separately.
   */
  signal?: AbortSignal
  /** Maximum number of retry attempts for rate limit errors */
  maxRetries?: number
  /** Base delay in ms to wait after a rate limit error if retry-after header is not present */
  baseRetryDelay?: number
}

/**
 * Sleep for a specified duration
 * @param ms Duration in milliseconds
 * @param signal Optional signal for cancelling the delay
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  if (signal.aborted) {
    return Promise.reject(new Error("Request aborted"))
  }

  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout>
    const onAbort = () => {
      clearTimeout(timeoutId)
      signal.removeEventListener("abort", onAbort)
      reject(new Error("Request aborted"))
    }
    timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

/**
 * Execute an async operation with automatic retry on rate limit errors.
 * Respects the retry-after header when present, otherwise uses exponential backoff.
 *
 * @param operation The async operation to execute
 * @param options Configuration for rate limit handling
 * @returns The result of the operation
 * @throws The last error encountered if all retries are exhausted
 */
export async function executeWithRateLimit<T>(
  operation: () => Promise<T>,
  options: RateLimitOptions = {},
): Promise<T> {
  const {
    logger = () => {},
    signal,
    maxRetries = DEFAULT_MAX_RETRIES,
    baseRetryDelay = DEFAULT_BASE_RETRY_DELAY_MS,
  } = options

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error
      const rateLimitError = error as OpenSeaRateLimitError

      // Check if this is a rate limit error by status code (robust) or retry-after header
      const isRateLimitError =
        rateLimitError.statusCode === RATE_LIMIT_STATUS_CODE ||
        rateLimitError.statusCode === CUSTOM_RATE_LIMIT_STATUS_CODE ||
        rateLimitError.retryAfter !== undefined

      if (!isRateLimitError || attempt === maxRetries) {
        // Not a rate limit error or out of retries, throw the error
        throw error
      }

      // Calculate delay
      let delayMs: number
      if (rateLimitError.retryAfter !== undefined) {
        delayMs = rateLimitError.retryAfter * MILLISECONDS_PER_SECOND
        logger(
          `Rate limit hit. Waiting ${rateLimitError.retryAfter} seconds before retry (attempt ${attempt + 1}/${maxRetries})...`,
        )
      } else {
        // Exponential backoff
        delayMs = baseRetryDelay * EXPONENTIAL_BACKOFF_BASE ** attempt
        const delaySeconds = delayMs / MILLISECONDS_PER_SECOND
        logger(
          `Rate limit hit. Waiting ${delaySeconds} seconds before retry (attempt ${attempt + 1}/${maxRetries})...`,
        )
      }

      await sleep(delayMs, signal)
      logger(`Retrying operation...`)
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError
}

/**
 * Execute an array of async operations sequentially with rate limit handling.
 * Logs progress after each operation.
 *
 * @param operations Array of async operations to execute
 * @param options Configuration for rate limit handling and progress logging
 * @returns Array of results from each operation
 */
export async function executeSequentialWithRateLimit<T>(
  operations: Array<() => Promise<T>>,
  options: RateLimitOptions & {
    operationName?: string
  } = {},
): Promise<T[]> {
  const {
    logger = () => {},
    operationName = "operation",
    ...rateLimitOptions
  } = options

  const results: T[] = []
  const total = operations.length

  logger(`Starting ${total} ${pluralize(total, operationName)}...`)

  for (let i = 0; i < operations.length; i++) {
    const operation = operations[i]
    logger(`Executing ${operationName} ${i + 1}/${total}...`)

    const result = await executeWithRateLimit(operation, {
      ...rateLimitOptions,
      logger,
    })

    results.push(result)
    logger(`Completed ${operationName} ${i + 1}/${total}`)
  }

  logger(
    `All ${total} ${pluralize(total, operationName)} completed successfully`,
  )

  return results
}
