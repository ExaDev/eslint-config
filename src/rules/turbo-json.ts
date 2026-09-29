import { dirname, join, resolve } from 'node:path';
import { isRecord } from '../is-record';
import { parseJsonc } from './jsonc';
import { isWorkspaceRoot } from './turbo-workspace';
import type { WorkspaceFs } from './workspace-fs';

/** The file name turbo reads its configuration from, at the workspace root and, extending it, inside a package. */
export const TURBO_JSON = 'turbo.json';

/** Prefix of a task key that runs a script of the root package (`//#lint:root`), which turbo otherwise excludes from a task named without it. */
export const ROOT_TASK_PREFIX = '//#';

/** In a package's `turbo.json`, an array entry that keeps the root task's entries and adds the others after them, instead of replacing the array. */
export const TURBO_EXTENDS = '$TURBO_EXTENDS$';

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
  // Undefined when the entry does not set it, which turbo reads as the package's own files (`$TURBO_DEFAULT$`).
  readonly inputs: readonly string[] | undefined;
  readonly keys: readonly string[];
}

/**
 * The parts of a `turbo.json` the turbo rules read. `extends` is undefined for a root configuration, which is what tells it from a package configuration; `tags` is empty when the file declares none.
 */
export interface TurboJson {
  readonly extends: readonly string[] | undefined;
  // Undefined when the file has no `$schema`.
  readonly schema: string | undefined;
  readonly globalDependencies: readonly string[];
  // Undefined when the file sets no `globalPassThroughEnv` (or sets it to null, which turbo's schema allows).
  readonly globalPassThroughEnv: readonly string[] | undefined;
  readonly hasBoundaries: boolean;
  readonly tags: readonly string[];
  readonly tasks: ReadonlyMap<string, TurboTask>;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function malformed(source: string, at: string, expected: string): never {
  throw new Error(`@exadev/eslint-config: ${source}: ${at} must be ${expected}.`);
}

function stringArray(value: unknown, source: string, at: string): readonly string[] {
  if (!Array.isArray(value) || !value.every(isString)) malformed(source, at, 'an array of strings');

  return value;
}

function optionalBoolean(value: unknown, source: string, at: string): boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') malformed(source, at, 'a boolean');

  return value;
}

// Turbo's schema types `outputs` as an array or null; null declares nothing, the same as leaving the key out.
function declaresOutputs(value: unknown, source: string, at: string): boolean {
  if (value !== undefined && value !== null && !Array.isArray(value)) malformed(source, at, 'an array or null');

  return Array.isArray(value);
}

function readTask(value: unknown, source: string, key: string): TurboTask {
  const at = `task "${key}"`;
  if (!isRecord(value)) malformed(source, at, 'an object');

  return {
    dependsOn: 'dependsOn' in value ? stringArray(value['dependsOn'], source, `"dependsOn" of ${at}`) : [],
    with: 'with' in value ? stringArray(value['with'], source, `"with" of ${at}`) : [],
    cache: optionalBoolean(value['cache'], source, `"cache" of ${at}`),
    persistent: optionalBoolean(value['persistent'], source, `"persistent" of ${at}`),
    hasOutputs: declaresOutputs(value['outputs'], source, `"outputs" of ${at}`),
    inputs: 'inputs' in value ? stringArray(value['inputs'], source, `"inputs" of ${at}`) : undefined,
    keys: Object.keys(value),
  };
}

/**
 * Reads the parts of a parsed `turbo.json` the turbo rules need. `source` names the file in the error thrown when a value the rules read has the wrong type (a `tasks` that is not an object, a `dependsOn` that is not a list of strings): reading it as absent would make the task look unimplemented or graph-only with no hint of the real cause, so the malformed value is reported where it is. `boundaries` is the exception: whether it is an object is exactly what `turbo-boundaries-config` judges, so any other value reads as absent.
 */
export function readTurboJson(value: unknown, source: string): TurboJson {
  if (!isRecord(value)) malformed(source, 'the configuration', 'an object');
  const tasks = new Map<string, TurboTask>();
  if ('tasks' in value) {
    if (!isRecord(value['tasks'])) malformed(source, '"tasks"', 'an object');
    for (const [key, entry] of Object.entries(value['tasks'])) tasks.set(key, readTask(entry, source, key));
  }

  const passThrough = value['globalPassThroughEnv'];
  const schema = value['$schema'];
  if (schema !== undefined && typeof schema !== 'string') malformed(source, '"$schema"', 'a string');

  return {
    extends: 'extends' in value ? stringArray(value['extends'], source, '"extends"') : undefined,
    schema,
    globalDependencies: 'globalDependencies' in value ? stringArray(value['globalDependencies'], source, '"globalDependencies"') : [],
    globalPassThroughEnv: passThrough === undefined || passThrough === null ? undefined : stringArray(passThrough, source, '"globalPassThroughEnv"'),
    hasBoundaries: isRecord(value['boundaries']),
    tags: 'tags' in value ? stringArray(value['tags'], source, '"tags"') : [],
    tasks,
  };
}

/**
 * The `turbo.json` in `dir`, or undefined when there is none. A file that exists but is not valid JSONC throws, naming its path.
 */
export function readTurboJsonAt(fs: WorkspaceFs, dir: string): TurboJson | undefined {
  const path = join(dir, TURBO_JSON);
  if (!fs.existsSync(path)) return undefined;

  return readTurboJson(parseJsonc(fs.readFileSync(path), path), path);
}

/** A repository's root turbo configuration and the directory it sits in. */
export interface TurboRoot {
  readonly dir: string;
  readonly turbo: TurboJson;
}

// `dir` and each directory above it up to the filesystem root, nearest first.
function ancestorDirs(dir: string): readonly string[] {
  const parent = dirname(dir);

  return parent === dir ? [dir] : [dir, ...ancestorDirs(parent)];
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

  const candidates = ancestorDirs(resolve(startDir)).flatMap((dir) => {
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

// An array the package entry sets replaces the root's, unless it lists `$TURBO_EXTENDS$`, which stands for the root's entries (verified with `turbo run --dry=json` against turbo 2.10.8).
function mergeList(base: readonly string[], override: readonly string[]): readonly string[] {
  if (!override.includes(TURBO_EXTENDS)) return override;

  return [...base, ...override.filter((entry) => entry !== TURBO_EXTENDS)];
}

/**
 * A package task laid over the root task it extends: a key the package entry sets replaces the root's (an array key that lists `$TURBO_EXTENDS$` keeps the root's entries and adds the others), and any other key is inherited, which is how turbo merges the two. With no root task the package task stands alone.
 */
export function mergeTask(base: TurboTask | undefined, override: TurboTask): TurboTask {
  if (base === undefined) return override;

  return {
    dependsOn: override.keys.includes('dependsOn') ? mergeList(base.dependsOn, override.dependsOn) : base.dependsOn,
    with: override.keys.includes('with') ? mergeList(base.with, override.with) : base.with,
    cache: override.cache ?? base.cache,
    persistent: override.persistent ?? base.persistent,
    hasOutputs: override.hasOutputs || base.hasOutputs,
    inputs: override.inputs === undefined ? base.inputs : mergeList(base.inputs ?? [], override.inputs),
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
