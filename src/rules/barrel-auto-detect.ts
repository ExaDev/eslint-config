import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isRecord } from '../is-record';

// Resolves the umbrella rule's 'auto' mode: a package that looks like a real, importable entry point (a non-empty `exports` or `main` field) gets 'single' — it needs a barrel at its own entry point — everything else gets 'banned', identical to today's hardcoded default. `private: true` is deliberately not consulted: a pnpm workspace package is routinely both `private` (never published to a registry) and a genuine import target for sibling packages via `exports` (that's what `linkWorkspacePackages` is for), so `private` says nothing about whether a barrel is warranted.

// A present-but-empty `exports` (`{}`, `[]`, `''`) declares no real entry point — treated the same as absent, matching the parallel `main: ''` case decideAutoBarrelMode already has to handle.
function hasRealExports(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;

  return isRecord(value) && Object.keys(value).length > 0;
}

export function decideAutoBarrelMode(packageJson: Record<string, unknown>): 'banned' | 'single' {
  const hasExports = hasRealExports(packageJson['exports']);
  const main = packageJson['main'];
  const hasMain = typeof main === 'string' && main.length > 0;

  return hasExports || hasMain ? 'single' : 'banned';
}

export type ReadPackageJsonFn = (startDir: string) => Record<string, unknown> | undefined;

/**
 * Resolves the directory of the package a file belongs to: the nearest ancestor of `startDir` (inclusive) that holds a `package.json`, or `undefined` when no ancestor does. barrel-policy matches its `entries` globs against a file's path relative to this directory.
 */
export type FindPackageRootFn = (startDir: string) => string | undefined;

// Both caches are keyed by the directory the walk started from, not the package.json it eventually found: every file under the same package's src/** starts its own walk from a different directory but ends at the identical manifest, so caching by start directory still collapses the common case (many files, one package) without needing to track which starting directories share a destination. `undefined` is a genuine cached outcome in each (no ancestor package.json at all; and, for the manifest cache, also an ancestor package.json that parses to something other than a usable JSON object, an array, a string or null), so presence is checked with `has`, not a nullish read.
const packageRootByStartDir = new Map<string, string | undefined>();
const packageJsonByStartDir = new Map<string, Record<string, unknown> | undefined>();

/**
 * The real, filesystem-backed FindPackageRootFn: walks upward from startDir to the nearest directory holding a package.json (startDir itself included) and returns that directory, or undefined once the walk reaches the filesystem root with nothing found. Only the file's existence is checked, so a manifest that does not parse still marks its directory as the package root.
 */
export function findNearestPackageRoot(startDir: string): string | undefined {
  const cached = packageRootByStartDir.get(startDir);
  if (packageRootByStartDir.has(startDir)) return cached;

  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) {
      packageRootByStartDir.set(startDir, dir);

      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      packageRootByStartDir.set(startDir, undefined);

      return undefined;
    }
    dir = parent;
  }
}

/**
 * The real, filesystem-backed ReadPackageJsonFn: finds the nearest ancestor package.json through findNearestPackageRoot (startDir itself included), parses it, and returns undefined when there is none. A found manifest that is not a usable JSON object (isRecord rejects an array as well as a string, number, boolean or null) collapses to the same undefined, matching workspace-graph.ts's identical readDeclaredManifest: this rule has nothing to read `exports`/`main` off an array-shaped or scalar manifest any more than off a wholly absent one, so the two are indistinguishable to decideAutoBarrelMode's caller. This is the production default threaded through resolveAutoMode/createBarrelPolicyRule below; tests inject a stub instead so they never touch the real filesystem.
 */
export function findNearestPackageJson(startDir: string): Record<string, unknown> | undefined {
  const cached = packageJsonByStartDir.get(startDir);
  if (packageJsonByStartDir.has(startDir)) return cached;

  const root = findNearestPackageRoot(startDir);
  const parsed: unknown = root === undefined ? undefined : JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const result = isRecord(parsed) ? parsed : undefined;
  packageJsonByStartDir.set(startDir, result);

  return result;
}

/**
 * filename is a file path (e.g. context.filename); the walk starts from its containing directory, not from filename itself. No ancestor package.json (a file outside any real package) resolves to 'banned' — the same conservative default as a package with neither exports nor main.
 */
export function resolveAutoMode(filename: string, readPackageJsonFn: ReadPackageJsonFn = findNearestPackageJson): 'banned' | 'single' {
  const packageJson = readPackageJsonFn(dirname(filename));

  return packageJson === undefined ? 'banned' : decideAutoBarrelMode(packageJson);
}
