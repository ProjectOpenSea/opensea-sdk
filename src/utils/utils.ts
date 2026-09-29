export * from "./address"
export * from "./chain"
// Re-export all utilities from specialized modules
export * from "./fees"
export * from "./protocol"
export * from "./units"

interface ErrorWithCode extends Error {
  code: string
}

/**
 * Narrow an `unknown` catch binding to an error carrying a `code`.
 *
 * `null` and `undefined` are legal `unknown` values — `throw null` and
 * `Promise.reject()` with no reason both produce one — so they have to be ruled
 * out before the property is read. Reading `.code` off a nullish value throws
 * `TypeError: Cannot read properties of null`, which is the opposite of what a
 * guard is for: the caller loses the error it was about to inspect or rethrow
 * and gets one that says nothing about what actually failed.
 */
export const hasErrorCode = (error: unknown): error is ErrorWithCode => {
  if (error === null || error === undefined) {
    return false
  }
  return !!(error as Partial<ErrorWithCode>).code
}
