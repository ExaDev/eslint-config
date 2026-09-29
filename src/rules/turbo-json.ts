import { dirname, join, resolve } from 'node:path';
import { isRecord } from '../is-record';
import { parseJsonc } from './jsonc';
import { isWorkspaceRoot } from './turbo-workspace';
import type { WorkspaceFs } from './workspace-fs';

/** The file name turbo reads its configuration from, at the workspace root and, extending it, inside a package. */
export const TURBO_JSON = 'turbo.json';

/** Prefix of a task key that runs a script of the root package (`//#lint:root`), which turbo otherwise excludes from a task named without it. */
export const ROOT_TASK_PREFIX = '//#';

/**
 * The parts of one `tasks` entry the turbo rules read. `keys` lists every key the entry defines, so a task that only wires other tasks together can be told from one that configures work.
 */
export interface TurboTask {
  readonly dependsOn: readonly string[];
  readonly with: readonly string[];
  // Undefined when the entry does not set it, which turbo reads as its default (cache on, not persistent).
  readonly cache: boolean | undefined;
  readonly persistent: boolean | undefined;
  readonly hasOutputs: boolean;
  readonly keys: readonly string[];
}

/**
 * The parts of a `turbo.json` the turbo rules read. `extends` is undefined for a root configuration, which is what tells it from a package configuration; `tags` is empty when the file declares none.
 */
export interface TurboJson {
  readonly extends: readonly string[] | undefined;
  readonly hasBoundaries: boolean;
  readonly tags: readonly string[];
  readonly tasks: ReadonlyMap<string, TurboTask>;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter(isString) : [];
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readTask(value: unknown): TurboTask {
  const entry = isRecord(value) ? value : {};

  return {
    dependsOn: stringArray(entry['dependsOn']),
    with: stringArray(entry['with']),
    cache: optionalBoolean(entry['cache']),
    persistent: optionalBoolean(entry['persistent']),
    hasOutputs: 'outputs' in entry,
    keys: Object.keys(entry),
  };
}

/**
 * Reads the parts of a parsed `turbo.json` the turbo rules need. Anything the file gets wrong (a `tasks` that is not an object, a `dependsOn` that is not a list of strings) reads as absent: turbo's own schema is what reports a malformed configuration, not these rules.
 */
export function readTurboJson(value: unknown): TurboJson {
  const config = isRecord(value) ? value : {};
  const tasks = new Map<string, TurboTask>();
  if (isRecord(config['tasks'])) {
    for (const [key, entry] of Object.entries(config['tasks'])) tasks.set(key, readTask(entry));
  }

  return {
    extends: 'extends' in config ? stringArray(config['extends']) : undefined,
    hasBoundaries: isRecord(config['boundaries']),
    tags: stringArray(config['tags']),
    tasks,
  };
}

/**
 * The `turbo.json` in `dir`, or undefined when there is none. A file that exists but is not valid JSONC throws, naming its path.
 */
export function readTurboJsonAt(fs: WorkspaceFs, dir: string): TurboJson | undefined {
  const path = join(dir, TURBO_JSON);
  if (!fs.existsSync(path)) return undefined;

  return readTurboJson(parseJsonc(fs.readFileSync(path), path));
}

/** A repository's root turbo configuration and the directory it sits in. */
export interface TurboRoot {
  readonly dir: string;
  readonly turbo: TurboJson;
}

// The directories from `startDir` up to the filesystem root, nearest first.
function ancestorDirs(startDir: string): readonly string[] {
  const dirs: string[] = [];
  for (let dir = resolve(startDir); !dirs.includes(dir); dir = dirname(dir)) dirs.push(dir);

  return dirs;
}

/**
 * The root turbo configuration governing `startDir`: the `turbo.json` in `rootOption` when that is given, otherwise the nearest one at or above `startDir` that does not `extends` another (a package configuration always does) and sits in a workspace root, falling back to the nearest that does not `extends` another for a repository with no workspace. Preferring the workspace root keeps a package whose own turbo.json forgot `extends` from being mistaken for a root. Undefined when there is none, which means the directory is not part of a turbo repository and every turbo rule has nothing to check.
 */
export function findTurboRoot(fs: WorkspaceFs, startDir: string, rootOption: string | undefined): TurboRoot | undefined {
  if (rootOption !== undefined) {
    const dir = resolve(rootOption);
    const turbo = readTurboJsonAt(fs, dir);

    return turbo === undefined ? undefined : { dir, turbo };
  }

  const candidates = ancestorDirs(startDir).flatMap((dir) => {
    const turbo = readTurboJsonAt(fs, dir);

    return turbo === undefined || turbo.extends !== undefined ? [] : [{ dir, turbo }];
  });

  return candidates.find((candidate) => isWorkspaceRoot(fs, candidate.dir)) ?? candidates[0];
}

/**
 * The task name in `key` without its package qualifier: `lint` for `lint`, `//#lint` and `web#lint`.
 */
export function baseTaskName(key: string): string {
  return key.slice(key.lastIndexOf('#') + 1);
}

/**
 * Whether the task defines nothing beyond its `dependsOn` and `description`, so it exists only to wire other tasks together and has no work of its own to cache.
 */
export function isGraphOnly(task: TurboTask): boolean {
  return task.dependsOn.length > 0 && task.keys.every((key) => key === 'dependsOn' || key === 'description');
}

/**
 * A package task laid over the root task it extends: a key the package entry sets replaces the root's, and any other key is inherited, which is how turbo merges the two. With no root task the package task stands alone.
 */
export function mergeTask(base: TurboTask | undefined, override: TurboTask): TurboTask {
  if (base === undefined) return override;

  return {
    dependsOn: override.keys.includes('dependsOn') ? override.dependsOn : base.dependsOn,
    with: override.keys.includes('with') ? override.with : base.with,
    cache: override.cache ?? base.cache,
    persistent: override.persistent ?? base.persistent,
    hasOutputs: override.hasOutputs || base.hasOutputs,
    keys: [...new Set([...base.keys, ...override.keys])],
  };
}

/** The package qualifier turbo gives the root package in a task key (`//#lint`). */
export const ROOT_PACKAGE_QUALIFIER = '//';

/**
 * The task entry turbo applies to script `script` of a package. The package's `qualifier` (`//` for the root package, its declared name otherwise, undefined for a package with no name) selects `qualifier#script` first, then the unqualified `script`; a non-root package's own `turbo.json` is laid over whichever of those exists. Undefined when nothing configures the script.
 */
export function resolveScriptTask(input: Readonly<{ script: string; root: TurboJson; qualifier: string | undefined; own: TurboJson | undefined }>): TurboTask | undefined {
  const { script, root, qualifier, own } = input;
  const qualified = qualifier === undefined ? undefined : root.tasks.get(`${qualifier}#${script}`);
  const base = qualified ?? root.tasks.get(script);
  const local = own?.tasks.get(script);

  return local === undefined ? base : mergeTask(base, local);
}
