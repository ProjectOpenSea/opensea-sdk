---
title: Quick Start Guide
category: 64cbb5277b5f3c0065d96616
slug: opensea-sdk-quick-start
parentDocSlug: opensea-sdk
order: 0
hidden: false
---

For every method's parameters and return types, see the [API reference](api-reference.md).

# Installation

The SDK requires Node.js 22 or higher (`nvm use 22` if you use nvm). Install it:

```bash
npm install --save @opensea/sdk
# or
yarn add @opensea/sdk
```

Then install one of the two supported provider libraries:

```bash
# For ethers.js users
npm install ethers

# For viem users
npm install viem
```

# Initialization

You need an API key. For experiments, request a free-tier key that is valid for 7 days:

```typescript
import { OpenSeaSDK } from "@opensea/sdk";

const { apiKey } = await OpenSeaSDK.requestInstantApiKey();
```

Or from the shell:

```bash
curl -s -X POST https://api.opensea.io/api/v2/auth/keys | jq -r '.api_key'
```

For production, create a key at [opensea.io/settings/developer](https://opensea.io/settings/developer). These keys don't expire, get higher rate limits, and can be rotated from your account. See the [API key docs](https://docs.opensea.io/reference/api-keys), and note the terms of use for API data.

Then create an `OpenSeaSDK` client with your provider.

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

// Read-only, no transactions:
const openseaSDK = new OpenSeaSDK(
  { publicClient },
  { chain: Chain.Mainnet, apiKey: "YOUR_API_KEY" },
);
```

## Signing transactions

A read-only provider can't send transactions, so it can't approve or trade assets. For that, pass a signer (ethers) or wallet client (viem).

### ethers

```typescript
import { ethers } from "ethers";
import { Chain, OpenSeaSDK } from "@opensea/sdk";

const PRIVATE_KEY = process.env.PRIVATE_KEY as string;
const provider = new ethers.JsonRpcProvider(
  "https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY",
);

const walletWithProvider = new ethers.Wallet(PRIVATE_KEY, provider);

const openseaSDK = new OpenSeaSDK(walletWithProvider, {
  chain: Chain.Mainnet,
  apiKey: "YOUR_API_KEY",
});
```

### viem

```typescript
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { Chain, OpenSeaSDK } from "@opensea/sdk/viem";

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const transport = http("https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY");

const publicClient = createPublicClient({ chain: mainnet, transport });

const account = privateKeyToAccount(PRIVATE_KEY);
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport,
});

const openseaSDK = new OpenSeaSDK(
  { publicClient, walletClient },
  { chain: Chain.Mainnet, apiKey: "YOUR_API_KEY" },
);
```

The SDK accepts browser providers such as `window.ethereum` from [MetaMask](https://metamask.io/) or [Coinbase Wallet](https://www.coinbase.com/wallet), but don't put your API key in client-side code: anyone can extract it from a frontend bundle. Run the SDK on your backend and return transaction data to the frontend. The [README security warning](../README.md#security-warning) describes the setup.
