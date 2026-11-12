# Integration Tests

The integration suite runs against the live OpenSea API and real chains. Read-only specs need only API keys. Wallet specs sign and post orders and send transactions on Base against a dedicated fixture contract, so they are deterministic and do not depend on any third-party collection.

### Environment variables

Set these in `.env` (not checked in):

```bash
OPENSEA_API_KEY="" # OpenSea API key
ALCHEMY_API_KEY="" # Alchemy API key (used for all supported networks)
WALLET_PRIV_KEY="0x" # Optional. Owner of the fixture; see "Wallet specs" below
```

Every other variable is optional and defaults to the fixture:

| Variable | Default | Used for |
|---|---|---|
| `FIXTURE_CHAIN` | `base` | Chain of the fixture |
| `FIXTURE_CONTRACT_ADDRESS` | `0x483A6ABD50E5b7DD7817585cFBAf720b6c6d1A87` | Fixture contract |
| `FIXTURE_TOKEN_ID` | `1` | Token the owner lists and the buyer holds |
| `FIXTURE_TOKEN_ID_2` | `2` | Second item for bulk orders |
| `LISTING_AMOUNT` | `0.00001` | Listing price in ETH (the buyer pays it) |
| `OFFER_AMOUNT` | `0.0001` | Offer amount in WETH |
| `ETH_TO_WRAP` | `0.00001` | ETH wrapped and unwrapped by `wrapEth.spec.ts` |
| `CREATE_LISTING_CHAIN`, `CREATE_LISTING_CONTRACT_ADDRESS`, `CREATE_LISTING_TOKEN_ID` | fixture, token 1 | Item for post-only listing and offer specs |
| `CREATE_LISTING_2_*`, `CREATE_LISTING_3_*` | fixture, token 2 | Second item for bulk orders and `validateOrderOnchain.spec.ts` |

An empty value counts as unset, because GitHub Actions passes `""` for a repo variable that does not exist. Fulfillment specs always use `FIXTURE_*`, since the buyer must be able to sell the item back. When `CREATE_LISTING_CONTRACT_ADDRESS` points elsewhere, `privateListing.spec.ts` posts the private listing but does not fill it.

### The fixture

`OpenSeaSdkTestFixture` is an OpenZeppelin ERC1155 with an owner-only `mint`, fully onchain metadata (one trait, `Purpose: Integration test`), and an ERC-7572 `contractURI`. The owner holds 1e12 each of tokens 1 and 2, so supply never runs out. Source and deploy script live in [`integration/fixture/`](integration/fixture/).

The deploy script uses CREATE2 with a fixed salt and the owner address as the constructor argument, so the address depends only on the owner key. Every step checks state first, so re-running it is harmless.

To deploy or redeploy (for example with a different owner key):

```bash
cd packages/sdk/test/integration/fixture
forge build
# Dry run against a Base fork. Prints the CREATE2 address and the buyer address.
PK=<owner key> forge script script/DeployFixture.s.sol --fork-url "https://base-mainnet.g.alchemy.com/v2/$ALCHEMY_API_KEY"
# Send it.
PK=<owner key> forge script script/DeployFixture.s.sol --rpc-url "https://base-mainnet.g.alchemy.com/v2/$ALCHEMY_API_KEY" --broadcast
```

The script borrows OpenZeppelin and forge-std from `packages/tool-registry/lib` (initialized by `./scripts/bootstrap`). A different owner gets a different address: set `FIXTURE_CONTRACT_ADDRESS` to the one the script prints, or update `DEFAULT_FIXTURE_CONTRACT_ADDRESS` in `test/utils/setupIntegration.ts` if CI's key changes. To use a new salt, bump `SALT` in the script.

### The buyer wallet

Seaport and the OpenSea API do not let a wallet fill its own orders, so the fulfillment specs need a second wallet. It is derived from the owner key, so CI needs only one secret:

```
buyerKey = keccak256(ownerKey ‖ utf8("opensea-sdk-integration-buyer"))
```

`getBuyerWallet(chain)` and `getBuyerSdkForChain(chain)` in `test/utils/setupIntegration.ts` implement it, and `DeployFixture.s.sol` derives the same key. To print the buyer address, run the dry run above.

### Funding and spend caps

`test/utils/integrationGlobalSetup.ts` runs `topUpBuyer()` (in `test/utils/fixtureTopUp.ts`) once per run before any spec. It:

- sends 100 fixture tokens from the owner when the buyer holds fewer than 10,
- sends ETH from the owner when the buyer has less than 0.0002 ETH, up to 0.0005 ETH,
- returns the buyer's WETH (earned from accepted offers) to the owner once it reaches 0.0005.

