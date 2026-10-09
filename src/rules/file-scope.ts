import { relative, sep } from 'node:path';
import { Minimatch, type MinimatchOptions } from 'minimatch';
import { isExcludePattern } from './workspace-glob';

/**
 * The option schema for a list of file globs: an array of strings, at least one entry, no duplicates. A glob is a [minimatch](https://github.com/isaacs/minimatch) glob, the matcher ESLint applies to a config's `files`, so a glob selects the same files here as it does there. Two things are this package's own: a leading `!` marks an exclusion, and a glob without a `/` in a per-file rule option means a file of that name at any depth. `readFileGlobs` is the runtime counterpart that additionally requires one include.
 */
export const fileGlobsSchema = {
  type: 'array',
  items: { type: 'string', minLength: 1 },
  minItems: 1,
  uniqueItems: true,
} as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Throws, naming `optionName` and the glob, when minimatch cannot compile `glob`, or when a file glob would not do what it says: one that starts with `#` is a comment to minimatch and matches nothing, and one that starts with a second `!` (after this package's own exclusion marker) is a negation. Every other form is a minimatch form and means here what it means to ESLint.
 */
export function assertSupportedGlob(glob: string, optionName: string, kind: GlobKind = 'file'): void {
  const body = withoutDotSlash(isExcludePattern(glob) ? glob.slice(1) : glob);
  let matcher: Minimatch;
  try {
    matcher = new Minimatch(body, minimatchOptions('any', kind));
    if (matcher.makeRe() === false && !matcher.comment && !matcher.negate) throw new Error('the pattern has no valid form');
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new Error(`@exadev/eslint-config: "${optionName}" has a glob that minimatch cannot compile: "${glob}": ${error.message}`, { cause: error });
  }
  if (matcher.comment) {
    throw new Error(`@exadev/eslint-config: "${optionName}" has a glob that starts with "#", which minimatch reads as a comment that matches nothing: "${glob}". Match a leading "#" with a character class, "[#]".`);
  }
  if (matcher.negate) {
    throw new Error(`@exadev/eslint-config: "${optionName}" has a glob with a second "!" after the exclusion marker, which minimatch reads as a negation: "${glob}". Write one "!" to exclude.`);
  }
}

/**
 * Validates a file-glob option value, enforcing everything `fileGlobsSchema` does plus one include: an array of non-empty strings with no duplicates, at least one of which does not start with `!` (a list of excludes alone would match nothing), and every glob compiling in minimatch (`assertSupportedGlob`). Returns the same array; throws naming `optionName` and the specific failure otherwise.
 */
export function readFileGlobs(value: unknown, optionName: string, kind: GlobKind = 'file'): readonly string[] {
  const prefix = `@exadev/eslint-config: "${optionName}" must`;
  if (!Array.isArray(value)) throw new Error(`${prefix} be an array of glob strings.`);
  if (!value.every(isNonEmptyString)) throw new Error(`${prefix} contain only non-empty strings.`);
  if (new Set(value).size !== value.length) throw new Error(`${prefix} not contain duplicate globs.`);
  if (!value.some((item) => !isExcludePattern(item))) throw new Error(`${prefix} contain at least one glob that does not start with "!".`);
  for (const pattern of value) {
    assertSupportedGlob(pattern, optionName, kind);
  }

  return value;
}

/**
 * How a glob treats a dot-prefixed path segment. `explicit` is the matching of every rule-scope option in this package: a wildcard or `**` never matches one, and only a segment that itself opens with a dot does. `any` is what ESLint applies to a config's `files`: every wildcard matches a dot-prefixed name (minimatch with `dot: true`), for a glob that must select what ESLint selects.
 */
export type DotMatching = 'explicit' | 'any';

/**
 * What a glob list selects: `file` paths relative to the working directory, matched exactly as ESLint matches a config's `files`, or module `specifier` patterns, which only this package's matcher reads (a leading `#` is a Node subpath import there, not a comment).
 */
export type GlobKind = 'file' | 'specifier';

// ESLint strips one leading "./" from a `files` pattern before it compiles it (and so does this package for a specifier pattern, which names the path a relative import resolves to).
function withoutDotSlash(glob: string): string {
  return glob.startsWith('./') ? glob.slice(2) : glob;
}

function minimatchOptions(dotMatching: DotMatching, kind: GlobKind): MinimatchOptions {
  return { dot: dotMatching === 'any', ...(kind === 'specifier' && { nocomment: true, nonegate: true }) };
}

/**
 * Decides whether the file ESLint is linting falls inside a configured glob list. `filename` is ESLint's `context.filename` (absolute) and `cwd` its `context.cwd`; the match is on the forward-slash path relative to `cwd`, so a file outside `cwd` (a leading `..` segment) matches nothing. Patterns are the minimatch globs of `fileGlobsSchema`.
 */
export type FileScope = (filename: string, cwd: string) => boolean;

/**
 * Decides whether a forward-slash path (already relative to whatever root the caller matches against) falls inside a configured glob list.
 */
export type PathMatcher = (path: string) => boolean;

/**
 * Compiles a validated glob list into a `PathMatcher`: a match means at least one include matches and no `!` exclude does, each decided by minimatch (compiled once, here). A path whose first segment is `..` matches nothing, since it leaves the root the globs are relative to. Compile once per rule `create()` (or per options object), not per path. `dotMatching` defaults to the rule-scope matching (`explicit`); `kind` says whether the globs are file globs or module specifier patterns.
 */
export function createPathMatcher(globs: readonly string[], { dotMatching = 'explicit', kind = 'file' }: { readonly dotMatching?: DotMatching; readonly kind?: GlobKind } = {}): PathMatcher {
  const options = minimatchOptions(dotMatching, kind);
  const compile = (glob: string): Minimatch => new Minimatch(withoutDotSlash(glob), options);
  const includes = globs.filter((glob) => !isExcludePattern(glob)).map(compile);
  const excludes = globs.filter(isExcludePattern).map((glob) => compile(glob.slice(1)));

  return (path) => {
    if (path === '..' || path.startsWith('../')) return false;

    return includes.some((matcher) => matcher.match(path)) && !excludes.some((matcher) => matcher.match(path));
  };
}

/**
 * The forward-slash path of `filename` relative to `cwd`, the spelling every `FileScope` and file-glob option matches against. A file outside `cwd` starts with `..`.
 */
export function relativeToCwd(filename: string, cwd: string): string {
  return relative(cwd, filename).split(sep).join('/');
}

/**
 * Compiles a validated glob list into a `FileScope`: in scope means at least one include matches and no `!` exclude does. Compile once per rule `create()` (or per options object), not per file.
 */
export function createFileScope(globs: readonly string[]): FileScope {
  const matches = createPathMatcher(globs);

  return (filename, cwd) => matches(relativeToCwd(filename, cwd));
}
