import { join } from 'node:path';
import { listSubdirectories, type WorkspaceFs } from './workspace-fs';
import { splitPathSegments } from './workspace-path';

// pnpm-workspace.yaml's own glob dialect, reimplemented directly against the real directory tree rather than via Node's fs.globSync: that API only stabilised in Node 22, below this package's own >=20 engines floor. Every "packages:" glob is a directory glob (it names where a package's own directory lives, never a file), so this matcher only ever walks real subdirectories: '*' matches exactly one path segment, '**' matches zero or more segments, and a literal segment matches only itself.

function walkPattern(fs: WorkspaceFs, root: string, segments: readonly string[], matchedSoFar: readonly string[]): string[] {
  const [segment, ...rest] = segments;
  if (segment === undefined) return [matchedSoFar.join('/')];

  const currentDir = join(root, ...matchedSoFar);

  if (segment === '**') {
    // Consuming zero segments of '**' tries the rest of the pattern from here; consuming one real directory level and trying '**' again from there covers every deeper match, exactly the recursive-doublestar shape a glob's own "zero or more" semantics require.
    const results = walkPattern(fs, root, rest, matchedSoFar);
    for (const child of listSubdirectories(fs, currentDir)) {
      results.push(...walkPattern(fs, root, segments, [...matchedSoFar, child]));
    }
    return results;
  }

  const candidates = segment === '*' ? listSubdirectories(fs, currentDir) : listSubdirectories(fs, currentDir).filter((name) => name === segment);
  const results: string[] = [];
  for (const candidate of candidates) {
    results.push(...walkPattern(fs, root, rest, [...matchedSoFar, candidate]));
  }
  return results;
}

/**
 * Expands one pnpm-workspace.yaml glob pattern against the real directory tree rooted at `root`, returning every matching directory as a path relative to `root` (forward-slash-joined, no leading "./"). A pattern with a leading "!" is not itself special here: negation is a list-level concern (see resolveWorkspacePackageDirs below), so a caller wanting an exclude pattern's own matches strips the "!" before calling this.
 */
export function expandGlob(fs: WorkspaceFs, root: string, pattern: string): readonly string[] {
  return walkPattern(fs, root, splitPathSegments(pattern), []);
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
