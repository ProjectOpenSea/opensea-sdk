import { describe, expect, it, vi } from "vitest"
import { OpenSeaAPI } from "../../src/api/api"
import type {
  GetAccountTokensArgs,
  GetEventsArgs,
  GetNFTsByAccountOptions,
  GetTokensArgs,
  PortfolioArgs,
} from "../../src/api/types"
import { Chain } from "../../src/types"
import { readOpenApiSpec } from "../utils/openapiSpec"

/**
 * Query-arg drift between the spec and the hand-written `*Args` interfaces.
 *
 * The arg interfaces are written by hand, so a query parameter added to the spec is unreachable
 * through the SDK until someone notices. Worse, a parameter the SDK sends that the spec does not
 * document is accepted by the server and ignored, which fails silently: `GetTokensArgs.next` did
 * exactly that on the token endpoints, whose request parameter is `cursor`, so paging by feeding
 * `next` back returned the first page forever.
 *
 * These interfaces are types, so nothing about them survives to runtime. The field lists below are
 * the hand-maintained half. That is the point: adding a parameter to the spec fails this test until
 * someone extends both the interface and this list, which is the decision the drift was skipping.
 */

/** Documented parameters an args interface deliberately does not expose, with the reason. */
const INTENTIONALLY_OMITTED: Record<string, Record<string, string>> = {
  GetTokensArgs: {
    // Forwarded from the deprecated `next` by `withCursor`, and exposed as `cursor`.
    cursor: "exposed as `cursor`",
  },
  GetNFTsByAccountOptions: {
    limit: "positional argument 2 of getNFTsByAccount",
    next: "positional argument 3 of getNFTsByAccount",
    // A real gap rather than a decision: nothing in the SDK sends it yet.
    collection: "not exposed by the SDK",
  },
}

/**
 * Asserts at compile time that `Fields` names every key of `Args` and nothing else.
 *
 * The interfaces are erased at runtime, so the lists below are the only thing the runtime
 * assertions can read. Without this, editing an interface and leaving its list alone would keep
 * both assertions passing while the two drifted apart, which is the failure this file exists to
 * prevent. The annotation catches a real key that is not listed; `readonly (keyof Args)[]` catches
 * a listed field that is not a real key.
 */
type CoversExactly<Args, Fields extends readonly (keyof Args)[]> = [
  Exclude<keyof Args, Fields[number]>,
] extends [never]
  ? Fields
  : {
      error: "args interface has keys missing from its fields list"
      missing: Exclude<keyof Args, Fields[number]>
    }

const GET_TOKENS_FIELDS = [
  "limit",
  "cursor",
  "next",
  "chains",
  "sortBy",
  "sortDirection",
] as const
const GET_ACCOUNT_TOKENS_FIELDS = [
  "limit",
  "chains",
  "sortBy",
  "sortDirection",
  "disableSpamFiltering",
  "cursor",
] as const
const PORTFOLIO_FIELDS = ["timeframe", "chains"] as const
const GET_EVENTS_FIELDS = [
  "eventType",
  "after",
  "before",
  "limit",
  "next",
  "chain",
] as const
// Only the non-pagination filters; the endpoint's other query parameters are
// recorded in INTENTIONALLY_OMITTED above.
const GET_NFTS_BY_ACCOUNT_FIELDS = ["includeAutoHidden"] as const

// Each of these fails to compile if its interface and its list disagree either way.
const _getTokensCovers: CoversExactly<GetTokensArgs, typeof GET_TOKENS_FIELDS> =
  GET_TOKENS_FIELDS
const _getAccountTokensCovers: CoversExactly<
  GetAccountTokensArgs,
  typeof GET_ACCOUNT_TOKENS_FIELDS
> = GET_ACCOUNT_TOKENS_FIELDS
const _portfolioCovers: CoversExactly<PortfolioArgs, typeof PORTFOLIO_FIELDS> =
  PORTFOLIO_FIELDS
const _getEventsCovers: CoversExactly<GetEventsArgs, typeof GET_EVENTS_FIELDS> =
  GET_EVENTS_FIELDS
const _getNFTsByAccountCovers: CoversExactly<
  GetNFTsByAccountOptions,
  typeof GET_NFTS_BY_ACCOUNT_FIELDS
> = GET_NFTS_BY_ACCOUNT_FIELDS

const ARGS_TO_OPERATION: Record<
  string,
  { path: string; method: string; fields: readonly string[] }
