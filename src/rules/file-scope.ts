import { relative, sep } from 'node:path';
import { expandBraces, findMatchingBrace, isExcludePattern, normalizeGlobSegments, segmentRequestsDotMatch, segmentToRegExp, splitTopLevelAlternatives } from './workspace-glob';
import { requireChar, splitPathSegments } from './workspace-path';

/**
 * The option schema for a list of file globs: an array of strings, at least one entry, no duplicates. The dialect is the one `workspace-glob.ts` documents (brace expansion, `*`, `?`, `[...]`, `**` as zero or more whole segments, a wildcard never matching a dot-prefixed name, a leading `!` for an exclude), applied to file paths relative to ESLint's working directory. `readFileGlobs` is the runtime counterpart that additionally requires one include.
 */
export const fileGlobsSchema = {
  type: 'array',
  items: { type: 'string', minLength: 1 },
  minItems: 1,
  uniqueItems: true,
} as const;

const EXTGLOB_OPENERS: ReadonlySet<string> = new Set(['@', '+', '!', '?', '*']);

// The index of the `]` closing the character class that opens at `open`, or -1 when it never closes (the `[` is then an ordinary character). A `]` straight after the `[`, or after its `!` or `^` negation, is a member of the class.
function classEnd(pattern: string, open: number): number {
  let index = open + 1;
  if (pattern[index] === '!' || pattern[index] === '^') index += 1;
  if (pattern[index] === ']') index += 1;
  while (index < pattern.length) {
    if (pattern[index] === '\\') index += 2;
    else if (pattern[index] === ']') return index;
    else index += 1;
  }

  return -1;
}

/**
 * Whether a glob uses extglob syntax: `@(`, `+(`, `?(`, `*(` or `!(` outside a character class and not escaped. One leading `!` is the dialect's exclusion marker and is not part of the pattern, so `!(group)/**` excludes a directory named `(group)`. Text inside `[...]` (`[!(]`) and a backslash-escaped character (`\@(a)`) are literal. A scan, not a regular expression, because the two exemptions depend on position.
 */
function hasExtglob(glob: string): boolean {
  const pattern = isExcludePattern(glob) ? glob.slice(1) : glob;
  let index = 0;
  while (index < pattern.length) {
    const char = requireChar(pattern, index);
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '[') {
      const end = classEnd(pattern, index);
      if (end !== -1) {
        index = end + 1;
        continue;
      }
    }
    if (EXTGLOB_OPENERS.has(char) && pattern[index + 1] === '(') return true;
    index += 1;
  }

  return false;
}

/**
 * Throws when `glob` uses extglob syntax. ESLint's minimatch reads `@(a|b)` and its kin as groups while this package's glob dialect, which every option and specifier pattern list shares, does not, so a pattern using one would select files for ESLint that this package's own matching cannot. The one definition of "extglob", called by every reader of a glob or specifier list; the error names `optionName` and the glob.
 */
export function assertNoExtglob(glob: string, optionName: string): void {
  if (hasExtglob(glob)) {
    throw new Error(`@exadev/eslint-config: "${optionName}" must not use extglob syntax, which this package's glob dialect does not support: "${glob}". Use braces, "*", "?" and "[...]", or several globs.`);
  }
}

// Whether the glob holds a POSIX character class (`[[:alpha:]]`). minimatch reads the inner `[:name:]` as one class, while this dialect closes the outer class at the first `]`, so the two select different files.
function hasPosixClass(glob: string): boolean {
  const pattern = isExcludePattern(glob) ? glob.slice(1) : glob;
  let index = 0;
  while (index < pattern.length) {
    if (pattern[index] === '\\') {
      index += 2;
      continue;
    }
    const end = pattern[index] === '[' ? classEnd(pattern, index) : -1;
    if (end === -1) {
      index += 1;
      continue;
    }
    const body = pattern.slice(index + 1, end);
    if (body.includes('[:') && body.endsWith(':')) return true;
    index = end + 1;
  }

  return false;
}

// Throws for a brace group `findMatchingBrace` cannot close, or one with no top-level comma, anywhere in `pattern` (checking each alternative's own groups too).
function assertBraceGroups(pattern: string, glob: string, optionName: string): void {
  let from = pattern.indexOf('{');
  while (from !== -1) {
    const close = findMatchingBrace(pattern, from);
    if (close === -1) {
      throw new Error(`@exadev/eslint-config: "${optionName}" has an unmatched "{" in "${glob}" (brace expansion). Rewrite it with balanced braces.`);
    }
    const alternatives = splitTopLevelAlternatives(pattern.slice(from + 1, close));
    if (alternatives.length < 2) {
      throw new Error(`@exadev/eslint-config: "${optionName}" has a brace group with no comma, "${pattern.slice(from, close + 1)}", in "${glob}", which minimatch and this package's glob dialect read differently. Write at least two alternatives, "{a,b}", or drop the braces.`);
    }
    for (const alternative of alternatives) assertBraceGroups(alternative, glob, optionName);
    from = pattern.indexOf('{', close + 1);
  }
}

