---
title: Advanced Use Cases
category: 64cbb5277b5f3c0065d96616
slug: opensea-sdk-advanced-use
parentDocSlug: opensea-sdk
order: 2
hidden: false
---

For every method's parameters and return types, see the [API reference](api-reference.md).

- [Purchasing items for other users](#purchasing-items-for-other-users)
- [Private orders](#private-orders)
- [Canceling orders](#canceling-orders)
- [Bulk order creation](#bulk-order-creation)
- [Bulk transfers](#bulk-transfers)
- [Listening to events](#listening-to-events)

## Purchasing items for other users

To buy an item and send it to someone else in one transaction, pass `recipientAddress`:

```typescript
const orderHash = "0x...";
const protocolAddress = "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC"; // Seaport 1.6
const accountAddress = "0x..."; // Wallet that signs and pays
const recipientAddress = "0x..."; // NFT recipient

const order = await openseaSDK.api.orders.getOrderByHash(orderHash, protocolAddress);
await openseaSDK.fulfillOrder({
  order,
  accountAddress,
  recipientAddress,
});
```

`accountAddress` pays and `recipientAddress` receives the item. `recipientAddress` only applies to listings; it has no effect when accepting an offer.

`fulfillOrder` doesn't send approval transactions. For an ERC20-priced listing it checks the buyer's balance and allowance first, and throws an error naming the `approve` call to make instead of sending a transaction that would revert.

## Private orders

A private listing can only be filled by the address you name in `buyerAddress`. Agree on a price elsewhere, then list at that price for that buyer alone. This example lists a Decentraland parcel for 10 ETH:

```typescript
// Address allowed to buy from you
const buyerAddress = "0x123...";
// Decentraland
const tokenAddress = "0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d";
const tokenId =
  "115792089237316195423570985008687907832853042650384256231655107562007036952461";
const accountAddress = "0x..."; // Seller's wallet (must own the NFT)

const listing = await openseaSDK.createListing({
  asset: { tokenAddress, tokenId },
  accountAddress,
  amount: 10,
  buyerAddress,
});
```

Only the taker is restricted, at the contract level. The order itself stays public and visible through OpenSea APIs and onchain indexers.

## Canceling orders

Orders can be canceled onchain, which costs gas, or offchain for free if they are SignedZone orders.

### Onchain order cancellation

`cancelOrder()` cancels one order and `cancelOrders()` cancels several in one transaction. Both return the transaction hash. Pass an order hash and the SDK fetches the order from the API for you, or pass an `OrderV2` you already hold:

```typescript
import type { OrderV2 } from "@opensea/sdk";

// Cancel using order hash (automatically fetches from API)
const transactionHash = await openseaSDK.cancelOrder({
  orderHash: "0x123...",
  accountAddress: "0x...",
  protocolAddress: "0x00000000000000adc04c56bf30ac9d3c0aaf14dc", // Seaport address
});

// Cancel using a full OrderV2 object you already hold. Note that
// `api.orders.getOrderByHash` returns the v2 `Listing`/`Offer` shape rather than
// an `OrderV2`, so pass `orderHash` above when that is where your order comes from.
declare const order: OrderV2;

await openseaSDK.cancelOrder({
  order,
  accountAddress: "0x...",
});
```

`cancelOrders()` also accepts lightweight `OrderComponents`:

```typescript
import type { OrderV2 } from "@opensea/sdk";

// Cancel using order hashes (automatically fetches from API)
await openseaSDK.cancelOrders({
  orderHashes: ["0x123...", "0x456...", "0x789..."],
  accountAddress: "0x...",
  protocolAddress: "0x00000000000000adc04c56bf30ac9d3c0aaf14dc", // Seaport address
});

// Cancel using full OrderV2 objects you already hold. As above, the listings
// endpoints return the v2 `Listing` shape, not `OrderV2`, so use `orderHashes`
// when your orders come from the API.
declare const orders: OrderV2[];

await openseaSDK.cancelOrders({
  orders,
  accountAddress: "0x...",
});
```

### Offchain order cancellation

Orders protected by SignedZone (a Seaport zone that validates orders offchain before allowing onchain fills) can be canceled offchain, with no gas and no wait for a block:

```typescript
import { Chain } from "@opensea/sdk";

await openseaSDK.offchainCancelOrder(
  protocolAddress,
  orderHash,
  Chain.Mainnet,
  undefined, // offererSignature: optional
  true, // useSignerToDeriveOffererSignature: sign with the SDK's signer
);
```

Without an `offererSignature`, the SDK's API key must belong to the order's offerer. Cancellation is only guaranteed if no fulfillment signature was issued before it.

The API refuses an offchain cancel for a recently created order, with the error "Orders created recently must be cancelled onchain". Cancel it [onchain](#onchain-order-cancellation) with `cancelOrder()`, which the SDK's error message also names. `sdk.api.orders.createCancelOrderActions()` returns the same onchain cancel as steps to execute yourself.

## Bulk order creation

`createBulkListings()` and `createBulkOffers()` sign many orders with one wallet signature, using Seaport's merkle tree bulk signatures. Each order keeps its own price, expiration, and other options. Orders are submitted to the API one at a time.

With a single order, both methods fall back to `createListing()` or `createOffer()`, because a bulk signature costs more to verify onchain.

### Creating multiple listings


```typescript
import { getUnixTimestampInSeconds, TimeInSeconds } from "@opensea/sdk";

const listings = await openseaSDK.createBulkListings({
  listings: [
    {
      asset: { tokenAddress: "0x...", tokenId: "1" },
      amount: "1.5", // Price in ETH
    },
    {
      asset: { tokenAddress: "0x...", tokenId: "2" },
      amount: "2.0",
      expirationTime: getUnixTimestampInSeconds(TimeInSeconds.WEEK), // 7 days
    },
    {
      asset: { tokenAddress: "0x...", tokenId: "3" },
      amount: "0.5",
    },
  ],
  accountAddress: "0x...",
});
```

### Creating multiple offers


```typescript
import { getUnixTimestampInSeconds, TimeInSeconds } from "@opensea/sdk";

const offers = await openseaSDK.createBulkOffers({
  offers: [
    {
      asset: { tokenAddress: "0x...", tokenId: "1" },
      amount: "0.8", // Offer price in WETH
    },
    {
      asset: { tokenAddress: "0x...", tokenId: "2" },
      amount: "1.2",
      expirationTime: getUnixTimestampInSeconds(TimeInSeconds.DAY), // 1 day
    },
    {
      asset: { tokenAddress: "0x...", tokenId: "3" },
      amount: "2.5",
      quantity: 5, // For ERC1155 tokens
    },
  ],
  accountAddress: "0x...",
});
```

Offers use the collection's pricing currency as the payment token and the chain's signed zone by default. If the collection requires a zone, the SDK uses that one.

### Error handling in bulk operations

By default, a bulk call throws as soon as one order fails to submit. Set `continueOnError: true` to attempt every order and get back the successes and failures:

```typescript
const result = await openseaSDK.createBulkListings({
  listings: [
    { asset: { tokenAddress: "0x...", tokenId: "1" }, amount: "1.5" },
    { asset: { tokenAddress: "0x...", tokenId: "2" }, amount: "2.0" },
    { asset: { tokenAddress: "0x...", tokenId: "3" }, amount: "0.5" },
  ],
  accountAddress: "0x...",
  continueOnError: true, // Continue even if some fail
  onProgress: (completed, total) => {
    console.log(`${completed}/${total} orders processed`);
  },
});

console.log(`✅ ${result.successful.length} orders created`);
console.log(`❌ ${result.failed.length} orders failed`);

// Handle failures
result.failed.forEach(({ index, error }) => {
  console.error(`Order ${index} failed:`, error.message);
});
```

`onProgress` runs after each order, successful or not.

Each entry in the `listings` or `offers` array takes:

| Field | Notes |
| --- | --- |
| `asset` | Required. `{ tokenAddress, tokenId }` |
| `amount` | Required. Price in payment token units |
| `quantity` | Defaults to 1. For semi-fungible tokens |
| `expirationTime` | Unix seconds |
| `domain` | Domain for order attribution |
| `salt` | Custom order salt |
| `buyerAddress` | Private listings only |
| `includeOptionalCreatorFees` | Listings only |
| `zone` | Custom zone address |

Every SDK API call, bulk or not, retries on rate limits (HTTP 429 or 599). It logs the delay, waits for the `retry-after` header or an exponential backoff, and retries up to 3 times before throwing.

An example using most options:

```typescript
import { getUnixTimestampInSeconds, TimeInSeconds } from "@opensea/sdk";

const listings = await openseaSDK.createBulkListings({
  listings: [
    {
      asset: { tokenAddress: "0x...", tokenId: "1" },
      amount: "1.5",
      quantity: 1,
      expirationTime: getUnixTimestampInSeconds(TimeInSeconds.MONTH), // 30 days
      domain: "mymarketplace.com",
      includeOptionalCreatorFees: true,
    },
    {
      asset: { tokenAddress: "0x...", tokenId: "2" },
      amount: "2.0",
      buyerAddress: "0xSpecificBuyer...", // Private listing
    },
  ],
  accountAddress: "0x...",
});
```

## Bulk transfers

`bulkTransfer()` sends many assets in one transaction through OpenSea's TransferHelper contract.

### Batch approving assets

Assets must first be approved for the OpenSea conduit. `batchApproveAssets()` checks each asset and approves only the contracts that need it:

```typescript
import { TokenStandard } from "@opensea/sdk";

// Approve every contract that is not yet approved for the conduit
const txHash = await openseaSDK.batchApproveAssets({
  assets: [
    {
      asset: {
        tokenAddress: "0x...",
        tokenId: "1",
        tokenStandard: TokenStandard.ERC721,
      },
    },
    {
      asset: {
        tokenAddress: "0x...",
        tokenId: "2",
        tokenStandard: TokenStandard.ERC1155,
      },
      amount: "10",
    },
  ],
  fromAddress: accountAddress,
});
```

It sends one approval transaction from `fromAddress` for each contract that needs one. Assets on the same contract share an approval. It returns the hash of the last approval, or `undefined` if nothing needed approving.

A regular wallet can't combine approvals into one transaction. A token grants the approval to its caller, so routing approvals through a contract such as Multicall3 would approve that contract instead of you.

### Bulk transfer

Once approved, transfer the assets. Each one can go to a different recipient:

```typescript
import { TokenStandard } from "@opensea/sdk";

const txHash = await openseaSDK.bulkTransfer({
  assets: [
    {
      asset: {
        tokenAddress: "0x...",
        tokenId: "1",
        tokenStandard: TokenStandard.ERC721,
      },
      toAddress: "0xrecipient1...",
    },
    {
      asset: {
        tokenAddress: "0x...",
        tokenId: "2",
        tokenStandard: TokenStandard.ERC1155,
      },
      toAddress: "0xrecipient2...",
      amount: "5",
    },
    {
      asset: {
        tokenAddress: "0x...", // ERC20 token
        tokenId: null, // ERC20 has no token ID
        tokenStandard: TokenStandard.ERC20,
      },
      toAddress: "0xrecipient3...",
      amount: "1000000000000000000", // 1 token in wei
    },
  ],
  fromAddress: accountAddress,
});
```

`bulkTransfer()` supports ERC20, ERC721, and ERC1155. If any asset isn't approved, it throws and points you to `batchApproveAssets()`.

## Listening to events

The SDK emits events when it creates transactions or orders and when transactions are mined. Forward them to your own store or state management:

```typescript
import { EventType, type OpenSeaSDK } from '@opensea/sdk'

declare const sdk: OpenSeaSDK

function handleSDKEvents() {
    sdk.addListener(EventType.TransactionCreated, ({ transactionHash, event }) => {
      console.info('Transaction created: ', { transactionHash, event })
    })
    sdk.addListener(EventType.TransactionConfirmed, ({ transactionHash, event }) => {
      console.info('Transaction confirmed: ',{ transactionHash, event })
    })
    sdk.addListener(EventType.TransactionDenied, ({ error, accountAddress }) => {
      console.info('Transaction denied: ', { error, accountAddress })
    })
    sdk.addListener(EventType.TransactionFailed, ({ transactionHash, event, error }) => {
      console.info('Transaction failed: ', { transactionHash, event, error })
    })
    sdk.addListener(EventType.WrapEth, ({ accountAddress, amount }) => {
      console.info('Wrap ETH: ', { accountAddress, amount })
    })
    sdk.addListener(EventType.UnwrapWeth, ({ accountAddress, amount }) => {
      console.info('Unwrap ETH: ', { accountAddress, amount })
    })
    sdk.addListener(EventType.MatchOrders, ({ transactionHash, event }) => {
      console.info('Match orders: ', { transactionHash, event })
    })
    sdk.addListener(EventType.CancelOrder, ({ orderV2, accountAddress }) => {
      console.info('Cancel order: ', { orderV2, accountAddress })
    })
    sdk.addListener(EventType.ApproveOrder, ({ orderV2, accountAddress }) => {
      console.info('Approve order: ', { orderV2, accountAddress })
    })
    sdk.addListener(EventType.Transfer, ({ accountAddress }) => {
      console.info('Transfer: ', { accountAddress })
    })
    sdk.addListener(EventType.ApproveAllAssets, ({ transactionHash, event }) => {
      console.info('Approve all assets: ', { transactionHash, event })
    })
}
```

`sdk.removeAllListeners()` removes them all.