> = {
  GetTokensArgs: {
    path: "/api/v2/tokens/trending",
    method: "get",
    fields: GET_TOKENS_FIELDS,
  },
  GetAccountTokensArgs: {
    path: "/api/v2/account/{address}/tokens",
    method: "get",
    fields: GET_ACCOUNT_TOKENS_FIELDS,
  },
  PortfolioArgs: {
    path: "/api/v2/account/{address}/portfolio",
    method: "get",
    fields: PORTFOLIO_FIELDS,
  },
  GetEventsArgs: {
    path: "/api/v2/events",
    method: "get",
    fields: GET_EVENTS_FIELDS,
  },
  GetNFTsByAccountOptions: {
    path: "/api/v2/chain/{chain}/account/{address}/nfts",
    method: "get",
    fields: GET_NFTS_BY_ACCOUNT_FIELDS,
  },
}

const snake = (camel: string): string =>
  camel.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)

function documentedQueryParams(path: string, method: string): string[] {
  const spec = readOpenApiSpec()
  const operation = (
    spec.paths as Record<string, Record<string, { parameters?: unknown[] }>>
  )[path]?.[method]

  // A throw, not expect().toBeDefined(): the matcher asserts but does not narrow the type, so
  // `operation` stays possibly-undefined for the access below.
  if (!operation) {
    throw new Error(`${method.toUpperCase()} ${path} missing from spec`)
  }

  return (operation.parameters ?? [])
    .map(p => p as { name: string; in: string })
    .filter(p => p.in === "query")
    .map(p => p.name)
    .sort()
}

describe("query arg drift", () => {
  for (const [name, { path, method, fields }] of Object.entries(
    ARGS_TO_OPERATION,
  )) {
    describe(name, () => {
      it("exposes every documented query parameter", () => {
        const documented = documentedQueryParams(path, method)
        const exposed = new Set(fields.map(snake))
        const omitted = INTENTIONALLY_OMITTED[name] ?? {}

        const missing = documented.filter(
          p => !exposed.has(p) && !(p in omitted),
        )

        expect(
          missing,
          `${name} does not expose documented ${method.toUpperCase()} ${path} ` +
            `parameters: ${missing.join(", ")}. Add them to the interface and to ` +
            `ARGS_TO_OPERATION, or record why they are omitted.`,
        ).toEqual([])
      })

      it("sends nothing the endpoint does not document", () => {
        const documented = new Set(documentedQueryParams(path, method))
        // Fields the SDK never puts on the wire for this endpoint, so the server cannot
        // silently ignore them:
        //   GetTokensArgs.next  — rewritten to `cursor` by `withCursor`.
        //   GetEventsArgs.chain — stripped by `withoutIgnoredChain`. The field is still valid
        //   for `getEventsByAccount`, whose endpoint does document `chain`; this entry is
        //   about the general feed only.
        const NOT_SENT: Record<string, string[]> = {
          GetTokensArgs: ["next"],
          GetEventsArgs: ["chain"],
        }
        const rewritten = new Set(NOT_SENT[name] ?? [])

        const undocumented = fields
          .map(snake)
          .filter(p => !documented.has(p) && !rewritten.has(p))

        expect(
          undocumented,
          `${name} exposes parameters ${method.toUpperCase()} ${path} does not ` +
            `document: ${undocumented.join(", ")}. The server ignores these, so a ` +
            `caller setting one gets no error and no effect.`,
        ).toEqual([])
      })
    })
  }
})

