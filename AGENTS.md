# sdk — Agent Conventions

TypeScript SDK for buying, selling, and managing NFTs and tokens on OpenSea. Supports ethers and viem providers.

## Quick commands

```bash
cd packages/sdk
pnpm run build
pnpm run test
pnpm run test:integration  # needs a .env, see test/README-integration.md
pnpm run check-types
pnpm run lint
```

## Responsibilities

- Provide `OpenSeaSDK` entry points: `@opensea/sdk` for ethers and `@opensea/sdk/viem` for viem.
- Provide the Stream API client at the `@opensea/sdk/stream` subpath.
- Camelize API responses and expose typed helpers for orders, fulfillment, assets, and wallet auth.
- Keep the `Chain` enum in sync with `ChainIdentifier` from `@opensea/api-types`.

## Rules

1. **Never hand-roll API request/response types**. Import from `@opensea/api-types` (or re-export through `src/api/types.ts`) using canonical schema names.
2. **Chain enum sync is compile-time enforced**. Adding a `ChainIdentifier` without a matching `Chain` value or payment-token case fails `pnpm check-types`. Update `scripts/chain-data.json` at the monorepo root and run `pnpm sync-chains` when adding chains, then `pnpm format` — the script also rewrites `chain-data.json` itself (persisting `_slugOrder`), and its `JSON.stringify` output fails `pnpm lint` until Biome reformats it.
3. **Dual provider support**. Changes to `BaseOpenSeaSDK` affect both ethers and viem paths; update both provider adapters if provider-specific logic changes.
4. **OAuth token contract**. `OpenSeaOAuth` requests `offline_access`; refresh responses may omit rotation — keep the previous refresh token. The top-level `wallet` JWT claim is wallet identity; `sub` is an account id.
5. **No secret leakage**. API keys live in `OpenSeaAPIConfig.apiKey`; never log them.
6. **Auth scopes are coupled to the spec in both directions**. `src/scopes.ts` asserts at compile time that `OPENSEA_SCOPES` matches `AuthScope` from `@opensea/api-types`, so a new scope has to land in the spec and in the constant in the same commit, and that commit cannot pass the `Mirror layout` gate until api-types publishes. Read [Spec changes and release order](../../AGENTS.md#spec-changes-and-release-order) before starting.
7. **Stream client is subpath-only and dependency-free**. `src/stream/` is exported from `./stream` and never from `src/index.ts` — `EventType`, `Trait`, `TraitOfferEvent`, and `CollectionOfferEvent` exist in both surfaces with different shapes. `src/stream/transport/` stays internal so a non-Phoenix Stream v2 can replace it without a breaking release; client code uses `StreamTransport`, never `PhoenixChannelsTransport`. The built entry resolves to six local files with zero external requires, so check the require graph before adding an import. Live tests are in `test/integration/stream.spec.ts` and need real network access, see `test/README-integration.md`.
8. **A sub-client method is reached through its namespace, never a flat forwarder**. Each sub-client is a public property on `OpenSeaAPI` (`api.collections`, `api.tokens`, …), so adding a method to `CollectionsAPI` makes it callable immediately. Do **not** add a matching flat `api.getX()` method; version 14 removed the 88 that existed. `search` is the one domain with no namespace, because `SearchAPI`'s only method is also called `search` and the property would have to displace the working `api.search()` call. `subclientReachability.spec.ts`, reading `test/utils/forwarderContract.ts`, asserts every sub-client is namespaced or a documented exception (with a compile-time `Pick` that catches a namespace marked `private`, which no runtime check can see) and that `OpenSeaAPI` carries no method sharing a name with a namespaced sub-client method. Background: [opensea-sdk#2007](https://github.com/ProjectOpenSea/opensea-sdk/issues/2007), where a method shipped with no forwarder and so no way to call it.

9. **Responses are camelCase; `@opensea/api-types` is snake_case.** A fetcher method returns `Camelize<T>`, so a raw wire type used to annotate an SDK return value is the wrong shape at runtime, and the compiler only rejects it where the wire type has a required snake_case key somewhere in its tree. Export a camelized alias in `src/api/types.ts` for a new response, or point the caller at `Camelize<WireType>`, which the root now exports. The exception is `camelizeResponse: false`, for a response keyed by data rather than field names: `get`, `post` and `request` carry a second signature keyed on that literal, which returns the raw `T` because the rewrite did not run. A `boolean` variable or a `const`-widened options object does not select it and still gets `Camelize<T>`, which is the one spelling where the declared type can still be wrong. `test/api/responseCasing.spec.ts` pins every call shape, and the README's "Response casing" section is type-checked by `pnpm run check-doc-examples` from the repo root.

## Conventions

- CommonJS (`"type": "commonjs"`) for broad consumer support.
- Node 22+ is the floor. The stream client relies on a global `WebSocket`.
- `viem` is an optional peer dependency; main entry uses ethers.
- Prefer `string` for decimal `Amount` values.
