import { relative, sep } from 'node:path';
import { expandBraces, isExcludePattern, normalizeGlobSegments, segmentRequestsDotMatch, segmentToRegExp } from './workspace-glob';
import { splitPathSegments } from './workspace-path';

/**
 * The option schema for a list of file globs: an array of strings, at least one entry, no duplicates. The dialect is the one `workspace-glob.ts` documents (brace expansion, `*`, `?`, `[...]`, `**` as zero or more whole segments, a wildcard never matching a dot-prefixed name, a leading `!` for an exclude), applied to file paths relative to ESLint's working directory. `readFileGlobs` is the runtime counterpart that additionally requires one include.
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
 * Validates a file-glob option value, enforcing everything `fileGlobsSchema` does plus one include: an array of non-empty strings with no duplicates, at least one of which does not start with `!` (a list of excludes alone would match nothing), and balanced braces in every pattern. Returns the same array; throws naming `optionName` and the specific failure otherwise.
 */
export function readFileGlobs(value: unknown, optionName: string): readonly string[] {
  const prefix = `@exadev/eslint-config: "${optionName}" must`;
  if (!Array.isArray(value)) throw new Error(`${prefix} be an array of glob strings.`);
  if (!value.every(isNonEmptyString)) throw new Error(`${prefix} contain only non-empty strings.`);
  if (new Set(value).size !== value.length) throw new Error(`${prefix} not contain duplicate globs.`);
  if (!value.some((item) => !isExcludePattern(item))) throw new Error(`${prefix} contain at least one glob that does not start with "!".`);
  for (const pattern of value) void expandBraces(pattern);

  return value;
}

interface WildcardSegment {
  readonly matches: (name: string) => boolean;
}

// A '**' segment is the string itself; any other segment is pre-compiled once, when the scope is created, rather than per file.
type CompiledSegment = '**' | WildcardSegment;

function compileSegment(segment: string): CompiledSegment {
  if (segment === '**') return '**';
  const pattern = segmentToRegExp(segment);
  const allowDotMatch = segmentRequestsDotMatch(segment);

  return { matches: (name) => (allowDotMatch || !name.startsWith('.')) && pattern.test(name) };
}

function compilePattern(pattern: string): readonly (readonly CompiledSegment[])[] {
  return expandBraces(pattern).map((expanded) => normalizeGlobSegments(splitPathSegments(expanded)).map(compileSegment));
}

function matchSegments(path: readonly string[], pattern: readonly CompiledSegment[]): boolean {
  const [head, ...rest] = pattern;
  const [first, ...others] = path;
  if (head === undefined) return first === undefined;
  if (head === '**') {
    // Zero segments consumed, or one real segment consumed and '**' tried again from the next; '**' never crosses a dot-prefixed segment, the same rule a single wildcard follows.
    if (matchSegments(path, rest)) return true;

    return first !== undefined && !first.startsWith('.') && matchSegments(others, pattern);
  }

  return first !== undefined && head.matches(first) && matchSegments(others, rest);
}

/**
 * Decides whether the file ESLint is linting falls inside a configured glob list. `filename` is ESLint's `context.filename` (absolute) and `cwd` its `context.cwd`; the match is on the forward-slash path relative to `cwd`, so a file outside `cwd` (a leading `..` segment) matches nothing. Patterns are the `fileGlobsSchema` dialect.
 */
export type FileScope = (filename: string, cwd: string) => boolean;

/**
 * Compiles a validated glob list into a `FileScope`: in scope means at least one include matches and no `!` exclude does. Compile once per rule `create()` (or per options object), not per file.
 */
export function createFileScope(globs: readonly string[]): FileScope {
  const includes = globs.filter((glob) => !isExcludePattern(glob)).flatMap(compilePattern);
  const excludes = globs
    .filter(isExcludePattern)
    .map((glob) => glob.slice(1))
    .flatMap(compilePattern);

  return (filename, cwd) => {
    const path = splitPathSegments(relative(cwd, filename).split(sep).join('/'));
    if (path[0] === '..') return false;

    return includes.some((pattern) => matchSegments(path, pattern)) && !excludes.some((pattern) => matchSegments(path, pattern));
  };
}
