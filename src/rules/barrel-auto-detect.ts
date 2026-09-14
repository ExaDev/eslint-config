import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Resolves the umbrella rule's 'auto' mode: a package that looks like a real, importable entry point (a non-empty `exports` or `main` field) gets 'single' — it needs a barrel at its own entry point — everything else gets 'banned', identical to today's hardcoded default. `private: true` is deliberately not consulted: a pnpm workspace package is routinely both `private` (never published to a registry) and a genuine import target for sibling packages via `exports` (that's what `linkWorkspacePackages` is for), so `private` says nothing about whether a barrel is warranted.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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

// Keyed by the directory the walk started from, not the package.json it eventually found — every file under the same package's src/** starts its own walk from a different directory but ends at the identical manifest, so caching by start directory still collapses the common case (many files, one package) without needing to track which starting directories share a destination. `undefined` is a genuine cached outcome (no ancestor package.json at all), so presence is checked with `has`, not a nullish read.
const packageJsonByStartDir = new Map<string, Record<string, unknown> | undefined>();

// The real, filesystem-backed ReadPackageJsonFn: walks upward from startDir to the nearest ancestor package.json (inclusive of startDir itself), parses it, and returns undefined once the walk reaches the filesystem root with nothing found. This is the production default threaded through resolveAutoMode/createBarrelPolicyRule below; tests inject a stub instead so they never touch the real filesystem.
export function findNearestPackageJson(startDir: string): Record<string, unknown> | undefined {
  const cached = packageJsonByStartDir.get(startDir);
  if (packageJsonByStartDir.has(startDir)) return cached;

  let dir = startDir;
  for (;;) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      const parsed: unknown = JSON.parse(readFileSync(candidate, 'utf8'));
      const result = isRecord(parsed) ? parsed : undefined;
      packageJsonByStartDir.set(startDir, result);
      return result;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      packageJsonByStartDir.set(startDir, undefined);
      return undefined;
    }
    dir = parent;
  }
}

// filename is a file path (e.g. context.filename); the walk starts from its containing directory, not from filename itself. No ancestor package.json (a file outside any real package) resolves to 'banned' — the same conservative default as a package with neither exports nor main.
export function resolveAutoMode(filename: string, readPackageJsonFn: ReadPackageJsonFn = findNearestPackageJson): 'banned' | 'single' {
  const packageJson = readPackageJsonFn(dirname(filename));
  return packageJson === undefined ? 'banned' : decideAutoBarrelMode(packageJson);
}
