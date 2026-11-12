---
title: Getting Started Guide
category: 64cbb5277b5f3c0065d96616
slug: opensea-sdk-getting-started
parentDocSlug: opensea-sdk
order: 1
hidden: false
---

For every method's parameters and return types, see the [API reference](api-reference.md).

- [Fetching NFTs](#fetching-nfts)
  - [Checking balances and ownership](#checking-balances-and-ownership)
- [Making offers](#making-offers)
- [Making listings](#making-listings)
  - [Collection and trait offers](#collection-and-trait-offers)
- [Fetching orders](#fetching-orders)
  - [Fetching an order by hash](#fetching-an-order-by-hash)
  - [Best offer and best listing for an NFT](#best-offer-and-best-listing-for-an-nft)
- [Fetching events](#fetching-events)
  - [Events by account](#events-by-account)
  - [Events by collection](#events-by-collection)
  - [Events by NFT](#events-by-nft)
  - [Event fields](#event-fields)
  - [Pagination](#pagination)
- [Buying items](#buying-items)
- [Accepting offers](#accepting-offers)

## Fetching NFTs

Fetch one NFT by contract address and token ID:

```typescript
const { nft } = await openseaSDK.api.nfts.getNFT(tokenAddress, tokenId);
```

Other NFT methods on `openseaSDK.api.nfts`:

- `getNFTsByCollection(collectionSlug, limit?, next?, traits?)` lists a collection's NFTs. `traits` is an array of `{ traitType, value }` filters, applied server-side and AND-combined.
- `getNFTsByContract(contractAddress, limit?, next?, chain?)` lists a contract's NFTs.
- `getNFTsByAccount(accountAddress, limit?, next?, chain?, options?)` lists NFTs an account owns. Set `options.includeAutoHidden` to also return NFTs hidden automatically because a third party minted or sent them. NFTs the holder hid themselves stay excluded.
- `getContract(contractAddress, chain?)` returns contract details.

### Checking balances and ownership

```typescript
import { TokenStandard } from "@opensea/sdk";

const asset = {
  // CryptoKitties contract
  tokenAddress: "0x06012c8cf97bead5deae237070f9587f8e7a266d",
  tokenId: "1",
  tokenStandard: TokenStandard.ERC721,
};

const balance = await openseaSDK.getBalance({
  accountAddress,
  asset,
});

const ownsKitty = balance > 0n;
```

## Making Offers

```typescript
// Token ID and smart contract address for a non-fungible token:
const tokenId = "1";
const tokenAddress = "0x1234...";
// The offerer's wallet address:
const accountAddress = "0x1234...";
// Value of the offer, in units of the payment token (or WETH if none is specified)
const amount = 1.2;

const offer = await openseaSDK.createOffer({
  asset: {
    tokenId,
    tokenAddress,
  },
  accountAddress,
  amount,
});
```

If the owner is an OpenSea user, they get an email with the offer amount when it's above their notification threshold.

The total value of your open offers can't exceed 1000x your wallet balance.

To create several offers with one signature, see [bulk order creation](advanced-use-cases.md#bulk-order-creation).

## Making listings

To sell an item, call `createListing`:

```typescript
import { getUnixTimestampInSeconds, TimeInSeconds } from "@opensea/sdk";

// Expire this listing one day from now
const expirationTime = getUnixTimestampInSeconds(TimeInSeconds.DAY);

const listing = await openseaSDK.createListing({
  asset: {
    tokenId,
    tokenAddress,
  },
  accountAddress,
  amount: 3,
  expirationTime,
});
```

`amount` is in units of the payment token, which the SDK picks for you. It uses the collection's configured pricing currency when there is one, and otherwise the chain default: usually the native token (ETH on Ethereum) for listings and the wrapped native token (WETH) for offers.

To create several listings with one signature, see [bulk order creation](advanced-use-cases.md#bulk-order-creation).

### Collection and trait offers

`openseaSDK.createCollectionOffer()` creates both. For a collection offer, pass the collection slug:

```typescript
const collection = await openseaSDK.api.collections.getCollection("cool-cats-nft");
const offer = await openseaSDK.createCollectionOffer({
  collectionSlug: collection.collection,
  accountAddress: walletAddress,
  amount: 7,
  quantity: 1,
});
```

For a single-trait offer, add `traitType` (the trait name) and `traitValue`:

```typescript
const offer = await openseaSDK.createCollectionOffer({
  collectionSlug: "cool-cats-nft",
  accountAddress: walletAddress,
  amount: 7,
  quantity: 1,
  traitType: "face",
  traitValue: "tvface bobross",
});
```

For several traits, use the `traits` array:

```typescript
const offer = await openseaSDK.createCollectionOffer({
  collectionSlug: "cool-cats-nft",
  accountAddress: walletAddress,
  amount: 7,
  quantity: 1,
  traits: [
    { type: "face", value: "tvface bobross" },
    { type: "body", value: "blue cat skin" },
  ],
});
```

For numeric traits, use `numericTraits` with min/max ranges:

```typescript
const offer = await openseaSDK.createCollectionOffer({
  collectionSlug: "cool-cats-nft",
  accountAddress: walletAddress,
  amount: 7,
  quantity: 1,
  numericTraits: [{ type: "level", min: 5, max: 10 }],
});
```

## Fetching orders

Offers and listings can be fetched per collection or per NFT. `getAllOffers` and `getAllListings` paginate with `limit` and `next`.

```typescript
import { type NFT } from "@opensea/sdk";

// Get all offers for a collection
const { offers } = await openseaSDK.api.offers.getAllOffers("cool-cats-nft");

// Get all listings for a collection
const { listings } = await openseaSDK.api.listings.getAllListings("cool-cats-nft");

// Get offers for a specific NFT. Keyed by collection slug and token id, not by
// contract address.
const { offers: nftOffers } = await openseaSDK.api.offers.getOffersByNFT(
  "cool-cats-nft",
  tokenId,
);

// Get the cheapest listing for a specific NFT. There is no per-NFT "all
// listings" endpoint; use getAllListings above for a whole collection.
const bestListing = await openseaSDK.api.listings.getBestListing(
  "cool-cats-nft",
  tokenId,
);
```

An item's price is its lowest active listing. Lowering a price doesn't cancel the earlier, higher listings: they all stay active until they're canceled or one of them is filled.

### Fetching an order by hash

With an order hash, fetch the full order, for example to cancel or fulfill it:

```typescript
const order = await openseaSDK.api.orders.getOrderByHash(
  "0x...", // Order hash
  "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC", // Seaport 1.6
);
```

### Best offer and best listing for an NFT

Get the highest offer or lowest listing on one NFT:

```typescript
// Get best offer for an NFT
const offer = await openseaSDK.api.offers.getBestOffer("boredapeyachtclub", "1");

// Get best listing for an NFT
const listing = await openseaSDK.api.listings.getBestListing("boredapeyachtclub", "1");
```

## Fetching events

Historical events (sales, transfers, mints, listings, and offers) can be fetched globally or by account, collection, or NFT. Every filter is optional:

```typescript
import { AssetEventType } from "@opensea/sdk";

const { assetEvents, next } = await openseaSDK.api.events.getEvents({
  eventType: AssetEventType.SALE, // Optional: filter by event type
  limit: 50, // Optional: results per page, 1 to 200
  after: 1672531200, // Optional: filter events after timestamp
  before: 1675209600, // Optional: filter events before timestamp
  next: "cursor", // Optional: cursor for pagination
});
```

`eventType` takes one value or an array of `"sale"`, `"transfer"`, `"mint"`, `"listing"`, `"offer"`, `"trait_offer"`, and `"collection_offer"` (the `AssetEventType` enum). `getEvents` has no chain filter and ignores `chain`; `getEventsByAccount` honors it.

### Events by account

```typescript
import { AssetEventType } from "@opensea/sdk";

const { assetEvents } = await openseaSDK.api.events.getEventsByAccount(
  "0x...", // Account address
  {
    eventType: AssetEventType.SALE,
    limit: 20,
  },
);
```

### Events by collection

```typescript
const { assetEvents } = await openseaSDK.api.events.getEventsByCollection(
  "cool-cats-nft", // Collection slug
  {
    limit: 100,
  },
);
```

### Events by NFT

```typescript
import { Chain, AssetEventType } from "@opensea/sdk";

const { assetEvents } = await openseaSDK.api.events.getEventsByNFT(
  Chain.Mainnet, // Chain
  "0x...", // Contract address
  "1", // Token ID
  {
    eventType: AssetEventType.SALE,
  },
);
```

### Event fields

Every event has `eventType`, `eventTimestamp` (Unix seconds), `chain`, and `quantity`. The rest depends on the type:

- Sales add `transaction`, `seller`, `buyer`, `payment`, and `nft`.
- Transfers add `transaction`, `fromAddress`, `toAddress`, and `nft`.
- Listings and offers add `maker`, `taker`, `payment`, `startDate`, and `expirationDate`. Listings also carry `isPrivateListing`.
- Events with `eventType` `"order"` carry an `orderType` of `"listing"`, `"item_offer"`, `"collection_offer"`, or `"trait_offer"`.

### Pagination

Pass the returned `next` cursor to fetch the next page:

```typescript
import { AssetEventType } from "@opensea/sdk";

let cursor: string | undefined;
const allEvents = [];

do {
  const response = await openseaSDK.api.events.getEvents({
    eventType: AssetEventType.SALE,
    limit: 50,
    next: cursor,
  });

  allEvents.push(...response.assetEvents);
  cursor = response.next;
} while (cursor);
```

## Buying items

To buy an item, fulfill its listing:

```typescript
const order = await openseaSDK.api.orders.getOrderByHash(
  "0x...",
  "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC", // Seaport 1.6
);

const accountAddress = "0x..."; // The buyer's wallet address
const transactionHash = await openseaSDK.fulfillOrder({
  order,
  accountAddress,
});
```

The buyer is the taker and pays for the item. `fulfillOrder` resolves with the transaction hash once the transaction is mined. To get the hash earlier, listen for the `TransactionCreated` event (see [listening to events](advanced-use-cases.md#listening-to-events)).

## Accepting offers

To accept an offer on an item you own, fulfill it the same way. You are the taker, and you give up the item in exchange for the offered tokens.

```typescript
const order = await openseaSDK.api.orders.getOrderByHash(
  "0x...",
  "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC", // Seaport 1.6
);

const accountAddress = "0x..."; // The owner's wallet address
await openseaSDK.fulfillOrder({ order, accountAddress });
```

