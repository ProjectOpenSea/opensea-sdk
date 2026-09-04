---
title: Quick Start Guide
category: 64cbb5277b5f3c0065d96616
slug: opensea-sdk-quick-start
parentDocSlug: opensea-sdk
order: 0
hidden: false
---

> 📖 **For a complete reference of all SDK methods with detailed parameters and return types, see the [API Reference](api-reference.md).**

# Installation

Node.js version 20 or higher is required for the SDK. If you have Node Version Manager (nvm), run `nvm use 20`.

Then in your project, run:

```bash
npm install --save @opensea/sdk
# or
yarn add @opensea/sdk
```

The SDK supports two provider libraries. Install the one you prefer:

```bash
# For ethers.js users
npm install ethers

# For viem users
npm install viem
```

# Initialization

To get started, first get an API key.

**For quick experimentation** — request a free-tier key in code (valid for 7 days):

```typescript
import { OpenSeaSDK } from "@opensea/sdk";

const { apiKey } = await OpenSeaSDK.requestInstantApiKey();
```

Or from the shell:

```bash
curl -s -X POST https://api.opensea.io/api/v2/auth/keys | jq -r '.api_key'
```

**For production** — create a permanent key at [opensea.io/settings/developer](https://opensea.io/settings/developer). These keys don't expire, get higher rate limits, and can be rotated from your account. See the [API key docs](https://docs.opensea.io/reference/api-keys) for details. Note the terms of use for using API data.

Then, create a new OpenSeaSDK client using your web3 provider.

## With ethers.js

Import from `@opensea/sdk` and pass an ethers provider or signer:

```typescript
import { ethers } from "ethers";
import { OpenSeaSDK, Chain } from "@opensea/sdk";

// This example provider won't let you make transactions, only read-only calls:
const provider = new ethers.JsonRpcProvider(
  "https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY",
);

const openseaSDK = new OpenSeaSDK(provider, {
  chain: Chain.Mainnet,
  apiKey: "YOUR_API_KEY",
});
```

## With viem

Import from `@opensea/sdk/viem` and pass `{ publicClient }` or `{ publicClient, walletClient }`:

```typescript
import { createPublicClient, createWalletClient, http } from "viem";
import { mainnet } from "viem/chains";
import { OpenSeaSDK, Chain } from "@opensea/sdk/viem";

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http("https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY"),
});

// Read-only — no transactions:
const openseaSDK = new OpenSeaSDK(
  { publicClient },
  { chain: Chain.Mainnet, apiKey: "YOUR_API_KEY" },
);
```

## Wallet

Using a read-only provider won't let you authorize transactions, which are needed when approving and trading assets and currency. To make transactions, you need a signer (ethers) or wallet client (viem).

### ethers wallet

```typescript
const walletWithProvider = new ethers.Wallet(PRIVATE_KEY, provider);

const openseaSDK = new OpenSeaSDK(walletWithProvider, {
  chain: Chain.Mainnet,
  apiKey: "YOUR_API_KEY",
});
```

### viem wallet

```typescript
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(PRIVATE_KEY);
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http("https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY"),
});

const openseaSDK = new OpenSeaSDK(
  { publicClient, walletClient },
  { chain: Chain.Mainnet, apiKey: "YOUR_API_KEY" },
);
```

In a browser with web3 or an extension like [MetaMask](https://metamask.io/) or [Coinbase Wallet](https://www.coinbase.com/wallet), you can use `window.ethereum` to access the native provider.

> **⚠️ Security Warning**: While the SDK supports browser-based providers like `window.ethereum`, **you should never include your API key in client-side code**. Exposing your API key in frontend applications allows anyone to extract and abuse it. Instead, use the SDK on a secure backend server and return transaction data to your frontend. See the [README Security Warning](../README.md#security-warning) for the recommended architecture.
