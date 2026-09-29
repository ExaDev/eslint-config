/**
 * Whether every own key of `value` is one of `allowed`. The workspace option readers use it to reject an unknown or misspelled key at each level they validate, rather than silently dropping it.
 */
export function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
