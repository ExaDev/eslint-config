import { join } from 'node:path';
import { isRecord } from '../is-record';
import { parseJsonc } from './jsonc';
import type { WorkspaceFs } from './workspace-fs';
import { resolveWorkspacePackageDirs } from './workspace-glob';
import { readWorkspacePackages } from './workspace-yaml';

/** A package of a turbo repository, reduced to what the task and script cross-checks read. */
export interface TurboPackage {
  // Relative to the repository root with forward slashes; the empty string for the root package.
  readonly dir: string;
  readonly name: string | undefined;
  // Only the scripts whose value is a string.
  readonly scripts: ReadonlyMap<string, string>;
}

function readManifest(fs: WorkspaceFs, dir: string): Record<string, unknown> | undefined {
  const path = join(dir, 'package.json');
  if (!fs.existsSync(path)) return undefined;
  const manifest = parseJsonc(fs.readFileSync(path), path);

  return isRecord(manifest) ? manifest : undefined;
}

function toPackage(dir: string, manifest: Record<string, unknown> | undefined): TurboPackage {
  const { name, scripts } = manifest ?? {};
  const commands = new Map<string, string>();
  if (isRecord(scripts)) {
    for (const [script, command] of Object.entries(scripts)) {
      if (typeof command === 'string') commands.set(script, command);
    }
  }

  return { dir, name: typeof name === 'string' ? name : undefined, scripts: commands };
}

// npm, Yarn and Bun declare workspaces in package.json, either as a list or as an object whose `packages` is the list.
function manifestWorkspaces(manifest: Record<string, unknown> | undefined): readonly string[] {
  const workspaces = manifest?.['workspaces'];
  const list = isRecord(workspaces) ? workspaces['packages'] : workspaces;

  return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
}

function workspacePatterns(fs: WorkspaceFs, root: string, rootManifest: Record<string, unknown> | undefined): readonly string[] {
  const yamlPath = join(root, 'pnpm-workspace.yaml');

  return fs.existsSync(yamlPath) ? readWorkspacePackages(fs.readFileSync(yamlPath)) : manifestWorkspaces(rootManifest);
}

/**
 * Whether `dir` is a workspace root: it holds a `pnpm-workspace.yaml`, or a `package.json` whose `workspaces` field lists at least one pattern.
 */
export function isWorkspaceRoot(fs: WorkspaceFs, dir: string): boolean {
  return fs.existsSync(join(dir, 'pnpm-workspace.yaml')) || manifestWorkspaces(readManifest(fs, dir)).length > 0;
}

/**
 * The directories, relative to `root`, of the workspace members: those matched by `packagesOption` when given, otherwise by `pnpm-workspace.yaml`'s `packages`, otherwise by the `workspaces` field of the root `package.json`. A repository declaring none is a single package and has no members. A matched directory without a `package.json` is not a member, and the root itself never is.
 */
export function workspaceMemberDirs(fs: WorkspaceFs, root: string, packagesOption: readonly string[] | undefined): readonly string[] {
  const patterns = packagesOption ?? workspacePatterns(fs, root, readManifest(fs, root));

  return resolveWorkspacePackageDirs(fs, root, patterns).filter((dir) => dir !== '');
}

/** The root package and the workspace members of a turbo repository. */
export interface TurboPackages {
  readonly root: TurboPackage;
  readonly members: readonly TurboPackage[];
}

/**
 * Reads the root package and every workspace member (see `workspaceMemberDirs`) of the repository at `root`. A manifest that is not valid JSON throws, naming its path.
 */
export function listTurboPackages(fs: WorkspaceFs, root: string, packagesOption: readonly string[] | undefined): TurboPackages {
  return {
    root: toPackage('', readManifest(fs, root)),
    members: workspaceMemberDirs(fs, root, packagesOption).map((dir) => toPackage(dir, readManifest(fs, join(root, dir)))),
  };
}
