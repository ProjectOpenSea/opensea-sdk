import { formatEther, parseEther } from "ethers"

/**
 * Hard limits on what one run moves out of the owner wallet. A bug that
 * loops or miscomputes an amount throws here instead of draining the owner.
 * buyerEthTarget and buyerTokenTarget match DeployFixture.s.sol.
 */
export const SPEND_CAPS = {
  buyerEthMin: parseEther("0.0002"),
  buyerEthTarget: parseEther("0.0005"),
  maxEthPerRun: parseEther("0.0005"),
  ownerEthFloor: parseEther("0.002"),
  buyerTokenMin: 10n,
  buyerTokenTarget: 100n,
  maxTokensPerRun: 1000n,
  buyerWethSweepThreshold: parseEther("0.0005"),
  ownerWethMin: parseEther("0.0003"),
  ownerWethTarget: parseEther("0.0005"),
  maxWrapPerRun: parseEther("0.0005"),
  /** Held back for the gas of the top-up transactions, so fees cannot push the owner under the floor. */
  ownerGasReserve: parseEther("0.0001"),
}

export type SpendCaps = typeof SPEND_CAPS

export interface TopUpState {
  ownerEth: bigint
  ownerTokens: bigint
  ownerWeth: bigint
  buyerEth: bigint
  buyerTokens: bigint
  buyerWeth: bigint
}

/** What earlier calls in the same run already moved, so caps hold run-wide. */
export interface SentThisRun {
  eth: bigint
  tokens: bigint
  wrapped: bigint
}

export interface TopUpPlan {
  tokensToBuyer: bigint
  ethToBuyer: bigint
  wethToOwner: bigint
  ethToWrapForOwner: bigint
}

/**
 * Decides every transfer for one top-up from balances alone. Throws, before
 * anything is sent, when a transfer would exceed a per-run cap, need more
 * than the owner holds, or take the owner's ETH below its floor. The ETH sent
 * to the buyer and the ETH wrapped for the owner count together against the
 * floor, after holding back ownerGasReserve for the transactions' fees.
 */
export const planTopUp = (
  state: TopUpState,
  sent: SentThisRun = { eth: 0n, tokens: 0n, wrapped: 0n },
  caps: SpendCaps = SPEND_CAPS,
): TopUpPlan => {
  const plan: TopUpPlan = {
    tokensToBuyer: 0n,
    ethToBuyer: 0n,
    wethToOwner: 0n,
    ethToWrapForOwner: 0n,
  }

  if (state.buyerTokens < caps.buyerTokenMin) {
    const amount = caps.buyerTokenTarget - state.buyerTokens
    if (sent.tokens + amount > caps.maxTokensPerRun) {
      throw new Error(
        `Token top-up of ${amount} would exceed the per-run cap of ${caps.maxTokensPerRun}`,
      )
    }
    if (state.ownerTokens < amount) {
      throw new Error(
        `Owner holds ${state.ownerTokens} fixture tokens, needs ${amount}. Mint more with DeployFixture.s.sol.`,
      )
    }
    plan.tokensToBuyer = amount
  }

  let ownerEthLeft = state.ownerEth - caps.ownerGasReserve
  if (state.buyerEth < caps.buyerEthMin) {
    const amount = caps.buyerEthTarget - state.buyerEth
    if (sent.eth + amount > caps.maxEthPerRun) {
      throw new Error(
        `ETH top-up of ${formatEther(amount)} would exceed the per-run cap of ${formatEther(caps.maxEthPerRun)}`,
      )
    }
    if (ownerEthLeft - amount < caps.ownerEthFloor) {
      throw new Error(
        `Owner has ${formatEther(ownerEthLeft)} ETH; topping up the buyer would cross the ${formatEther(caps.ownerEthFloor)} ETH floor. Refill the owner wallet.`,
      )
    }
    plan.ethToBuyer = amount
    ownerEthLeft -= amount
  }

  if (state.buyerWeth >= caps.buyerWethSweepThreshold) {
    plan.wethToOwner = state.buyerWeth
  }

  const ownerWethAfterSweep = state.ownerWeth + plan.wethToOwner
  if (ownerWethAfterSweep < caps.ownerWethMin) {
    const amount = caps.ownerWethTarget - ownerWethAfterSweep
    if (sent.wrapped + amount > caps.maxWrapPerRun) {
      throw new Error(
        `Wrapping ${formatEther(amount)} ETH for the owner would exceed the per-run cap of ${formatEther(caps.maxWrapPerRun)}`,
      )
    }
    if (ownerEthLeft - amount < caps.ownerEthFloor) {
      throw new Error(
        `Owner has ${formatEther(ownerEthLeft)} ETH; wrapping ${formatEther(amount)} for offers would cross the ${formatEther(caps.ownerEthFloor)} ETH floor. Refill the owner wallet.`,
      )
    }
    plan.ethToWrapForOwner = amount
  }

  return plan
}
