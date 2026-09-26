import { join } from 'node:path';
import { listSubdirectories, type WorkspaceFs } from './workspace-fs';
import { splitPathSegments } from './workspace-path';

// Reimplements pnpm-workspace.yaml's own "packages:" glob dialect directly against the real directory tree, rather than via Node's fs.globSync: that API only stabilised in Node 22, below this package's own >=20 engines floor. The current pnpm CLI (verified against the installed 12.4.1 binary: it is a compiled Rust executable, not the older TypeScript CLI, and its strings hold no "fast-glob" at all) does not literally resolve these globs through the fast-glob JS library; what stays true, checked against the same binary's own embedded exclusion string, is the documented DIALECT (https://pnpm.io/pnpm-workspace_yaml) this matcher follows: brace expansion ('{core,lib}/*' is two patterns, not one literal path), a wildcard segment never matching a name starting with "." ("A '*' never matches a name beginning with a dot, so 'packages/*' skips 'packages/.cache'"), and a "./" prefix or "." / ".." segment normalising the same way path.posix.normalize would ("./packages/*" and "packages//*" select the same projects). Every "packages:" glob is a directory glob (it names where a package's own directory lives, never a file), so this matcher only ever walks real subdirectories: '**' matches zero or more whole path segments; every other segment (a bare '*', a '[...]' character class, a literal name, or a partial pattern mixing literal text with '*'/'?'/'[...]' such as 'app-*' or '[a-z]-web') is matched against one real directory name at a time via segmentToRegExp below. node_modules and bower_components are never descended into or matched, mirroring the exact two-entry exclusion list ("**/node_modules/**", "**/bower_components/**") the installed pnpm binary itself embeds: a hoisted or npm-nested node_modules, or a bower_components left over from an older tool, is real content in the tree, never a workspace package.

/** Reads `text[index]`, throwing rather than reading past the end: every call site in this file only ever derives `index` from a `for` loop whose own condition (`index < text.length`) already guarantees it in range, so an out-of-bounds read here would mean that loop's own invariant broke, not a case to handle quietly. Exported so this throw (unreachable through every real call site) can be tested directly, the same "Unreachable, tested directly rather than trusted on a comment" shape workspace-yaml.ts's own `requireLine` establishes. */
export function requireChar(text: string, index: number): string {
  const char = text[index];
  if (char === undefined) {
    throw new Error(`Unreachable: index ${String(index)} is out of bounds for a string of length ${String(text.length)}.`);
  }
  return char;
}

// Every character segmentToRegExp's own default (no wildcard, no class) branch below can still reach and must escape under this file's own 'u'-flag regexes: a lone, unescaped ']' is itself a SyntaxError there ("Lone quantifier brackets"), not merely a stylistic nicety the way it would be without 'u', since it can never open a character class of its own to begin with; '[', '*' and '?' never reach this branch at all (their own dedicated branches above handle every one, matched or not), so they are deliberately absent from this list.
const REGEXP_SPECIAL_CHARS = /[.+^${}()|\]\\]/gu;

// The FULL set of regex metacharacters, unlike REGEXP_SPECIAL_CHARS above: an escaped character (the one immediately after a glob "\\") deliberately bypasses '*'/'?'/'['s own dedicated branches, specifically so an escaped wildcard never carries its usual meaning, so it needs '*', '?' and '[' escaped here too, characters the default branch's own escape set can safely omit only because its own callers never let one of them reach it un-escaped.
const ESCAPE_ANY_REGEXP_CHAR = /[.*+?^${}()|[\]\\]/gu;

