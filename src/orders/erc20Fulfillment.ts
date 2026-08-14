/**
 * Helpers for ERC20-denominated listing fulfillment.
 *
 * When a listing is priced in an ERC20 token instead of the native currency,
 * `transaction.value` is `0` and Seaport pulls the payment from the buyer with
 * `transferFrom`. That only works if the buyer has already approved the spender,
 * so the fulfillment reverts with a bare "execution reverted" when they haven't.
 * These helpers read the payment token and amount out of the API's fulfillment
 * input data so the SDK can check the allowance before spending gas.
 */

/** Seaport `ItemType` for an ERC20 item. 0 is native, and anything >= 2 is an NFT. */
const ITEM_TYPE_ERC20 = 1

/**
 * Seaport `BasicOrderRouteType` values where the fulfiller pays with an ERC20
 * token: `ERC20_TO_ERC721` (2) and `ERC20_TO_ERC1155` (3). Routes 0-1 are
 * native-priced listings; routes 4-5 are offer fulfillments, where the fulfiller
 * provides the NFT and the ERC20 comes from the offerer instead.
 */
const ERC20_PAYMENT_ROUTES = new Set([2, 3])

/** A `bytes32(0)` conduit key means Seaport transfers directly, with no conduit. */
export const ZERO_CONDUIT_KEY = `0x${"0".repeat(64)}`

export type Erc20Payment = {
  /** Payment token contract address. */
  token: string
  /** Total amount the fulfiller owes, in the token's base units. */
  amount: bigint
}

type ConsiderationItemLike = {
  itemType?: unknown
  token?: unknown
  startAmount?: unknown
}

/**
 * Coerce a value an RPC adapter may return as a bigint, a decimal string, or a
 * number into a bigint. Returns null for anything else.
 */
export function toBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") {
    return value
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return BigInt(value)
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim())
  }
  return null
}

function toNumber(value: unknown): number | null {
  const asBigInt = toBigInt(value)
  return asBigInt === null ? null : Number(asBigInt)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * Sum the ERC20 consideration items of a listing, which together are what the
 * fulfiller pays (seller proceeds plus marketplace and creator fees).
 *
 * Returns null unless every consideration item is the same ERC20 token. A native
 * item means the listing is native-priced, an NFT item means this is an offer
 * fulfillment rather than a purchase, and mixed tokens are not something we can
 * express as a single allowance.
 */
function sumErc20Consideration(consideration: unknown): Erc20Payment | null {
  if (!Array.isArray(consideration) || consideration.length === 0) {
    return null
  }

  let token: string | null = null
  let total = 0n

  for (const rawItem of consideration as ConsiderationItemLike[]) {
    if (!isRecord(rawItem)) {
      return null
    }
    const itemType = toNumber(rawItem.itemType)
    if (itemType !== ITEM_TYPE_ERC20) {
      // Native payment, an NFT in the consideration, or an unreadable item type.
      return null
    }
    const itemToken = rawItem.token
    if (typeof itemToken !== "string") {
      return null
    }
    if (token === null) {
      token = itemToken
    } else if (token.toLowerCase() !== itemToken.toLowerCase()) {
      return null
    }
    const amount = toBigInt(rawItem.startAmount)
    if (amount === null) {
      return null
    }
    total += amount
  }

  return token === null ? null : { token, amount: total }
}

/**
 * Sum the ERC20 payment for a basic order, whose consideration is flattened into
 * `considerationAmount` plus one entry per `additionalRecipients` fee.
 */
function basicOrderErc20Payment(
  basicOrderParameters: unknown,
): Erc20Payment | null {
  if (!isRecord(basicOrderParameters)) {
    return null
  }

  const basicOrderType = toNumber(basicOrderParameters.basicOrderType)
  if (basicOrderType === null) {
    return null
  }
  // Four order types share each route: full/partial x open/restricted.
  if (!ERC20_PAYMENT_ROUTES.has(Math.floor(basicOrderType / 4))) {
    return null
  }

  const token = basicOrderParameters.considerationToken
  if (typeof token !== "string") {
    return null
  }

  let total = toBigInt(basicOrderParameters.considerationAmount)
  if (total === null) {
    return null
  }

  const additionalRecipients = basicOrderParameters.additionalRecipients
  if (additionalRecipients !== undefined) {
    if (!Array.isArray(additionalRecipients)) {
      return null
    }
    for (const recipient of additionalRecipients) {
      if (!isRecord(recipient)) {
        return null
      }
      const amount = toBigInt(recipient.amount)
      if (amount === null) {
        return null
      }
      total += amount
    }
  }

  return { token, amount: total }
}

/**
 * Whether an advanced order's numerator/denominator fraction represents a
 * full fill. A full fill is the only case where summing the consideration
 * items' `startAmount`s yields the exact payment: for a partial fill Seaport
 * scales each item by the fraction and requires exact divisibility, which the
 * SDK does not model here. Returns false for a missing or unparsable value, a
 * non-positive value, or an unequal fraction, so the caller fails open and
 * skips the preflight.
 */
function isFullFillFraction(order: Record<string, unknown>): boolean {
  const numerator = toBigInt(order.numerator)
  const denominator = toBigInt(order.denominator)
  if (numerator === null || denominator === null) {
    return false
  }
  return numerator > 0n && numerator === denominator
}

/**
 * Read the ERC20 payment a fulfiller owes from the `inputData` of an OpenSea
 * fulfillment response.
 *
 * Returns null whenever the payment is not a single ERC20 amount we can read
 * with confidence, including native-priced listings and offer fulfillments.
 * Callers must treat null as "no preflight possible" and submit the transaction
 * unchanged, so an unfamiliar response shape can never block a working purchase.
 */
export function getErc20Payment(inputData: unknown): Erc20Payment | null {
  if (!isRecord(inputData)) {
    return null
  }

  if ("basicOrderParameters" in inputData) {
    return basicOrderErc20Payment(inputData.basicOrderParameters)
  }

  const order = isRecord(inputData.advancedOrder)
    ? inputData.advancedOrder
    : isRecord(inputData.order)
      ? inputData.order
      : null
  if (!order || !isRecord(order.parameters)) {
    return null
  }

  // An AdvancedOrder may carry a numerator/denominator fraction representing a
  // partial fill. Seaport applies that fraction to each consideration item and
  // requires exact divisibility, so the summed full-order consideration is only
  // a confident preflight amount for a full fill. For any other fraction, fail
  // open and skip the preflight rather than falsely blocking a purchase.
  if (isRecord(inputData.advancedOrder) && !isFullFillFraction(order)) {
    return null
  }

  return sumErc20Consideration(order.parameters.consideration)
}

/**
 * Read the fulfiller's conduit key, which decides who the buyer must approve:
 * the resolved conduit for a non-zero key, or Seaport itself for `bytes32(0)`.
 * Returns null when the response does not carry one.
 */
export function getFulfillerConduitKey(inputData: unknown): string | null {
  if (!isRecord(inputData)) {
    return null
  }
  const direct = inputData.fulfillerConduitKey
  if (typeof direct === "string") {
    return direct
  }
  if (isRecord(inputData.basicOrderParameters)) {
    const fromBasicOrder = inputData.basicOrderParameters.fulfillerConduitKey
    if (typeof fromBasicOrder === "string") {
      return fromBasicOrder
    }
  }
  return null
}

/** Whether a conduit key means "transfer directly from Seaport, no conduit". */
export function isZeroConduitKey(conduitKey: string | null): boolean {
  if (!conduitKey) {
    return true
  }
  return conduitKey.toLowerCase() === ZERO_CONDUIT_KEY
}
