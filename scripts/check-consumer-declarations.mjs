#!/usr/bin/env node
/**
 * Type-check the built declarations the way a consumer with
 * `skipLibCheck: false` does.
 *
 * Every tsconfig in this repo sets `skipLibCheck: true`, so an error inside a
 * shipped `.d.ts` never surfaces here: `tsc` checks the sources, and the doc
 * example check reads `lib/` but skips every `.d.ts` it loads. A consumer who
 * turns `skipLibCheck` off gets the error instead. `@opensea/sdk@12.10.1`
 * shipped one: a type predicate whose emitted type was `"stablechain" | "arc"`,
 * which is not assignable to its `Chain` parameter (TS2677).
 *
 * Imports every entry point the package exports, so a new subpath is covered
 * without editing this file. Resolves TypeScript and `@types/node` from the
 * package directory, so it runs in the monorepo and in the flat mirror layout.
 * Run after `pnpm --filter @opensea/sdk build`.
 */

import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const TAG = "[check-consumer-declarations]"
const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"))
const require = createRequire(join(pkgDir, "package.json"))

const entries = Object.entries(pkg.exports ?? {})
  .filter(([subpath, entry]) => !subpath.includes("*") && typeof entry?.types === "string")
  .map(([subpath, entry]) => ({
    specifier: subpath === "." ? pkg.name : `${pkg.name}/${subpath.replace(/^\.\//, "")}`,
    types: join(pkgDir, entry.types),
  }))

if (entries.length === 0) {
  console.error(`${TAG} ${pkg.name} exports no declaration entry points`)
  process.exit(1)
}

const missing = entries.filter(e => !existsSync(e.types))
if (missing.length > 0) {
  for (const e of missing) console.error(`${TAG} ${e.types} not found`)
  console.error(`${TAG} build the package first (\`pnpm --filter ${pkg.name} build\`)`)
  process.exit(1)
}

const tsPkgPath = require.resolve("typescript/package.json")
const tsc = join(dirname(tsPkgPath), JSON.parse(readFileSync(tsPkgPath, "utf8")).bin.tsc)
const nodeTypesDir = dirname(require.resolve("@types/node/package.json"))

const dir = mkdtempSync(join(tmpdir(), "consumer-declarations-"))
let status = 1
try {
  writeFileSync(
    join(dir, "index.ts"),
    `${entries.map((e, i) => `import * as entry${i} from "${e.specifier}"`).join("\n")}\n` +
      `export { ${entries.map((_, i) => `entry${i}`).join(", ")} }\n`,
  )
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: ["node"],
        typeRoots: [dirname(nodeTypesDir)],
        paths: Object.fromEntries(entries.map(e => [e.specifier, [e.types]])),
      },
      files: ["index.ts"],
    }),
  )

  const result = spawnSync(process.execPath, [tsc, "-p", join(dir, "tsconfig.json")], {
    cwd: pkgDir,
    stdio: "inherit",
  })
  status = result.status ?? 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}

if (status !== 0) {
  console.error(
    `${TAG} FAILED: a consumer with skipLibCheck: false cannot type-check ${pkg.name}'s declarations (errors above)`,
  )
  process.exit(status)
}
console.log(
  `${TAG} OK: ${entries.map(e => e.specifier).join(", ")} type-check with skipLibCheck: false`,
)
