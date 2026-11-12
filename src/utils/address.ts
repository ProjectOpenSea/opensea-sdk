import { keccak_256 } from "@noble/hashes/sha3.js"
import { bytesToHex } from "@noble/hashes/utils.js"

/**
 * EIP-55 checksum an Ethereum address.
 *
 * Mixed-case input is validated as an existing checksum, and an incorrect
 * checksum throws (matching ethers.getAddress behavior).
 * All-lowercase and all-uppercase inputs are checksummed without validation.
 *
 * @param address The address to checksum (must be a valid 0x-prefixed hex address).
 * @returns The checksummed address.
 * @throws Error if the address is not a valid Ethereum address or has an invalid checksum.
 */
export function checksumAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Invalid address: ${address}`)
  }

  const lower = address.slice(2).toLowerCase()
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(lower)))

  let checksummed = "0x"
  for (let i = 0; i < 40; i++) {
    const char = lower[i]
    const hashNibble = Number.parseInt(hash[i], 16)
    checksummed += hashNibble >= 8 ? char.toUpperCase() : char
  }

  // If the input has mixed case, validate it matches the computed checksum.
  // All-lowercase and all-uppercase inputs skip validation (they're just being checksummed).
  const hex = address.slice(2)
  const isAllLower = hex === hex.toLowerCase()
  const isAllUpper = hex === hex.toUpperCase()
  if (!isAllLower && !isAllUpper && address !== checksummed) {
    throw new Error(`Invalid address checksum: ${address}`)
  }

  return checksummed
}
