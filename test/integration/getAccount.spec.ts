import { describe, expect, test } from "vitest"
import { Chain } from "../../src/types"
import { getSdkForChain } from "../utils/setupIntegration"

describe("SDK: getAccount", () => {
  test("Get Account", async () => {
    const address = "0xfba662e1a8e91a350702cf3b87d0c2d2fb4ba57f"
    const account = await getSdkForChain(Chain.Mainnet).api.accounts.getAccount(
      address,
    )

    expect(account).toBeTruthy()
    expect(account.address).toBe(address)
  })
})
