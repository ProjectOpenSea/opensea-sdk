import type { Fee } from "../types"

/**
 * Sums up the basis points for fees.
 * @param fees The fees to sum up
 * @returns sum of basis points
 */
export const totalBasisPointsForFees = (fees: Fee[]): bigint => {
  const feeBasisPoints = fees.map(fee => basisPointsForFee(fee))
  const totalBasisPoints = feeBasisPoints.reduce(
    (sum, basisPoints) => basisPoints + sum,
    0n,
  )
  return totalBasisPoints
}

/**
 * Converts a fee to its basis points representation.
 * A fee of 2.5 means 2.5%, which is 250 basis points.
 *
 * Uses string-based arithmetic to avoid IEEE 754 floating point errors
 * (e.g. Math.round(2.505 * 100) === 250 due to 2.505 * 100 === 250.49999...).
 * Handles scientific notation (e.g. 1e-7) by normalizing to decimal string first.
 * @param fee The fee to convert
 * @returns the basis points
 */
export const basisPointsForFee = (fee: Fee): bigint => {
  // Normalize scientific notation to a decimal string.
  // (1e-7).toString() → "1e-7", which needs to become "0.0000001"
  let str = fee.fee.toString()
  if (str.includes("e") || str.includes("E")) {
    // toFixed(10) covers fees down to 0.00000001%, well below any realistic fee.
    str = fee.fee.toFixed(10).replace(/0+$/, "").replace(/\.$/, "")
  }

  // Split into integer and fractional parts, then multiply by 100 via decimal shift.
  const [intPart, fracPart = ""] = str.split(".")

  // We need 2 decimal places of the fractional part (since we multiply by 100)
  const padded = fracPart.padEnd(2, "0")
  const shifted = intPart + padded.slice(0, 2)
  const remainder = padded.slice(2)

  // Round based on the remaining fractional digits
  let result = BigInt(shifted)
  if (remainder.length > 0 && Number(remainder[0]) >= 5) {
    result += 1n
  }

  return result
}
