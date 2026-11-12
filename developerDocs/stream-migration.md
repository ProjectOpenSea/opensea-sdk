# Migrating from @opensea/stream-js

The OpenSea Stream client now ships inside `@opensea/sdk` at the
`@opensea/sdk/stream` subpath. The standalone `@opensea/stream-js` package is
deprecated and will not receive further releases.

Every event type, payload shape, and `on*` method is unchanged, apart from
`onItemReceivedOffer`, which never received an event (see below). Most projects
need to change two lines.

## The short version

```bash
npm uninstall @opensea/stream-js ws node-localstorage
npm install @opensea/sdk
```

```diff
-import { OpenSeaStreamClient } from "@opensea/stream-js";
+import { OpenSeaStreamClient } from "@opensea/sdk/stream";

-const client = new OpenSeaStreamClient({ token: "YOUR_API_KEY" });
+const client = new OpenSeaStreamClient({ apiKey: "YOUR_API_KEY" });
```

## What changed

### Node no longer needs `ws` or `node-localstorage`

The old README told Node users to install both and pass them through
`connectOptions`:

```typescript no-check
// No longer necessary. Not type-checked: it imports two packages the SDK does not depend on.
import { WebSocket } from "ws";
import { LocalStorage } from "node-localstorage";

const client = new OpenSeaStreamClient({
  token: "YOUR_API_KEY",
  connectOptions: { transport: WebSocket, sessionStorage: LocalStorage },
});
```

Node 22 and every browser provide a global `WebSocket`, which the client uses
automatically:

```typescript
import { OpenSeaStreamClient } from "@opensea/sdk/stream";

const client = new OpenSeaStreamClient({ apiKey: "YOUR_API_KEY" });
```

`sessionStorage` was only ever read by the underlying library's long-poll
fallback, which the OpenSea stream does not use, so `node-localstorage` was
never doing anything.

On a runtime older than Node 22 you can still supply an implementation:

```typescript no-check
// Not type-checked: `ws` is your dependency, not the SDK's, so its types are not installed here.
import { WebSocket } from "ws";
import { OpenSeaStreamClient } from "@opensea/sdk/stream";

const client = new OpenSeaStreamClient({
  apiKey: "YOUR_API_KEY",
  connectOptions: { transport: WebSocket },
});
```

### `apiKey` replaces `token`

Pass the key as `apiKey`, the name `OpenSeaAPIConfig.apiKey` uses everywhere
else in the SDK. `token` is not accepted: a config that sets only `token`
throws "An OpenSea API key is required".

### `onItemReceivedOffer` is gone

The Stream API never emitted `item_received_offer`, so a handler registered
with `onItemReceivedOffer` could not fire. Item-level offers arrive as
`item_received_bid`. Use `onItemReceivedBid`, `EventType.ITEM_RECEIVED_BID`,
`ItemReceivedBidEvent` and `ItemReceivedBidEventPayload` in place of
`onItemReceivedOffer`, `EventType.ITEM_RECEIVED_OFFER`,
`ItemReceivedOfferEvent` and `ItemReceivedOfferEventPayload`:

```typescript
import { OpenSeaStreamClient } from "@opensea/sdk/stream";

const client = new OpenSeaStreamClient({ apiKey: "YOUR_API_KEY" });

client.onItemReceivedBid("doodles-official", event => {
  console.log(event.payload.base_price);
});
```

### `connectOptions` is a smaller, SDK-owned type

It was `Partial<SocketConnectOption>` borrowed from `@types/phoenix`. It is now
`StreamConnectOptions`:

| Option | Status |
|---|---|
| `transport` | Kept |
| `params` | Kept |
| `timeout` | Kept |
| `heartbeatIntervalMs` | Kept |
| `reconnectAfterMs` | Kept |
| `sessionStorage` | Removed, only used by the unused long-poll fallback |
| `longPollFallbackMs` | Removed, the stream is WebSocket only |
| `binaryType`, `vsn`, `encode`, `decode` | Removed, the wire format is fixed |