// Whether a glob has an empty path segment (a leading, trailing or doubled slash, or nothing at all) or a `.` or `..` segment. The package's dialect drops those and minimatch does not, so a glob that has one differs from it.
function hasUnreadableSegment(glob: string): boolean {
  const segments = glob.split('/');

  return glob === '' || segments.some((segment) => segment === '.' || segment === '..' || (segment === '' && segments.length > 1));
}

// Rejects the brace forms the two matchers read differently: a backslash before a backslash, a brace or a comma in a glob that uses braces (minimatch expands the braces before it reads escapes, so the escape does not protect the character), and a group whose alternative leaves an empty or dot path segment (`{a,}/x` expands to `/x`, which the package reads as `x`, and `{a,.}` leaves a dot segment the package drops), a group with no comma (`{a}` is literal to one and an alternative of one to the other, `{1..3}` a range to minimatch). Also names the option and the whole glob for an unbalanced brace.
function assertBracesSupported(glob: string, optionName: string): void {
  const pattern = isExcludePattern(glob) ? glob.slice(1) : glob;
  if (!pattern.includes('{')) return;
  if (/\\[\\{},]/u.test(pattern)) {
    throw new Error(`@exadev/eslint-config: "${optionName}" must not escape a backslash, brace or comma in a glob that uses braces, since minimatch and this package's glob dialect read the escape differently: "${glob}". Put the character in a character class, "[,]", instead.`);
  }
  assertBraceGroups(pattern, glob, optionName);
  // A segment the glob already has without its braces is not the braces' doing, and is read the same whatever they hold.
  let skeleton = pattern;
  for (let next = skeleton.replace(/\{[^{}]*\}/gu, 'x'); next !== skeleton; next = skeleton.replace(/\{[^{}]*\}/gu, 'x')) skeleton = next;
  if (hasUnreadableSegment(skeleton)) return;
  if (expandBraces(pattern).some(hasUnreadableSegment)) {
    throw new Error(`@exadev/eslint-config: "${optionName}" has a brace group that leaves an empty or dot path segment in "${glob}", which minimatch and this package's glob dialect read differently. Name each alternative with a real path segment, or drop the group.`);
  }
}

const ESCAPED_CARET = '\\^';

// Whether a character class opens with an escaped caret that is not the whole class (`[\^a]`). minimatch reads such a class as negated, by de-escaping the caret after the fact, but only when more follows it; `[\^]` is a caret and `[\^-x]` a set holding `-` and `x`. The dialect has no consistent reading to match, so the form is rejected.
function hasEscapedCaretClass(glob: string): boolean {
  const pattern = isExcludePattern(glob) ? glob.slice(1) : glob;
  let index = 0;
  while (index < pattern.length) {
    if (pattern[index] === '\\') {
      index += 2;
      continue;
    }
    const end = pattern[index] === '[' ? classEnd(pattern, index) : -1;
    if (end === -1) {
      index += 1;
      continue;
    }
    if (pattern.startsWith(ESCAPED_CARET, index + 1) && end - (index + 1) > ESCAPED_CARET.length) return true;
    index = end + 1;
  }

  return false;
}

/**
 * Throws when `glob` uses syntax this package's glob dialect reads differently from the minimatch ESLint applies to the same glob, so that the two would select different files: extglob (`assertNoExtglob`), a POSIX character class (`[[:alpha:]]`), a class opening with an escaped caret (`[\^a]`), a brace form (an escape before a brace, comma or backslash, a group with no comma or one that leaves an empty or dot path segment, an unbalanced brace), or a character class that is not valid, a reversed range such as `[c-a]`. The error names `optionName` and the glob. The one check every reader of a glob or specifier list calls.
 */
