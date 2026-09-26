import { join } from 'node:path';
import { listSubdirectories, type WorkspaceFs } from './workspace-fs';
import { splitPathSegments } from './workspace-path';

// Reimplements pnpm-workspace.yaml's own "packages:" glob dialect directly against the real directory tree, rather than via Node's fs.globSync: that API only stabilised in Node 22, below this package's own >=20 engines floor. pnpm resolves these globs through fast-glob (https://pnpm.io/pnpm-workspace_yaml, "@pnpm/workspace.find-packages"), which is why this matcher follows fast-glob's own two behaviours that a naive hand-rolled globber would otherwise miss: brace expansion ('{core,lib}/*' is two patterns, not one literal path) and a wildcard segment never matching a name starting with "." (fast-glob's own default "dot: false"; pnpm's docs state this explicitly: "A '*' never matches a name beginning with a dot, so 'packages/*' skips 'packages/.cache'"). Every "packages:" glob is a directory glob (it names where a package's own directory lives, never a file), so this matcher only ever walks real subdirectories: '**' matches zero or more whole path segments; every other segment (a bare '*', a '[...]' character class, a literal name, or a partial pattern mixing literal text with '*'/'?'/'[...]' such as 'app-*' or '[a-z]-web') is matched against one real directory name at a time via segmentToRegExp below. node_modules is never descended into or matched, mirroring pnpm's own unconditional "**/node_modules/**" exclusion: a hoisted or npm-nested node_modules is real content in the tree, never a workspace package.

// Builds the one-segment matcher behind every non-'**' pattern segment: '*' becomes zero-or-more characters, '?' becomes exactly one, a balanced '[...]' becomes a regex character class (a leading '!' or '^' negated the glob way, translated to the single '^' regex negation understands), and every other character is escaped so a literal segment (no wildcard or class at all) matches only its own exact name, same as before this function existed. Exported so its own 'u' flag (needed for the same reason deriveRank's nameRanks patterns carry one, see workspace-graph.unit.test.ts) can be asserted directly, independent of any particular directory name this module is ever exercised against.
export function segmentToRegExp(segment: string): RegExp {
  let source = '';
  for (let index = 0; index < segment.length; ) {
    const char = segment.charAt(index);
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
      const closeIndex = segment.indexOf(']', index + 1);
      if (closeIndex === -1) {
        // An unmatched '[' is not a character class at all, just a literal character: escaped the same way every other non-wildcard character is, rather than left to open a regex class that never closes.
        source += '\\[';
        index += 1;
        continue;
      }
      const body = segment.slice(index + 1, closeIndex);
      const negated = body.startsWith('!') || body.startsWith('^');
      // A backslash inside the class body is escaped so it can never itself start an unintended regex escape sequence; every other character (including a "-" range or a "^" past the first position) is passed through verbatim, since glob character classes and regex character classes share that same core syntax.
      const classBody = (negated ? body.slice(1) : body).replace(/\\/gu, '\\\\');
      source += `[${negated ? '^' : ''}${classBody}]`;
      index = closeIndex + 1;
      continue;
    }
    source += char.replace(/[.+^${}()|\\]/gu, '\\$&');
    index += 1;
  }
  return new RegExp(`^${source}$`, 'u');
}

// Whether `segment` itself explicitly opens with a literal dot, the one case a wildcard segment is still allowed to match a dot-prefixed directory name: an explicit "." in the pattern is a deliberate request, not a wildcard's own incidental sweep picking up hidden content it was never meant to see.
function segmentRequestsDotMatch(segment: string): boolean {
  return segment.startsWith('.');
}

// listSubdirectories filtered to exclude node_modules, used at every point this file lists real directory children so a dependency's own nested node_modules can never itself be mistaken for a workspace member, regardless of which pattern segment is doing the matching.
function listRealSubdirectories(fs: WorkspaceFs, dir: string): readonly string[] {
  return listSubdirectories(fs, dir).filter((name) => name !== 'node_modules');
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
    const char = pattern.charAt(index);
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

// Splits `text` on every top-level "," (one not itself nested inside a further "{...}" group), so "{a,{b,c}}" yields ["a", "{b,c}"] rather than wrongly cutting the nested group's own comma.
function splitTopLevelAlternatives(text: string): readonly string[] {
  const alternatives: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
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

/**
 * Expands one pnpm-workspace.yaml glob pattern against the real directory tree rooted at `root`, returning every matching directory as a path relative to `root` (forward-slash-joined, no leading "./"). A pattern with a leading "!" is not itself special here: negation is a list-level concern (see resolveWorkspacePackageDirs below), so a caller wanting an exclude pattern's own matches strips the "!" before calling this. Brace groups are expanded first (a pattern can hold more than one, and each expansion can itself match several directories), so the final result is the union of every expanded pattern's own matches, deduplicated.
 */
export function expandGlob(fs: WorkspaceFs, root: string, pattern: string): readonly string[] {
  const matches = new Set<string>();
  for (const expandedPattern of expandBraces(pattern)) {
    for (const match of walkPattern(fs, root, splitPathSegments(expandedPattern), [])) {
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
 * Resolves pnpm-workspace.yaml's own package glob list (positive patterns plus "!"-prefixed excludes) against the real directory tree, returning every matching directory (relative to `root`) that also owns a real package.json. A glob match with no package.json of its own is silently not a package (an empty scaffold directory, a stray folder left behind by a rename), matching pnpm's own behaviour rather than treating it as a workspace member.
 */
export function resolveWorkspacePackageDirs(fs: WorkspaceFs, root: string, patterns: readonly string[]): readonly string[] {
  const includePatterns = patterns.filter((pattern) => !isExcludePattern(pattern));
  const excludePatterns = patterns.filter(isExcludePattern).map((pattern) => pattern.slice(1));

  const included = new Set<string>();
  for (const pattern of includePatterns) {
    for (const dir of expandGlob(fs, root, pattern)) included.add(dir);
  }

  const excluded = new Set<string>();
  for (const pattern of excludePatterns) {
    for (const dir of expandGlob(fs, root, pattern)) excluded.add(dir);
  }

  return [...included].filter((dir) => !excluded.has(dir) && fs.existsSync(join(root, dir, 'package.json')));
}
