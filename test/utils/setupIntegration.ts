import { concat, type ethers, getBytes, keccak256, toUtf8Bytes } from "ethers"
import { OpenSeaSDK } from "../../src/sdk"
import { Chain } from "../../src/types"
import { OPENSEA_API_KEY, WALLET_PRIV_KEY } from "./env"
import { alchemyProvider } from "./providers"
import {
  envOptional,
  envOr,
  getWalletForChain,
  normalizeChain,
  normalizePrivateKey,
} from "./runtime"
import { cappedAmount } from "./walletGuards"

/**
 * True when WALLET_PRIV_KEY is set. Specs that sign, post orders, or send
 * transactions gate on this with `describe.skipIf(!hasWallet)` so the nightly
 * run passes their read-only siblings when the key is absent.
 */
export const hasWallet = Boolean(WALLET_PRIV_KEY)

const requireWalletKey = (): string => {
  if (!WALLET_PRIV_KEY) {
    throw new Error(
      "WALLET_PRIV_KEY is not set; gate this spec with describe.skipIf(!hasWallet)",
    )
  }
  return normalizePrivateKey(WALLET_PRIV_KEY)
}

// The wallet specs trade an ERC1155 fixture on Base between the owner wallet
// (WALLET_PRIV_KEY) and a buyer wallet derived from it. Source and deploy
// script: test/integration/fixture/. See test/README-integration.md.

/**
 * CREATE2 address of `OpenSeaSdkTestFixture` deployed by
 * `test/integration/fixture/script/DeployFixture.s.sol` with the CI wallet as
 * owner. The address depends on the owner, so a different WALLET_PRIV_KEY needs
 * its own deployment and FIXTURE_CONTRACT_ADDRESS.
 */
export const DEFAULT_FIXTURE_CONTRACT_ADDRESS =
  "0x483A6ABD50E5b7DD7817585cFBAf720b6c6d1A87"

export const FIXTURE_CHAIN = normalizeChain(envOr("FIXTURE_CHAIN", Chain.Base))
export const FIXTURE_CONTRACT_ADDRESS = envOr(
  "FIXTURE_CONTRACT_ADDRESS",
  DEFAULT_FIXTURE_CONTRACT_ADDRESS,
)
/** Token the owner lists and the buyer holds. */
export const FIXTURE_TOKEN_ID = envOr("FIXTURE_TOKEN_ID", "1")
/** Second token, for bulk orders that need two distinct items. */
export const FIXTURE_TOKEN_ID_2 = envOr("FIXTURE_TOKEN_ID_2", "2")
/** Trait every fixture token carries (see OpenSeaSdkTestFixture.uri). */
export const FIXTURE_TRAIT = { type: "Purpose", value: "Integration test" }

/** Tag hashed with the owner key to derive the buyer key. Matches DeployFixture.s.sol. */
export const BUYER_KEY_TAG = "opensea-sdk-integration-buyer"

export const CREATE_LISTING_CONTRACT_ADDRESS = envOr(
  "CREATE_LISTING_CONTRACT_ADDRESS",
  FIXTURE_CONTRACT_ADDRESS,
)
export const CREATE_LISTING_TOKEN_ID = envOr(
  "CREATE_LISTING_TOKEN_ID",
  FIXTURE_TOKEN_ID,
)
export const CREATE_LISTING_2_CONTRACT_ADDRESS = envOr(
  "CREATE_LISTING_2_CONTRACT_ADDRESS",
  FIXTURE_CONTRACT_ADDRESS,
)
export const CREATE_LISTING_2_TOKEN_ID = envOr(
  "CREATE_LISTING_2_TOKEN_ID",
  FIXTURE_TOKEN_ID_2,
)
export const CREATE_LISTING_3_CONTRACT_ADDRESS = envOr(
  "CREATE_LISTING_3_CONTRACT_ADDRESS",
  FIXTURE_CONTRACT_ADDRESS,
)
export const CREATE_LISTING_3_TOKEN_ID = envOr(
  "CREATE_LISTING_3_TOKEN_ID",
  FIXTURE_TOKEN_ID_2,
)
/** Listing price in ETH. Tiny, because the buyer actually pays it. */
export const LISTING_AMOUNT = cappedAmount(
  "LISTING_AMOUNT",
  process.env.LISTING_AMOUNT,
  "0.00001",
)
/** ETH to wrap and unwrap in wrapEth.spec.ts. */
export const ETH_TO_WRAP = cappedAmount(
  "ETH_TO_WRAP",
  process.env.ETH_TO_WRAP,
  "0.00001",
)

