import { parseEther } from "ethers"
import { describe, expect, test } from "vitest"
import { planTopUp, SPEND_CAPS, type TopUpState } from "./fixtureTopUpPlan"

const healthy: TopUpState = {
  ownerEth: parseEther("0.01"),
  ownerTokens: 1_000_000n,
  ownerWeth: parseEther("0.001"),
  buyerEth: parseEther("0.0005"),
  buyerTokens: 100n,
  buyerWeth: 0n,
}

describe("planTopUp", () => {
  test("moves nothing when every balance is above its minimum", () => {
    expect(planTopUp(healthy)).toEqual({
      tokensToBuyer: 0n,
      ethToBuyer: 0n,
      wethToOwner: 0n,
      ethToWrapForOwner: 0n,
    })
  })

  test("tops the buyer's tokens up to the target", () => {
    expect(planTopUp({ ...healthy, buyerTokens: 9n }).tokensToBuyer).toBe(91n)
  })

  test("sends no tokens at exactly the token minimum", () => {
    expect(
      planTopUp({ ...healthy, buyerTokens: SPEND_CAPS.buyerTokenMin })
        .tokensToBuyer,
    ).toBe(0n)
  })

  test("refuses a token top-up past the per-run cap", () => {
    expect(() =>
      planTopUp(
        { ...healthy, buyerTokens: 0n },
        { eth: 0n, tokens: SPEND_CAPS.maxTokensPerRun - 99n, wrapped: 0n },
      ),
    ).toThrow(/per-run cap/)
  })

  test("refuses a token top-up the owner cannot cover", () => {
    expect(() =>
      planTopUp({ ...healthy, buyerTokens: 0n, ownerTokens: 99n }),
    ).toThrow(/Owner holds 99 fixture tokens, needs 100/)
  })

  test("tops the buyer's ETH up to the target", () => {
    expect(
      planTopUp({ ...healthy, buyerEth: parseEther("0.0001") }).ethToBuyer,
    ).toBe(parseEther("0.0004"))
  })

  test("sends no ETH at exactly the buyer's ETH minimum", () => {
    expect(
      planTopUp({ ...healthy, buyerEth: SPEND_CAPS.buyerEthMin }).ethToBuyer,
    ).toBe(0n)
  })

  test("refuses an ETH top-up past the per-run cap", () => {
    expect(() =>
      planTopUp(
        { ...healthy, buyerEth: 0n },
        { eth: 1n, tokens: 0n, wrapped: 0n },
      ),
    ).toThrow(/ETH top-up .* per-run cap/)
  })

  test("allows an ETH top-up that leaves the owner exactly at the floor after the gas reserve", () => {
    const ownerEth =
      SPEND_CAPS.ownerEthFloor +
      SPEND_CAPS.ownerGasReserve +
      parseEther("0.0005")
    expect(planTopUp({ ...healthy, ownerEth, buyerEth: 0n }).ethToBuyer).toBe(
      parseEther("0.0005"),
    )
  })

  test("refuses an ETH top-up that would take the owner below the floor once gas is reserved", () => {
    const ownerEth =
      SPEND_CAPS.ownerEthFloor +
      SPEND_CAPS.ownerGasReserve +
      parseEther("0.0005") -
      1n
    expect(() => planTopUp({ ...healthy, ownerEth, buyerEth: 0n })).toThrow(
      /cross the 0.002 ETH floor/,
    )
  })

  test("sweeps the buyer's WETH to the owner at the threshold", () => {
    const buyerWeth = SPEND_CAPS.buyerWethSweepThreshold
    expect(planTopUp({ ...healthy, buyerWeth }).wethToOwner).toBe(buyerWeth)
  })

  test("leaves the buyer's WETH just below the threshold", () => {
    const buyerWeth = SPEND_CAPS.buyerWethSweepThreshold - 1n
    expect(planTopUp({ ...healthy, buyerWeth }).wethToOwner).toBe(0n)
  })

  test("wraps ETH for the owner's offers up to the WETH target", () => {
    expect(
      planTopUp({ ...healthy, ownerWeth: parseEther("0.0001") })
        .ethToWrapForOwner,
    ).toBe(parseEther("0.0004"))
  })

  test("wraps nothing at exactly the owner's WETH minimum", () => {
    expect(
      planTopUp({ ...healthy, ownerWeth: SPEND_CAPS.ownerWethMin })
        .ethToWrapForOwner,
    ).toBe(0n)
  })

  test("counts the swept WETH before deciding to wrap", () => {
    const plan = planTopUp({
      ...healthy,
      ownerWeth: 0n,
      buyerWeth: SPEND_CAPS.buyerWethSweepThreshold,
    })
    expect(plan.wethToOwner).toBe(SPEND_CAPS.buyerWethSweepThreshold)
    expect(plan.ethToWrapForOwner).toBe(0n)
  })

  test("refuses a wrap past the per-run cap", () => {
    expect(() =>
      planTopUp(
        { ...healthy, ownerWeth: 0n },
        { eth: 0n, tokens: 0n, wrapped: 1n },
      ),
    ).toThrow(/Wrapping .* per-run cap/)
  })

  test("counts the buyer's ETH top-up against the floor before wrapping", () => {
    const ownerEth =
      SPEND_CAPS.ownerEthFloor +
      SPEND_CAPS.ownerGasReserve +
      parseEther("0.0007")
    expect(() =>
      planTopUp({ ...healthy, ownerEth, buyerEth: 0n, ownerWeth: 0n }),
    ).toThrow(/wrapping .* would cross the 0.002 ETH floor/)
  })
})
