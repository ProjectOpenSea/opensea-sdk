import { defineConfig, mergeConfig } from "vitest/config"
import baseConfig from "./vitest.config.base"

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["test/integration/**/*.spec.ts"],
      testTimeout: 30000,
      setupFiles: ["dotenv/config"],
      globalSetup: ["test/utils/integrationGlobalSetup.ts"],
      // Wallet specs share the owner and buyer wallets. Running files in
      // parallel races their nonces and their balance assertions.
      fileParallelism: false,
    },
  }),
)