export const CREATE_LISTING_CHAIN = normalizeChain(
  envOr("CREATE_LISTING_CHAIN", FIXTURE_CHAIN),
)
export const CREATE_LISTING_2_CHAIN = normalizeChain(
  envOr("CREATE_LISTING_2_CHAIN", CREATE_LISTING_CHAIN),
)
export const CREATE_LISTING_3_CHAIN = normalizeChain(
  envOr("CREATE_LISTING_3_CHAIN", CREATE_LISTING_CHAIN),
)

/** Set when the env points CREATE_LISTING at something other than the fixture. */
export const usesCustomListingAsset =
  envOptional("CREATE_LISTING_CONTRACT_ADDRESS") !== undefined

let walletAddress: string | undefined

export const getWalletAddress = (): string => {
  walletAddress ??= getWalletForChain(requireWalletKey(), Chain.Mainnet).address
  return walletAddress
}

/** Owner wallet (WALLET_PRIV_KEY) connected to `chain`. */
export const getOwnerWallet = (chain: Chain): ethers.Wallet =>
  getWalletForChain(requireWalletKey(), chain)

/**
 * The buyer's private key: keccak256(ownerKey ‖ utf8(BUYER_KEY_TAG)). Seaport
 * and the OpenSea API refuse to let a wallet fill its own orders, so the
 * fulfillment specs need a second wallet; deriving it from the owner key keeps
 * CI to one secret. DeployFixture.s.sol derives the same key.
 */
const deriveBuyerKey = (ownerKey: string): string =>
  keccak256(concat([getBytes(ownerKey), toUtf8Bytes(BUYER_KEY_TAG)]))

/** Buyer wallet connected to `chain`. Throws when WALLET_PRIV_KEY is unset. */
export const getBuyerWallet = (chain: Chain): ethers.Wallet =>
  getWalletForChain(deriveBuyerKey(requireWalletKey()), chain)

let buyerAddress: string | undefined

export const getBuyerAddress = (): string => {
  buyerAddress ??= getBuyerWallet(Chain.Mainnet).address
  return buyerAddress
}

const newSdk = (wallet: ethers.Wallet, chain: Chain, label: string) =>
  new OpenSeaSDK(wallet, { chain, apiKey: OPENSEA_API_KEY }, line =>
    console.info(`${label}${chain.toUpperCase()}: ${line}`),
  )

const sdkCache = new Map<Chain, OpenSeaSDK>()

/** Wallet-backed SDK for specs that sign. Throws when WALLET_PRIV_KEY is unset. */
export const getSdkForChain = (chain: Chain): OpenSeaSDK => {
  if (!sdkCache.has(chain)) {
    sdkCache.set(chain, newSdk(getOwnerWallet(chain), chain, ""))
  }
  return sdkCache.get(chain)!
}

const buyerSdkCache = new Map<Chain, OpenSeaSDK>()

/** SDK signing as the derived buyer wallet. Throws when WALLET_PRIV_KEY is unset. */
export const getBuyerSdkForChain = (chain: Chain): OpenSeaSDK => {
  if (!buyerSdkCache.has(chain)) {
    buyerSdkCache.set(chain, newSdk(getBuyerWallet(chain), chain, "BUYER "))
  }
  return buyerSdkCache.get(chain)!
}

const readOnlySdkCache = new Map<Chain, OpenSeaSDK>()

/** Provider-backed SDK for API reads. Needs no wallet. */
export const getReadOnlySdkForChain = (chain: Chain): OpenSeaSDK => {
  if (readOnlySdkCache.has(chain)) {
    return readOnlySdkCache.get(chain)!
  }

  const sdk = new OpenSeaSDK(
    alchemyProvider(chain),
    {
      chain,
      apiKey: OPENSEA_API_KEY,
    },
    line => console.info(`${chain.toUpperCase()}: ${line}`),
  )

  readOnlySdkCache.set(chain, sdk)
  return sdk
}
