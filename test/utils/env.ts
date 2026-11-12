import "dotenv/config"
import { cappedAmount } from "./walletGuards"

export const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY as string | undefined
export const WALLET_PRIV_KEY = process.env.WALLET_PRIV_KEY as string | undefined
export const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY as string | undefined

/**
 * WETH per offer. Defaults to a tiny amount: offers are made on the Base
 * fixture, and the one the buyer accepts is paid out of the owner's WETH.
 * `||` so the "" that GitHub passes for an unset repo variable falls back too.
 */
export const OFFER_AMOUNT = cappedAmount(
  "OFFER_AMOUNT",
  process.env.OFFER_AMOUNT,
  "0.0001",
)
