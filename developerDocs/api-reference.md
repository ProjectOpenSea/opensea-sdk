---
title: API Reference
category: 64cbb5277b5f3c0065d96616
slug: opensea-sdk-api-reference
parentDocSlug: opensea-sdk
order: 4
hidden: false
---

# OpenSea API Reference

This comprehensive reference documents all OpenSea API endpoints available through the @opensea/sdk. The SDK provides convenient TypeScript methods to interact with the OpenSea API v2.

> **Note:** Your API key should only be used on a secure backend server. Never expose it in client-side code, public repositories, or browser environments. See the [Security Warning](../README.md#security-warning) in the README for more details.

- [NFT Endpoints](#nft-endpoints)
- [Collection Endpoints](#collection-endpoints)
- [Listing Endpoints](#listing-endpoints)
- [Offer Endpoints](#offer-endpoints)
- [Order Endpoints](#order-endpoints)
- [Account Endpoints](#account-endpoints)
- [Event Endpoints](#event-endpoints)
- [Token Endpoints](#token-endpoints)
- [Search Endpoint](#search-endpoint)
- [Tool Endpoints [Beta]](#tool-endpoints-beta)

---

## Calling the API

Reads and writes are grouped by domain on `sdk.api`:

```ts
const collection = await sdk.api.collections.getCollection("boredapeyachtclub")
const { nfts } = await sdk.api.nfts.getNFTsByCollection("boredapeyachtclub")
const best = await sdk.api.listings.getBestListing("boredapeyachtclub", "1")
```

The namespaces are `accounts`, `assets`, `chains`, `collections`, `drops`, `events`, `listings`,
`nfts`, `offers`, `orders`, `signals`, `tokens`, `tools` (beta), `transactions` and `walletAuth`. Search is the exception and
stays flat, as `sdk.api.search(args)`, because `SearchAPI`'s only method is also called `search`.

The flat equivalents (`sdk.api.getCollection(...)`) still work and are deprecated for removal in the
next major. Each carries a `@deprecated` tag naming its replacement, so your editor will point you
at the namespaced call. Four of them differ in name as well as shape:

| Deprecated | Replacement |
| --- | --- |
| `api.buildDropMintTransaction` | `api.drops.buildMintTransaction` |
| `api.buildCrossChainDropMintTransactions` | `api.drops.buildCrossChainMintTransactions` |
| `api.getDeployContractReceipt` | `api.drops.getDeployReceipt` |
| `api.validateNFTMetadata` | `api.nfts.validateMetadata` |

## NFT Endpoints

### Get NFT

Fetch metadata, traits, ownership information, and rarity for a single NFT.

```typescript
import { Chain } from "@opensea/sdk";

const { nft } = await openseaSDK.api.nfts.getNFT(
  "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D", // Contract address
  "1", // Token ID
  Chain.Mainnet, // Optional: defaults to SDK's configured chain
);

console.log(nft.name);
console.log(nft.imageUrl);
console.log(nft.traits);
```

**Parameters:**

| Parameter    | Type   | Required | Description                                           |
| ------------ | ------ | -------- | ----------------------------------------------------- |
| `address`    | string | Yes      | The NFT contract address                              |
| `identifier` | string | Yes      | The token ID                                          |
| `chain`      | Chain  | No       | The blockchain (defaults to chain set in constructor) |

**Returns:** `GetNFTResponse` containing:

- `nft`: NFT object with metadata, traits, owners, rarity, etc.

---

### Get NFTs by Collection

Fetch multiple NFTs for a collection with pagination support.

```typescript
const { nfts, next } = await openseaSDK.api.nfts.getNFTsByCollection(
  "boredapeyachtclub", // Collection slug
  50, // Limit
  undefined, // Next cursor for pagination
);

console.log(`Fetched ${nfts.length} NFTs`);
```

**Parameters:**

| Parameter | Type   | Required | Description                                                                                                                                    |
| --------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`    | string | Yes      | Collection slug (identifier)                                                                                                                   |
| `limit`   | number | No       | Number of NFTs to retrieve (1-50)                                                                                                              |
| `next`    | string | No       | Pagination cursor from previous request                                                                                                        |
| `traits`  | TraitFilter[] | No | Trait filters, e.g. `[{ traitType: "Background", value: "Red" }]`. Multiple entries are AND-combined. The SDK JSON-encodes the array for the request. |

**Returns:** `ListNFTsResponse` containing:

- `nfts`: Array of NFT objects
- `next`: Cursor for next page (if available)

---

### Get NFTs by Contract

Fetch multiple NFTs for a specific contract address.

```typescript
import { Chain } from "@opensea/sdk";

const { nfts, next } = await openseaSDK.api.nfts.getNFTsByContract(
  "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
  50,
  undefined,
  Chain.Mainnet,
);
```

**Parameters:**

| Parameter | Type   | Required | Description                            |
| --------- | ------ | -------- | -------------------------------------- |
| `address` | string | Yes      | The NFT contract address               |
| `limit`   | number | No       | Number of NFTs to retrieve (1-50)      |
| `next`    | string | No       | Pagination cursor                      |
| `chain`   | Chain  | No       | The blockchain (defaults to SDK chain) |

**Returns:** `ListNFTsResponse` with NFTs array and pagination cursor.

---

### Get NFTs by Account

Fetch NFTs owned by a specific account address.

```typescript
import { Chain } from "@opensea/sdk";

const { nfts, next } = await openseaSDK.api.nfts.getNFTsByAccount(
  "0xfBa662e1a8e91a350702cF3b87D0C2d2Fb4BA57F", // Wallet address
  50,
  undefined,
  Chain.Mainnet,
);

console.log(`Account owns ${nfts.length} NFTs`);
```

**Parameters:**

| Parameter | Type   | Required | Description                            |
| --------- | ------ | -------- | -------------------------------------- |
| `address` | string | Yes      | The account/wallet address             |
| `limit`   | number | No       | Number of NFTs to retrieve (1-50)      |
| `next`    | string | No       | Pagination cursor                      |
| `chain`   | Chain  | No       | The blockchain (defaults to SDK chain) |
| `options` | object | No       | Non-pagination filters (see below)     |

**Returns:** `ListNFTsResponse` with NFTs owned by the account.

`options.includeAutoHidden` also returns NFTs that were hidden automatically because a third party minted or sent them to this account, which is how airdropped and unsolicited items are kept out of the default response. It goes on the wire as `include_auto_hidden` and is left off entirely when unset.

It changes only the automatic hiding. NFTs the account holder hid themselves are still not returned, and NFTs removed for policy violations are not surfaced by it.

```typescript
const { nfts: withAirdrops } = await openseaSDK.api.nfts.getNFTsByAccount(
  "0xfBa662e1a8e91a350702cF3b87D0C2d2Fb4BA57F",
  50,
  undefined,
  Chain.Mainnet,
  { includeAutoHidden: true },
);
```

---

### Get NFTs by Collection Group

Search NFTs across every collection in a group, such as `trading_cards`, by normalized attributes that are consistent across issuers (franchise, grader, grade, subject, year, set, language, edition, product type). Each attribute filter is a list that matches any of its values, and separate filters are AND-combined. List values are sent as repeated query parameters (`?grader=PSA&grader=CGC`).

```typescript
const { nfts, next } = await openseaSDK.api.nfts.getNFTsByGroup(
  "trading_cards",
  {
    franchise: ["Pokemon"],
    grader: ["PSA", "CGC"],
    grade: ["10"],
    isListed: true,
    sortBy: "price",
    sortDirection: "asc",
    limit: 20,
  },
);
```

**Parameters:** `group` (string, required) and an optional `GetNFTsByGroupArgs`: `collectionSlugs` (max 10), `query`, `isListed`, `minEstimatedValueUsd`, `maxEstimatedValueUsd`, `sortBy`, `sortDirection`, `limit` (1-100), `next`, and the attribute filters above (`productType` for product type).

**Returns:** `GetNFTsByGroupResponse` with `nfts` (`StandardizedNFT[]`) and an optional `next` cursor.

---

### Get Collection Group Facets

Fetch the values of each normalized attribute in a group with the number of matching NFTs. Each facet is narrowed by the filters of the other types, so a facet keeps listing all of its own values.

```typescript
const { facets } = await openseaSDK.api.nfts.getNFTGroupFacets(
  "trading_cards",
  { facetTypes: ["grader", "grade"], franchise: ["Pokemon"] },
);
// facets: [{ type: "grader", values: [{ value: "PSA", count: 417810 }, ...] }, ...]
```

**Parameters:** `group` (string, required) and an optional `GetNFTGroupFacetsArgs`: `facetTypes`, `collectionSlugs` (max 10), and the same attribute filters.

**Returns:** `GetNFTGroupFacetsResponse` with `facets`.

---

### Refresh NFT Metadata

Force a metadata refresh for an NFT. Useful after updating metadata onchain.

```typescript
import { Chain } from "@opensea/sdk";

await openseaSDK.api.nfts.refreshNFTMetadata(
  "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
  "1",
  Chain.Mainnet,
);
```

**Parameters:**

| Parameter    | Type   | Required | Description                            |
| ------------ | ------ | -------- | -------------------------------------- |
| `address`    | string | Yes      | The NFT contract address               |
| `identifier` | string | Yes      | The token ID                           |
| `chain`      | Chain  | No       | The blockchain (defaults to SDK chain) |

**Returns:** Response object from the API.

**Note:** Metadata updates may take a few minutes to propagate.

---

### Get Contract

Fetch smart contract information including name, chain, and associated collection.

```typescript
import { Chain } from "@opensea/sdk";

const contract = await openseaSDK.api.nfts.getContract(
  "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
  Chain.Mainnet,
);

console.log(contract.name); // "Bored Ape Yacht Club"
console.log(contract.collection); // "boredapeyachtclub"
console.log(contract.contractStandard); // "erc721"
```

**Parameters:**

| Parameter | Type   | Required | Description                            |
| --------- | ------ | -------- | -------------------------------------- |
| `address` | string | Yes      | The contract address                   |
| `chain`   | Chain  | No       | The blockchain (defaults to SDK chain) |

**Returns:** `GetContractResponse` containing:

- `address`: Contract address
- `chain`: Blockchain name
- `collection`: Associated collection slug (if any)
- `name`: Contract name
- `contractStandard`: Token standard (e.g., "erc721", "erc1155")

---

## Collection Endpoints

### Get Collection

Fetch detailed information about a single collection including fees, traits, and social links.

```typescript
const collection = await openseaSDK.api.collections.getCollection("boredapeyachtclub");

console.log(collection.name);
console.log(collection.totalSupply);
console.log(collection.fees);
```

**Parameters:**

| Parameter | Type   | Required | Description                  |
| --------- | ------ | -------- | ---------------------------- |
| `slug`    | string | Yes      | Collection slug (identifier) |

**Returns:** `OpenSeaCollection` object with comprehensive collection data.

---

### Get Collections

Fetch a list of collections with filtering and sorting options.

```typescript
import { Chain, CollectionOrderByOption } from "@opensea/sdk";

const { collections, next } = await openseaSDK.api.collections.getCollections(
  CollectionOrderByOption.SEVEN_DAY_VOLUME, // Sort by 7-day volume
  Chain.Mainnet, // Filter by chain
  undefined, // Creator username filter
  false, // Include hidden collections
  100, // Limit
  undefined, // Next cursor
);
```

**Parameters:**

| Parameter         | Type                    | Required | Description                                 |
| ----------------- | ----------------------- | -------- | ------------------------------------------- |
| `orderBy`         | CollectionOrderByOption | No       | Sort option (defaults to CREATED_DATE)      |
| `chain`           | Chain                   | No       | Filter by blockchain                        |
| `creatorUsername` | string                  | No       | Filter by creator's OpenSea username        |
| `includeHidden`   | boolean                 | No       | Include hidden collections (default: false) |
| `limit`           | number                  | No       | Number of collections to return (1-100)     |
| `next`            | string                  | No       | Pagination cursor                           |

**Order By Options:**

- `CREATED_DATE`: Recently created collections
- `ONE_DAY_CHANGE`: 24-hour price change
- `SEVEN_DAY_VOLUME`: 7-day trading volume
- `SEVEN_DAY_CHANGE`: 7-day price change
- `NUM_OWNERS`: Number of unique owners
- `MARKET_CAP`: Market capitalization

**Returns:** `GetCollectionsResponse` containing:

- `collections`: Array of collection objects
- `next`: Pagination cursor

---

### Get Collection Stats

Fetch statistical data for a collection including floor price, volume, and sales.

```typescript
const stats = await openseaSDK.api.collections.getCollectionStats("boredapeyachtclub");

console.log(stats.total.volume); // Total trading volume
console.log(stats.total.sales); // Total number of sales
console.log(stats.total.floorPrice); // Current floor price
```

**Parameters:**

| Parameter | Type   | Required | Description                  |
| --------- | ------ | -------- | ---------------------------- |
| `slug`    | string | Yes      | Collection slug (identifier) |

**Returns:** `OpenSeaCollectionStats` with:

- `total`: All-time statistics
- `intervals`: Time-based statistics (1 day, 7 days, 30 days)

---

### Get Traits

Fetch all traits for a collection with their possible values and occurrence counts. Useful for building trait filters and rarity calculators.

```typescript
const { categories, counts } =
  await openseaSDK.api.collections.getTraits("boredapeyachtclub");

// List all trait categories
console.log(Object.keys(categories)); // ["Background", "Fur", "Eyes", ...]

// Get counts for a specific trait
console.log(counts["Fur"]);
// { "Brown": 1234, "Black": 987, "Golden Brown": 456, ... }

// Calculate rarity
const totalNFTs = Object.values(counts["Fur"]).reduce((a, b) => a + b, 0);
const brownFurCount = counts["Fur"]["Brown"];
const rarity = (brownFurCount / totalNFTs) * 100;
console.log(`Brown Fur rarity: ${rarity.toFixed(2)}%`);
```

**Parameters:**

| Parameter        | Type   | Required | Description                  |
| ---------------- | ------ | -------- | ---------------------------- |
| `collectionSlug` | string | Yes      | Collection slug (identifier) |

**Returns:** `GetTraitsResponse` containing:

- `categories`: Object mapping trait types to their data type ("string", "number", or "date")
- `counts`: Object with trait counts for each category

**Use Cases:**

- Build trait filter interfaces
- Calculate trait rarity
- Display trait distribution charts
- Validate trait offers

---

### Get Creator Fee Enforcement

Check whether a collection enforces creator fees onchain today, and whether its contract supports turning enforcement on.

```typescript
const { enabled, eligible } =
  await openseaSDK.api.collections.getCreatorFeeEnforcement("my-collection");
```

**Returns:** `CreatorFeeEnforcementStatusResponse` with `enabled` and `eligible`.

---

### Get Collection PFP Profiles

List the profiles that wear a verified NFT from a collection as their profile picture.

```typescript
const { profiles, next } =
  await openseaSDK.api.collections.getCollectionPfpProfiles("doodles-official", {
    limit: 20,
  });
const page2 = await openseaSDK.api.collections.getCollectionPfpProfiles(
  "doodles-official",
  { limit: 20, cursor: next ?? undefined },
);
```

**Parameters:** `slug` (string, required) and an optional `GetCollectionPfpProfilesArgs`: `limit` (1-100, server default 50) and `cursor` (the previous response's `next`).

**Returns:** `CollectionPfpProfilesResponse` with `profiles` (address, username, display name, image, verification and the worn `nftPfp`) and `next`.

---

### Get Top PFP Collections

Rank collections by how many accounts wear one of their verified NFTs as a profile picture.

```typescript
const { collections } = await openseaSDK.api.collections.getTopPfpCollections({
  limit: 10,
  chain: Chain.Base,
});
// collections: [{ rank: 1, pfpWearerCount: 1234, collection: { ... } }, ...]
```

**Parameters:** `GetTopPfpCollectionsArgs`: `limit` (1-50, required) and an optional `chain`. Omit `chain` to rank across every chain.

**Returns:** `TopPfpCollectionsResponse` with `collections`.

---

### Manage a Collection

Collection editors manage a collection through `api.walletAuth`, which needs an `authToken` with the `write:collections` scope (see "Wallet-authenticated API helpers" in the README).

```typescript
const page = await openseaSDK.api.walletAuth.getCollectionMetadata("my-collection");

const upload = await openseaSDK.api.walletAuth.createCollectionPageMediaUpload(
  "my-collection",
  "hero_desktop",
  "video/mp4",
);
// Upload the file to upload.url with upload.fields, then pass upload.token
// in updateCollectionMetadata as { video: { token } }.

const { workflowId } = await openseaSDK.api.walletAuth.setCollectionPricingCurrency(
  "my-collection",
  { useStablecoin: true },
);

const { transactions } =
  await openseaSDK.api.walletAuth.buildCreatorFeeEnforcementTransactions("my-collection", {
    enabled: true,
  });
// Send each transaction in order from its `from`, the contract owner.

await openseaSDK.api.walletAuth.refreshCollectionMetadata("my-collection");
```

`getCollectionMetadata` returns the saved hero, about and overview content in the shape `updateCollectionMetadata` accepts. `createCollectionPageMediaUpload` takes a placement (`hero_desktop`, `hero_mobile`, `about_preview`, `about_section`, `overview`, `overview_background` or `team`) and the file's exact MIME type, and returns its `UploadContext` without camelizing `fields`, so the signed field names reach storage unchanged. `setCollectionPricingCurrency` returns a null `workflowId` when the collection is already priced that way, and `buildCreatorFeeEnforcementTransactions` returns an empty list when the contract is already in the requested state.

---

## Listing Endpoints

### Get All Listings

Get all active listings for a collection with pagination.

```typescript
const { listings, next } = await openseaSDK.api.listings.getAllListings(
  "boredapeyachtclub",
  100, // Limit
  undefined, // Next cursor
  false, // Include private listings
);

listings.forEach((listing) => {
  console.log(`Price: ${listing.price.current.value}`);
  console.log(
    `Token ID: ${listing.protocolData?.parameters.offer[0].identifierOrCriteria}`,
  );
});
```

**Parameters:**

| Parameter                | Type    | Required | Description                               |
| ------------------------ | ------- | -------- | ----------------------------------------- |
| `collectionSlug`         | string  | Yes      | Collection slug (identifier)              |
| `limit`                  | number  | No       | Number of listings (1-100, default: 100)  |
| `next`                   | string  | No       | Pagination cursor                         |
| `includePrivateListings` | boolean | No       | Include private listings (default: false) |

**Returns:** `GetListingsResponse` containing:

- `listings`: Array of listing objects
- `next`: Cursor for next page

---

### Get Best Listing

Get the best (lowest price) active listing for a specific NFT.

```typescript
const listing = await openseaSDK.api.listings.getBestListing("boredapeyachtclub", "1");

console.log(`Best price: ${listing.price.current.value}`);
console.log(`Seller: ${listing.protocolData?.parameters.offerer}`);
```

**Parameters:**

| Parameter                | Type             | Required | Description                               |
| ------------------------ | ---------------- | -------- | ----------------------------------------- |
| `collectionSlug`         | string           | Yes      | Collection slug                           |
| `tokenId`                | string \| number | Yes      | Token ID                                  |
| `includePrivateListings` | boolean          | No       | Include private listings (default: false) |

**Returns:** `GetBestListingResponse` with the lowest-priced active listing.

---

### Get Best Listings

Get the best listings for each NFT in a collection.

```typescript
const { listings, next } = await openseaSDK.api.listings.getBestListings(
  "boredapeyachtclub",
  100,
);
```

**Parameters:**

| Parameter                | Type    | Required | Description                                                                                                                                 |
| ------------------------ | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `collectionSlug`         | string  | Yes      | Collection slug                                                                                                                             |
| `limit`                  | number  | No       | Number of listings (1-100)                                                                                                                  |
| `next`                   | string  | No       | Pagination cursor                                                                                                                           |
| `includePrivateListings` | boolean | No       | Include private listings (default: false)                                                                                                   |
| `traits`                 | TraitFilter[] | No | Trait filters, e.g. `[{ traitType: "Background", value: "Red" }]`. Multiple entries are AND-combined. The SDK JSON-encodes the array for the request. |

**Returns:** `GetListingsResponse` with best listings.

---

### Per-NFT listings

There is no endpoint that returns every active listing for a single NFT. This section previously
documented `api.getNFTListings(...)`, which was removed in
[#276](https://github.com/ProjectOpenSea/opensea-devtools/pull/276) and has no replacement, so the
example here could not have run.

Two calls cover what it was used for:

- `api.listings.getBestListing(collectionSlug, tokenId)` for the cheapest listing on one NFT, which
  is what a price display or an "is it listed" check needs.
- `api.listings.getAllListings(collectionSlug, limit, next)` for every listing across a collection,
  filtered client-side if you need one token.

```typescript
const bestListing = await openseaSDK.api.listings.getBestListing(
  "boredapeyachtclub",
  "1",
);

const price = bestListing.price.current.value;
const decimals = bestListing.price.current.decimals;
console.log(`Cheapest: ${parseFloat(price) / 10 ** decimals} ETH`);
```

---

## Offer Endpoints

### Get All Offers

Get all active offers for a collection.

```typescript
const { offers, next } = await openseaSDK.api.offers.getAllOffers(
  "boredapeyachtclub",
  100,
  undefined,
);

offers.forEach((offer) => {
  console.log(`Offer: ${offer.price.value} ${offer.price.currency}`);
});
```

**Parameters:**

| Parameter        | Type   | Required | Description                            |
| ---------------- | ------ | -------- | -------------------------------------- |
| `collectionSlug` | string | Yes      | Collection slug                        |
| `limit`          | number | No       | Number of offers (1-100, default: 100) |
| `next`           | string | No       | Pagination cursor                      |

**Returns:** `GetOffersResponse` containing:

- `offers`: Array of offer objects
- `next`: Pagination cursor

---

### Get Trait Offers

Get offers for NFTs with specific trait values.

```typescript
const { offers, next } = await openseaSDK.api.offers.getTraitOffers(
  "boredapeyachtclub",
  "Fur", // Trait type
  "Golden Brown", // Trait value
  100, // Limit
  undefined, // Next
  undefined, // Float value (for numeric traits)
  undefined, // Int value (for numeric traits)
);
```

**Parameters:**

| Parameter        | Type   | Required | Description                      |
| ---------------- | ------ | -------- | -------------------------------- |
| `collectionSlug` | string | Yes      | Collection slug                  |
| `type`           | string | Yes      | Trait type/category name         |
| `value`          | string | Yes      | Trait value                      |
| `limit`          | number | No       | Number of offers (1-100)         |
| `next`           | string | No       | Pagination cursor                |
| `floatValue`     | number | No       | For decimal-based numeric traits |
| `intValue`       | number | No       | For integer-based numeric traits |

**Returns:** `GetOffersResponse` with trait-specific offers.

---

### Get Best Offer

Get the highest active offer for a specific NFT.

```typescript
const offer = await openseaSDK.api.offers.getBestOffer("boredapeyachtclub", "1");

console.log(`Best offer: ${offer.price.value}`);
console.log(`Offerer: ${offer.protocolData?.parameters.offerer}`);
```

**Parameters:**

| Parameter        | Type             | Required | Description     |
| ---------------- | ---------------- | -------- | --------------- |
| `collectionSlug` | string           | Yes      | Collection slug |
| `tokenId`        | string \| number | Yes      | Token ID        |

**Returns:** `GetBestOfferResponse` with the highest offer.

---

### Get NFT Offers

Get all active offers for a specific NFT (not just the best one). Useful for showing all buying interest.

```typescript
const { offers, next } = await openseaSDK.api.offers.getOffersByNFT(
  "boredapeyachtclub", // Collection slug
  "1", // Token ID
  50, // Limit
  undefined, // Next cursor
);

console.log(`Found ${offers.length} active offers for this NFT`);

offers.forEach((offer) => {
  const price = offer.price.value;
  const decimals = offer.price.decimals;
  const priceInEth = parseFloat(price) / Math.pow(10, decimals);
  const offerer = offer.protocolData?.parameters.offerer;
  console.log(`${priceInEth} ETH from ${offerer}`);
});
```

**Parameters:**

| Parameter        | Type             | Required | Description              |
| ---------------- | ---------------- | -------- | ------------------------ |
| `collectionSlug` | string           | Yes      | Collection slug          |
| `identifier`     | string \| number | Yes      | Token ID                 |
| `limit`          | number           | No       | Number of offers (1-100) |
| `next`           | string           | No       | Pagination cursor        |

**Returns:** `GetOffersResponse` containing:

- `offers`: Array of all active offers for the NFT
- `next`: Pagination cursor

**Use Cases:**

- Display all offers received on an NFT
- Find highest bidders
- Show offer history and interest level

---

### Build Offer

Build criteria offer data for collection or trait offers.

```typescript
const offerData = await openseaSDK.api.offers.buildOffer(
  "0x...", // Offerer address
  1, // Quantity
  "boredapeyachtclub", // Collection slug
  true, // Offer protection enabled
  "Fur", // Optional: trait type (single trait)
  "Golden Brown", // Optional: trait value (single trait)
);

// Multi-trait offers
const multiTraitOffer = await openseaSDK.api.offers.buildOffer(
  "0x...",
  1,
  "boredapeyachtclub",
  true,
  undefined, // Don't use traitType with traits array
  undefined, // Don't use traitValue with traits array
  [
    { type: "Fur", value: "Golden Brown" },
    { type: "Eyes", value: "Bored" },
  ],
);
```

**Parameters:**

| Parameter                | Type                                                  | Required | Description                                                                       |
| ------------------------ | ----------------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `offererAddress`         | string                                                | Yes      | Wallet making the offer                                                           |
| `quantity`               | number                                                | Yes      | Number of NFTs requested                                                          |
| `collectionSlug`         | string                                                | Yes      | Collection slug                                                                   |
| `offerProtectionEnabled` | boolean                                               | No       | Use OpenSea's signed zone (default: true)                                         |
| `traitType`              | string                                                | No       | Trait name for single-trait offers                                                |
| `traitValue`             | string                                                | No       | Trait value for single-trait offers                                               |
| `traits`                 | Array\<{ type: string; value: string }\>              | No       | Array of traits for multi-trait offers (cannot combine with traitType/traitValue) |
| `numericTraits`          | Array\<{ type: string; min?: number; max?: number }\> | No       | Array of numeric trait criteria with min/max ranges                               |

**Returns:** `BuildOfferResponse` with partial order parameters.

---

### Get Collection Offers

Get all collection-level offers for a collection.

```typescript
const { offers, next } = await openseaSDK.api.offers.getCollectionOffers(
  "boredapeyachtclub",
  100, // Limit
  undefined, // Next cursor
);

offers.forEach((offer) => {
  console.log(`Collection offer: ${offer.price.value}`);
});
```

**Parameters:**

| Parameter | Type   | Required | Description                            |
| --------- | ------ | -------- | -------------------------------------- |
| `slug`    | string | Yes      | Collection slug                        |
| `limit`   | number | No       | Number of offers (1-100, default: 100) |
| `next`    | string | No       | Pagination cursor                      |

**Returns:** `GetOffersResponse` containing:

- `offers`: Array of offer objects
- `next`: Pagination cursor

---

### Post Collection Offer

Submit a collection or trait offer to OpenSea.

```typescript
const offer = await openseaSDK.api.offers.postCollectionOffer(
  protocolData, // ProtocolData object
  "boredapeyachtclub", // Collection slug
  "Fur", // Optional: trait type
  "Golden Brown", // Optional: trait value
);

// Multi-trait collection offer
const multiTraitOffer = await openseaSDK.api.offers.postCollectionOffer(
  protocolData,
  "boredapeyachtclub",
  undefined, // Don't use traitType with traits array
  undefined, // Don't use traitValue with traits array
  [
    { type: "Fur", value: "Golden Brown" },
    { type: "Eyes", value: "Bored" },
  ],
);
```

**Parameters:**

| Parameter       | Type                                                  | Required | Description                                                                       |
| --------------- | ----------------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `order`         | ProtocolData                                          | Yes      | Signed order data                                                                 |
| `slug`          | string                                                | Yes      | Collection slug                                                                   |
| `traitType`     | string                                                | No       | Trait name for single-trait offers                                                |
| `traitValue`    | string                                                | No       | Trait value for single-trait offers                                               |
| `traits`        | Array\<{ type: string; value: string }\>              | No       | Array of traits for multi-trait offers (cannot combine with traitType/traitValue) |
| `numericTraits` | Array\<{ type: string; min?: number; max?: number }\> | No       | Array of numeric trait criteria with min/max ranges                               |

**Returns:** `CollectionOffer` object or `null`.

---

## Order Endpoints

### Get Order by Hash

Fetch a single order by its unique hash.

```typescript
import { Chain } from "@opensea/sdk";

const order = await openseaSDK.api.orders.getOrderByHash(
  "0x1234...", // Order hash
  "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC", // Seaport protocol address
  Chain.Mainnet, // Optional: chain
);

console.log(order.protocolData?.parameters);
```

**Parameters:**

| Parameter         | Type   | Required | Description                        |
| ----------------- | ------ | -------- | ---------------------------------- |
| `orderHash`       | string | Yes      | Order hash identifier              |
| `protocolAddress` | string | Yes      | Seaport contract address           |
| `chain`           | Chain  | No       | Blockchain (defaults to SDK chain) |

**Returns:** `GetOrderByHashResponse` (Offer | Listing)

**Use Cases:**

- Retrieve order for fulfillment
- Check order status before cancellation
- Fetch order details for UI display

---

### Generate Fulfillment Data

Generate the data needed to fulfill a listing or offer onchain.

```typescript
import { OrderSide } from "@opensea/sdk";

const fulfillmentData = await openseaSDK.api.orders.generateFulfillmentData(
  "0x...", // Fulfiller address
  "0x1234...", // Order hash
  "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC", // Protocol address
  OrderSide.LISTING,
  "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D", // Optional: asset contract
  "1", // Optional: token ID
  "1", // Optional: units to fill
  "0x...", // Optional: recipient address
  false, // Optional: include optional creator fees
);
```

**Parameters:**

| Parameter                    | Type      | Required | Description                                    |
| ---------------------------- | --------- | -------- | ---------------------------------------------- |
| `fulfillerAddress`           | string    | Yes      | Wallet fulfilling the order                    |
| `orderHash`                  | string    | Yes      | Order hash                                     |
| `protocolAddress`            | string    | Yes      | Seaport contract address                       |
| `side`                       | OrderSide | Yes      | LISTING or OFFER                               |
| `assetContractAddress`       | string    | No       | For criteria offers                            |
| `tokenId`                    | string    | No       | For criteria offers                            |
| `unitsToFill`                | string    | No       | Number of units to fill (default: 1)           |
| `recipientAddress`           | string    | No       | Recipient address for NFT (listings only)      |
| `includeOptionalCreatorFees` | boolean   | No       | Include optional creator fees (default: false) |

**Returns:** `FulfillmentDataResponse` with transaction data.

---

### Post Listing

Submit a signed listing to OpenSea. Returns the new v2 Listing response format.

```typescript
const listing = await openseaSDK.api.orders.postListing(
  protocolData, // Signed Seaport order
  "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC", // Seaport protocol address
);
```

**Parameters:**

| Parameter         | Type         | Required | Description              |
| ----------------- | ------------ | -------- | ------------------------ |
| `order`           | ProtocolData | Yes      | Signed order data        |
| `protocolAddress` | string       | Yes      | Seaport contract address |

**Returns:** `Listing` object for the submitted listing.

---

### Post Offer

Submit a signed offer to OpenSea. Returns the new v2 Offer response format.

```typescript
const offer = await openseaSDK.api.orders.postOffer(
  protocolData, // Signed Seaport order
  "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC", // Seaport protocol address
);
```

**Parameters:**

| Parameter         | Type         | Required | Description              |
| ----------------- | ------------ | -------- | ------------------------ |
| `order`           | ProtocolData | Yes      | Signed order data        |
| `protocolAddress` | string       | Yes      | Seaport contract address |

**Returns:** `Offer` object for the submitted offer.

---

### Offchain Cancel Order

Cancel an order off-chain (gas-free) when protected by SignedZone.

```typescript
import { Chain } from "@opensea/sdk";

const result = await openseaSDK.api.orders.offchainCancelOrder(
  "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC", // Protocol address
  "0x1234...", // Order hash
  Chain.Mainnet, // Optional: chain
  "0xabcd...", // Optional: offerer signature
);

console.log(
  `Last signature valid until: ${result.lastSignatureIssuedValidUntil}`,
);
```

**Parameters:**

| Parameter          | Type   | Required | Description                        |
| ------------------ | ------ | -------- | ---------------------------------- |
| `protocolAddress`  | string | Yes      | Seaport contract address           |
| `orderHash`        | string | Yes      | Order hash to cancel               |
| `chain`            | Chain  | No       | Blockchain (defaults to SDK chain) |
| `offererSignature` | string | No       | EIP-712 signature from offerer     |

**Returns:** `CancelOrderResponse` with cancellation details.

**Important Notes:**

- Only works for SignedZone-protected orders
- No gas fees required
- If signature not provided, API key must belong to order offerer
- Cancellation only assured if no fulfillment signature was vended

---

## Account Endpoints

### Get Account

Fetch account profile information from OpenSea.

```typescript
const account = await openseaSDK.api.accounts.getAccount(
  "0xfBa662e1a8e91a350702cF3b87D0C2d2Fb4BA57F",
);

console.log(account.address);
console.log(account.username);
console.log(account.profileImageUrl);
```

**Parameters:**

| Parameter | Type   | Required | Description    |
| --------- | ------ | -------- | -------------- |
| `address` | string | Yes      | Wallet address |

**Returns:** `OpenSeaAccount` object with profile data.

---

### Get Profile Shelves

Fetch the shelves a wallet shows on its public profile. An API key is enough; the wallet token is
sent too when the client has one. The create, reorder, update and delete helpers next to it on
`walletAuth` need a token with the `write:profile` scope.

```typescript
const shelves = await openseaSDK.api.walletAuth.getProfileShelves(
  "0x8ba1f109551bd432803012645ac136c94c19d6e",
);

for (const shelf of shelves) {
  console.log(shelf.title, shelf.displayOrder, shelf.items.length);
}
```

**Parameters:**

| Parameter | Type   | Required | Description    |
| --------- | ------ | -------- | -------------- |
| `address` | string | Yes      | Wallet address |

**Returns:** an array of shelves (`ProfileShelfResponse` from `@opensea/api-types`, camelized), each
with `id`, `title`, `displayOrder`, `items` and `shelfItemMetadata`.

---

### Get Payment Token

Fetch details about a payment token (ERC20) used on OpenSea.

```typescript
import { Chain } from "@opensea/sdk";

const token = await openseaSDK.api.accounts.getPaymentToken(
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH address
  Chain.Mainnet,
);

console.log(token.symbol); // "WETH"
console.log(token.decimals); // 18
console.log(token.usdPrice); // Current USD price
```

**Parameters:**

| Parameter | Type   | Required | Description                        |
| --------- | ------ | -------- | ---------------------------------- |
| `address` | string | Yes      | Token contract address             |
| `chain`   | Chain  | No       | Blockchain (defaults to SDK chain) |

**Returns:** `OpenSeaPaymentToken` with token metadata and pricing.

---

## Event Endpoints

Events include sales, transfers, listings, offers, and cancellations.

### Get Events

Fetch all events with optional filtering.

```typescript
import { AssetEventType } from "@opensea/sdk";

const { assetEvents, next } = await openseaSDK.api.events.getEvents({
  eventType: AssetEventType.SALE,
  limit: 50,
  after: 1672531200, // Unix timestamp
  before: 1675209600, // Unix timestamp
  chain: "ethereum",
});

assetEvents.forEach((event) => {
  if (event.eventType === "sale") {
    console.log(`Sale: ${event.payment.quantity} at ${event.eventTimestamp}`);
  }
});
```

**Parameters:**

| Parameter    | Type                     | Required | Description                  |
| ------------ | ------------------------ | -------- | ---------------------------- |
| `eventType`  | AssetEventType \| string | No       | Filter by event type         |
| `after`      | number                   | No       | Events after Unix timestamp  |
| `before`     | number                   | No       | Events before Unix timestamp |
| `limit`      | number                   | No       | Number of events to return   |
| `next`       | string                   | No       | Pagination cursor            |
| `chain`      | string                   | No       | Filter by blockchain         |

**Event Types:**

- `"sale"` - NFT sales
- `"transfer"` - NFT transfers
- `"mint"` - NFT mints
- `"listing"` - Item listings
- `"offer"` - Item offers
- `"trait_offer"` - Trait-based offers
- `"collection_offer"` - Collection offers

**Returns:** `GetEventsResponse` containing:

- `assetEvents`: Array of event objects
- `next`: Pagination cursor

---

### Get Events by Account

Fetch events for a specific account.

```typescript
import { AssetEventType } from "@opensea/sdk";

const { assetEvents } = await openseaSDK.api.events.getEventsByAccount(
  "0xfBa662e1a8e91a350702cF3b87D0C2d2Fb4BA57F",
  {
    eventType: AssetEventType.SALE,
    limit: 100,
  },
);
```

**Parameters:**

| Parameter | Type          | Required | Description             |
| --------- | ------------- | -------- | ----------------------- |
| `address` | string        | Yes      | Account address         |
| `args`    | GetEventsArgs | No       | Event filtering options |

**Returns:** `GetEventsResponse` with account events.

---

### Get Events by Collection

Fetch events for a specific collection.

```typescript
import { AssetEventType } from "@opensea/sdk";

const { assetEvents } = await openseaSDK.api.events.getEventsByCollection(
  "boredapeyachtclub",
  {
    eventType: AssetEventType.SALE,
    limit: 100,
    after: Math.floor(Date.now() / 1000) - 86400, // Last 24 hours
  },
);

// Calculate total volume in last 24 hours
let totalVolume = 0n;
assetEvents.forEach((event) => {
  if (event.eventType === "sale") {
    totalVolume += BigInt(event.payment.quantity);
  }
});
```

**Parameters:**

| Parameter        | Type          | Required | Description                                                                                                                                                       |
| ---------------- | ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collectionSlug` | string        | Yes      | Collection slug                                                                                                                                                   |
| `args`           | GetEventsArgs | No       | Event filtering options. `args.traits` is a `TraitFilter[]` (e.g. `[{ traitType: "Background", value: "Red" }]`) to scope events to NFTs matching every trait — the SDK JSON-encodes it for the request. |

**Returns:** `GetEventsResponse` with collection events.

---

### Get Events by NFT

Fetch events for a specific NFT.

```typescript
import { AssetEventType, Chain } from "@opensea/sdk";

const { assetEvents } = await openseaSDK.api.events.getEventsByNFT(
  Chain.Mainnet,
  "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
  "1",
  {
    eventType: AssetEventType.SALE,
  },
);

// Show sale history
assetEvents.forEach((event) => {
  if (event.eventType === "sale") {
    const price = event.payment.quantity;
    const date = new Date(event.eventTimestamp * 1000);
    console.log(`Sold for ${price} on ${date.toLocaleDateString()}`);
  }
});
```

**Parameters:**

| Parameter    | Type          | Required | Description             |
| ------------ | ------------- | -------- | ----------------------- |
| `chain`      | Chain         | Yes      | Blockchain              |
| `address`    | string        | Yes      | Contract address        |
| `identifier` | string        | Yes      | Token ID                |
| `args`       | GetEventsArgs | No       | Event filtering options |

**Returns:** `GetEventsResponse` with NFT events.

---

## Event Data Structures

### Sale Events

```ts
type SaleEvent = {
  eventType: "sale",
  eventTimestamp: 1234567890,
  chain: "ethereum",
  transaction: "0x...",
  seller: "0x...",
  buyer: "0x...",
  payment: {
    quantity: "1000000000000000000",
    tokenAddress: "0x0000000000000000000000000000000000000000",
    decimals: 18,
    symbol: "ETH"
  },
  nft: { /* NFT details */ }
}
```

### Order Events (Listings/Offers)

```ts
type OrderEvent = {
  eventType: "order",
  orderType: "listing" | "item_offer" | "collection_offer" | "trait_offer",
  eventTimestamp: 1234567890,
  maker: "0x...",
  taker: "0x...",
  payment: { /* payment details */ },
  expirationDate: 1234567890,
  isPrivateListing: false,
  asset: { /* NFT details or null for collection offers */ }
}
```

### Transfer Events

```ts
type TransferEvent = {
  eventType: "transfer",
  eventTimestamp: 1234567890,
  transaction: "0x...",
  fromAddress: "0x...",
  toAddress: "0x...",
  nft: { /* NFT details */ }
}
```

---

## Token Endpoints

### Get Trending Tokens

Fetch a list of trending tokens with pagination.

```typescript
const { tokens, next } = await openseaSDK.api.tokens.getTrendingTokens({
  limit: 20,
});

tokens.forEach((token) => {
  console.log(`${token.name} (${token.symbol}): $${token.usdPrice}`);
});
```

**Parameters:**

| Parameter | Type   | Required | Description                             |
| --------- | ------ | -------- | --------------------------------------- |
| `limit`   | number | No       | Number of tokens to return              |
| `next`    | string | No       | Pagination cursor from previous request |

**Returns:** `GetTrendingTokensResponse` containing:

- `tokens`: Array of token objects
- `next`: Pagination cursor

---

### Get Top Tokens

Fetch a list of top tokens with pagination.

```typescript
const { tokens, next } = await openseaSDK.api.tokens.getTopTokens({
  limit: 20,
});

tokens.forEach((token) => {
  console.log(`${token.name} (${token.symbol}): $${token.usdPrice}`);
});
```

**Parameters:**

| Parameter | Type   | Required | Description                             |
| --------- | ------ | -------- | --------------------------------------- |
| `limit`   | number | No       | Number of tokens to return              |
| `next`    | string | No       | Pagination cursor from previous request |

**Returns:** `GetTopTokensResponse` containing:

- `tokens`: Array of token objects
- `next`: Pagination cursor

---

### Get Swap Quote

Get a swap quote for exchanging tokens.

```typescript
const quote = await openseaSDK.api.tokens.getSwapQuote({
  fromChain: "ethereum",
  fromAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
  toChain: "ethereum",
  toAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  quantity: "1000000000000000000", // 1 WETH in wei
  address: "0x...", // Wallet executing the swap
  slippage: 0.05, // Optional: slippage tolerance (0.0 to 0.5)
});
```

**Parameters:**

| Parameter     | Type   | Required | Description                                       |
| ------------- | ------ | -------- | ------------------------------------------------- |
| `fromChain`   | string | Yes      | Chain of the token to swap from                   |
| `fromAddress` | string | Yes      | Contract address of the token to swap from        |
| `toChain`     | string | Yes      | Chain of the token to swap to                     |
| `toAddress`   | string | Yes      | Contract address of the token to swap to          |
| `quantity`    | string | Yes      | Amount to swap in the token's smallest unit (wei) |
| `address`     | string | Yes      | Wallet address executing the swap                 |
| `slippage`    | number | No       | Slippage tolerance, 0.0 to 0.5 (default 0.01)     |
| `recipient`   | string | No       | Recipient address (defaults to sender)            |

Set `fromChain` and `toChain` to different chains for cross-chain swaps.

**Returns:** `GetSwapQuoteResponse` with the swap quote and the transactions to execute.

---

### Get Token

Fetch details for a specific token by chain and contract address.

```typescript
const token = await openseaSDK.api.tokens.getToken(
  "ethereum", // Chain
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // Token address
);

console.log(`${token.name} (${token.symbol})`);
```

**Parameters:**

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| `chain`   | string | Yes      | The chain the token is on |
| `address` | string | Yes      | Token contract address    |

**Returns:** `GetTokenResponse` with token details.

---

### Get Token Activity Stats

Fetch materialized trade count, USD volume, and average trade size for a token.

```typescript
import { Chain } from "@opensea/sdk";

const activity = await openseaSDK.api.tokens.getTokenActivityStats(
  Chain.Base,
  "0x4200000000000000000000000000000000000006",
  { windows: ["1h", "24h"] },
);

console.log(activity.computedAt);
console.log(activity.windows["24h"]?.volumeUsd);
```

**Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `chain` | string | Yes | The chain the token is on |
| `address` | string | Yes | Token contract address |
| `args.windows` | `("5m" \| "1h" \| "4h" \| "24h")[]` | No | Materialized windows to return. Defaults to all available windows |

**Returns:** `TokenActivityStatsResponse` with `computedAt` and a `windows` map.
Each window contains `trades`, `volumeUsd`, and `averageTradeUsd`. A requested
window is absent when the token has no swaps in that period.

---

## Search Endpoint

### Search

Search across collections, tokens, NFTs, and accounts. Results are ranked by relevance.

```typescript
const results = await openseaSDK.api.search({
  query: "bored ape",
  chains: ["ethereum"], // Optional: filter by chain
  assetTypes: ["collection", "nft"], // Optional: filter by type
  limit: 20, // Optional: number of results (default: 20, max: 50)
});

results.results.forEach((result) => {
  if (result.type === "collection" && result.collection) {
    console.log(`Collection: ${result.collection.name}`);
  } else if (result.type === "nft" && result.nft) {
    console.log(`NFT: ${result.nft.name}`);
  } else if (result.type === "token" && result.token) {
    console.log(`Token: ${result.token.name} ($${result.token.usdPrice})`);
  } else if (result.type === "account" && result.account) {
    console.log(`Account: ${result.account.username}`);
  }
});
```

**Parameters:**

| Parameter     | Type     | Required | Description                                                |
| ------------- | -------- | -------- | ---------------------------------------------------------- |
| `query`       | string   | Yes      | Search query text                                          |
| `chains`      | string[] | No       | Filter by blockchain(s)                                    |
| `assetTypes` | string[] | No       | Filter by type: "collection", "nft", "token", or "account" |
| `limit`       | number   | No       | Number of results (default: 20, max: 50)                   |

**Returns:** `SearchResponse` containing:

- `results`: Array of `SearchResult` objects, each with a `type` field and the corresponding typed object (`collection`, `token`, `nft`, or `account`)

---

## Upload Contexts

Five `walletAuth` helpers return an `UploadContext`, a short-lived presigned storage upload, instead of taking the file themselves:

| Helper | Returns |
| --- | --- |
| `createProfileImageUpload(body)` | `UploadContext` |
| `createCollectionImageUpload(slug, imageType, contentType)` | `UploadContext` |
| `createDropAllowlistUpload(slug)` | `UploadContext` |
| `createDropCollectionManifestUpload(slug)` | `UploadContext` |
| `createDropItemMediaUpload(slug, body)` | `UploadContext[]`, one per filename |

### Upload to a Context

`uploadToContext(context, file, options?)` sends the file to the context's storage URL and resolves to `{ token }`, which you pass to the follow-up call (for example `profileImageToken` in `updateProfileSettings`). It uses the global `fetch`, `FormData` and `Blob`, so it runs in browsers and in Node 22+, and it never sends your API key or wallet token to storage.

```typescript
import { uploadToContext } from "@opensea/sdk";

declare const file: Blob;

const context = await openseaSDK.api.walletAuth.createProfileImageUpload({
  imageType: "profile_picture",
  contentType: "image/png",
});
const { token } = await uploadToContext(context, file, { filename: "avatar.png" });
await openseaSDK.api.walletAuth.updateProfileSettings({ profileImageToken: token });
```

**Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `context` | `UploadContext` | Yes | The context a helper above returned, unchanged |
| `file` | `Blob \| ArrayBuffer \| Uint8Array` | Yes | The file. A browser `File` is a `Blob`; a Node `Buffer` is a `Uint8Array` |
| `options.filename` | string | No | Filename of the multipart file part (POST contexts). Defaults to `file` |
| `options.signal` | `AbortSignal` | No | Cancels the upload |

For a POST context, every entry of `fields` is sent unchanged, then the file as the last part, named `file`. For a PUT context, the bytes are the request body and no headers are added, so a `Blob` with a `type` sets the Content-Type and raw bytes send none. The URL must be HTTPS and redirects are refused.

The file goes to whatever URL the context names, and `selectUploadContext` checks shape, not origin. Pass only contexts returned by the `walletAuth` helpers above, never untrusted user-supplied JSON.

**Throws:** an `Error` for a malformed or non-HTTPS context before anything is sent, and `UploadContextError` when storage answers with a non-2xx status. `UploadContextError` has only `status`, and its message is `Storage upload failed with HTTP <status>`. The response body is never read (it is cancelled on success and on failure), since storage error bodies can echo signed request material, and neither error includes the URL or the signed fields.

### Select an Upload Context

`selectUploadContext(value, index?)` checks that a value is an upload context and returns it. For the array `createDropItemMediaUpload` returns, pass the index of the one to use.

```typescript
import { selectUploadContext, uploadToContext } from "@opensea/sdk";

declare const uploadBatchId: string;
declare const files: File[];

const contexts = await openseaSDK.api.walletAuth.createDropItemMediaUpload("my-drop", {
  filenames: ["1.png", "2.png"],
  uploadBatchId,
});
for (const [i, file] of files.entries()) {
  await uploadToContext(selectUploadContext(contexts, i), file, { filename: file.name });
}
```

---

## Signal Endpoints

Signals are public posts on OpenSea about one subject: a currency, an NFT or a collection. Reading them needs only an API key, so `getSignal` and `listSignals` live on `openseaSDK.api.signals`. Creating and deleting a signal needs an `authToken` with the `write:posts` scope, so those live on `api.walletAuth` as `createSignal` and `deleteSignal`. Signals cannot be edited.

A signal ID is an opaque `sig_v1_...` string. Pass it back unchanged.

### Get Signal

```typescript
const signal = await openseaSDK.api.signals.getSignal("sig_v1_...");
console.log(signal.text, signal.authorAddress, signal.subject.type);
```

**Returns:** `GetSignalResponse` with `signalId`, `authorAddress`, `text`, `subject`, `subjectPriceUsd` (the USD price when the signal was posted) and its timestamps. Removed, private and pending signals return 404.

---

### List Signals

```typescript
const { signals, next } = await openseaSDK.api.signals.listSignals({
  chain: "base",
  contract: "0x0000000000000000000000000000000000000000",
  tokenId: "42",
  limit: 50,
});
```

**Parameters:** `ListSignalsArgs` with exactly one subject: `chain` and `contract` for a currency, plus `tokenId` for an NFT (a decimal on EVM chains, the mint address on Solana), or `collection` (a slug) alone. Also `limit` (1-100) and `cursor`.

**Returns:** `ListSignalsResponse` with `signals`, newest first, and a `next` cursor. A page can be empty while `next` is set, so keep passing `next` back as `cursor` until it is null:

```typescript
let cursor: string | undefined;
do {
  const page = await openseaSDK.api.signals.listSignals({
    collection: "doodles-official",
    cursor,
  });
  for (const signal of page.signals) console.log(signal.text);
  cursor = page.next ?? undefined;
} while (cursor);
```

---

### Create and Delete a Signal

```typescript
const { signalId } = await openseaSDK.api.walletAuth.createSignal({
  text: "Floor looks thin",
  collection: "doodles-official",
});

await openseaSDK.api.walletAuth.deleteSignal(signalId);
```

`createSignal` takes `text` (up to 3000 characters), the same subject fields as `listSignals`, and an optional `authorAddress`, which defaults to the wallet the token signed in with. It is not idempotent: a retry after an unknown outcome can post twice once the per-subject cooldown has passed, and a post inside the cooldown returns 422. `deleteSignal` resolves with no value; a signal that is missing, already deleted or owned by another account returns 404.

---

## Tool Endpoints [Beta]

Methods on `openseaSDK.api.tools` for tools registered in the ERC-8257 tool registry and the x402 directories. These endpoints are in beta and may change without notice. A tool is identified by its registry chain ID, its registry address (an EVM address, or `x402_bazaar` / `x402_bankr` for x402 tools) and its tool ID. Each part is encoded as one path segment.

Saved tools are per account and need wallet auth (`read:tools` / `write:tools`), so they live on `api.walletAuth` as `listSavedTools`, `saveTool` and `removeSavedTool`.

### List Tools

```typescript
const { tools, next } = await openseaSDK.api.tools.listTools({
  sortBy: "newest",
  type: "nft_gated",
  limit: 20,
});
```

**Parameters:** an optional `ListToolsArgs`: `sortBy` (`newest` or `oldest`), `type` (access type), `source` (`onchain`, `x402_bazaar`, `x402_bankr`), `limit` (1-200) and `cursor`.

**Returns:** `ListToolsResponse` with `tools` and an optional `next` cursor.

---

### Search Tools

```typescript
const { results } = await openseaSDK.api.tools.searchTools({
  query: "floor price",
  tags: ["nft", "analytics"],
  sortBy: "most_used",
  includeDetails: false,
});
```

**Parameters:** an optional `SearchToolsArgs`: `query`, `registryChain`, `tags` (sent as repeated `tags` parameters), `accessType`, `creator`, `source`, `collection` (slug of a gating collection), `sortBy` (`relevance`, `newest`, `most_used`), `includeDetails` (defaults to `true` on the server), `limit` and `cursor`.

**Returns:** `SearchToolsResponse` with `results` and an optional `next` cursor.

---

### Get Tool

```typescript
const tool = await openseaSDK.api.tools.getTool(
  8453,
  "0x0000000000000000000000000000000000000000",
  42,
);
console.log(tool.displayName, tool.pricingRecipients);
```

**Returns:** `GetToolResponse`, including pricing recipients and access requirements. `inputs` and `outputs` are the tool's JSON Schemas and keep their wire keys, so a `wallet_address` property stays `wallet_address`. The rest of the response is camelCase.

---

### Get Tool Activity

```typescript
const { activity } = await openseaSDK.api.tools.getToolActivity(
  8453,
  "0x0000000000000000000000000000000000000000",
  42,
  { limit: 25, offset: 0, includeCreatorPayments: false },
);
```

**Parameters:** the tool key and an optional `GetToolActivityArgs`: `includeCreatorPayments`, `limit` (1-100) and `offset`.

**Returns:** `GetToolActivityResponse` with `activity`: x402 payment events and usage reports, deduplicated by transaction hash, each with an `attribution` confidence level.

---

### Report Tool Usage

Report a verified tool invocation for metrics. This does not trigger any onchain transaction. Identify the tool with `toolChainId`, `toolRegistryAddress` and `toolOnchainId`, or with `toolEndpoint` alone. Tool authors who report from their server can use the reporters in `@opensea/tool-sdk` instead.

```typescript
const { id, verified } = await openseaSDK.api.tools.reportToolUsage({
  verificationType: "x402_settlement",
  toolChainId: 8453,
  toolRegistryAddress: "0x0000000000000000000000000000000000000000",
  toolOnchainId: 42,
  latencyMs: 180,
  x402: { callerAddress: "0x...", txHash: "0x...", chainId: 8453 },
});
```

**Parameters:** `ReportToolUsageRequest`. `verificationType` is `eip3009_authorization` (free tools, with an `eip3009` proof) or `x402_settlement` (paid tools, with an `x402` settlement).

**Returns:** `ReportToolUsageResponse` with `id`, `verified` and `verificationType`.

---

## Pagination

Most list endpoints support pagination using cursor-based navigation:

```typescript
import { type Listing } from "@opensea/sdk";

let cursor: string | undefined;
const allResults: Listing[] = [];

do {
  const response = await openseaSDK.api.listings.getAllListings(
    "boredapeyachtclub",
    100,
    cursor,
  );

  allResults.push(...response.listings);
  cursor = response.next;
} while (cursor);

console.log(`Fetched ${allResults.length} total results`);
```

---

## Rate Limiting

The SDK automatically handles rate limiting with exponential backoff:

- Detects 429 (Too Many Requests) and 599 (custom rate limit) status codes
- Respects `retry-after` header when present
- Automatically retries failed requests up to 3 times
- Logs rate limit encounters with retry delay

**Best Practices:**

- Use pagination to avoid large single requests
- Implement caching for frequently accessed data
- Use bulk operations when available
- Monitor your API usage in OpenSea dashboard

---

## Error Handling

```typescript
try {
  const listing = await openseaSDK.api.listings.getBestListing(
    "boredapeyachtclub",
    "1",
  );
} catch (error) {
  if (!(error instanceof Error)) {
    throw error;
  }
  if (error.message.includes("Not found")) {
    console.log("No matching order found");
  } else if ((error as { statusCode?: number }).statusCode === 429) {
    console.log("Rate limited, will retry automatically");
  } else {
    console.error("API error:", error.message);
  }
}
```

---

## Common Patterns

### Check if NFT has Active Listings

The best-listing endpoint returns 404 when nothing is listed, which the SDK raises as an error
rather than returning an empty result, so this is a `try`/`catch` rather than a length check.

Narrow on the status code. A bare `catch` would report an NFT as unlisted on a rate limit, an
expired key or a 500, which is the same wrong answer as a real 404 and impossible to tell apart.

```typescript
import type { OpenSeaApiError } from "@opensea/sdk";

let hasListings: boolean;
try {
  await openseaSDK.api.listings.getBestListing("boredapeyachtclub", tokenId);
  hasListings = true;
} catch (error) {
  if ((error as OpenSeaApiError).statusCode === 404) {
    hasListings = false;
  } else {
    throw error;
  }
}
```

### Find Best Price for NFT

```typescript
const bestListing = await openseaSDK.api.listings.getBestListing(
  collectionSlug,
  tokenId,
);
const bestOffer = await openseaSDK.api.offers.getBestOffer(collectionSlug, tokenId);

const listingPrice = parseFloat(bestListing.price.current.value);
const offerPrice = parseFloat(bestOffer.price.value);

console.log(`Spread: ${listingPrice - offerPrice} wei`);
```

### Build Trait Filter

```typescript
const { categories, counts } = await openseaSDK.api.collections.getTraits(collectionSlug);

// Create filter UI
Object.keys(categories).forEach((traitType) => {
  const values = Object.keys(counts[traitType]);
  console.log(`${traitType}: ${values.join(", ")}`);
});
```

---

For more examples and use cases, see the [Getting Started Guide](getting-started.md) and [Advanced Use Cases](advanced-use-cases.md).
