import { CROSS_CHAIN_SEAPORT_V1_6_ADDRESS } from "@opensea/seaport-js/lib/constants"
import {
  ALTERNATE_CONDUIT_ADDRESS,
  ALTERNATE_CONDUIT_KEY,
  ALTERNATE_FEE_RECIPIENT,
  ALTERNATE_SEAPORT_V1_6_ADDRESS,
  ALTERNATE_SIGNED_ZONE_V2_ADDRESS,
  GUNZILLA_FEE_RECIPIENT,
  OPENSEA_CONDUIT_ADDRESS,
  OPENSEA_CONDUIT_ADDRESS_2,
  OPENSEA_CONDUIT_KEY,
  OPENSEA_CONDUIT_KEY_2,
  OPENSEA_FEE_RECIPIENT,
  OPENSEA_SIGNED_ZONE_V2,
  SOMNIA_FEE_RECIPIENT,
  WPOL_ADDRESS,
  ZERO_ADDRESS,
} from "../constants"
import { Chain } from "../types"
import { CHAIN_ID_MAP } from "./chainIds.generated"

/**
 * Checks if a chain uses the alternate protocol addresses.
 * These chains use non-standard Seaport, conduit, and signed zone deployments.
 * @param chain The chain to check
 * @returns True if the chain uses alternate protocol addresses
 */
export const usesAlternateProtocol = (chain: Chain): boolean =>
  chain === Chain.Gunzilla || chain === Chain.Somnia || chain === Chain.MegaETH

/** Decimals of native assets and of every wrapped native token the SDK defaults to. */
const NATIVE_DECIMALS = 18

// Enum members, not `keyof typeof NATIVE_STABLECOIN_OFFER_TOKENS`: the emitted
// declaration writes computed enum keys as their string values, so the
// predicate below would narrow `Chain` to `"arc" | "stablechain"` and fail a
// consumer's typecheck (TS2677) whenever skipLibCheck is off.
type NativeStablecoinOfferChain = Chain.Arc | Chain.StableChain

/**
 * Chains whose default offer currency is an ERC-20 mirror of the native
 * stablecoin rather than a wrapped native token. The mirror spends the native
 * balance directly, so there is no wrap/unwrap contract, and its decimals
 * differ from the native asset's. Adding a chain here and to
 * `NativeStablecoinOfferChain` opts it in everywhere.
 */
const NATIVE_STABLECOIN_OFFER_TOKENS = {
  [Chain.Arc]: {
    address: "0x3600000000000000000000000000000000000000", // USDC
    decimals: 6,
  },
  [Chain.StableChain]: {
    address: "0x779ded0c9e1022225f8e0630b35a9b54be713736", // USDT0
    decimals: 6,
  },
} as const satisfies Record<
  NativeStablecoinOfferChain,
  { address: string; decimals: number }
>

/**
 * Checks if a chain's default offer currency is a native stablecoin mirror
 * instead of a wrapped native token.
 * @param chain The chain to check
 * @returns True if offers on the chain spend the native stablecoin through an ERC-20 mirror
 */
export const usesNativeStablecoinOffers = (
  chain: Chain,
): chain is NativeStablecoinOfferChain =>
  chain in NATIVE_STABLECOIN_OFFER_TOKENS

/**
 * Gets the chain ID for a given chain.
 *
 * Uses the generated CHAIN_ID_MAP from scripts/chain-data.json.
 * To add a new chain, update chain-data.json and run `pnpm sync-chains`.
 *
 * @param chain The chain to get the ID for
 * @returns The chain ID as a string
 */
export const getChainId = (chain: Chain): string => {
  const id = CHAIN_ID_MAP[chain]
  if (id === undefined) {
    if (Object.values(Chain).includes(chain)) {
      throw new Error(
        `Chain ${chain} has no EVM chain ID for OpenSea Seaport operations`,
      )
    }
    throw new Error(`Unknown chainId for ${chain}`)
  }
  return id
}

/**
 * Returns the default currency for offers on the given chain.
 * @param chain The chain to get the offer payment token for
 * @returns The token address for offers
 */
