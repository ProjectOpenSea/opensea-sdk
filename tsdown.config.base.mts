import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: { sourcemap: true },
  sourcemap: true,
  clean: true,
  target: "node18",
  fixedExtension: false,
})
