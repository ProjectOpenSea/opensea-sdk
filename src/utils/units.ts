/**
 * Parse a decimal string into its base unit representation (e.g. ETH -> wei).
 * @param value The decimal value as a string or number (e.g. "1.5")
 * @param decimals The number of decimal places (e.g. 18 for ETH)
 * @returns The value in base units as a bigint
 */
export function parseUnits(
  value: string | number | bigint,
  decimals: number,
): bigint {
  let str = value.toString()

  // Handle scientific notation (e.g. 1e-8 or "1e-8" → "0.00000001").
  // Note: toFixed has precision limits for very large numbers, but this is
  // sufficient for realistic token amounts (up to ~2^53).
  if (str.toLowerCase().includes("e")) {
    const num = Number(value)
    if (!Number.isNaN(num)) {
      str = num.toFixed(decimals)
    }
  }

  // Handle negative values
  const isNegative = str.startsWith("-")
  const abs = isNegative ? str.slice(1) : str

  const [intPart, fracPart = ""] = abs.split(".")
  if (abs.split(".").length > 2) {
    throw new Error(`Invalid decimal value: ${str}`)
  }

  // Reject excess decimal places to match ethers.parseUnits behavior
  if (fracPart.length > decimals) {
    throw new Error(`Too many decimal places: ${fracPart.length} > ${decimals}`)
  }
  const paddedFrac = fracPart.padEnd(decimals, "0")
  const combined = (intPart || "0") + paddedFrac

  // Remove leading zeros then parse
  const result = BigInt(combined)
  return isNegative ? -result : result
}

/**
 * Parse an ether-denominated value into wei.
 * Shorthand for `parseUnits(value, 18)`.
 */
export function parseEther(value: string | number | bigint): bigint {
  return parseUnits(value, 18)
}
