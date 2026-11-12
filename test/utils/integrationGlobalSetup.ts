import type { TestProject } from "vitest/node"
import { topUpBuyer } from "./fixtureTopUp"
import { hasWallet } from "./setupIntegration"
import { assertNoSteeringOverridesInCi } from "./walletGuards"

/**
 * Runs the buyer top-up once per run, before any spec, so the per-run spend
 * caps in fixtureTopUp.ts hold across files. A failure is handed to the wallet specs
 * through `inject("fixtureSetupError")` instead of thrown, so read-only specs
 * still report.
 */
export default async function setup(project: TestProject) {
  let error = ""
  if (hasWallet) {
    try {
      assertNoSteeringOverridesInCi(process.env)
      await topUpBuyer()
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
      console.error(`Fixture top-up failed: ${error}`)
    }
  }
  project.provide("fixtureSetupError", error)
}
