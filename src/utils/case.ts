/**
 * Recursively camelizes object keys (snake_case → camelCase). Walks plain
 * objects and arrays. Leaves non-plain values (strings, numbers, Date, etc.)
 * untouched.
 *
 * `is_nsfw` → `isNsfw`. Multi-underscore segments capitalize each subsequent
 * word: `total_original_consideration_items` → `totalOriginalConsiderationItems`.
 *
 * Used by the API fetcher to expose camelCase responses to SDK consumers
 * regardless of the snake_case wire format. Pair with the {@link Camelize}
 * type-level mapper so the type system reflects the runtime shape.
 */
export function camelizeKeysDeep<T>(value: T): Camelize<T> {
  return walk(value) as Camelize<T>
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(walk)
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
      out[snakeToCamel(key)] = walk(v)
    }
    return out
  }
  return value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function snakeToCamel(key: string): string {
  // No underscore → preserve as-is. Skips the regex when not needed (common case).
  if (!key.includes("_")) return key
  return key.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase())
}

/**
 * Recursively snakeizes object keys (camelCase → snake_case). Walks plain
 * objects and arrays. Leaves non-plain values (strings, numbers, Date, etc.)
 * untouched.
 *
 * The inverse of {@link camelizeKeysDeep}. Used by the fetcher to convert
 * camelCase request bodies and query params back to the snake_case wire
 * format the API expects.
 *
 * **Acronym caveat:** every uppercase character emits its own underscore, so
 * acronym-style keys are split between letters: `URL` → `url`,
 * `userID` → `user_i_d`, `NFTContract` → `n_f_t_contract`. This is deliberate
 * (the roundtrip with `camelizeKeysDeep` is consistent under generic rules)
 * but consumers calling `snakeizeKeysDeep` directly should avoid PascalCase
 * acronyms in key names — use `userId` / `nftContract` instead.
 */
export function snakeizeKeysDeep<T>(value: T): Snakeize<T> {
  return walkSnake(value) as Snakeize<T>
}

function walkSnake(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(walkSnake)
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
      out[camelToSnake(key)] = walkSnake(v)
    }
    return out
  }
  return value
}

function camelToSnake(key: string): string {
  // Position-0 guard: don't emit a leading underscore for the first uppercase
  // character. Otherwise PascalCase or acronym keys (`URL`, `MyKey`) would
  // gain a spurious leading `_` (`_u_r_l`, `_my_key`).
  return key.replace(/[A-Z]/g, (ch, i) =>
    i === 0 ? ch.toLowerCase() : `_${ch.toLowerCase()}`,
  )
}

/**
 * Whether a single character earns an underscore in front of it, i.e. whether
 * {@link camelToSnake} would emit one.
 *
 * `Ch extends Uppercase<Ch>` is the wrong test for this. `Uppercase` is the
 * identity on digits and on anything else without a case, so `"1" extends
 * Uppercase<"1">` is true and every digit read as an uppercase letter. Comparing
 * against `Lowercase` instead is true for exactly the characters `Lowercase`
 * actually rewrites, which is the set the runtime `/[A-Z]/` matches.
 */
type IsUppercaseLetter<Ch extends string> = Ch extends Lowercase<Ch>
  ? false
  : true

/**
 * Maps a camelCase string literal to snake_case at the type level.
 * `"isNsfw"` → `"is_nsfw"`. The inverse of {@link Camelize}.
 *
 * Position 0 is special-cased so that PascalCase or acronym keys (`"URL"`,
 * `"MyKey"`) don't gain a leading underscore — this mirrors the runtime
 * {@link camelToSnake} behavior.
 */
type CamelToSnakeInner<S extends string> =
  S extends `${infer Head}${infer Tail}`
    ? IsUppercaseLetter<Head> extends true
      ? `_${Lowercase<Head>}${CamelToSnakeInner<Tail>}`
      : `${Head}${CamelToSnakeInner<Tail>}`
    : S

type CamelToSnake<S extends string> = S extends `${infer Head}${infer Tail}`
  ? IsUppercaseLetter<Head> extends true
    ? `${Lowercase<Head>}${CamelToSnakeInner<Tail>}`
    : `${Head}${CamelToSnakeInner<Tail>}`
  : S

/**
 * Recursively rewrites object keys from camelCase to snake_case. The inverse
 * of {@link Camelize}.
 */
export type Snakeize<T> = T extends Date
  ? T
  : T extends Array<infer U>
    ? Array<Snakeize<U>>
    : T extends object
      ? {
          [K in keyof T as K extends string ? CamelToSnake<K> : K]: Snakeize<
            T[K]
          >
        }
      : T

// ─── Type-level mapper ─────────────────────────────────────────────────────

/**
 * Maps a snake_case string literal to camelCase at the type level.
 * `"is_nsfw"` → `"isNsfw"`.
 */
type SnakeToCamel<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<SnakeToCamel<Tail>>}`
  : S

/**
 * Recursively rewrites object keys from snake_case to camelCase. Preserves
 * arrays, primitives, and non-plain objects (Date, etc.).
 *
 * SDK consumers see camelCase types even though api-types ships snake_case —
 * the runtime {@link camelizeKeysDeep} keeps shapes in sync.
 *
 * Reach for this when a response has no dedicated camelized alias in this
 * package: `Camelize<SomeWireType>` is the shape an SDK method returns, and
 * the raw `@opensea/api-types` type is not. Annotating an SDK return value
 * with the raw type leaves every renamed field `undefined` at runtime, while
 * single-word keys such as `address` survive and still read correctly, and the
 * compiler only catches it when the wire type has a required snake_case key
 * somewhere in its tree.
 *
 * @example
 * ```ts
 * import type { AccountResolveResponse } from "@opensea/api-types"
 * import type { Camelize } from "@opensea/sdk"
 *
 * // Wrong: compiles, and `ens_name` is undefined at runtime.
 * const bad: AccountResolveResponse =
 *   await sdk.api.accounts.resolveAccount("vitalik.eth")
 *
 * // Right.
 * const good: Camelize<AccountResolveResponse> =
 *   await sdk.api.accounts.resolveAccount("vitalik.eth")
 * ```
 */
export type Camelize<T> = T extends Date
  ? T
  : T extends Array<infer U>
    ? Array<Camelize<U>>
    : T extends object
      ? {
          [K in keyof T as K extends string ? SnakeToCamel<K> : K]: Camelize<
            T[K]
          >
        }
      : T
