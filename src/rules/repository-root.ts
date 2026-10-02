import { dirname, join } from 'node:path';
import { isWorkspaceRoot } from './turbo-workspace';
import type { WorkspaceFs } from './workspace-fs';

/**
 * The repository root a directory belongs to: the nearest ancestor of `dir` (or `dir` itself) that is a workspace root (a `pnpm-workspace.yaml`, or a `package.json` listing `workspaces`) or holds a `.git` entry (a directory, or the file a linked worktree has). A tree with neither marker is rooted where ESLint runs, `cwd`, since nothing structural says otherwise. Independent of `cwd` whenever a marker exists, so a package linted from inside its own directory (as turbo runs a `_lint` script) is still known not to be the root.
 */
export function findRepositoryRoot(fs: WorkspaceFs, dir: string, cwd: string): string {
  let current = dir;
  for (;;) {
    if (isWorkspaceRoot(fs, current) || fs.existsSync(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return cwd;
    current = parent;
  }
}
