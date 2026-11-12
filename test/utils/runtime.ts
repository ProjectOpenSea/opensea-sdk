import { ethers } from "ethers"
import { Chain } from "../../src/types"
import { alchemyProvider } from "./providers"

/** Context type used in integration tests for skip logic */
export interface TestContext {
  test?: { title?: string }
  skip: () => void
}

/**
 * Reads an env var, treating an empty string as unset. GitHub Actions passes
 * `${{ vars.X }}` as "" when the repo variable does not exist, which `??`
 * would keep.
 */
export const envOr = (name: string, fallback: string): string => {
  const value = process.env[name]
  return value === undefined || value === "" ? fallback : value
}

/** Like {@link envOr} with no fallback: "" and unset both come back undefined. */
export const envOptional = (name: string): string | undefined => {
  const value = process.env[name]
  return value === undefined || value === "" ? undefined : value
}

/** ethers needs the 0x prefix; 1Password and some CI secrets store keys without it. */
export const normalizePrivateKey = (key: string): string =>
  key.startsWith("0x") ? key : `0x${key}`

export const normalizeChain = (chain: string): Chain => {
  if (!chain) {
    throw new Error("normalizeChain: chain is required")
  }
  const lower = chain.toLowerCase()
  const found = Object.values(Chain).find(value => value === lower) as
    | Chain
    | undefined
  if (!found) {
    throw new Error(`normalizeChain: unsupported chain '${chain}'`)
  }
  return found
}

export const normalizeChainName = (chain: string): string => {
  if (!chain) {
    throw new Error("normalizeChainName: chain is required")
  }
  const lower = chain.toLowerCase()
  const found = Object.values(Chain).find(value => value === lower)
  if (!found) {
    throw new Error(`normalizeChainName: unsupported chain '${chain}'`)
  }
  // Return the chain enum key
  const enumKey = Object.keys(Chain).find(
    key => Chain[key as keyof typeof Chain] === found,
  )
  if (!enumKey) {
    throw new Error(
      `normalizeChainName: could not find enum key for chain '${chain}'`,
    )
  }
  return enumKey
}

const getProviderForChain = (chain: Chain): ethers.Provider => {
  return alchemyProvider(chain)
}

export const getWalletForChain = (
  privateKey: string,
  chain: Chain,
): ethers.Wallet => {
  return new ethers.Wallet(
    normalizePrivateKey(privateKey),
    getProviderForChain(chain),
  )
}

export const ensureVarsOrSkip = <T extends Record<string, unknown>>(
  ctx: TestContext,
  vars: T,
  label?: string,
): boolean => {
  const missing = Object.entries(vars)
    .filter(
      ([, value]) => value === undefined || value === null || value === "",
    )
    .map(([key]) => key)
  if (missing.length > 0) {
    const testName = ctx.test?.title || label || "Unknown test"
    console.log(`${testName} - Skipping test - missing: ${missing.join(", ")}`)
    ctx.skip()
    return false
  }
  return true
}