// Builds the one-segment matcher behind every non-'**' pattern segment: '*' becomes zero-or-more characters, '?' becomes exactly one, a balanced '[...]' becomes a regex character class (a leading '!' or '^' negated the glob way, translated to the single '^' regex negation understands), a backslash escapes the very next character (turning off whatever special meaning it would otherwise carry), and every other character is escaped so a literal segment (no wildcard or class at all) matches only its own exact name, same as before this function existed. Exported so its own 'u' flag (needed for the same reason deriveRank's nameRanks patterns carry one, see workspace-graph.unit.test.ts) can be asserted directly, independent of any particular directory name this module is ever exercised against.
export function segmentToRegExp(segment: string): RegExp {
  let source = '';
  for (let index = 0; index < segment.length; ) {
    const char = requireChar(segment, index);
    if (char === '\\') {
      // A trailing, unescaped backslash (nothing left in the segment to escape) is itself just a literal backslash, the same as picomatch's own behaviour for a dangling escape; otherwise the very next character is appended as a literal, regex-escaped if needed, bypassing '*'/'?'/'[' entirely so an escaped wildcard never carries its usual meaning ("\\*" matches a literal "*", not "zero or more characters").
      const next = segment[index + 1];
      if (next === undefined) {
        source += char.replace(ESCAPE_ANY_REGEXP_CHAR, '\\$&');
        index += 1;
        continue;
      }
      source += next.replace(ESCAPE_ANY_REGEXP_CHAR, '\\$&');
      index += 2;
      continue;
    }
    if (char === '*') {
      source += '.*';
      index += 1;
      continue;
    }
    if (char === '?') {
      source += '.';
      index += 1;
      continue;
    }
    if (char === '[') {
      // A '!' or '^' negation marker is consumed first, then a ']' sitting in the very next body position (right after '[', or right after that marker) is itself a literal member of the class, not its closing bracket: the same POSIX/picomatch convention that makes an empty class otherwise meaningless. Only a ']' found strictly after that leading position closes the class.
      let bodyStart = index + 1;
      const marker = segment[bodyStart];
      const negated = marker === '!' || marker === '^';
      if (negated) bodyStart += 1;
      const searchFrom = segment[bodyStart] === ']' ? bodyStart + 1 : bodyStart;
      const closeIndex = segment.indexOf(']', searchFrom);
      if (closeIndex === -1) {
        // An unmatched '[' is not a character class at all, just a literal character: escaped the same way every other non-wildcard character is, rather than left to open a regex class that never closes.
        source += '\\[';
        index += 1;
        continue;
      }
      const body = segment.slice(bodyStart, closeIndex);
      // A backslash inside the class body is escaped so it can never itself start an unintended regex escape sequence, and a literal ']' (only ever reachable here as the leading-position member the check above just admitted) is escaped too, since a 'u'-flag regex class never treats an unescaped ']' as anything other than its own close, unlike a POSIX bracket expression's leading-position exception; every other character (including a "-" range or a "^" past the first position) is passed through verbatim, since glob character classes and regex character classes otherwise share that same core syntax.
      const classBody = body.replace(/\\/gu, '\\\\').replace(/\]/gu, '\\]');
      source += `[${negated ? '^' : ''}${classBody}]`;
      index = closeIndex + 1;
      continue;
    }
    source += char.replace(REGEXP_SPECIAL_CHARS, '\\$&');
    index += 1;
  }
  return new RegExp(`^${source}$`, 'u');
}

// Whether `segment` itself explicitly opens with a literal dot, the one case a wildcard segment is still allowed to match a dot-prefixed directory name: an explicit "." in the pattern is a deliberate request, not a wildcard's own incidental sweep picking up hidden content it was never meant to see.
function segmentRequestsDotMatch(segment: string): boolean {
  return segment.startsWith('.');
}

// listSubdirectories filtered to exclude node_modules and bower_components, used at every point this file lists real directory children so a dependency's own nested node_modules or a leftover bower_components can never itself be mistaken for a workspace member, regardless of which pattern segment is doing the matching. Mirrors the installed pnpm binary's own unconditional two-entry exclusion list exactly (see this file's own header comment for how that was verified).
function listRealSubdirectories(fs: WorkspaceFs, dir: string): readonly string[] {
  return listSubdirectories(fs, dir).filter((name) => name !== 'node_modules' && name !== 'bower_components');
}

