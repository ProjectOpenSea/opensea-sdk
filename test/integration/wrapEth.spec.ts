import { parseEther } from "ethers"
import { beforeAll, describe, expect, test } from "vitest"
import { requireFixtureReady, wethAsset } from "../utils/fixture"
import {
  ETH_TO_WRAP,
  FIXTURE_CHAIN,
  getSdkForChain,
  getWalletAddress,
  hasWallet,
} from "../utils/setupIntegration"

describe.skipIf(!hasWallet)(`SDK: WETH - ${FIXTURE_CHAIN}`, () => {
  beforeAll(requireFixtureReady)

  test("Wrap ETH and Unwrap", async () => {
    const sdk = getSdkForChain(FIXTURE_CHAIN)
    const accountAddress = getWalletAddress()
    const wrapAmount = parseEther(ETH_TO_WRAP)

    const startingBalance = await sdk.getBalance({
      accountAddress,
      asset: wethAsset(),
    })
    console.log("Starting WETH balance:", startingBalance.toString())

    await sdk.wrapEth({ accountAddress, amountInEth: ETH_TO_WRAP })

    const wrappedBalance = await sdk.getBalance({
      accountAddress,
      asset: wethAsset(),
    })
    console.log("Wrapped WETH balance:", wrappedBalance.toString())
    expect(wrappedBalance - startingBalance).toBe(wrapAmount)

    console.log("Unwrapping WETH...")
    await sdk.unwrapWeth({ accountAddress, amountInEth: ETH_TO_WRAP })

    const unwrappedBalance = await sdk.getBalance({
      accountAddress,
      asset: wethAsset(),
    })
    console.log("Unwrapped WETH balance:", unwrappedBalance.toString())
    expect(unwrappedBalance - startingBalance).toBe(0n)
  }, 120_000)
})
