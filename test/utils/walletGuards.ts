import { parseEther } from "ethers"

/**
 * Ceilings on what one order or wrap in the wallet specs may move. They hold
 * even if an env override is set by mistake or by someone who should not.
 */
export const AMOUNT_CEILINGS = {
  OFFER_AMOUNT: "0.001",
  LISTING_AMOUNT: "0.001",
  ETH_TO_WRAP: "0.001",
} as const

export type CappedAmountName = keyof typeof AMOUNT_CEILINGS

/**
 * Returns `raw`, or `fallback` when `raw` is unset or "" (GitHub passes "" for
 * an unset variable). Throws when the amount is not a positive decimal or is
 * above its ceiling.
 */
export const cappedAmount = (
  name: CappedAmountName,
  raw: string | undefined,
  fallback: string,
): string => {
  const value = raw || fallback
  let wei: bigint
  try {
    wei = parseEther(value)
  } catch {
    throw new Error(`${name} must be a decimal amount, got "${value}"`)
  }
  if (wei <= 0n) {
    throw new Error(`${name} must be greater than 0, got "${value}"`)
  }
  const ceiling = AMOUNT_CEILINGS[name]
  if (wei > parseEther(ceiling)) {
    throw new Error(`${name} ${value} is above its ceiling of ${ceiling}`)
  }
  return value
}

/** Env overrides that would change which asset or chain the wallet specs trade. */
export const WALLET_STEERING_VARS = [
  "FIXTURE_CHAIN",
  "FIXTURE_CONTRACT_ADDRESS",
  "FIXTURE_TOKEN_ID",
  "FIXTURE_TOKEN_ID_2",
  "CREATE_LISTING_CHAIN",
  "CREATE_LISTING_CONTRACT_ADDRESS",
  "CREATE_LISTING_TOKEN_ID",
  "CREATE_LISTING_2_CHAIN",
  "CREATE_LISTING_2_CONTRACT_ADDRESS",
  "CREATE_LISTING_2_TOKEN_ID",
  "CREATE_LISTING_3_CHAIN",
  "CREATE_LISTING_3_CONTRACT_ADDRESS",
  "CREATE_LISTING_3_TOKEN_ID",
] as const

/**
 * In CI the wallet specs must trade only the committed fixture, so a changed
 * repo variable cannot point a funded wallet at another asset. Throws, naming
 * each override, when CI is set and any steering variable is non-empty.
 */
export const assertNoSteeringOverridesInCi = (
  env: Record<string, string | undefined>,
): void => {
  if (!env.CI) {
    return
  }
  const set = WALLET_STEERING_VARS.filter(name => env[name])
  if (set.length > 0) {
    throw new Error(
      `Wallet specs in CI trade only the committed fixture; unset ${set.join(", ")}`,
    )
  }
}
