import { Contract, formatEther } from "ethers"
import { getNativeWrapTokenAddress } from "../../src/utils/chain"
import { planTopUp, type SentThisRun } from "./fixtureTopUpPlan"
import {
  FIXTURE_CHAIN,
  FIXTURE_CONTRACT_ADDRESS,
  FIXTURE_TOKEN_ID,
  getBuyerWallet,
  getOwnerWallet,
} from "./setupIntegration"

// Imported by integrationGlobalSetup.ts, which runs outside a test worker and
// so must not import the vitest runtime.

const ERC1155_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
]
const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function deposit() payable",
]

const sentThisRun: SentThisRun = { eth: 0n, tokens: 0n, wrapped: 0n }

/**
 * Keeps the buyer able to run the suite: fixture tokens to sell into offers,
 * ETH to buy listings and pay gas. Sends from the owner only when the buyer is
 * below a minimum, never more than SPEND_CAPS (fixtureTopUpPlan.ts) allows per run, and never below
 * the owner's ETH floor. Also returns the WETH the buyer earns from accepted
 * offers to the owner, who makes the offers. Every transfer is logged.
 */
export const topUpBuyer = async (
  log: (line: string) => void = console.info,
) => {
  const owner = getOwnerWallet(FIXTURE_CHAIN)
  const buyer = getBuyerWallet(FIXTURE_CHAIN)
  const provider = owner.provider
  if (!provider) {
    throw new Error("Owner wallet has no provider")
  }

  if ((await provider.getCode(FIXTURE_CONTRACT_ADDRESS)) === "0x") {
    throw new Error(
      `No contract at FIXTURE_CONTRACT_ADDRESS ${FIXTURE_CONTRACT_ADDRESS} on ${FIXTURE_CHAIN}. ` +
        "Deploy it with test/integration/fixture/script/DeployFixture.s.sol (see test/README-integration.md).",
    )
  }

  const fixture = new Contract(FIXTURE_CONTRACT_ADDRESS, ERC1155_ABI, owner)
  const weth = new Contract(
    getNativeWrapTokenAddress(FIXTURE_CHAIN),
    ERC20_ABI,
    provider,
  )
  const [ownerEth, ownerTokens, ownerWeth, buyerEth, buyerTokens, buyerWeth] =
    (await Promise.all([
      provider.getBalance(owner.address),
      fixture.balanceOf(owner.address, FIXTURE_TOKEN_ID),
      weth.balanceOf(owner.address),
      provider.getBalance(buyer.address),
      fixture.balanceOf(buyer.address, FIXTURE_TOKEN_ID),
      weth.balanceOf(buyer.address),
    ])) as bigint[]
  const plan = planTopUp(
    { ownerEth, ownerTokens, ownerWeth, buyerEth, buyerTokens, buyerWeth },
    sentThisRun,
  )

  if (plan.tokensToBuyer > 0n) {
    sentThisRun.tokens += plan.tokensToBuyer
    log(
      `Top-up: sending ${plan.tokensToBuyer} fixture tokens to buyer ${buyer.address}`,
    )
    await (
      await fixture.safeTransferFrom(
        owner.address,
        buyer.address,
        FIXTURE_TOKEN_ID,
        plan.tokensToBuyer,
        "0x",
      )
    ).wait()
  }
  if (plan.ethToBuyer > 0n) {
    sentThisRun.eth += plan.ethToBuyer
    log(
      `Top-up: sending ${formatEther(plan.ethToBuyer)} ETH to buyer ${buyer.address}`,
    )
    await (
      await owner.sendTransaction({ to: buyer.address, value: plan.ethToBuyer })
    ).wait()
  }
  if (plan.wethToOwner > 0n) {
    log(
      `Top-up: returning ${formatEther(plan.wethToOwner)} WETH from buyer to owner`,
    )
    const buyerWethContract = weth.connect(buyer) as Contract
    await (
      await buyerWethContract.transfer(owner.address, plan.wethToOwner)
    ).wait()
  }
  if (plan.ethToWrapForOwner > 0n) {
    sentThisRun.wrapped += plan.ethToWrapForOwner
    log(
      `Top-up: wrapping ${formatEther(plan.ethToWrapForOwner)} ETH into WETH for owner offers`,
    )
    const ownerWethContract = weth.connect(owner) as Contract
    await (
      await ownerWethContract.deposit({ value: plan.ethToWrapForOwner })
    ).wait()
  }
}
