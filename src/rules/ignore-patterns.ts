import { Minimatch } from 'minimatch';

/**
 * Decides whether ESLint, given the patterns, would ignore a forward-slash path relative to its working directory. `isDirectory` says whether the path names a directory, which ESLint matches as the path with a trailing slash.
 */
export type IgnoreMatcher = (path: string, isDirectory: boolean) => boolean;

interface IgnoreRule {
  readonly negated: boolean;
  readonly matcher: Minimatch;
}

// ESLint strips one leading "./" from an ignore pattern before it compiles it, after the negation marker.
function withoutDotSlash(pattern: string): string {
  return pattern.startsWith('./') ? pattern.slice(2) : pattern;
}

function compileRule(pattern: string): IgnoreRule {
  const negated = pattern.startsWith('!');

  return { negated, matcher: new Minimatch(withoutDotSlash(negated ? pattern.slice(1) : pattern), { dot: true }) };
}

/**
 * Compiles the entries of a flat config's `ignores` into an `IgnoreMatcher`, deciding every path the way ESLint's config array does: a file is matched as it is and a directory as the path with a trailing slash, through minimatch with `dot: true` and the original pattern, so `x/`, `x/**`, `x/**` followed by a slash and brace or extglob forms that expand to a trailing slash agree with ESLint. The entries are evaluated in order and the last one that selects a path decides it: a plain entry ignores the path, a `!` entry brings it back. An ignored directory is ignored with everything under it, so a caller prunes it without asking about its contents. Compile once per rule `create()` or per options object, not per path.
 */
export function createIgnoreMatcher(patterns: readonly string[]): IgnoreMatcher {
  const rules = patterns.map(compileRule);

  return (path, isDirectory) => {
    if (path === '..' || path.startsWith('../')) return false;
    const subject = isDirectory ? `${path}/` : path;

    return rules.reduce((ignored, rule) => (rule.matcher.match(subject) ? !rule.negated : ignored), false);
  };
}
