import { describe, expect, test, vi } from "vitest"
import type { OpenSeaRateLimitError } from "../../src/types"
import {
  executeSequentialWithRateLimit,
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
      const rateLimitError: OpenSeaRateLimitError = Object.assign(
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
      ) as OpenSeaRateLimitError
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
      ) as OpenSeaRateLimitError
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

    test("handles 599 custom rate limit code", async () => {
      const rateLimitError = new Error(
        "599 Rate Limit",
      ) as OpenSeaRateLimitError
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
      }) as OpenSeaRateLimitError
      const operation = vi
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce("success")
      const controller = new AbortController()
      const options: RateLimitOptions = {
        signal: controller.signal,
      }
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

  describe("executeSequentialWithRateLimit", () => {
    test("executes operations sequentially", async () => {
      const operations = [
        vi.fn().mockResolvedValue("result1"),
        vi.fn().mockResolvedValue("result2"),
        vi.fn().mockResolvedValue("result3"),
      ]

      const logger = vi.fn()

      const results = await executeSequentialWithRateLimit(operations, {
        logger,
        operationName: "test operation",
      })

      expect(results).toEqual(["result1", "result2", "result3"])
      expect(operations[0]).toHaveBeenCalledTimes(1)
      expect(operations[1]).toHaveBeenCalledTimes(1)
      expect(operations[2]).toHaveBeenCalledTimes(1)
      expect(logger).toHaveBeenCalledWith(
        expect.stringMatching(/Starting 3 test operations/),
      )
      expect(logger).toHaveBeenCalledWith(
        expect.stringMatching(/Executing test operation 1\/3/),
      )
      expect(logger).toHaveBeenCalledWith(
        expect.stringMatching(/All 3 test operations completed/),
      )
    })

    test("logs progress correctly for single operation", async () => {
      const operations = [vi.fn().mockResolvedValue("result")]

      const logger = vi.fn()

      await executeSequentialWithRateLimit(operations, {
        logger,
        operationName: "test",
      })

      expect(logger).toHaveBeenCalledWith(
        expect.stringMatching(/Starting 1 test\.\.\./),
      )
      expect(logger).toHaveBeenCalledWith(
        expect.stringMatching(/All 1 test completed/),
      )
    })

    test("handles rate limit errors in sequential operations", async () => {
      const rateLimitError = new Error(
        "429 Too Many Requests",
      ) as OpenSeaRateLimitError
      rateLimitError.statusCode = 429

      const operations = [
        vi.fn().mockResolvedValue("result1"),
        vi
          .fn()
          .mockRejectedValueOnce(rateLimitError)
          .mockResolvedValueOnce("result2"),
        vi.fn().mockResolvedValue("result3"),
      ]

      const logger = vi.fn()

      const promise = executeSequentialWithRateLimit(operations, {
        logger,
        operationName: "listing submission",
        baseRetryDelay: 500,
      })

      // Wait for first operation
      await vi.advanceTimersByTimeAsync(0)

      // Wait for rate limit retry on second operation
      await vi.advanceTimersByTimeAsync(500)

      const results = await promise

      expect(results).toEqual(["result1", "result2", "result3"])
      expect(logger).toHaveBeenCalledWith(
        expect.stringMatching(/Rate limit hit/),
      )
    })

    test("stops execution if operation fails after retries", async () => {
      const rateLimitError = new Error(
        "429 Too Many Requests",
      ) as OpenSeaRateLimitError
      rateLimitError.statusCode = 429

      const operations = [
        vi.fn().mockResolvedValue("result1"),
        vi.fn().mockRejectedValue(rateLimitError),
        vi.fn().mockResolvedValue("result3"),
      ]

      const logger = vi.fn()

      const resultPromise = executeSequentialWithRateLimit(operations, {
        logger,
        maxRetries: 1,
        baseRetryDelay: 100,
      })

      // Attach a rejection handler immediately to prevent unhandled rejection
      const caughtPromise = resultPromise.catch((error: Error) => error)

      // Wait for first operation and retries
      await vi.runAllTimersAsync()

      const error = await caughtPromise
      expect((error as Error).message).toContain("429")
      // Third operation should not be called
      expect(operations[2]).not.toHaveBeenCalled()
    })
  })
})
