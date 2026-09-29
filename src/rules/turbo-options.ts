// The one options shape shared by the turbo rules, so a consumer configures turbo once and passes the identical object to each rule (or once to turboConfig(), which wires them all). Every rule reads only the fields it needs and ignores the rest. Each field is validated here, at the option boundary, so a malformed entry fails loudly and names the option. The README's "Turbo" section carries the reasoning; this file is the schema and the runtime reader, not the policy.

import { isRecord } from '../is-record';
import { fileGlobsSchema, readFileGlobs } from './file-scope';
import { hasOnlyKeys } from './option-keys';
import type { TurboDelegate } from './turbo-commands';

/**
 * A place `@boundaries-ignore` comments are accepted, with the reason they are. `files` are globs relative to ESLint's working directory, in the dialect of the workspace `packages` globs.
 */
export interface AllowedBoundariesIgnore {
  readonly files: readonly string[];
  readonly reason: string;
}

/**
 * A directory taxonomy entry for tag checking: the packages under `path` (default `name`, relative to the repository root) are expected to carry a tag equal to `name`.
 */
export interface BoundaryGroup {
  readonly name: string;
  readonly path?: string;
}

/**
 * Opt-in `turbo boundaries` checks. Giving this option at all enables them.
 */
export interface TurboBoundariesOptions {
  // The root script run before pushing (a `check` or `verify` aggregate); it must invoke boundary checking. Omitted, only the `boundaries` script itself is checked.
  readonly aggregateScript?: string;
  // When given, every workspace package must carry the tag named after its group.
  readonly groups?: readonly BoundaryGroup[];
  // Places a `@boundaries-ignore` comment is tolerated. Omitted or empty, none is.
  readonly allowIgnore?: readonly AllowedBoundariesIgnore[];
}

export interface TurboOptions {
  // The repository root directory. Defaults to the nearest ancestor holding a `turbo.json` that does not extend another.
  readonly root?: string;
  // Workspace package globs. Defaults to pnpm-workspace.yaml's `packages`, then package.json's `workspaces`; none means a single-package repository.
  readonly packages?: readonly string[];
  // The prefix that marks a script as the implementation of a turbo task. Defaults to `_`.
  readonly prefix?: string;
  // The command a public script uses to hand a task to turbo. Defaults to `turbo run`.
  readonly delegate?: TurboDelegate;
  // Task names (`build`, or a qualified `//#build`) that the task checks skip.
  readonly exemptTasks?: readonly string[];
  // Also require `outputs` on graph-only and uncached tasks.
  readonly requireEmptyOutputs?: boolean;
  // Flags that make a cached task rewrite its own inputs. Defaults to `--fix` and `--write`.
  readonly fixFlags?: readonly string[];
  readonly boundaries?: TurboBoundariesOptions;
}

export const DEFAULT_TASK_PREFIX = '_';
export const DEFAULT_DELEGATE: TurboDelegate = 'turbo run';
export const DEFAULT_FIX_FLAGS: readonly string[] = ['--fix', '--write'];

const nonEmptyString = { type: 'string', minLength: 1 } as const;
const stringList = { type: 'array', items: nonEmptyString } as const;

