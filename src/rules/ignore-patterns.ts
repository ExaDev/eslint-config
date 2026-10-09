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

  // ESLint's ignore matching reads a pattern with a leading slash as an absolute path, which no path relative to the working directory is, so such a pattern selects nothing (a `.gitignore` entry like `/dist` reaches ESLint already rewritten by includeIgnoreFile, without the slash).
  const matches: PathMatcher = body.startsWith('/') ? () => false : createPathMatcher([directoriesOnly ? body.slice(0, -1) : body], 'any');

  return { negated, directoriesOnly, matches };
}

/**
 * Compiles the entries of a flat config's `ignores` into an `IgnoreMatcher`. The entries are evaluated in order and the last one that selects a path decides it: a plain entry ignores the path, a `!` entry brings it back. Wildcards and `**` match dot-prefixed segments, as they do in the minimatch ESLint applies, and an entry starting with `/` selects nothing, as in ESLint (checked against its Node API). An ignored directory is ignored with everything under it, so a caller prunes it without asking about its contents. Compile once per rule `create()` or per options object, not per path.
 */
export function createIgnoreMatcher(patterns: readonly string[]): IgnoreMatcher {
  const rules = patterns.map(compileRule);

  return (path, isDirectory) => rules.reduce((ignored, rule) => (rule.directoriesOnly && !isDirectory) || !rule.matches(path) ? ignored : !rule.negated, false);
}
