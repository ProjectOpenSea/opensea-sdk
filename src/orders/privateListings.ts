import { ItemType } from "@opensea/seaport-js/lib/constants"
import type {
  ConsiderationInputItem,
  CreateInputItem,
  MatchOrdersFulfillment,
  Order,
  OrderWithCounter,
} from "@opensea/seaport-js/lib/types"
import { isCurrencyItem } from "@opensea/seaport-js/lib/utils/item"
import { generateRandomSalt } from "@opensea/seaport-js/lib/utils/order"
import { ZERO_ADDRESS } from "../constants"

/**
 * Compute the native currency (ETH) value required to fulfill a private listing.
 * Sums all native currency consideration items not going to the taker.
 * @param order The private listing order
 * @param takerAddress The address of the private listing recipient
 * @returns The total native currency value as a bigint
 */
export const computePrivateListingValue = (
  order: OrderWithCounter,
  takerAddress: string,
): bigint => {
  return order.parameters.consideration
    .filter(
      item =>
        item.recipient.toLowerCase() !== takerAddress.toLowerCase() &&
        item.token.toLowerCase() === ZERO_ADDRESS.toLowerCase() &&
        item.itemType === ItemType.NATIVE,
    )
    .reduce((sum, item) => sum + BigInt(item.startAmount), 0n)
}

export const getPrivateListingConsiderations = (
  offer: CreateInputItem[],
  privateSaleRecipient: string,
): ConsiderationInputItem[] => {
  return offer.map(item => {
    return { ...item, recipient: privateSaleRecipient }
  })
}

export const constructPrivateListingCounterOrder = (
  order: OrderWithCounter,
  privateSaleRecipient: string,
): Order => {
  // Counter order offers up all the items in the private listing consideration
  // besides the items that are going to the private listing recipient
  const paymentItems = order.parameters.consideration.filter(
    item => item.recipient.toLowerCase() !== privateSaleRecipient.toLowerCase(),
  )

  // Only validate payment items if there are any (zero-payment private listings are valid)
  if (paymentItems.length > 0) {
    if (!paymentItems.every(item => isCurrencyItem(item))) {
      throw new Error(
        "The consideration for the private listing did not contain only currency items",
      )
    }
    if (
      !paymentItems.every(
        item =>
          item.itemType === paymentItems[0].itemType &&
          item.token.toLowerCase() === paymentItems[0].token.toLowerCase(),
      )
    ) {
      throw new Error("Not all currency items were the same for private order")
    }
  }

  const { aggregatedStartAmount, aggregatedEndAmount } = paymentItems.reduce(
    ({ aggregatedStartAmount, aggregatedEndAmount }, item) => ({
      aggregatedStartAmount: aggregatedStartAmount + BigInt(item.startAmount),
      aggregatedEndAmount: aggregatedEndAmount + BigInt(item.endAmount),
    }),
    {
      aggregatedStartAmount: 0n,
      aggregatedEndAmount: 0n,
    },
  )

  const counterOrder: Order = {
    parameters: {
      ...order.parameters,
      offerer: privateSaleRecipient,
      // Empty offer for zero-payment private listings, single aggregated item otherwise
      offer:
        paymentItems.length > 0
          ? [
              {
                itemType: paymentItems[0].itemType,
                token: paymentItems[0].token,
                identifierOrCriteria: paymentItems[0].identifierOrCriteria,
                startAmount: aggregatedStartAmount.toString(),
                endAmount: aggregatedEndAmount.toString(),
              },
            ]
          : [],
      // The consideration here is empty as the original private listing order supplies
      // the taker address to receive the desired items.
      consideration: [],
      salt: generateRandomSalt(),
      totalOriginalConsiderationItems: 0,
    },
    signature: "0x",
  }

  return counterOrder
}

export const getPrivateListingFulfillments = (
  privateListingOrder: OrderWithCounter,
): MatchOrdersFulfillment[] => {
  const nftRelatedFulfillments: MatchOrdersFulfillment[] = []

  // For the original order, we need to match everything offered with every consideration item
  // on the original order that's set to go to the private listing recipient
  privateListingOrder.parameters.offer.forEach((offerItem, offerIndex) => {
    const considerationIndex =
      privateListingOrder.parameters.consideration.findIndex(
        considerationItem =>
          considerationItem.itemType === offerItem.itemType &&
          considerationItem.token === offerItem.token &&
          considerationItem.identifierOrCriteria ===
            offerItem.identifierOrCriteria,
      )
    if (considerationIndex === -1) {
      throw new Error(
        "Could not find matching offer item in the consideration for private listing",
      )
    }
    nftRelatedFulfillments.push({
      offerComponents: [
        {
          orderIndex: 0,
          itemIndex: offerIndex,
        },
      ],
      considerationComponents: [
        {
          orderIndex: 0,
          itemIndex: considerationIndex,
        },
      ],
    })
  })

  const currencyRelatedFulfillments: MatchOrdersFulfillment[] = []

  // For the original order, we need to match everything offered with every consideration item
  // on the original order that's set to go to the private listing recipient
  privateListingOrder.parameters.consideration.forEach(
    (considerationItem, considerationIndex) => {
      if (!isCurrencyItem(considerationItem)) {
        return
      }
      // We always match the offer item (index 0) of the counter order (index 1)
      // with all of the payment items on the private listing
      currencyRelatedFulfillments.push({
        offerComponents: [
          {
            orderIndex: 1,
            itemIndex: 0,
          },
        ],
        considerationComponents: [
          {
            orderIndex: 0,
            itemIndex: considerationIndex,
          },
        ],
      })
    },
  )

  return [...nftRelatedFulfillments, ...currencyRelatedFulfillments]
}