export const turboOptionsSchema = {
  type: 'object',
  properties: {
    root: nonEmptyString,
    packages: stringList,
    prefix: nonEmptyString,
    delegate: { enum: ['turbo run', 'turbo'] },
    exemptTasks: stringList,
    requireEmptyOutputs: { type: 'boolean' },
    fixFlags: { type: 'array', items: nonEmptyString, minItems: 1 },
    boundaries: {
      type: 'object',
      properties: {
        aggregateScript: nonEmptyString,
        groups: {
          type: 'array',
          items: { type: 'object', properties: { name: nonEmptyString, path: nonEmptyString }, required: ['name'], additionalProperties: false },
        },
        allowIgnore: {
          type: 'array',
          items: { type: 'object', properties: { files: fileGlobsSchema, reason: nonEmptyString }, required: ['files', 'reason'], additionalProperties: false },
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;

const TOP_LEVEL_KEYS = ['root', 'packages', 'prefix', 'delegate', 'exemptTasks', 'requireEmptyOutputs', 'fixFlags', 'boundaries'] as const;
const BOUNDARIES_KEYS = ['aggregateScript', 'groups', 'allowIgnore'] as const;
const GROUP_KEYS = ['name', 'path'] as const;
const ALLOW_IGNORE_KEYS = ['files', 'reason'] as const;

function fail(optionName: string, detail: string): never {
  throw new Error(`@exadev/eslint-config: "${optionName}" ${detail}`);
}

function readNonEmptyString(value: unknown, optionName: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(optionName, 'must be a non-empty string.');

  return value;
}

function readStringList(value: unknown, optionName: string): readonly string[] {
  if (!Array.isArray(value)) fail(optionName, 'must be an array of non-empty strings.');

  return value.map((item) => readNonEmptyString(item, optionName));
}

function readEntry(value: unknown, optionName: string, allowedKeys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value) || !hasOnlyKeys(value, allowedKeys)) fail(optionName, `must be an object with only the keys ${allowedKeys.map((key) => `"${key}"`).join(', ')}.`);

  return value;
}

function readArray(value: unknown, optionName: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(optionName, 'must be an array.');

  return value;
}

function readGroups(value: unknown): readonly BoundaryGroup[] {
  const names = new Set<string>();

  return readArray(value, 'boundaries.groups').map((item) => {
    const entry = readEntry(item, 'boundaries.groups entry', GROUP_KEYS);
    const name = readNonEmptyString(entry['name'], 'boundaries.groups name');
    if (names.has(name)) fail('boundaries.groups', `declares more than one group named "${name}"; a tag is matched to one group by name.`);
    names.add(name);

    return { name, ...(entry['path'] !== undefined && { path: readNonEmptyString(entry['path'], 'boundaries.groups path') }) };
  });
}

function readAllowIgnore(value: unknown): readonly AllowedBoundariesIgnore[] {
  return readArray(value, 'boundaries.allowIgnore').map((item) => {
    const entry = readEntry(item, 'boundaries.allowIgnore entry', ALLOW_IGNORE_KEYS);

    return {
      files: readFileGlobs(entry['files'], 'boundaries.allowIgnore files'),
      reason: readNonEmptyString(entry['reason'], 'boundaries.allowIgnore reason'),
    };
  });
}

function readBoundaries(value: unknown): TurboBoundariesOptions {
  const entry = readEntry(value, 'boundaries', BOUNDARIES_KEYS);
  const { aggregateScript, groups, allowIgnore } = entry;

  return {
    ...(aggregateScript !== undefined && { aggregateScript: readNonEmptyString(aggregateScript, 'boundaries.aggregateScript') }),
    ...(groups !== undefined && { groups: readGroups(groups) }),
    ...(allowIgnore !== undefined && { allowIgnore: readAllowIgnore(allowIgnore) }),
  };
}

function readDelegate(value: unknown): TurboDelegate {
  if (value !== 'turbo run' && value !== 'turbo') fail('delegate', 'must be "turbo run" or "turbo".');

  return value;
}

function readBoolean(value: unknown, optionName: string): boolean {
  if (typeof value !== 'boolean') fail(optionName, 'must be a boolean.');

  return value;
}

/**
 * The runtime safety net behind `turboOptionsSchema`: turboConfig() builds its rule options by calling this reader on the caller's raw object before ESLint's own schema validation ever sees it, so an unknown or misspelled key at any level it validates fails loudly here, naming the option, rather than being silently dropped. Accepts `undefined` as no options at all, for a rule configured with a bare severity.
 */
export function readTurboOptions(options: unknown): TurboOptions {
  if (options === undefined) return {};
  const entry = readEntry(options, 'turbo options', TOP_LEVEL_KEYS);
  const { root, packages, prefix, delegate, exemptTasks, requireEmptyOutputs, fixFlags, boundaries } = entry;
  const fixFlagList = fixFlags === undefined ? undefined : readStringList(fixFlags, 'fixFlags');
  if (fixFlagList?.length === 0) fail('fixFlags', 'must name at least one flag.');

  return {
    ...(root !== undefined && { root: readNonEmptyString(root, 'root') }),
    ...(packages !== undefined && { packages: readStringList(packages, 'packages') }),
    ...(prefix !== undefined && { prefix: readNonEmptyString(prefix, 'prefix') }),
    ...(delegate !== undefined && { delegate: readDelegate(delegate) }),
    ...(exemptTasks !== undefined && { exemptTasks: readStringList(exemptTasks, 'exemptTasks') }),
    ...(requireEmptyOutputs !== undefined && { requireEmptyOutputs: readBoolean(requireEmptyOutputs, 'requireEmptyOutputs') }),
    ...(fixFlagList !== undefined && { fixFlags: fixFlagList }),
    ...(boundaries !== undefined && { boundaries: readBoundaries(boundaries) }),
  };
}

/** The options with every default applied, in the form the rules read. */
export interface ResolvedTurboOptions {
  readonly root: string | undefined;
  readonly packages: readonly string[] | undefined;
  readonly prefix: string;
  readonly delegate: TurboDelegate;
  readonly exemptTasks: ReadonlySet<string>;
  readonly requireEmptyOutputs: boolean;
  readonly fixFlags: readonly string[];
  readonly boundaries: TurboBoundariesOptions | undefined;
}

export function resolveTurboOptions(options: TurboOptions): ResolvedTurboOptions {
  return {
    root: options.root,
    packages: options.packages,
    prefix: options.prefix ?? DEFAULT_TASK_PREFIX,
    delegate: options.delegate ?? DEFAULT_DELEGATE,
    exemptTasks: new Set(options.exemptTasks),
    requireEmptyOutputs: options.requireEmptyOutputs ?? false,
    fixFlags: options.fixFlags ?? DEFAULT_FIX_FLAGS,
    boundaries: options.boundaries,
  };
}

/**
 * Validates the raw rule option and applies the defaults: what every turbo rule calls once per `create()`.
 */
export function loadTurboOptions(raw: unknown): ResolvedTurboOptions {
  return resolveTurboOptions(readTurboOptions(raw));
}
