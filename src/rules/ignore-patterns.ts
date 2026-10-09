import { createPathMatcher, type PathMatcher } from './file-scope';

/**
 * Decides whether ESLint, given the patterns, would ignore a forward-slash path relative to its working directory. `isDirectory` says whether the path names a directory, which a pattern ending in `/` selects alone.
 */
export type IgnoreMatcher = (path: string, isDirectory: boolean) => boolean;

interface IgnoreRule {
  readonly negated: boolean;
  readonly directoriesOnly: boolean;
  readonly matches: PathMatcher;
}

function compileRule(pattern: string): IgnoreRule {
  const negated = pattern.startsWith('!');
  const body = negated ? pattern.slice(1) : pattern;
  const directoriesOnly = body.endsWith('/');

  return { negated, directoriesOnly, matches: createPathMatcher([directoriesOnly ? body.slice(0, -1) : body], 'any') };
}

/**
 * Compiles the entries of a flat config's `ignores` into an `IgnoreMatcher`. The entries are evaluated in order and the last one that selects a path decides it: a plain entry ignores the path, a `!` entry brings it back. Wildcards and `**` match dot-prefixed segments, as they do in the minimatch ESLint applies. An ignored directory is ignored with everything under it, so a caller prunes it without asking about its contents. Compile once per rule `create()` or per options object, not per path.
 */
export function createIgnoreMatcher(patterns: readonly string[]): IgnoreMatcher {
  const rules = patterns.map(compileRule);

  return (path, isDirectory) => rules.reduce((ignored, rule) => (rule.directoriesOnly && !isDirectory) || !rule.matches(path) ? ignored : !rule.negated, false);
}
