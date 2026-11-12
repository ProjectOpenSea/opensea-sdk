import { describe, expect, test, vi } from "vitest"
import type { OpenSeaApiError } from "../../src/types"
import {
  executeWithRateLimit,
  type RateLimitOptions,
} from "../../src/utils/rateLimit"

describe("Utils: rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe("executeWithRateLimit", () => {
    test("successfully executes operation on first try", async () => {
      const operation = vi.fn().mockResolvedValue("success")

      const result = await executeWithRateLimit(operation)

      expect(result).toBe("success")
      expect(operation).toHaveBeenCalledTimes(1)
    })

    test("retries on rate limit error with retry-after header", async () => {
      const rateLimitError: OpenSeaApiError = Object.assign(
        new Error("429 Too Many Requests"),
        {
          statusCode: 429,
          retryAfter: 2, // 2 seconds
        },
      )

      const operation = vi
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce("success")

      const logger = vi.fn()

      const promise = executeWithRateLimit(operation, { logger })

      // Advance time by 2 seconds
      await vi.advanceTimersByTimeAsync(2000)

      const result = await promise

      expect(result).toBe("success")
      expect(operation).toHaveBeenCalledTimes(2)
      expect(logger).toHaveBeenCalledWith(
        expect.stringMatching(/Rate limit hit.*2 seconds/),
      )
    })

    test("retries on rate limit error with exponential backoff", async () => {
      const rateLimitError = new Error(
        "429 Too Many Requests",
      ) as OpenSeaApiError
      rateLimitError.statusCode = 429

      const operation = vi
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce("success")

      const logger = vi.fn()

      const promise = executeWithRateLimit(operation, {
        logger,
        baseRetryDelay: 1000,
      })

      // Advance time by 1 second (first retry delay)
      await vi.advanceTimersByTimeAsync(1000)

      const result = await promise

      expect(result).toBe("success")
      expect(operation).toHaveBeenCalledTimes(2)
      expect(logger).toHaveBeenCalledWith(
        expect.stringMatching(/Rate limit hit.*1 seconds/),
      )
    })

    test("respects maxRetries and throws after exhausting retries", async () => {
      const rateLimitError = new Error(
        "429 Too Many Requests",
      ) as OpenSeaApiError
      rateLimitError.statusCode = 429

      const operation = vi.fn().mockRejectedValue(rateLimitError)
      const logger = vi.fn()

      const resultPromise = executeWithRateLimit(operation, {
        logger,
        maxRetries: 2,
        baseRetryDelay: 100,
      })

      // Attach a rejection handler immediately to prevent unhandled rejection
      const caughtPromise = resultPromise.catch((error: Error) => error)

      // Advance time for all retries
      await vi.runAllTimersAsync()

      const error = await caughtPromise
      expect((error as Error).message).toContain("429")
      expect(operation).toHaveBeenCalledTimes(3) // Initial + 2 retries
    })

    test("throws immediately on non-rate-limit errors", async () => {
      const nonRateLimitError = new Error("Server Error")

      const operation = vi.fn().mockRejectedValue(nonRateLimitError)

      try {
        await executeWithRateLimit(operation)
        throw new Error("Expected error to be thrown")
      } catch (error) {
        expect((error as Error).message).toBe("Server Error")
        expect(operation).toHaveBeenCalledTimes(1)
      }
    })

    test.each([
      null,
      undefined,
    ])("rethrows a %s rejection without retrying", async reason => {
      const operation = vi.fn().mockRejectedValue(reason)

      await expect(executeWithRateLimit(operation)).rejects.toBe(reason)

      expect(operation).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    })

    test("handles 599 custom rate limit code", async () => {
      const rateLimitError = new Error("599 Rate Limit") as OpenSeaApiError
      rateLimitError.statusCode = 599

      const operation = vi
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce("success")

      const logger = vi.fn()

      const promise = executeWithRateLimit(operation, { logger })

      await vi.advanceTimersByTimeAsync(1000)

      const result = await promise

      expect(result).toBe("success")
      expect(operation).toHaveBeenCalledTimes(2)
    })

    test("aborts while waiting to retry a rate-limited operation", async () => {
      const rateLimitError = Object.assign(new Error("429 Too Many Requests"), {
        statusCode: 429,
        retryAfter: 30,
      }) as OpenSeaApiError
      const operation = vi
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce("success")
      const controller = new AbortController()
      const options: RateLimitOptions = { signal: controller.signal }
      let outcome: "pending" | "resolved" | "rejected" = "pending"
      let rejection: unknown

      const observed = executeWithRateLimit(operation, options).then(
        () => {
          outcome = "resolved"
        },
        error => {
          outcome = "rejected"
          rejection = error
        },
      )

      await vi.advanceTimersByTimeAsync(0)
      expect(operation).toHaveBeenCalledTimes(1)

      controller.abort()
      await vi.advanceTimersByTimeAsync(0)

      expect(outcome).toBe("rejected")
      expect((rejection as Error).message).toBe("Request aborted")
      expect(operation).toHaveBeenCalledTimes(1)
      await observed
    })
  })
})
