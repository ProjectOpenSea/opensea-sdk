import { describe, expect, test } from "vitest"
import { parseEther, parseUnits } from "../../src/utils/units"

describe("parseUnits", () => {
  test("parses integer value", () => {
    expect(parseUnits("1", 18)).toBe(1000000000000000000n)
  })

  test("parses decimal value", () => {
    expect(parseUnits("1.5", 18)).toBe(1500000000000000000n)
  })

  test("parses zero", () => {
    expect(parseUnits("0", 18)).toBe(0n)
  })

  test("pads fractional part when shorter than decimals", () => {
    expect(parseUnits("1.1", 18)).toBe(1100000000000000000n)
  })

  test("throws when fractional part exceeds decimals", () => {
    expect(() => parseUnits("1.1234567", 6)).toThrow("Too many decimal places")
  })

  test("handles 6 decimals (USDC)", () => {
    expect(parseUnits("100", 6)).toBe(100000000n)
    expect(parseUnits("1.5", 6)).toBe(1500000n)
  })

  test("handles 0 decimals", () => {
    expect(parseUnits("42", 0)).toBe(42n)
  })

  test("handles negative values", () => {
    expect(parseUnits("-1", 18)).toBe(-1000000000000000000n)
  })

  test("handles bigint input", () => {
    expect(parseUnits(5n, 18)).toBe(5000000000000000000n)
  })

  test("handles number input", () => {
    expect(parseUnits(3, 18)).toBe(3000000000000000000n)
  })

  test("handles JavaScript scientific notation (small numbers)", () => {
    // 1e-8 in JS becomes "1e-8" string via toString()
    expect(parseUnits(1e-8, 18)).toBe(10000000000n)
  })

  test("handles string scientific notation", () => {
    expect(parseUnits("1e-8", 18)).toBe(10000000000n)
    expect(parseUnits("1.5e-5", 18)).toBe(15000000000000n)
    expect(parseUnits("1E-6", 6)).toBe(1n)
  })

  test("throws for invalid decimal (multiple dots)", () => {
    expect(() => parseUnits("1.2.3", 18)).toThrow("Invalid decimal value")
  })
})

describe("parseEther", () => {
  test("parses 1 ETH", () => {
    expect(parseEther("1")).toBe(1000000000000000000n)
  })

  test("parses 0.5 ETH", () => {
    expect(parseEther("0.5")).toBe(500000000000000000n)
  })

  test("parses small amount", () => {
    expect(parseEther("0.000000000000000001")).toBe(1n)
  })
})
