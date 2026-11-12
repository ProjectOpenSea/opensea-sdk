import { describe, expect, test } from "vitest"
import { sdk } from "../utils/liveSdk"

describe("SDK: orders", () => {
  test("Fungible tokens filter", async () => {
    const manaAddress = "0x0f5d2fb29fb7d3cfee444a200298f468908cc942"
    const manaPaymentToken = await sdk.api.accounts.getPaymentToken(manaAddress)
    expect(manaPaymentToken).not.toBeNull()
    expect(manaPaymentToken.name).toBe("Decentraland MANA")
    expect(manaPaymentToken.address).toBe(manaAddress)
    expect(manaPaymentToken.decimals).toBe(18)

    const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f"
    const daiPaymentToken = await sdk.api.accounts.getPaymentToken(daiAddress)
    expect(daiPaymentToken).not.toBeNull()
    expect(daiPaymentToken.name).toBe("Dai Stablecoin")
    expect(daiPaymentToken.decimals).toBe(18)
  })
})
