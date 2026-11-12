---
title: Frequently Asked Questions
category: 64cbb5277b5f3c0065d96616
slug: opensea-sdk-faq
parentDocSlug: opensea-sdk
order: 4
hidden: false
---

- [How do I access the source code?](#how-do-i-access-the-source-code)
- [What chains are supported?](#what-chains-are-supported)
- [Why is there no SDK method for the API request I am trying to call?](#why-is-there-no-sdk-method-for-the-api-request-i-am-trying-to-call)
- [Does the SDK support viem?](#does-the-sdk-support-viem)
- [What changed in v10?](#what-changed-in-v10)

## How do I access the source code?

It's on [GitHub](https://github.com/ProjectOpenSea/opensea-sdk).

## What chains are supported?

See the `Chain` enum in [`src/types.ts`](https://github.com/ProjectOpenSea/opensea-sdk/blob/main/src/types.ts).

## Why is there no SDK method for the API request I am trying to call?

Check the [API reference](api-reference.md) first. The SDK covers most OpenSea API v2 endpoints.

For anything it doesn't cover, call the generic `get` and `post` methods on `OpenSeaAPI` ([`src/api/api.ts`](https://github.com/ProjectOpenSea/opensea-sdk/blob/main/src/api/api.ts)). Pull requests are welcome.

## Does the SDK support viem?

Yes, since v10. Import from `@opensea/sdk/viem` and pass `{ publicClient }` for read-only use or `{ publicClient, walletClient }` to send transactions. The [quick start](quick-start.md) has full examples.

ethers still ends up in `node_modules` with the viem entry point. `@opensea/seaport-js` only accepts ethers signers and providers, so the SDK depends on ethers and wraps your viem clients in an ethers-compatible signer before calling Seaport. Your own code never has to import ethers.

## What changed in v10?

- New `@opensea/sdk/viem` entry point that takes `{ publicClient, walletClient }` instead of an ethers `Signer | JsonRpcProvider`.
- `OrderSide` values changed from `"ask"`/`"bid"` to `"listing"`/`"offer"`.
- `BigNumberish` is replaced by `Amount` (`string | number | bigint`).
- `Overrides` is replaced by `Record<string, unknown>`.
- TypeChain is gone. Contract ABIs are used directly.
- HTTP calls use native `fetch()` instead of `ethers.FetchRequest`.
- `OpenSeaSigner`, `OpenSeaProvider`, `ContractCaller`, and `OpenSeaWallet` are exported for custom provider integrations.
- The public `sdk.provider` property is removed. Use the provider you passed to the constructor for direct RPC access. `sdk.api` is unchanged.
- The ethers-specific `estimateGas` utility is removed. Use your provider's gas estimation.
