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

TypeScript SDK for [OpenSea](https://opensea.io). Read and filter the orderbook, create and fulfill listings and offers, swap tokens across chains, and subscribe to marketplace events.

## Install

```bash
npm install @opensea/sdk
```

Requires Node.js 22 or newer. `ethers` ships as a dependency; install `viem` too if you use the viem entry point.

## Get an API key

For quick experiments, request a free-tier key in code. It needs no signup and expires after 7 days.

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

For production, create a permanent key at [opensea.io/settings/developer](https://opensea.io/settings/developer). These keys don't expire, get higher rate limits, and can be rotated. See the [API key docs](https://docs.opensea.io/reference/api-keys).

## Quick start

Do not ship your API key in frontend code. See [Security warning](#security-warning).

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
ethers bridge and pass the result as the signer. Orders are signed with the adapter's
`signTypedData`. Fulfillments, approvals and onchain cancels go through its `sendTransaction`.
The provider handles reads and receipts only.

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

Creating listings and offers requires an adapter that supports typed-data signing
(`wallet.capabilities.signTypedData`).

## Calling the API

`sdk.api` groups methods by domain: `accounts`, `assets`, `chains`, `collections`, `drops`,
`events`, `listings`, `nfts`, `offers`, `orders`, `tokens`, `tools` (beta), `transactions` and
`walletAuth`. For example, `sdk.api.collections.getCollection(slug)` or
`sdk.api.offers.getAllOffers(...)`. Search is the one flat method: `sdk.api.search(args)`.

Version 14 removed the older flat methods such as `sdk.api.getCollection(slug)`. Each one maps to
the namespaced method of the same name, except four that were renamed; see the
[API reference](developerDocs/api-reference.md#calling-the-api).

## Response casing

The API uses snake_case. The SDK converts response keys to camelCase, and converts camelCase
request bodies and query params to snake_case. You read `collection.bannerImageUrl`; the wire
carries `banner_image_url`.

`@opensea/api-types` describes the wire format, so its types are snake_case. Don't use them to
annotate a value an SDK method returned:

```typescript
import type { AccountResolveResponse } from "@opensea/api-types";

// Wrong. This compiles, and every snake_case field reads undefined at runtime.
const account: AccountResolveResponse = await sdk.api.accounts.resolveAccount("vitalik.eth");
console.log(account.ens_name); // undefined; the runtime key is `ensName`
```

TypeScript only rejects this when the wire type has a required snake_case key somewhere in its
tree. `AccountResolveResponse` has one required property, `address`, which has no underscore, so
the camelCase object type-checks and every snake_case field is `undefined` at runtime.

Use the SDK's own response type, which is already camelCase:

```typescript
import type { ResolveAccountResponse } from "@opensea/sdk";

const account: ResolveAccountResponse = await sdk.api.accounts.resolveAccount("vitalik.eth");
console.log(account.ensName);
```

Or, for a response with no SDK alias, wrap the wire type in `Camelize`:

```typescript
import type { AccountResolveResponse } from "@opensea/api-types";
import type { Camelize } from "@opensea/sdk";

const account: Camelize<AccountResolveResponse> = await sdk.api.accounts.resolveAccount("vitalik.eth");
```

Pass `camelizeResponse: false` to skip the conversion for one call. Use it when response keys are
data rather than field names. `getTraits`, for example, is keyed by trait names the collection
chose, so conversion would turn a `dark_brown` trait into `darkBrown` and merge two traits that
differ only in casing.

Write it as the literal `false`. `api.get`, `api.post` and `api.request` have an overload for
that literal that returns the raw `T`, so the declared type matches the response:

```typescript
type UploadPolicy = { upload_url: string; success_action_status: string };

const policy = await sdk.api.get<UploadPolicy>("/api/v2/some/path", undefined, {
  camelizeResponse: false,
});

console.log(policy.success_action_status); // typed, and present at runtime

// @ts-expect-error the rewrite did not run, so there is no `successActionStatus`
console.log(policy.successActionStatus);
```

TypeScript keeps the literal only when the option is written inline at the call site or the
object is declared `as const`. In the cases below the runtime still skips the conversion, but the
declared type is `Camelize<T>`, which claims camelCase properties the response doesn't have:

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

## Examples

### Wallet-authenticated API

For a server-side EVM signer, `OpenSeaAuth` signs in with SIWE, creates a scoped personal access
token (PAT), and exchanges it for the short-lived JWT that REST and MCP accept.

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

Keep the same `OpenSeaAuth` instance until you revoke, because it holds the SIWE session.
`revoke()` takes the current JWT as a guard, revokes the PAT behind it, and clears the in-memory
auth state. `walletAuth` has a typed helper for every deployed scoped operation. Request only the
scopes the task needs. See the [wallet-auth guide](https://docs.opensea.io/reference/auth).

### Cross-chain drop minting

Build the ordered transactions to pay on one chain and mint a drop on another:

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

The action APIs return the ordered approval, signing and transaction steps a wallet needs to
run. On Solana, pass `svm_order.id` as the order identifier and keep base58 addresses in their
original case.

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

Run `actions.steps` in order. If a Solana step includes a partially signed transaction or needs a
Jito bundle, submit it exactly as the response directs. Don't rebuild it or broadcast it through a
public RPC.

### Token activity stats

Get precomputed trade count and USD volume for a token without aggregating raw events:

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

A requested window is missing from `windows` when the token had no swaps in that period.

### Real-time events

Subscribe to marketplace events over WebSocket with the `@opensea/sdk/stream` subpath. Stream
events don't count toward your API rate limits.

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

It runs in Node 22+ and browsers with no extra dependencies. After a dropped connection, the
client reconnects with backoff and re-subscribes to every topic it was watching.

Before version 0.4.0 this client was published as `@opensea/stream-js`. See the
[migration guide](developerDocs/stream-migration.md).

## Documentation

- [Quick start guide](developerDocs/quick-start.md)
- [Getting started guide](developerDocs/getting-started.md)
- [API reference](developerDocs/api-reference.md)
- [Stream migration from @opensea/stream-js](developerDocs/stream-migration.md)
- [Advanced use cases](developerDocs/advanced-use-cases.md)
- [FAQ](developerDocs/faq.md)
- [Contributing](CONTRIBUTING.md)

## Security warning

Don't use this SDK in frontend code. It needs your API key, and anyone can extract a key embedded
in a browser or mobile app, then abuse it or burn through your rate limit.

For a frontend app:

1. Run your own backend that stores the API key.
2. Call `@opensea/sdk` from that backend.
3. Return what the frontend needs, such as transaction parameters.
4. Have users sign transactions in the browser with their own wallet (for example, MetaMask).

## Changelog

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