function walkPattern(fs: WorkspaceFs, root: string, segments: readonly string[], matchedSoFar: readonly string[]): string[] {
  const [segment, ...rest] = segments;
  if (segment === undefined) return [matchedSoFar.join('/')];

  const currentDir = join(root, ...matchedSoFar);

  if (segment === '**') {
    // Consuming zero segments of '**' tries the rest of the pattern from here; consuming one real directory level and trying '**' again from there covers every deeper match, exactly the recursive-doublestar shape a glob's own "zero or more" semantics require. '**' never itself opens with a literal dot, so a dot-prefixed directory is never a level '**' descends into either, the same rule a single wildcard segment follows below.
    const results = walkPattern(fs, root, rest, matchedSoFar);
    for (const child of listRealSubdirectories(fs, currentDir).filter((name) => !name.startsWith('.'))) {
      results.push(...walkPattern(fs, root, segments, [...matchedSoFar, child]));
    }
    return results;
  }

  const pattern = segmentToRegExp(segment);
  const allowDotMatch = segmentRequestsDotMatch(segment);
  const candidates = listRealSubdirectories(fs, currentDir).filter((name) => (allowDotMatch || !name.startsWith('.')) && pattern.test(name));
  const results: string[] = [];
  for (const candidate of candidates) {
    results.push(...walkPattern(fs, root, rest, [...matchedSoFar, candidate]));
  }
  return results;
}

function findMatchingBrace(pattern: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < pattern.length; index += 1) {
    const char = requireChar(pattern, index);
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

// Splits `text` on every top-level "," (one not itself nested inside a further "{...}" group), so "{a,{b,c}}" yields ["a", "{b,c}"] rather than wrongly cutting the nested group's own comma. Exported for direct testing independent of expandBraces' own real-pattern scenarios.
export function splitTopLevelAlternatives(text: string): readonly string[] {
  const alternatives: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = requireChar(text, index);
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === ',' && depth === 0) {
      alternatives.push(text.slice(start, index));
      start = index + 1;
    }
  }
  alternatives.push(text.slice(start));
  return alternatives;
}

/**
 * Expands every "\{a,b\}" brace group in `pattern` into its own separate, fully concrete pattern (the cross product of every group's own alternatives, nested groups included), matching fast-glob's own brace expansion, pnpm's underlying glob engine. A pattern with no "\{" at all expands to itself, unchanged. Exported for direct testing of the expansion itself, independent of any real directory tree.
 */
export function expandBraces(pattern: string): readonly string[] {
  const openIndex = pattern.indexOf('{');
  if (openIndex === -1) return [pattern];

  const closeIndex = findMatchingBrace(pattern, openIndex);
  if (closeIndex === -1) {
    throw new Error(
      `@exadev/eslint-config: workspace glob pattern "${pattern}" has an unmatched "{" (brace expansion). Rewrite it, or pass the "packages" rule option explicitly to bypass this pattern.`,
    );
  }

  const prefix = pattern.slice(0, openIndex);
  const suffix = pattern.slice(closeIndex + 1);
  const alternatives = splitTopLevelAlternatives(pattern.slice(openIndex + 1, closeIndex));

  const results: string[] = [];
  for (const alternative of alternatives) {
    for (const expandedAlternative of expandBraces(alternative)) {
      for (const expandedSuffix of expandBraces(suffix)) {
        results.push(prefix + expandedAlternative + expandedSuffix);
      }
    }
  }
  return results;
}