export function assertSupportedGlob(glob: string, optionName: string): void {
  assertNoExtglob(glob, optionName);
  if (hasPosixClass(glob)) {
    throw new Error(`@exadev/eslint-config: "${optionName}" must not use a POSIX character class, which this package's glob dialect does not support: "${glob}". List the characters or a range instead.`);
  }
  if (hasEscapedCaretClass(glob)) {
    throw new Error(`@exadev/eslint-config: "${optionName}" must not open a character class with an escaped caret, which this package's glob dialect cannot read the way ESLint does: "${glob}". Use "[^...]" to negate, or put the caret after the first member.`);
  }
  assertBracesSupported(glob, optionName);
  const body = isExcludePattern(glob) ? glob.slice(1) : glob;
  for (const expanded of expandBraces(body)) {
    for (const segment of normalizeGlobSegments(splitPathSegments(expanded))) {
      try {
        segmentToRegExp(segment);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        throw new Error(`@exadev/eslint-config: "${optionName}" has a character class in "${glob}" that is not valid: ${error.message}`, { cause: error });
      }
    }
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Validates a file-glob option value, enforcing everything `fileGlobsSchema` does plus one include: an array of non-empty strings with no duplicates, at least one of which does not start with `!` (a list of excludes alone would match nothing), balanced braces in every pattern, and no extglob syntax (`@(a|b)`, `+(a)`, `!(a)`, `?(a)`, `*(a)`), which ESLint accepts and the dialect does not. Returns the same array; throws naming `optionName` and the specific failure otherwise.
 */
export function readFileGlobs(value: unknown, optionName: string): readonly string[] {
  const prefix = `@exadev/eslint-config: "${optionName}" must`;
  if (!Array.isArray(value)) throw new Error(`${prefix} be an array of glob strings.`);
  if (!value.every(isNonEmptyString)) throw new Error(`${prefix} contain only non-empty strings.`);
  if (new Set(value).size !== value.length) throw new Error(`${prefix} not contain duplicate globs.`);
  if (!value.some((item) => !isExcludePattern(item))) throw new Error(`${prefix} contain at least one glob that does not start with "!".`);
  for (const pattern of value) {
    assertSupportedGlob(pattern, optionName);
  }

  return value;
}

interface WildcardSegment {
  readonly matches: (name: string) => boolean;
}

// A '**' segment, which consumes zero or more whole path segments; `crossesDot` says whether it may consume a dot-prefixed one.
interface GlobstarSegment {
  readonly crossesDot: boolean;
}

// Any other segment is pre-compiled once, when the scope is created, rather than per file.
type CompiledSegment = GlobstarSegment | WildcardSegment;

/**
 * How a glob treats a dot-prefixed path segment. `explicit` is the dialect of every file glob option in this package: a wildcard or `**` never matches one, and only a segment that itself opens with a dot does. `any` is the matching ESLint applies to a config's `files` and `ignores` (minimatch with `dot: true`), for a rule that must agree with ESLint about which files a glob selects.
 */
export type DotMatching = 'explicit' | 'any';

function compileSegment(segment: string, dotMatching: DotMatching): CompiledSegment {
  if (segment === '**') return { crossesDot: dotMatching === 'any' };
  const pattern = segmentToRegExp(segment);
  const allowDotMatch = dotMatching === 'any' || segmentRequestsDotMatch(segment);

  return { matches: (name) => (allowDotMatch || !name.startsWith('.')) && pattern.test(name) };
}

function compilePattern(pattern: string, dotMatching: DotMatching): readonly (readonly CompiledSegment[])[] {
  return expandBraces(pattern).map((expanded) => normalizeGlobSegments(splitPathSegments(expanded)).map((segment) => compileSegment(segment, dotMatching)));
}

function matchSegments(path: readonly string[], pattern: readonly CompiledSegment[]): boolean {
  const [head, ...rest] = pattern;
  const [first, ...others] = path;
  if (head === undefined) return first === undefined;
  if ('crossesDot' in head) {
    // Zero segments consumed, or one real segment consumed and '**' tried again from the next; unless it crosses dots, '**' never crosses a dot-prefixed segment, the same rule a single wildcard follows.
    if (matchSegments(path, rest)) return true;

    return first !== undefined && (head.crossesDot || !first.startsWith('.')) && matchSegments(others, pattern);
  }

  return first !== undefined && head.matches(first) && matchSegments(others, rest);
}

/**
 * Decides whether the file ESLint is linting falls inside a configured glob list. `filename` is ESLint's `context.filename` (absolute) and `cwd` its `context.cwd`; the match is on the forward-slash path relative to `cwd`, so a file outside `cwd` (a leading `..` segment) matches nothing. Patterns are the `fileGlobsSchema` dialect.
 */
export type FileScope = (filename: string, cwd: string) => boolean;

/**
 * Decides whether a forward-slash path (already relative to whatever root the caller matches against) falls inside a configured glob list.
 */
export type PathMatcher = (path: string) => boolean;

/**
 * Compiles a validated glob list into a `PathMatcher`: a match means at least one include matches and no `!` exclude does. The path is split on `/` and matched segment by segment, so it need not be a file path: an import specifier matches the same way. A path whose first segment is `..` matches nothing, since it leaves the root the globs are relative to. Compile once per rule `create()` (or per options object), not per path. `dotMatching` defaults to the package dialect (`explicit`).
 */
export function createPathMatcher(globs: readonly string[], dotMatching: DotMatching = 'explicit'): PathMatcher {
  const compile = (glob: string) => compilePattern(glob, dotMatching);
  const includes = globs.filter((glob) => !isExcludePattern(glob)).flatMap(compile);
  const excludes = globs
    .filter(isExcludePattern)
    .map((glob) => glob.slice(1))
    .flatMap(compile);

  return (path) => {
    const segments = splitPathSegments(path);
    if (segments[0] === '..') return false;

    return includes.some((pattern) => matchSegments(segments, pattern)) && !excludes.some((pattern) => matchSegments(segments, pattern));
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
