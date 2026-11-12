<p align="center">
  <img src="https://raw2.seadn.io/app_logos/repo-banners/opensea-repo-banner-2026.png" alt="OpenSea" />
</p>

[![Version][version-badge]][version-link]
[![npm][npm-badge]][npm-link]
[![Test CI][ci-badge]][ci-link]
[![License][license-badge]][license-link]
[![Docs][docs-badge]][docs-link]
[![Discussions][discussions-badge]][discussions-link]

# @opensea/sdk <!-- omit in toc -->

This is the TypeScript SDK for [OpenSea](https://opensea.io), the largest marketplace for NFTs and tokens.

It allows developers to access the official orderbook, filter it, create listings and offers, complete trades programmatically, and swap tokens across chains.

Get started by getting an API key and instantiating your own OpenSea SDK instance. Then you can create orders off-chain or fulfill orders onchain, and listen to events in the process.

### Get an API key

**For quick experimentation** — request a free-tier key in code, no signup needed. The returned key is valid for 7 days.

```typescript
import { ethers } from "ethers";
import { OpenSeaSDK, Chain } from "@opensea/sdk";

const provider = new ethers.JsonRpcProvider("https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY");
const { apiKey } = await OpenSeaSDK.requestInstantApiKey();
const sdk = new OpenSeaSDK(provider, { chain: Chain.Mainnet, apiKey });
```

Or from the shell:

```bash
curl -s -X POST https://api.opensea.io/api/v2/auth/keys | jq -r '.api_key'
```

**For production** — create a permanent key at [opensea.io/settings/developer](https://opensea.io/settings/developer). These keys don't expire, get higher rate limits, and can be rotated from your account. See the [API key docs](https://docs.opensea.io/reference/api-keys) for details.

Happy seafaring!

## Calling the API

`sdk.api` groups its methods by domain: `sdk.api.collections.getCollection(slug)`,
`sdk.api.nfts.getNFT(...)`, `sdk.api.offers.getAllOffers(...)`, and so on across `accounts`,
`assets`, `chains`, `drops`, `events`, `listings`, `orders`, `tokens`, `tools` (beta),
`transactions` and `walletAuth`. Search stays flat as `sdk.api.search(args)`.

The older flat methods (`sdk.api.getCollection(slug)`) still work, carry `@deprecated` tags naming
their replacements, and are removed in the next major. See the
[API reference](developerDocs/api-reference.md#calling-the-api) for the four whose names change.

## Response casing

The API speaks snake_case. The SDK rewrites response keys to camelCase before handing them back,
and rewrites camelCase request bodies and query params to snake_case on the way out. So
`collection.bannerImageUrl` is what you read, and `banner_image_url` is what crosses the wire.

`@opensea/api-types` describes the wire, so its types stay snake_case. Do not annotate a value an
SDK method returned with one of them:

```typescript
import type { AccountResolveResponse } from "@opensea/api-types";

// Wrong. This compiles, and every snake_case field reads undefined at runtime.
const account: AccountResolveResponse = await sdk.api.accounts.resolveAccount("vitalik.eth");
console.log(account.ens_name); // undefined; the runtime key is `ensName`
```

TypeScript rejects that pairing only when the wire type has a required snake_case key somewhere in
its tree. Of the 166 schemas in the spec that declare snake_case properties directly, 15 take the
camelized value with no error, `AccountResolveResponse` among them: its one required property,
`address`, has no underscore to rewrite, so nothing is missing and the camelCase keys are allowed
through as extras.

Two spellings work. Use the SDK's own response type, which is already camelized:

```typescript
import type { ResolveAccountResponse } from "@opensea/sdk";

const account: ResolveAccountResponse = await sdk.api.accounts.resolveAccount("vitalik.eth");
console.log(account.ensName);
```

Or wrap the wire type in `Camelize`, for a response with no dedicated alias in this package:

```typescript
import type { AccountResolveResponse } from "@opensea/api-types";
import type { Camelize } from "@opensea/sdk";

const account: Camelize<AccountResolveResponse> = await sdk.api.accounts.resolveAccount("vitalik.eth");
```

`camelizeResponse: false` turns the rewrite off for one call. Use it where the response keys are
data rather than field names: `getTraits` is keyed by collection-authored trait names, so the
rewrite would report a `dark_brown` trait as `darkBrown` and merge two traits that differ only in
casing.

Write it as the literal `false`. `api.get`, `api.post` and `api.request` overload on that literal
and hand back the raw `T`, so the declared type is the wire shape the call actually returns:

```typescript
type UploadPolicy = { upload_url: string; success_action_status: string };

const policy = await sdk.api.get<UploadPolicy>("/api/v2/some/path", undefined, {
  camelizeResponse: false,
});

console.log(policy.success_action_status); // typed, and present at runtime

// @ts-expect-error the rewrite did not run, so there is no `successActionStatus`
console.log(policy.successActionStatus);
```

The literal is what selects that signature, and TypeScript keeps it only where the property is
written inline at the call site or the object is declared `as const`. The two spellings below
compile, and the runtime still skips the rewrite whenever the value is `false`, but the declared
type is `Camelize<T>` either way, so it claims camelCase properties the response does not have:

```typescript
type UploadPolicy = { upload_url: string; success_action_status: string };
declare const skipRewrite: boolean;

// A boolean whose value the compiler cannot see.
await sdk.api.get<UploadPolicy>("/api/v2/some/path", undefined, {
  camelizeResponse: skipRewrite,
});

// A `const` declaration widens `false` to `boolean`; `as const` keeps the literal.
const options = { camelizeResponse: false };
await sdk.api.get<UploadPolicy>("/api/v2/some/path", undefined, options);
```

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

### With a wallet adapter

To sign with a managed wallet (Privy, Turnkey, Fireblocks, Bankr) or a raw private key, wrap a
[`@opensea/wallet-adapters`](https://github.com/ProjectOpenSea/wallet-adapters) adapter in its
ethers bridge and pass the result as the signer. Orders are signed through the adapter's
`signTypedData`, and fulfillments, approvals and onchain cancels go through its `sendTransaction`.
The provider is used for reads and receipts only.

```typescript
import { ethers } from "ethers";
import { OpenSeaSDK, Chain } from "@opensea/sdk";
import { createWalletFromEnv } from "@opensea/wallet-adapters";
import { walletAdapterToEthersSigner } from "@opensea/wallet-adapters/ethers";

const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
const signer = walletAdapterToEthersSigner(createWalletFromEnv(), provider);
const sdk = new OpenSeaSDK(signer, { chain: Chain.Base, apiKey: "YOUR_API_KEY" });

const listing = await sdk.createListing({
  asset: { tokenAddress, tokenId },
  accountAddress: await signer.getAddress(),
  amount: "0.5",
});
```

The adapter has to support typed-data signing (`wallet.capabilities.signTypedData`) to create
listings and offers.

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
const mint = await sdk.api.drops.buildCrossChainMintTransactions("pyro-on-ape", {
  payer: "0x1111111111111111111111111111111111111111",
  minter: "0x1111111111111111111111111111111111111111",
  quantity: 1,
  payment: {
    chain: "base",
    tokenAddress: "0x0000000000000000000000000000000000000000",
  },
})

// Submit mint.transactions in order, then poll the exact returned request.
const receipt = await sdk.api.transactions.getTransactionReceipt(mint.receiptRequest)
```

### Order actions on EVM and Solana

Use the typed action APIs when a wallet needs ordered approval, signing, or transaction steps. Solana callers should pass `svm_order.id` as the order identifier and preserve base58 address casing.

```typescript
const actions = await sdk.api.listings.createListingFulfillmentActions({
  listing: {
    hash: "<svm_order.id>",
    chain: "solana",
    protocolAddress: "<protocol address from the listing>",
  },
  fulfiller: { address: "<buyer address>" },
  includeOptionalCreatorFees: false,
})

// Also available:
// sdk.api.offers.createOfferActions(request)
// sdk.api.offers.createOfferFulfillmentActions(request)
// sdk.api.orders.createCancelOrderActions(protocol, orderIdentifier, request, chain)
```

Execute `actions.steps` in order. If a Solana action includes a partially signed transaction or requires a Jito bundle, submit it exactly as directed by the response rather than rebuilding or broadcasting it through a public RPC.

### Token activity stats

Read materialized trade count and USD volume for a token without aggregating
raw events:

```typescript
import { Chain } from "@opensea/sdk";

const activity = await sdk.api.tokens.getTokenActivityStats(
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

## Contributing

Read-only mirror of a private monorepo, updated on each release. Pull requests are welcome, and we bring accepted changes into the monorepo.

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