`SPEND_CAPS` in `test/utils/fixtureTopUpPlan.ts` holds the limits, and `fixtureTopUpPlan.spec.ts` unit-tests each one. One run never sends more than 0.0005 ETH or 1,000 tokens to the buyer, or wraps more than 0.0005 ETH into WETH for the owner's offers, and the top-up refuses to take the owner below 0.002 ETH. If the top-up fails (fixture not deployed, owner out of funds), the wallet specs fail in `beforeAll` with the reason and the read-only specs still run.

Money mostly circulates between the two wallets: the buyer pays the owner for listings and the owner pays the buyer for offers. What leaves for good is gas and marketplace fees, roughly 1e-5 ETH per run at Base's current 0.006 gwei.

### Cleanup

Every order a spec posts is recorded in an `OrderTracker` (`test/utils/fixture.ts`), and `afterAll` cancels the open ones onchain in a single `cancelOrders` transaction. Offchain cancellation is not used for cleanup: the API refuses it for recently created orders, and it is not assured once a fulfillment signature has been issued. Orders also expire 15 to 60 minutes after creation, so a crashed run leaves nothing behind by the next night. The onchain-validated orders in `validateOrderOnchain.spec.ts` are read back from their `OrderValidated` event and cancelled in the test.

### Wallet specs

Only `OPENSEA_API_KEY` and `ALCHEMY_API_KEY` are required. Specs that read from the API or chain run without a wallet:

- `getAccount.spec.ts`
- `getBalance.spec.ts`
- `getCollection.spec.ts`
- `getCollectionOffers.spec.ts`
- `getListingsAndOffers.spec.ts`
- `getNFTs.spec.ts`
- `getOrderByHash.spec.ts`
- `paymentTokens.spec.ts`
- `search.spec.ts`
- `stream.spec.ts`

Specs that sign, post orders, or send transactions need `WALLET_PRIV_KEY`, and skip as a whole when it is unset:

- `bulkOrders.spec.ts`: bulk listings and offers on fixture tokens 1 and 2
- `fulfillBestListing.spec.ts`: the buyer fills the owner's listing and accepts the owner's offer
- `fulfillment.spec.ts`: fulfillment data for a listing, an item offer, and a collection offer, with the buyer as fulfiller
- `postOrder.spec.ts`: offers, listings, a collection offer cancelled offchain (the API refuses this for offers under 5 minutes old, which the spec accepts), and a trait offer. Trait offers need the collection's `trait_offers_enabled` flag, which only an OpenSea admin can set on the fixture (its 2e12 total supply fails the owner's self-serve eligibility check), so until then the trait-offer test skips. It never posts on a public collection, where a real holder could fill the offer.
- `privateListing.spec.ts`: a private listing to the buyer, who fills it
- `validateOrderOnchain.spec.ts`: listing and offer validated onchain, then cancelled
- `wrapEth.spec.ts`: wraps and unwraps `ETH_TO_WRAP`

These gate on `describe.skipIf(!hasWallet)` from `test/utils/setupIntegration.ts`. The integration config sets `fileParallelism: false`, because the wallet specs share two wallets and would otherwise race nonces and balance assertions.

`setupIntegration.ts` builds nothing at import. Read-only specs call `getReadOnlySdkForChain(chain)`; wallet specs call `getSdkForChain(chain)`, `getBuyerSdkForChain(chain)`, `getWalletAddress()` and `getBuyerAddress()`, which throw if the key is missing.

### How to run:

```
npm run test:integration
```

To run specific test suites:

```bash
# Run only bulk order tests
npm run test:integration -- --grep "bulk order posting"

# Run specific test
npm run test:integration -- --grep "Post Bulk Offers"
```

## Bulk Order Tests

The bulk order tests (`test/integration/bulkOrders.spec.ts`) verify bulk order signing and submission functionality using Seaport's merkle tree signature mechanism.

### What are Bulk Orders?

Bulk orders allow signing multiple orders with a single wallet signature, reducing gas costs and improving UX. Each order receives a unique signature composed of:

- **Base Signature** (64 bytes): Compact ECDSA signature of the merkle root
- **Order Index** (3 bytes): Position in the merkle tree
- **Merkle Proof** (variable): ABI-encoded array of sibling hashes

### Notes

- Single orders use normal signatures to avoid merkle proof overhead
- Tests include detailed logging of order hashes and signature lengths
- Test timeouts: 120s for bulk operations, 60s for single orders

## Stream tests

`test/integration/stream.spec.ts` connects to `wss://stream-api.opensea.io/socket`
and needs only `OPENSEA_API_KEY`, no wallet.

These need direct outbound network access. Running them through `pnpm` can fail
because npm/pnpm wrappers such as Socket Firewall set `HTTP_PROXY` and
`HTTPS_PROXY` to a local proxy that only tunnels registry traffic, and the
WebSocket handshake is refused with close code 1006. A `beforeAll` probe detects
this and fails with an explicit message rather than letting the assertions pass
vacuously. If you hit it, invoke vitest directly:

```bash
node ../../node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts test/integration/stream.spec.ts
```
