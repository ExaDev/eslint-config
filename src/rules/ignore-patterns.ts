import { Minimatch } from 'minimatch';

/**
 * Decides whether ESLint, given the patterns, would ignore a forward-slash path relative to its working directory. `isDirectory` says whether the path names a directory, which ESLint matches as the path with a trailing slash.
 */
export type IgnoreMatcher = (path: string, isDirectory: boolean) => boolean;

interface IgnoreRule {
  readonly negated: boolean;
  readonly matcher: Minimatch;
}

const CURRENT_DIRECTORY = './';

// ESLint strips one leading "./" (after a negation marker, "!./" becomes "!") before it reads an ignore pattern.
function normalise(pattern: string): string {
  if (pattern.startsWith(CURRENT_DIRECTORY)) return pattern.slice(CURRENT_DIRECTORY.length);

  return pattern.startsWith(`!${CURRENT_DIRECTORY}`) ? `!${pattern.slice(CURRENT_DIRECTORY.length + 1)}` : pattern;
}

// A negated entry is handed to minimatch whole, with its marker, and with `flipNegate` so that a hit stays a hit, exactly as ESLint's config array does; that is what makes `!!(foo)/x` read as ESLint reads it, not as a negation of an extglob.
function compileRule(pattern: string): IgnoreRule {
  const normalised = normalise(pattern);
  const negated = normalised.startsWith('!');

  return { negated, matcher: new Minimatch(normalised, { dot: true, ...(negated && { flipNegate: true }) }) };
}

/**
 * Compiles the entries of a flat config's `ignores` into an `IgnoreMatcher`, deciding every path below the working directory the way ESLint's config array does: a file is matched as it is and a directory as the path with a trailing slash, through minimatch with `dot: true` and the original pattern, so `x/`, `x/**`, `x/**` followed by a slash and brace or extglob forms that expand to a trailing slash agree with ESLint. The entries are evaluated in order and the last one that selects a path decides it: a plain entry ignores the path, a `!` entry brings it back. An ignored directory is ignored with everything under it, so a caller prunes it without asking about its contents. Compile once per rule `create()` or per options object, not per path. Callers pass only paths below the working directory (the only caller is `scanSkillFiles`): for a path outside it ESLint's config array answers true for a directory and false for a file whatever the patterns, which this matcher does not reproduce, since it answers by the patterns.
 */
export function createIgnoreMatcher(patterns: readonly string[]): IgnoreMatcher {
  const rules = patterns.map(compileRule);

  return (path, isDirectory) => {
    const subject = isDirectory ? `${path}/` : path;

    return rules.reduce((ignored, rule) => (rule.matcher.match(subject) ? !rule.negated : ignored), false);
  };
}
