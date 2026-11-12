import { afterEach, describe, expect, it, vi } from "vitest"
import {
  chainArchToAccountType,
  createSiwxMessage,
  linkWalletWithSiwx,
  parseSiwxMessage,
  requestSiwxNonce,
  requestWalletLinkNonce,
} from "../../src"

const LINK_STATEMENT = "Link this wallet to your OpenSea account."

describe("SIWX wallet-link helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("builds and parses SIWX messages", () => {
    const message = createSiwxMessage({
      address: "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e",
      chainArch: "EVM",
      chainId: 1,
      domain: "opensea.io",
      nonce: "abcd1234efgh5678",
      uri: "https://opensea.io/tools",
      statement: "Link your wallet to OpenSea",
      issuedAt: new Date("2026-01-01T00:00:00.000Z"),
    })

    expect(chainArchToAccountType("EVM")).toBe("Ethereum")
    expect(parseSiwxMessage(message)).toEqual({
      domain: "opensea.io",
      address: "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e",
      statement: "Link your wallet to OpenSea",
      uri: "https://opensea.io/tools",
      version: "1",
      chainId: "1",
      nonce: "abcd1234efgh5678",
      issuedAt: "2026-01-01T00:00:00.000Z",
      accountType: "Ethereum",
    })
  })

  it("maps non-EVM chain architectures to SIWX account types", () => {
    expect(chainArchToAccountType("SVM")).toBe("Solana")
    expect(chainArchToAccountType("BITCOIN")).toBe("Bitcoin")
  })

  it.each([
    ["SVM", "Solana"],
    ["BITCOIN", "Bitcoin"],
  ] as const)("builds and parses %s SIWX messages", (chainArch, accountType) => {
    const message = createSiwxMessage({
      address:
        chainArch === "SVM"
          ? "7GgB8L4xY2m2h3QvZ8K9z1f4Xc5W6r7S8T9uVwXyZq1"
          : "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      chainArch,
      chainId: 1,
      domain: "opensea.io",
      nonce: "abcd1234efgh5678",
      uri: "https://opensea.io/tools",
      issuedAt: new Date("2026-01-01T00:00:00.000Z"),
    })

    expect(parseSiwxMessage(message)).toMatchObject({
      accountType,
      domain: "opensea.io",
      chainId: "1",
      nonce: "abcd1234efgh5678",
    })
  })

  it("rejects invalid SIWX message fields", () => {
    expect(() =>
      createSiwxMessage({
        address: "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e",
        chainArch: "EVM",
        chainId: 1,
        domain: "invalid-domain",
        nonce: "abcd1234efgh5678",
      }),
    ).toThrow("Invalid domain: invalid-domain")

    expect(() =>
      createSiwxMessage({
        address: "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e",
        chainArch: "EVM",
        chainId: 1,
        domain: "opensea.io",
        nonce: "abcd1234efgh5678",
        uri: "notaurl",
      }),
    ).toThrow("Invalid uri: notaurl")
  })

  it("rejects malformed SIWX messages", () => {
    expect(() => parseSiwxMessage("invalid message")).toThrow(
      "Invalid SIWX message",
    )
  })

  it("signs the wallet-link nonce and statement and posts them with the scoped bearer token", async () => {
    const address = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e"
    const signMessage = vi.fn(async (_message: string) => "0xsigned")
    const signer = { getAddress: async () => address, signMessage }
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            nonce: "abcd1234efgh5678",
            statement: LINK_STATEMENT,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ linkedWalletAddress: address }), {
          status: 200,
        }),
      )

    const result = await linkWalletWithSiwx(signer, {
      authToken: "token-123",
      apiKey: "api-key",
      chainArch: "EVM",
      chainId: 1,
      apiBaseUrl: "https://api.opensea.io",
    })

    expect(result.linkedWalletAddress).toBe(address)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    const [nonceUrl, nonceInit] = fetchSpy.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ]
    expect(nonceUrl).toBe(
      "https://api.opensea.io/api/v2/accounts/wallets/siwx/nonce",
    )
    expect(nonceInit.method).toBe("POST")
    expect(nonceInit.headers.Authorization).toBe("Bearer token-123")
    expect(nonceInit.headers["X-API-KEY"]).toBe("api-key")

    const signed = signMessage.mock.calls[0][0]
    expect(signed).toContain(`\n\n${LINK_STATEMENT}\n`)
    expect(signed).toContain("\nNonce: abcd1234efgh5678\n")

    const [linkUrl, linkInit] = fetchSpy.mock.calls[1] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ]
    expect(linkUrl).toBe("https://api.opensea.io/api/v2/accounts/wallets/siwx")
    expect(linkInit.method).toBe("POST")
    expect(linkInit.headers.Authorization).toBe("Bearer token-123")
    expect(linkInit.headers["X-API-KEY"]).toBe("api-key")

    const body = JSON.parse(linkInit.body as string) as {
      message: {
        domain: string
        nonce: string
        statement: string
        uri: string
        accountType?: string
      }
      signature: string
      chainArch: string
    }
    expect(body.signature).toBe("0xsigned")
    expect(body.chainArch).toBe("EVM")
    expect(body.message.domain).toBe("opensea.io")
    expect(body.message.uri).toBe("https://opensea.io")
    expect(body.message.nonce).toBe("abcd1234efgh5678")
    expect(body.message.statement).toBe(LINK_STATEMENT)
    expect(body.message.accountType).toBe("Ethereum")
  })

  it("does not sign or link when the wallet-link nonce request is refused", async () => {
    const signMessage = vi.fn(async () => "0xsigned")
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("missing write:wallets scope", { status: 403 }),
      )

    await expect(
      linkWalletWithSiwx(
        {
          getAddress: async () => "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e",
          signMessage,
        },
        { authToken: "token-123", chainArch: "EVM", chainId: 1 },
      ),
    ).rejects.toThrow(
      "Wallet link nonce request failed (403): missing write:wallets scope",
    )
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(signMessage).not.toHaveBeenCalled()
  })

  it("rejects a wallet-link nonce response without a statement", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ nonce: "abcd1234efgh5678" }), {
        status: 200,
      }),
    )

    await expect(
      requestWalletLinkNonce({ authToken: "token-123" }),
    ).rejects.toThrow(
      "Wallet link nonce response is missing nonce or statement",
    )
  })

  it("requests the sign-in nonce from the auth service", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ nonce: "nonce-123" }), { status: 200 }),
      )

    await expect(requestSiwxNonce("https://api.opensea.io/")).resolves.toBe(
      "nonce-123",
    )

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.opensea.io/api/v2/auth/siwe/nonce",
      {
        method: "POST",
        headers: { Accept: "application/json" },
      },
    )
  })

  it("rejects empty auth tokens", async () => {
    await expect(
      linkWalletWithSiwx(
        {
          getAddress: async () => "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e",
          signMessage: async () => "0xsigned",
        },
        {
          authToken: " ",
          chainArch: "EVM",
          chainId: 1,
        },
      ),
    ).rejects.toThrow("authToken is required to link a wallet")
  })

  it("round-trips optional SIWX fields into the wallet-link payload", async () => {
    const address = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e"
    const signer = {
      getAddress: async () => address,
      signMessage: async () => "0xsigned",
    }
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            nonce: "abcd1234efgh5678",
            statement: LINK_STATEMENT,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ linkedWalletAddress: address }), {
          status: 200,
        }),
      )

    await linkWalletWithSiwx(signer, {
      authToken: "token-123",
      chainArch: "EVM",
      chainId: 1,
      apiBaseUrl: "https://api.opensea.io",
      expirationTime: new Date("2026-01-02T00:00:00.000Z"),
      notBefore: new Date("2026-01-01T12:00:00.000Z"),
      requestId: "request-123",
      resources: ["https://opensea.io/tools"],
    })

    const [, linkInit] = fetchSpy.mock.calls[1] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ]
    const body = JSON.parse(linkInit.body as string) as {
      message: {
        expirationTime?: string
        notBefore?: string
        requestId?: string
        resources?: string[]
      }
    }
    expect(body.message.expirationTime).toBe("2026-01-02T00:00:00.000Z")
    expect(body.message.notBefore).toBe("2026-01-01T12:00:00.000Z")
    expect(body.message.requestId).toBe("request-123")
    expect(body.message.resources).toEqual(["https://opensea.io/tools"])
  })
})
