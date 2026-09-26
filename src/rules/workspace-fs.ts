import { existsSync, readFileSync, readdirSync } from 'node:fs';

// The injectable filesystem seam for every workspace-architecture module (workspace-yaml, workspace-glob, workspace-graph): pure decision logic never touches node:fs directly, only this interface, so a unit test can fabricate an in-memory tree with a plain object instead of writing real files to disk. Mirrors the ReadPackageJsonFn seam barrel-auto-detect.ts already establishes for the same "injectable in tests, defaulted in production" problem, generalised to the handful of fs operations workspace discovery needs (existence checks, reading a manifest/yaml file, and listing a directory's own entries).
export interface DirEntry {
  readonly name: string;
  readonly isDirectory: () => boolean;
}

export interface WorkspaceFs {
  readonly existsSync: (path: string) => boolean;
  readonly readFileSync: (path: string) => string;
  readonly readdirSync: (path: string) => readonly DirEntry[];
}

// The real, filesystem-backed WorkspaceFs, threaded through as the default everywhere a WorkspaceFs parameter is accepted, exactly as findNearestPackageJson is the default ReadPackageJsonFn in barrel-auto-detect.ts.
export const realWorkspaceFs: WorkspaceFs = {
  existsSync,
  readFileSync: (path) => readFileSync(path, 'utf8'),
  readdirSync: (path) => readdirSync(path, { withFileTypes: true }),
};

// A directory that does not exist yet (a group whose glob pattern has no matches at this level, or a workspace mid-restructure) lists as empty rather than throwing, the same "missing input is nothing to report, not an error" stance listDirs takes in the monorepo-template original this module supersedes.
export function listSubdirectories(fs: WorkspaceFs, dir: string): readonly string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}
