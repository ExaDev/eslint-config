import { dirname, relative, resolve, sep } from 'node:path';
import type { MemberNode, ObjectNode } from '@humanwhocodes/momoa';
import { getMemberKeyName } from './json-member-key';
import { findTurboRoot, readTurboJsonAt, ROOT_PACKAGE_QUALIFIER, type TurboJson, type TurboRoot, type TurboTask } from './turbo-json';
import { readDeclaredName } from './workspace-json-helpers';
import type { WorkspaceFs } from './workspace-fs';

/**
 * The test seam every turbo rule's factory accepts: the filesystem the rule reads sibling and ancestor files through, defaulting to the real one.
 */
export interface TurboRuleDeps {
  readonly fs?: WorkspaceFs;
}

/** A `package.json` being linted, placed within the turbo repository it belongs to. */
export interface LintedTurboPackage {
  readonly root: TurboRoot;
  // Absolute directory of the linted package.json.
  readonly dir: string;
  readonly isRoot: boolean;
  readonly name: string | undefined;
  // The package qualifier turbo gives this package in a task key: `//` for the root package, its declared name otherwise, undefined for a package with no name.
  readonly qualifier: string | undefined;
  // The package's own turbo.json, which extends the root configuration; undefined for the root package and for a package without one.
  readonly own: TurboJson | undefined;
}

/**
 * Places the manifest at `filename` (ESLint's `context.filename`) in its turbo repository: the root configuration governing it, whether it is the root package, and its own `turbo.json`. Undefined when the manifest belongs to no turbo repository (no root configuration at or above it, or one given by `rootOption` that does not contain it), in which case every turbo rule has nothing to check.
 */
export function readLintedTurboPackage(input: Readonly<{ fs: WorkspaceFs; filename: string; manifest: ObjectNode; rootOption: string | undefined }>): LintedTurboPackage | undefined {
  const { fs, filename, manifest, rootOption } = input;
  const dir = dirname(resolve(filename));
  const root = findTurboRoot(fs, dir, rootOption);
  if (root === undefined || relative(root.dir, dir).split(sep)[0] === '..') return undefined;
  const isRoot = dir === root.dir;
  const name = readDeclaredName(manifest)?.name;

  return { root, dir, isRoot, name, qualifier: isRoot ? ROOT_PACKAGE_QUALIFIER : name, own: isRoot ? undefined : readTurboJsonAt(fs, dir) };
}

/** One entry of a `turbo.json` document's `tasks` object: its key, the member node a diagnostic lands on, and the parsed task. */
export interface TaskEntry {
  readonly key: string;
  readonly member: MemberNode;
  readonly task: TurboTask;
}

/**
 * The entries of a `turbo.json` document's `tasks` object, each pairing the member node with the task parsed from the same text (`tasks`, from `readTurboJson`). Empty when the file has no `tasks` object. Throws when a member has no parsed task, which cannot happen for tasks read from the same text; exported so that throw is tested directly.
 */
export function readTaskEntries(rootObject: ObjectNode, tasks: ReadonlyMap<string, TurboTask>): readonly TaskEntry[] {
  const tasksMember = rootObject.members.find((member) => getMemberKeyName(member) === 'tasks');
  if (tasksMember?.value.type !== 'Object') return [];

  return tasksMember.value.members.map((member) => {
    const key = getMemberKeyName(member);
    const task = tasks.get(key);
    if (task === undefined) throw new Error(`Unreachable: task "${key}" is in this document but was not parsed from it.`);

    return { key, member, task };
  });
}