// Resolves "." and ".." segments the same way path.posix.normalize would, purely at the segment level (pnpm's own documented dialect: "a pattern may be written with a './' prefix, may contain '.' and '..' segments... './packages/*' and 'packages//*' select the same projects"). A leading segment array already has no empty entries (splitPathSegments drops those, so a repeated or trailing slash is already handled before this ever runs); this only ever needs to drop a literal '.' segment and pop the preceding real segment for a '..' one. A leading '..' with nothing to pop is kept as-is, the same as normalize's own behaviour for a path that walks above where it started: there is no ancestor segment inside the pattern itself to remove, so walking a directory literally named ".." (which will simply never exist) is the correct, if inert, result.
function normalizeGlobSegments(segments: readonly string[]): readonly string[] {
  const normalized: string[] = [];
  for (const segment of segments) {
    if (segment === '.') continue;
    if (segment === '..' && normalized.length > 0 && normalized[normalized.length - 1] !== '..') {
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  return normalized;
}

/**
 * Expands one pnpm-workspace.yaml glob pattern against the real directory tree rooted at `root`, returning every matching directory as a path relative to `root` (forward-slash-joined, no leading "./"). A pattern with a leading "!" is not itself special here: negation is a list-level concern (see resolveWorkspacePackageDirs below), so a caller wanting an exclude pattern's own matches strips the "!" before calling this. Brace groups are expanded first (a pattern can hold more than one, and each expansion can itself match several directories), so the final result is the union of every expanded pattern's own matches, deduplicated.
 */
export function expandGlob(fs: WorkspaceFs, root: string, pattern: string): readonly string[] {
  const matches = new Set<string>();
  for (const expandedPattern of expandBraces(pattern)) {
    const segments = normalizeGlobSegments(splitPathSegments(expandedPattern));
    for (const match of walkPattern(fs, root, segments, [])) {
      matches.add(match);
    }
  }
  return [...matches];
}

/** Whether `pattern` is an exclude entry in pnpm-workspace.yaml's own glob list: a leading "!", never a trailing one. Exported so this exact asymmetry (as opposed to, say, "ends with '!'") is tested directly, independent of resolveWorkspacePackageDirs' own real-filesystem scenarios below. */
export function isExcludePattern(pattern: string): boolean {
  return pattern.startsWith('!');
}

/**
 * Resolves pnpm-workspace.yaml's own package glob list (positive patterns plus "!"-prefixed excludes) against the real directory tree, returning every matching directory (relative to `root`) that also owns a real package.json. A glob match with no package.json of its own is silently not a package (an empty scaffold directory, a stray folder left behind by a rename), matching pnpm's own behaviour rather than treating it as a workspace member. A positive pattern matching NO directory at all, though, is treated differently: that is almost always a typo or a stale path (see the pnpm/pattern mismatch example this throw's own message points at), and letting it through silently would make every workspace-architecture rule quietly stop covering whatever that pattern was meant to reach, exactly the empty-result no-op resolveWorkspacePackagePatterns' own empty-pattern-list guard already exists to prevent one level up.
 */
export function resolveWorkspacePackageDirs(fs: WorkspaceFs, root: string, patterns: readonly string[]): readonly string[] {
  const includePatterns = patterns.filter((pattern) => !isExcludePattern(pattern));
  const excludePatterns = patterns.filter(isExcludePattern).map((pattern) => pattern.slice(1));

  const included = new Set<string>();
  for (const pattern of includePatterns) {
    const matches = expandGlob(fs, root, pattern);
    if (matches.length === 0) {
      throw new Error(
        `@exadev/eslint-config: the workspace "packages" glob "${pattern}" matched no directory under "${root}". Fix the pattern (a typo, a stale path, or a "./"/".."/repeated-slash form that still resolves to nothing real), or remove it if it is no longer needed: a positive glob matching nothing would otherwise silently make every workspace-architecture rule skip whatever it was meant to cover.`,
      );
    }
    for (const dir of matches) included.add(dir);
  }

  const excluded = new Set<string>();
  for (const pattern of excludePatterns) {
    for (const dir of expandGlob(fs, root, pattern)) excluded.add(dir);
  }

  return [...included].filter((dir) => !excluded.has(dir) && fs.existsSync(join(root, dir, 'package.json')));
}
