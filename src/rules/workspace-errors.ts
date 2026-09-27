/**
 * Shared by workspace-graph.ts (readDeclaredManifest) and workspace-options.ts (validateRankRulePatterns), which each wrap a caught error from a call (JSON.parse, the RegExp constructor) that only ever throws a real Error (a SyntaxError) on failure, never a plain string or other non-Error value. `catch`'s own clause type is `unknown`, so narrowing it back to `Error` needs SOME check; this narrows via an "Unreachable, tested directly" throw (the same shape this package's own requireChar/findDependencyEntry/findGroupSpec/last establish) rather than an `as Error` assertion or a `String(error)` fallback, so a genuine violation of that "only ever throws Error" contract fails loudly, with the caller's own context named, instead of silently losing the original error text.
 *
 * An assertion function, not one returning a narrowed value under a new name: this package's own `preserve-caught-error` lint rule requires a re-thrown error's own `cause` to be the exact SAME identifier the `catch` clause bound, so narrowing `error` in place (rather than handing callers back a differently-named `Error`) is what lets `throw new Error(..., { cause: error })` keep referring to that one, real, unrenamed binding.
 */
export function assertIsError(error: unknown, context: string): asserts error is Error {
  if (!(error instanceof Error)) {
    throw new Error(`Unreachable: ${context} threw a non-Error value.`);
  }
}

/**
 * The exact context string readDeclaredManifest (workspace-graph.ts) passes to assertIsError when JSON.parse throws. Extracted into its own function, rather than inlined as a template literal at that call site, because assertIsError's own throw is unreachable there (JSON.parse never throws a non-Error value): a test exercising the real call path can never observe which context string was passed, so this function exists purely to let that exact string be asserted directly against a range of manifest paths, the same "Unreachable, tested directly" treatment this package gives requireChar/findDependencyEntry/findGroupSpec/last.
 */
export function jsonParseContext(manifestPath: string): string {
  return `JSON.parse while parsing "${manifestPath}"`;
}

/**
 * The exact context string validateRankRulePatterns (workspace-options.ts) passes to assertIsError when the RegExp constructor throws, extracted for the same reason as jsonParseContext above: that call site's assertIsError throw is equally unreachable (the RegExp constructor never throws a non-Error value), so this function is what makes the string directly testable.
 */
export function regExpConstructorContext(pattern: string): string {
  return `the RegExp constructor while compiling "nameRanks" pattern "${pattern}"`;
}
