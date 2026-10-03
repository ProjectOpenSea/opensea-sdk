---
title: OpenSea SDK
category: 64cbb5277b5f3c0065d96616
slug: opensea-sdk
hidden: false
---

# Overview

This is the TypeScript SDK for [OpenSea](https://opensea.io), the largest marketplace for NFTs and tokens.

It allows developers to access the official orderbook, filter it, create offers and listings, complete trades programmatically, and swap tokens across chains.

## Getting Started

Get started by getting an API key — instantly via API (no signup needed) or from the [developer portal](https://opensea.io/settings/developer) — and instantiating your own OpenSea SDK instance. Then you can create orders off-chain or fulfill orders onchain, and listen to events in the process.

Happy seafaring! ⛵️

## Documentation

- **[Quick Start Guide](quick-start.md)** - Installation and initialization
- **[Getting Started Guide](getting-started.md)** - Learn the basics: fetching NFTs, making offers, creating listings, and swapping tokens
- **[API Reference](api-reference.md)** - Complete reference for all SDK methods
- **[Advanced Use Cases](advanced-use-cases.md)** - Bulk operations, canceling orders, event listening, and more
- **Key v10 Types**: `Amount` (`string | number | bigint`), `OpenSeaSigner`, `OpenSeaProvider`, `ContractCaller`, `OpenSeaWallet`
- **[FAQ](faq.md)** - Frequently asked questions
- **[Contributing](contributing.md)** - How to contribute to the SDK

## Requirements

- Node.js 22 or higher
- An OpenSea API key — get one instantly: `curl -s -X POST https://api.opensea.io/api/v2/auth/keys | jq -r '.api_key'` or from [opensea.io/settings/developer](https://opensea.io/settings/developer)
- A web3 provider: ethers.js (`JsonRpcProvider` / `Wallet`) or viem (`publicClient` / `walletClient`)

## Key Features

- **Create Listings & Offers**: List NFTs and tokens for sale or make offers on items
- **Fulfill Orders**: Buy listings or accept offers programmatically
- **Bulk Operations**: Create multiple listings/offers with a single signature
- **Events API**: Query historical sales, transfers, and order events
- **Token API**: Fetch trending tokens, top tokens, swap quotes, and token details
- **Search API**: Search across collections, tokens, NFTs, and accounts
- **Multi-chain Support**: Ethereum, Polygon, Arbitrum, Base, Optimism, and more
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Event Listeners**: React to transactions and order changes in real-time

## Example Usage

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

### Common usage (same for both providers)

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

## Security Warning

⚠️ **Do not use this SDK directly in client-side/frontend applications.**

The SDK requires an API key which should never be exposed in frontend code. Instead:

1. Use the SDK on a secure backend server
2. Create API endpoints that wrap SDK functionality
3. Call your backend from the frontend
4. Have users sign transactions with their wallets in the browser

See the [README Security Warning](../README.md#security-warning) for more details.
