---
title: OpenSea SDK
category: 64cbb5277b5f3c0065d96616
slug: opensea-sdk
hidden: false
---

# Overview

The TypeScript SDK for [OpenSea](https://opensea.io). Use it to read the orderbook, create listings and offers, fulfill orders, and swap tokens across chains.

To start, get an API key and create an `OpenSeaSDK` instance. Listings and offers are signed offchain. Fulfilling an order is an onchain transaction.

## Documentation

- [Quick start](quick-start.md): install and initialize
- [Getting started](getting-started.md): fetch NFTs, make offers, create listings, buy and sell
- [API reference](api-reference.md): every SDK method
- [Advanced use cases](advanced-use-cases.md): bulk orders, cancellation, event listeners, and more
- [Stream migration](stream-migration.md): moving from `@opensea/stream-js`
- [FAQ](faq.md)
- [Contributing](contributing.md)

v10 exports these core types: `Amount` (`string | number | bigint`), `OpenSeaSigner`, `OpenSeaProvider`, `ContractCaller`, and `OpenSeaWallet`.

## Requirements

- Node.js 22 or higher
- An OpenSea API key. Request one instantly with `curl -s -X POST https://api.opensea.io/api/v2/auth/keys | jq -r '.api_key'`, or create one at [opensea.io/settings/developer](https://opensea.io/settings/developer).
- ethers.js (`JsonRpcProvider` / `Wallet`) or viem (`publicClient` / `walletClient`)

## Features

- Create listings and offers on NFTs and tokens
- Buy listings and accept offers
- Create many listings or offers with one signature
- Query historical sales, transfers, and order events
- Fetch trending and top tokens, swap quotes, and token details
- Search collections, tokens, NFTs, and accounts
- Ethereum, Polygon, Arbitrum, Base, Optimism, and [other chains](faq.md#what-chains-are-supported)
- Full TypeScript types
- Event listeners for transactions and order changes

## Example usage

### With ethers.js

```typescript
import { ethers } from "ethers";
import { OpenSeaSDK, Chain } from "@opensea/sdk";

const provider = new ethers.JsonRpcProvider(
  "https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY",
);
const sdk = new OpenSeaSDK(provider, {
  chain: Chain.Mainnet,
  apiKey: "your-api-key",
});
```

### With viem

```typescript
import { createPublicClient, createWalletClient, http } from "viem";
import { mainnet } from "viem/chains";
import { OpenSeaSDK, Chain } from "@opensea/sdk/viem";

const publicClient = createPublicClient({ chain: mainnet, transport: http() });
const sdk = new OpenSeaSDK(
  { publicClient },
  { chain: Chain.Mainnet, apiKey: "your-api-key" },
);
```

### Common usage (both providers)

```typescript
// Fetch an NFT
const { nft } = await sdk.api.nfts.getNFT(contractAddress, tokenId);

// Create an offer
await sdk.createOffer({
  asset: { tokenAddress, tokenId },
  accountAddress: walletAddress,
  amount: 1.5, // In WETH
});

// Fulfill a listing
const order = await sdk.api.orders.getOrderByHash(
  "0x...",
  "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC", // protocolAddress (Seaport 1.6)
);
await sdk.fulfillOrder({ order, accountAddress: walletAddress });
```

## Security

Don't use this SDK in client-side code. It needs an API key, and any key shipped to a browser can be extracted. Instead:

1. Run the SDK on your backend.
2. Expose endpoints that wrap the SDK calls you need.
3. Call those endpoints from your frontend.
4. Have users sign transactions with their own wallets in the browser.

See the [README security warning](../README.md#security-warning).
