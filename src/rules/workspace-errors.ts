// Shared by workspace-graph.ts (readDeclaredManifest) and workspace-options.ts (validateRankRulePatterns), which each wrap a caught error from a call (JSON.parse, the RegExp constructor) that only ever throws a real Error (a SyntaxError) on failure, never a plain string or other non-Error value. `catch`'s own clause type is `unknown`, so narrowing it back to `Error` needs SOME check; this narrows via an "Unreachable, tested directly" throw (the same shape this package's own requireChar/findDependencyEntry/findGroupSpec/last establish) rather than an `as Error` assertion or a `String(error)` fallback, so a genuine violation of that "only ever throws Error" contract fails loudly, with the caller's own context named, instead of silently losing the original error text.
//
// An assertion function, not one returning a narrowed value under a new name: this package's own `preserve-caught-error` lint rule requires a re-thrown error's own `cause` to be the exact SAME identifier the `catch` clause bound, so narrowing `error` in place (rather than handing callers back a differently-named `Error`) is what lets `throw new Error(..., { cause: error })` keep referring to that one, real, unrenamed binding.
export function assertIsError(error: unknown, context: string): asserts error is Error {
  if (!(error instanceof Error)) {
    throw new Error(`Unreachable: ${context} threw a non-Error value.`);
  }
}
