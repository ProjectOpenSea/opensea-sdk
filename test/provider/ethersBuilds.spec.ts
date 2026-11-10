import type {
  BrowserProvider,
  JsonRpcProvider,
  JsonRpcSigner,
  Wallet,
} from "ethers"
import { describe, expectTypeOf, test } from "vitest"
import type { EthersSignerOrProvider, OpenSeaSDK } from "../../src"

/**
 * This package is CommonJS, so a plain `"ethers"` import names the lib.commonjs declarations. An
 * ESM consumer, or `@opensea/wallet-adapters/ethers`, passes lib.esm classes, which TypeScript treats
 * as unrelated because of their private fields (opensea-sdk#2039). These pin the constructor
 * parameter to accepting both.
 */
type ConstructorArg = ConstructorParameters<typeof OpenSeaSDK>[0]
type EsmEthers = typeof import("ethers", { with: {
  "resolution-mode": "import",
}})

describe("new OpenSeaSDK(signerOrProvider)", () => {
  test("accepts signers and providers from the CommonJS build", () => {
    expectTypeOf<Wallet>().toExtend<ConstructorArg>()
    expectTypeOf<JsonRpcSigner>().toExtend<ConstructorArg>()
    expectTypeOf<JsonRpcProvider>().toExtend<ConstructorArg>()
    expectTypeOf<BrowserProvider>().toExtend<ConstructorArg>()
  })

  test("accepts signers and providers from the ESM build", () => {
    expectTypeOf<InstanceType<EsmEthers["Wallet"]>>().toExtend<ConstructorArg>()
    expectTypeOf<
      InstanceType<EsmEthers["JsonRpcSigner"]>
    >().toExtend<ConstructorArg>()
    expectTypeOf<
      InstanceType<EsmEthers["JsonRpcProvider"]>
    >().toExtend<ConstructorArg>()
    expectTypeOf<
      InstanceType<EsmEthers["AbstractSigner"]>
    >().toExtend<ConstructorArg>()
  })

  test("takes the exported EthersSignerOrProvider", () => {
    expectTypeOf<ConstructorArg>().toEqualTypeOf<EthersSignerOrProvider>()
  })

  test("the ESM classes are not the CommonJS ones to TypeScript", () => {
    // Without this, the ESM cases above would pass vacuously if both imports resolved to one build.
    expectTypeOf<
      InstanceType<EsmEthers["JsonRpcProvider"]>
    >().not.toExtend<JsonRpcProvider>()
  })

  test("rejects values that are not an ethers signer or provider", () => {
    expectTypeOf<object>().not.toExtend<ConstructorArg>()
    expectTypeOf<{
      getAddress(): Promise<string>
    }>().not.toExtend<ConstructorArg>()
  })
})