Passing a removed option is a TypeScript error. At runtime unknown keys are
ignored, so an unmigrated call site will not crash.

### Unsubscribing drops one handler, not the whole collection

This is a bug fix, and the one behavior change that could affect working code.

Previously every `on*` method returned a function that left the entire channel
for that collection. Two subscriptions on the same collection meant unsubscribing
from one silently stopped the other:

```typescript
import { OpenSeaStreamClient } from "@opensea/sdk/stream";

const client = new OpenSeaStreamClient({ apiKey: "YOUR_API_KEY" });
const onListing = console.log;
const onSale = console.log;

const stopListings = client.onItemListed("doodles-official", onListing);
client.onItemSold("doodles-official", onSale);

stopListings();
// Before: onSale stopped firing too.
// Now:    onSale keeps firing. The topic is left only when its last
//         handler is removed.
```

If you were relying on the old behavior to tear down a collection, call every
returned unsubscribe function, or call `client.disconnect()` to drop everything.

### Mixing `onEvents` and an individual `on*` method now works

`onEvents` sends a server-side event filter in its subscription. In
`@opensea/stream-js`, the first subscriber to a collection fixed that filter, so
this combination silently produced a handler that never fired:

```typescript
import { EventType, OpenSeaStreamClient } from "@opensea/sdk/stream";

const client = new OpenSeaStreamClient({ apiKey: "YOUR_API_KEY" });
const onListing = console.log;
const onSale = console.log;

client.onEvents("doodles-official", [EventType.ITEM_SOLD], onSale);
// Before: the server kept filtering to item_sold, so onListing never fired.
// Now:    the filter widens and both handlers receive their events.
client.onItemListed("doodles-official", onListing);
```

Widening re-establishes the subscription, so a few events on that collection can
be missed in the moment it takes to re-join. Subscribing with the full set up
front avoids that:

```typescript
import { EventType, OpenSeaStreamClient } from "@opensea/sdk/stream";

const client = new OpenSeaStreamClient({ apiKey: "YOUR_API_KEY" });
const handler = console.log;

client.onEvents(
  "doodles-official",
  [EventType.ITEM_SOLD, EventType.ITEM_LISTED],
  handler,
);
```

### Node 22 is the minimum

`@opensea/sdk` requires Node 22 or newer. Node 20 reached end of life in April
2026 and has no global `WebSocket`.

### The `phoenix` dependency is gone

The client speaks the protocol directly, so the dependency tree for
`@opensea/sdk/stream` is empty. Importing the subpath pulls in no ethers, no
seaport, and no third-party runtime code.

## What did not change

- Every `on*` method: `onItemListed`, `onItemSold`, `onItemTransferred`,
  `onItemMetadataUpdated`, `onItemCancelled`, `onItemReceivedBid`,
  `onCollectionOffer`, `onTraitOffer`,
  `onOrderInvalidate`, `onOrderRevalidate`, and `onEvents`.
- Every event and payload type other than the `ItemReceivedOffer` ones,
  unchanged field for field.
- `EventType`, `LogLevel`, `Network`, `OnClientEvent`, and `Callback`.
- `connect()`, `disconnect()`, the `onError` and `onEvent` callbacks, and the
  `"*"` wildcard for all collections.
- Automatic reconnection with backoff, and re-subscription after a reconnect.

## Types collide with the SDK root, so import from the subpath

`EventType`, `Trait`, `TraitOfferEvent`, and `CollectionOfferEvent` exist in
both `@opensea/sdk` and `@opensea/sdk/stream` with different shapes. The stream
versions are only exported from the subpath. Import them from
`@opensea/sdk/stream`, and alias if you need both in one file:

```typescript
import { EventType as StreamEventType } from "@opensea/sdk/stream";
import { AssetEventType } from "@opensea/sdk";
```