export const getOfferPaymentToken = (chain: Chain) => {
  if (chain === Chain.Solana || chain === Chain.Hyperliquid) {
    throw new Error(
      `Chain ${chain} is not supported for OpenSea Seaport offers`,
    )
  }
  if (usesNativeStablecoinOffers(chain)) {
    return NATIVE_STABLECOIN_OFFER_TOKENS[chain].address
  }
  switch (chain) {
    case Chain.Mainnet:
      return "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" // WETH
    case Chain.Polygon:
      return "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" // WETH
    case Chain.Avalanche:
      return "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7" // WAVAX
    case Chain.Arbitrum:
      return "0x82af49447d8a07e3bd95bd0d56f35241523fbab1" // WETH
    case Chain.Blast:
      return "0x4300000000000000000000000000000000000004" // WETH
    // MegaETH and OP Chains have WETH at the same address
    case Chain.MegaETH:
    case Chain.Base:
    case Chain.Optimism:
    case Chain.Zora:
    case Chain.B3:
    case Chain.Shape:
    case Chain.Unichain:
    case Chain.Ink:
    case Chain.Soneium:
      return "0x4200000000000000000000000000000000000006" // WETH
    case Chain.AnimeChain:
      return "0x164906a76f1a2ea933366c446ae0ec6a37062c42" // WANIME
    case Chain.BeraChain:
      return "0x6969696969696969696969696969696969696969" // WBERA
    case Chain.Sei:
      return "0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7" // WSEI
    case Chain.Flow:
      return "0xd3bf53dac106a0290b0483ecbc89d40fcc961f3e" // WFLOW
    case Chain.ApeChain:
      return "0x48b62137edfa95a428d35c09e44256a739f6b557" // WAPE
    case Chain.Ronin:
      return "0xe514d9deb7966c8be0ca922de8a064264ea6bcd4" // WRON
    case Chain.Abstract:
      return "0x3439153eb7af838ad19d56e1571fbd09333c2809" // WETH
    case Chain.Gunzilla:
      return "0x5aad7bba61d95c2c4e525a35f4062040264611f1" // WGUN
    case Chain.HyperEVM:
      return "0x5555555555555555555555555555555555555555" // WHYPE
    case Chain.Somnia:
      return "0x046ede9564a72571df6f5e44d0405360c0f4dcab" // WSOMI
    case Chain.Monad:
      return "0x3bd359c1119da7da1d913d1c4d2b7c461115433a" // WMON
    case Chain.Robinhood:
      return "0x0bd7d308f8e1639fab988df18a8011f41eacad73" // WETH
    default: {
      const exhaustiveChain: never = chain
      throw new Error(`Unknown offer currency for ${exhaustiveChain}`)
    }
  }
}

/**
 * Returns the decimals of the default offer currency on the given chain.
 * @param chain The chain to get the offer payment token decimals for
 * @returns The number of decimals the token uses
 */
export const getOfferPaymentTokenDecimals = (chain: Chain): number =>
  usesNativeStablecoinOffers(chain)
    ? NATIVE_STABLECOIN_OFFER_TOKENS[chain].decimals
    : NATIVE_DECIMALS

/**
 * Returns the decimals of the chain's default offer and listing currencies,
 * keyed by lowercase address, so pricing them never needs a metadata request.
 * @param chain The chain to seed the payment token decimals cache for
 * @returns A map of lowercase token address to decimals
 */
export const getDefaultPaymentTokenDecimals = (
  chain: Chain,
): { [address: string]: number } => ({
  [getListingPaymentToken(chain).toLowerCase()]: NATIVE_DECIMALS,
  [getOfferPaymentToken(chain).toLowerCase()]:
    getOfferPaymentTokenDecimals(chain),
})

/**
 * Returns the default currency for listings on the given chain.
 * @param chain The chain to get the listing payment token for
 * @returns The token address for listings
 */