describe("query arg serialization", () => {
  // The drift tests above compare names only. These pin what actually reaches the wire, since
  // a correctly named field is still useless if it serializes to something the server ignores.
  const urlFor = async (
    call: (api: OpenSeaAPI) => Promise<unknown>,
  ): Promise<URL> => {
    const fetchStub = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }))
    try {
      await call(new OpenSeaAPI({ apiKey: "key" }))
      return new URL(fetchStub.mock.calls[0][0] as string)
    } finally {
      fetchStub.mockRestore()
    }
  }

  it("repeats eventType as snake_case event_type, one param per value", async () => {
    const url = await urlFor(api =>
      api.getEvents({ eventType: ["sale", "transfer"] }),
    )

    expect(url.searchParams.getAll("event_type")).toEqual(["sale", "transfer"])
    expect(url.searchParams.has("eventType")).toBe(false)
  })

  it("repeats chains on the token endpoints", async () => {
    const url = await urlFor(api =>
      api.getTrendingTokens({ chains: ["ethereum", "solana"] }),
    )

    expect(url.searchParams.getAll("chains")).toEqual(["ethereum", "solana"])
  })

  it.each([
    {
      endpoint: "getTopTokens",
      call: (api: OpenSeaAPI) =>
        api.getTopTokens({ sortBy: "market_cap", sortDirection: "asc" }),
      sortBy: "market_cap",
      sortDirection: "asc",
    },
    {
      endpoint: "getTrendingTokens",
      call: (api: OpenSeaAPI) =>
        api.getTrendingTokens({ sortBy: "price", sortDirection: "desc" }),
      sortBy: "price",
      sortDirection: "desc",
    },
  ])("$endpoint sends the ranking sort as snake_case", async ({
    call,
    sortBy,
    sortDirection,
  }) => {
    const url = await urlFor(call)

    // Pinned per endpoint rather than matched against a set, so the two
    // cannot pass by serializing each other's values.
    expect(url.searchParams.get("sort_by")).toBe(sortBy)
    expect(url.searchParams.get("sort_direction")).toBe(sortDirection)
    // The camelCase spellings would be undocumented parameters on the wire.
    expect(url.searchParams.has("sortBy")).toBe(false)
    expect(url.searchParams.has("sortDirection")).toBe(false)
  })

  it("omits the ranking sort when the caller does not set one", async () => {
    // Each endpoint keeps its own server-side default, so sending nothing is
    // what preserves the behavior callers had before sorting was exposed.
    const url = await urlFor(api => api.getTopTokens({ limit: 5 }))

    expect(url.searchParams.has("sort_by")).toBe(false)
    expect(url.searchParams.has("sort_direction")).toBe(false)
  })

  it("sends the forwarded cursor, never the deprecated next", async () => {
    const url = await urlFor(api => api.getTrendingTokens({ next: "page-2" }))

    expect(url.searchParams.get("cursor")).toBe("page-2")
    expect(url.searchParams.has("next")).toBe(false)
  })

  it("sends includeAutoHidden as include_auto_hidden=true", async () => {
    const url = await urlFor(api =>
      api.nfts.getNFTsByAccount("0xabc", undefined, undefined, Chain.Mainnet, {
        includeAutoHidden: true,
      }),
    )

    expect(url.searchParams.get("include_auto_hidden")).toBe("true")
    // The camelCase spelling would be an undocumented parameter on the wire,
    // which the server accepts and ignores.
    expect(url.searchParams.has("includeAutoHidden")).toBe(false)
  })

  it("sends include_auto_hidden=false when the caller asks for false", async () => {
    // Pinned separately from the true case so a serializer that coerced every
    // set value to "true" could not pass both.
    const url = await urlFor(api =>
      api.nfts.getNFTsByAccount("0xabc", undefined, undefined, Chain.Mainnet, {
        includeAutoHidden: false,
      }),
    )

    expect(url.searchParams.get("include_auto_hidden")).toBe("false")
  })

  it("omits include_auto_hidden when the caller does not set it", async () => {
    const url = await urlFor(api => api.nfts.getNFTsByAccount("0xabc", 5))

    expect(url.searchParams.get("include_auto_hidden")).toBeNull()
    expect(url.searchParams.has("includeAutoHidden")).toBe(false)
    // The rest of the query still goes out, so an empty query string is not
    // what makes the assertion above pass.
    expect(url.searchParams.get("limit")).toBe("5")
  })

  it.each([
    {
      endpoint: "the general event feed",
      call: (api: OpenSeaAPI) =>
        api.events.getEvents({ chain: "solana", limit: 5 }),
    },
    {
      endpoint: "the collection event feed",
      call: (api: OpenSeaAPI) =>
        api.events.getEventsByCollection("azuki", {
          chain: "solana",
          limit: 5,
        }),
    },
    {
      endpoint: "the NFT event feed",
      call: (api: OpenSeaAPI) =>
        api.events.getEventsByNFT(Chain.Mainnet, "0xabc", "1", {
          chain: "solana",
          limit: 5,
        }),
    },
  ])("omits the chain $endpoint ignores", async ({ call }) => {
    const url = await urlFor(call)

    expect(url.searchParams.has("chain")).toBe(false)
    expect(url.searchParams.get("limit")).toBe("5")
  })

  it("keeps the chain filter on the account event feed", async () => {
    const url = await urlFor(api =>
      api.events.getEventsByAccount("0xabc", { chain: "solana", limit: 5 }),
    )

    expect(url.searchParams.get("chain")).toBe("solana")
    expect(url.searchParams.get("limit")).toBe("5")
  })
})
