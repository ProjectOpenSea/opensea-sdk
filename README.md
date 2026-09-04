<p align="center">
  <img src="./img/banner.png" />
</p>

[![Version][version-badge]][version-link]
[![npm][npm-badge]][npm-link]
[![Test CI][ci-badge]][ci-link]
[![License][license-badge]][license-link]
[![Docs][docs-badge]][docs-link]
[![Discussions][discussions-badge]][discussions-link]

# @opensea/sdk <!-- omit in toc -->

> **Read-only mirror.** This package is developed in a private monorepo and mirrored to [ProjectOpenSea/opensea-sdk](https://github.com/ProjectOpenSea/opensea-sdk) when a version is released, so the public code can trail the internal main branch by weeks.
>
> Pull requests opened on the mirror cannot be merged there. They are read, and a fix worth taking is recreated in the monorepo. Because a fix that has landed internally is not public until the next release, filing an issue before writing a patch is the quickest way to find out whether a bug is already fixed.

This is the TypeScript SDK for [OpenSea](https://opensea.io), the largest marketplace for NFTs and tokens.

It allows developers to access the official orderbook, filter it, create listings and offers, complete trades programmatically, and swap tokens across chains.

Get started by getting an API key and instantiating your own OpenSea SDK instance. Then you can create orders off-chain or fulfill orders onchain, and listen to events in the process.

### Get an API key

**For quick experimentation** — request a free-tier key in code, no signup needed. The returned key is valid for 7 days.

```typescript
import { OpenSeaSDK } from "@opensea/sdk";

const { apiKey } = await OpenSeaSDK.requestInstantApiKey();
const sdk = new OpenSeaSDK(provider, { chain: Chain.Mainnet, apiKey });
```

Or from the shell:

```bash
curl -s -X POST https://api.opensea.io/api/v2/auth/keys | jq -r '.api_key'
```

**For production** — create a permanent key at [opensea.io/settings/developer](https://opensea.io/settings/developer). These keys don't expire, get higher rate limits, and can be rotated from your account. See the [API key docs](https://docs.opensea.io/reference/api-keys) for details.

Happy seafaring!

## Quick Start

### With ethers.js

```typescript
import { ethers } from "ethers";
import { OpenSeaSDK, Chain } from "@opensea/sdk";

const provider = new ethers.JsonRpcProvider("https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY");
const sdk = new OpenSeaSDK(provider, { chain: Chain.Mainnet, apiKey: "YOUR_API_KEY" });
```

### With viem

```typescript
import { createPublicClient, createWalletClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { OpenSeaSDK, Chain } from '@opensea/sdk/viem'

const publicClient = createPublicClient({ chain: mainnet, transport: http() })
const sdk = new OpenSeaSDK({ publicClient }, { chain: Chain.Mainnet, apiKey: 'YOUR_API_KEY' })
```

### Wallet-authenticated API helpers

For a server-side EVM signer, `OpenSeaAuth` signs in with SIWE, creates a scoped
personal access token (PAT), and exchanges it for the short-lived JWT used by
REST and MCP.

```typescript
import { Wallet } from "ethers"
import { OpenSeaAPI, OpenSeaAuth } from "@opensea/sdk"

const signer = new Wallet(process.env.OPENSEA_PRIVATE_KEY!)
const auth = new OpenSeaAuth()
let token = await auth.authenticate(signer, { scopes: ["read:favorites"] })

try {
  token = await auth.getValidToken()
  const api = new OpenSeaAPI({
    apiKey: process.env.OPENSEA_API_KEY,
    authToken: token.accessToken,
  })
  await api.walletAuth.getFavorites(await signer.getAddress(), { limit: 10 })
  await api.walletAuth.declareAgentAccount()
} finally {
  await auth.revoke(token.accessToken)
}
```

Keep the same `OpenSeaAuth` instance through revocation because it holds the
SIWE session. `revoke()` accepts the current JWT as a guard, revokes its backing
PAT, and clears the in-memory auth state. `walletAuth` provides typed helpers
for every deployed scoped operation; request only the scopes the task needs. See the
[wallet-auth guide](https://docs.opensea.io/reference/auth).

### Cross-chain drop minting

Build the ordered transactions for paying on one chain and minting a drop on
another through the typed API client:

```typescript
const mint = await sdk.api.buildCrossChainDropMintTransactions("pyro-on-ape", {
  payer: "0x1111111111111111111111111111111111111111",
  minter: "0x1111111111111111111111111111111111111111",
  quantity: 1,
  payment: {
    chain: "base",
    tokenAddress: "0x0000000000000000000000000000000000000000",
  },
})

// Submit mint.transactions in order, then poll the exact returned request.
const receipt = await sdk.api.getTransactionReceipt(mint.receiptRequest)
```

### Order actions on EVM and Solana

Use the typed action APIs when a wallet needs ordered approval, signing, or transaction steps. Solana callers should pass `svm_order.id` as the order identifier and preserve base58 address casing.

```typescript
const actions = await sdk.api.createListingFulfillmentActions({
  listing: {
    hash: "<svm_order.id>",
    chain: "solana",
    protocolAddress: "<protocol address from the listing>",
  },
  fulfiller: { address: "<buyer address>" },
  includeOptionalCreatorFees: false,
})

// Also available:
// sdk.api.createOfferActions(request)
// sdk.api.createOfferFulfillmentActions(request)
// sdk.api.createCancelOrderActions(protocol, orderIdentifier, request, chain)
```

Execute `actions.steps` in order. If a Solana action includes a partially signed transaction or requires a Jito bundle, submit it exactly as directed by the response rather than rebuilding or broadcasting it through a public RPC.

### Token activity stats

Read materialized trade count and USD volume for a token without aggregating
raw events:

```typescript
const activity = await sdk.api.getTokenActivityStats(
  Chain.Base,
  "0x4200000000000000000000000000000000000006",
  { windows: ["1h", "24h"] },
)

console.log(activity.windows["24h"]?.trades)
console.log(activity.windows["24h"]?.volumeUsd)
```

The SDK exposes camel-cased fields. A requested window is absent when the token
has no swaps in that period.

### Real-time events

Subscribe to marketplace events over WebSocket from the `@opensea/sdk/stream`
subpath. Streaming events do not count toward your API rate limits.

```typescript
import { OpenSeaStreamClient, EventType } from "@opensea/sdk/stream";

const client = new OpenSeaStreamClient({ apiKey: "YOUR_API_KEY" });

// Listings for one collection, by slug
const unsubscribe = client.onItemListed("doodles-official", event => {
  console.log(event.payload.item.nft_id, event.payload.base_price);
});

// Sales across every collection
client.onItemSold("*", event => console.log(event.payload.sale_price));

// Several event types at once, filtered server-side
client.onEvents(
  "doodles-official",
  [EventType.ITEM_SOLD, EventType.ITEM_CANCELLED],
  console.log,
);

unsubscribe();
```

Node 22 or newer, or any browser, needs no extra dependencies. The client
reconnects with backoff and re-subscribes to every topic it was watching, so a
dropped connection recovers without any work from you.

This code was published as `@opensea/stream-js` until version 0.4.0. See the
[migration guide](developerDocs/stream-migration.md) for the differences.

## Documentation

- [Quick Start Guide](developerDocs/quick-start.md)
- [Getting Started Guide](developerDocs/getting-started.md)
- [API Reference](developerDocs/api-reference.md)
- [Stream migration from @opensea/stream-js](developerDocs/stream-migration.md)
- [Advanced Use Cases](developerDocs/advanced-use-cases.md)
- [Frequently Asked Questions](developerDocs/faq.md)
- [Contributing](CONTRIBUTING.md)

### Security Warning

**Do not use this SDK directly in client-side/frontend applications.**

The OpenSea SDK requires an API key for initialization. If you embed your API key in frontend code (e.g., browser applications, mobile apps), it will be publicly exposed and could be extracted by anyone, leading to potential abuse and rate limit issues.

#### Recommended Architecture

For frontend applications that need to interact with OpenSea functionality:

1. **Create a backend API wrapper**: Set up your own backend server that securely stores your OpenSea API key
2. **Call OpenSea SDK server-side**: Use `@opensea/sdk` on your backend to interact with OpenSea's APIs
3. **Return data to your frontend**: Send the necessary data (like transaction parameters) back to your frontend
4. **Execute transactions in the browser**: Have users sign transactions with their own wallets (e.g., MetaMask) in the browser

## Changelog

The changelog for recent versions can be found at:

- @opensea/sdk: https://github.com/ProjectOpenSea/opensea-sdk/releases
- OpenSea API: https://docs.opensea.io/changelog

## Security

Found a vulnerability? Report it through OpenSea's Bugcrowd program at https://bugcrowd.com/engagements/opensea rather than opening a public issue. See [SECURITY.md](SECURITY.md).

[version-badge]: https://img.shields.io/github/package-json/v/ProjectOpenSea/opensea-sdk
[version-link]: https://github.com/ProjectOpenSea/opensea-sdk/releases
[npm-badge]: https://img.shields.io/npm/v/@opensea/sdk?color=red
[npm-link]: https://www.npmjs.com/package/@opensea/sdk
[ci-badge]: https://github.com/ProjectOpenSea/opensea-sdk/actions/workflows/ci.yml/badge.svg
[ci-link]: https://github.com/ProjectOpenSea/opensea-sdk/actions/workflows/ci.yml
[license-badge]: https://img.shields.io/github/license/ProjectOpenSea/opensea-sdk
[license-link]: https://github.com/ProjectOpenSea/opensea-sdk/blob/main/LICENSE
[docs-badge]: https://img.shields.io/badge/@opensea/sdk-documentation-informational
[docs-link]: https://github.com/ProjectOpenSea/opensea-sdk#documentation
[discussions-badge]: https://img.shields.io/badge/@opensea/sdk-discussions-blueviolet
[discussions-link]: https://github.com/ProjectOpenSea/opensea-sdk/discussions