export const getListingPaymentToken = (chain: Chain) => {
  if (chain === Chain.Solana || chain === Chain.Hyperliquid) {
    throw new Error(
      `Chain ${chain} is not supported for OpenSea Seaport listings`,
    )
  }
  switch (chain) {
    case Chain.Mainnet:
    case Chain.Soneium:
    case Chain.Somnia:
    case Chain.HyperEVM:
    case Chain.Arbitrum:
    case Chain.Blast:
    case Chain.Base:
    case Chain.Optimism:
    case Chain.Zora:
    case Chain.B3:
    case Chain.Abstract:
    case Chain.Shape:
    case Chain.Unichain:
    case Chain.Monad:
    case Chain.MegaETH:
    case Chain.Ink:
      return "0x0000000000000000000000000000000000000000" // ETH
    case Chain.Polygon:
      return "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" // WETH
    case Chain.Avalanche:
      return "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7" // WAVAX
    case Chain.BeraChain:
      return "0x0000000000000000000000000000000000000000" // BERA
    case Chain.Sei:
      return "0x0000000000000000000000000000000000000000" // SEI
    case Chain.Flow:
      return "0xd3bf53dac106a0290b0483ecbc89d40fcc961f3e" // WETH
    case Chain.ApeChain:
      return "0x0000000000000000000000000000000000000000" // APE
    case Chain.Ronin:
      return "0xe514d9deb7966c8be0ca922de8a064264ea6bcd4" // WETH
    case Chain.Gunzilla:
      return "0x0000000000000000000000000000000000000000" // GUN
    case Chain.AnimeChain:
      return "0x0000000000000000000000000000000000000000" // ANIME
    case Chain.Robinhood:
      return "0x0000000000000000000000000000000000000000" // ETH
    case Chain.Arc:
      return ZERO_ADDRESS
    case Chain.StableChain:
      return ZERO_ADDRESS
    default: {
      const exhaustiveChain: never = chain
      throw new Error(`Unknown listing currency for ${exhaustiveChain}`)
    }
  }
}

/**
 * Get the default conduit key and address for a given chain.
 * @param chain The chain to get the conduit for
 * @returns The conduit key and address for the chain
 */
export const getDefaultConduit = (
  chain: Chain,
): { key: string; address: string } => {
  switch (chain) {
    case Chain.Abstract:
    case Chain.HyperEVM:
    case Chain.Monad:
    case Chain.Robinhood:
    case Chain.Arc:
    case Chain.StableChain:
      return {
        key: OPENSEA_CONDUIT_KEY_2,
        address: OPENSEA_CONDUIT_ADDRESS_2,
      }
    default:
      if (usesAlternateProtocol(chain)) {
        return {
          key: ALTERNATE_CONDUIT_KEY,
          address: ALTERNATE_CONDUIT_ADDRESS,
        }
      }
      return {
        key: OPENSEA_CONDUIT_KEY,
        address: OPENSEA_CONDUIT_ADDRESS,
      }
  }
}

/**
 * Get the Seaport 1.6 contract address for a given chain.
 * @param chain The chain to get the Seaport address for
 * @returns The Seaport 1.6 address for the chain
 */
export const getSeaportAddress = (chain: Chain): string => {
  return usesAlternateProtocol(chain)
    ? ALTERNATE_SEAPORT_V1_6_ADDRESS
    : CROSS_CHAIN_SEAPORT_V1_6_ADDRESS
}

/**
 * Get the signed zone address for a given chain.
 * @param chain The chain to get the signed zone address for
 * @returns The signed zone address for the chain
 */
export const getSignedZone = (chain: Chain): string => {
  return usesAlternateProtocol(chain)
    ? ALTERNATE_SIGNED_ZONE_V2_ADDRESS
    : OPENSEA_SIGNED_ZONE_V2
}

/**
 * Get the fee recipient address for a given chain
 * @param chain The blockchain chain
 * @returns The fee recipient address for the chain
 */
export const getFeeRecipient = (chain: Chain): string => {
  switch (chain) {
    case Chain.Gunzilla:
      return GUNZILLA_FEE_RECIPIENT
    case Chain.Somnia:
      return SOMNIA_FEE_RECIPIENT
    case Chain.MegaETH:
      return ALTERNATE_FEE_RECIPIENT
    default:
      return OPENSEA_FEE_RECIPIENT
  }
}

/**
 * Get the appropriate token address for wrap/unwrap operations.
 * For Polygon, use WPOL. For other chains, use the wrapped native asset.
 * @param chain The chain to get the token address for
 * @returns The token address for wrap/unwrap operations
 */
export const getNativeWrapTokenAddress = (chain: Chain): string => {
  if (usesNativeStablecoinOffers(chain)) {
    throw new Error(
      `Chain ${chain} has no wrapped native token; offers spend the native balance directly through ${getOfferPaymentToken(chain)}`,
    )
  }
  switch (chain) {
    case Chain.Polygon:
      return WPOL_ADDRESS
    default:
      return getOfferPaymentToken(chain)
  }
}
