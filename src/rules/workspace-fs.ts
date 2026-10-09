import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * The injectable filesystem seam for every workspace-architecture module (workspace-yaml, workspace-glob, workspace-graph): pure decision logic never touches node:fs directly, only this interface, so a unit test can fabricate an in-memory tree with a plain object instead of writing real files to disk. Mirrors the ReadPackageJsonFn seam barrel-auto-detect.ts already establishes for the same "injectable in tests, defaulted in production" problem, generalised to the handful of fs operations workspace discovery needs (existence checks, reading a manifest/yaml file, and listing a directory's own entries).
 */
export interface DirEntry {
  readonly name: string;
  readonly isDirectory: () => boolean;
}

export interface WorkspaceFs {
  readonly existsSync: (path: string) => boolean;
  readonly readFileSync: (path: string) => string;
  readonly readdirSync: (path: string) => readonly DirEntry[];
  // Resolves a path through every symlink along it to its one canonical spelling, exactly as node:fs's own realpathSync does. manifestRelativeDir (workspace-graph.ts) is the one caller: two lexically different paths (a workspace root given by realpath, ESLint's own context.filename reached through a symlinked cwd, a macOS /tmp vs /private/tmp being the recurring real case) can name the identical real directory, and only realpath resolution can tell the two spellings apart from a genuinely different directory.
  readonly realpathSync: (path: string) => string;
}

/**
 * The real, filesystem-backed WorkspaceFs, threaded through as the default everywhere a WorkspaceFs parameter is accepted, exactly as findNearestPackageJson is the default ReadPackageJsonFn in barrel-auto-detect.ts.
 */
export const realWorkspaceFs: WorkspaceFs = {
  existsSync,
  readFileSync: (path) => readFileSync(path, 'utf8'),
  readdirSync: (path) => readdirSync(path, { withFileTypes: true }),
  realpathSync: (path) => realpathSync(path),
};

/**
 * A directory that does not exist yet (a group whose glob pattern has no matches at this level, or a workspace mid-restructure) lists as empty rather than throwing, the same "missing input is nothing to report, not an error" stance listDirs takes in the monorepo-template original this module supersedes.
 */
export function listSubdirectories(fs: WorkspaceFs, dir: string): readonly string[] {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

// The error codes that mean a path cannot be listed as a directory: it is a file (ENOTDIR) or the process may not read it (EACCES, EPERM). The one definition of them, shared by every listing that treats such a path as empty.
const UNLISTABLE_CODES: ReadonlySet<string> = new Set(['ENOTDIR', 'EACCES', 'EPERM']);

/**
 * The entries of `dir`, or none when it cannot be listed as a directory because it is a file or the process may not read it. Absence of a directory is a legitimate branch for every caller: a repository may have a file where a layout directory could be, and ESLint lints nothing in a directory it may not read, so there is nothing to find there. Any other error (an I/O failure, say) propagates.
 */
export function listEntriesOrEmpty(fs: WorkspaceFs, dir: string): readonly DirEntry[] {
  try {
    return fs.readdirSync(dir);
  } catch (error) {
    if (error instanceof Error && 'code' in error && typeof error.code === 'string' && UNLISTABLE_CODES.has(error.code)) return [];
    throw error;
  }
}

// Whether `path` is a symbolic link, directly or through further links, to a directory: its fully resolved path is listed as a directory by its own parent. A dangling link has no target to resolve and is not one.
function isLinkToDirectory(fs: WorkspaceFs, path: string): boolean {
  if (!fs.existsSync(path)) return false;
  const target = fs.realpathSync(path);

  return listEntriesOrEmpty(fs, dirname(target)).some((entry) => entry.name === basename(target) && entry.isDirectory());
}

/**
 * The names of the subdirectories of `dir`, counting a symbolic link to a directory as one, with the same missing-directory-lists-as-empty stance as listSubdirectories. `listSubdirectories` leaves links out because a recursive walk (workspace globs, the SKILL.md scan) must never follow one into a cycle; this is for a one-level listing of a directory whose entries a repository may legitimately link in from elsewhere (a plugin or a skill kept outside the tree that publishes it).
 */
export function listSubdirectoriesThroughLinks(fs: WorkspaceFs, dir: string): readonly string[] {
  if (!fs.existsSync(dir)) return [];

  return listEntriesOrEmpty(fs, dir)
    .filter((entry) => entry.isDirectory() || isLinkToDirectory(fs, join(dir, entry.name)))
    .map((entry) => entry.name);
}

/**
 * Every entry name (file or directory) in `dir`, with the same missing-directory-lists-as-empty stance as listSubdirectories.
 */
export function listEntryNames(fs: WorkspaceFs, dir: string): readonly string[] {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir).map((entry) => entry.name);
}

/**
 * The names of the files directly inside `dir` (directories left out), with the same missing-directory-lists-as-empty stance as listSubdirectories.
 */
export function listFileNames(fs: WorkspaceFs, dir: string): readonly string[] {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((entry) => !entry.isDirectory())
    .map((entry) => entry.name);
}
