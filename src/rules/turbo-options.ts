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

/**
 * A dependency edge policy: the task named `task` must list every entry of `dependsOn` in its own `dependsOn`, written exactly as it appears there (`_typecheck`, `^_build`, `//#_gen`).
 */
export interface TaskGraphRequirement {
  readonly task: string;
  readonly dependsOn: readonly string[];
}

/**
 * The aggregate task a repository runs before pushing: `name` must be a task of the root `turbo.json` and its `dependsOn` must list every entry of `includes`.
 */
export interface AggregateTaskOptions {
  readonly name: string;
  readonly includes: readonly string[];
}

/**
 * Presence checks on `turbo.json` itself. Every field is optional; the `$schema` check runs with the default hosts even when the option is not given.
 */
export interface TurboHygieneOptions {
  // Hosts a `$schema` URL (`https://<host>/schema.json`) may use. Defaults to the three hosts turbo has published it under; one host makes it the canonical one and reports the others.
  readonly schemaHosts?: readonly string[];
  // Require `globalPassThroughEnv` in the root `turbo.json` to include `CI`.
  readonly requireCiPassThrough?: boolean;
  readonly aggregateTask?: AggregateTaskOptions;
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
  // Tool command word to the config file globs it reads, matched against files directly inside the package or repository root. Entries replace the defaults of the same tool; an empty list stops checking that tool.
  readonly toolConfigs?: Readonly<Record<string, readonly string[]>>;
  // Dependency edges that tasks must have. Nothing is required by default, since which graph is right is a per-repository policy.
  readonly taskGraph?: readonly TaskGraphRequirement[];
  readonly hygiene?: TurboHygieneOptions;
  readonly boundaries?: TurboBoundariesOptions;
}

export const DEFAULT_TASK_PREFIX = '_';
export const DEFAULT_DELEGATE: TurboDelegate = 'turbo run';
export const DEFAULT_FIX_FLAGS: readonly string[] = ['--fix', '--write'];
export const DEFAULT_TOOL_CONFIGS: Readonly<Record<string, readonly string[]>> = { eslint: ['eslint.config.*'], tsc: ['tsconfig*.json'], vitest: ['vitest.config.*'] };
// turbo.json's `$schema` has been published under all three hosts.
export const DEFAULT_SCHEMA_HOSTS: readonly string[] = ['turborepo.com', 'turborepo.dev', 'turbo.build'];

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
    toolConfigs: { type: 'object', propertyNames: nonEmptyString, additionalProperties: { type: 'array', items: nonEmptyString, uniqueItems: true } },
    taskGraph: {
      type: 'array',
      items: {
        type: 'object',
        properties: { task: nonEmptyString, dependsOn: { type: 'array', items: nonEmptyString, minItems: 1, uniqueItems: true } },
        required: ['task', 'dependsOn'],
        additionalProperties: false,
      },
    },
    hygiene: {
      type: 'object',
      properties: {
        schemaHosts: { type: 'array', items: nonEmptyString, minItems: 1, uniqueItems: true },
        requireCiPassThrough: { type: 'boolean' },
        aggregateTask: {
          type: 'object',
          properties: { name: nonEmptyString, includes: { type: 'array', items: nonEmptyString, minItems: 1, uniqueItems: true } },
          required: ['name', 'includes'],
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
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

const TOP_LEVEL_KEYS = ['root', 'packages', 'prefix', 'delegate', 'exemptTasks', 'requireEmptyOutputs', 'fixFlags', 'toolConfigs', 'taskGraph', 'hygiene', 'boundaries'] as const;
const TASK_GRAPH_KEYS = ['task', 'dependsOn'] as const;
const HYGIENE_KEYS = ['schemaHosts', 'requireCiPassThrough', 'aggregateTask'] as const;
const AGGREGATE_TASK_KEYS = ['name', 'includes'] as const;
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

function readToolConfigs(value: unknown): Readonly<Record<string, readonly string[]>> {
  if (!isRecord(value)) fail('toolConfigs', 'must be an object mapping a tool command word to its config file globs.');

  return Object.fromEntries(
    Object.entries(value).map(([tool, globs]) => {
      if (tool === '') fail('toolConfigs', 'must not name a tool with an empty command word.');
      const optionName = `toolConfigs.${tool}`;
      if (Array.isArray(globs) && globs.length === 0) return [tool, []];
      const list = readFileGlobs(globs, optionName);
      if (list.some((glob) => glob.includes('/'))) fail(optionName, 'must hold file name globs without "/": they are matched against files directly inside a package or the repository root.');

      return [tool, list];
    }),
  );
}

function readNonEmptyList(value: unknown, optionName: string): readonly string[] {
  const list = readStringList(value, optionName);
  if (list.length === 0) fail(optionName, 'must name at least one entry.');
  if (new Set(list).size !== list.length) fail(optionName, 'must not name an entry twice.');

  return list;
}

function readTaskGraph(value: unknown): readonly TaskGraphRequirement[] {
  const tasks = new Set<string>();

  return readArray(value, 'taskGraph').map((item) => {
    const entry = readEntry(item, 'taskGraph entry', TASK_GRAPH_KEYS);
    const task = readNonEmptyString(entry['task'], 'taskGraph task');
    if (tasks.has(task)) fail('taskGraph', `declares more than one entry for task "${task}"; list all its required edges in one entry.`);
    tasks.add(task);

    return { task, dependsOn: readNonEmptyList(entry['dependsOn'], 'taskGraph dependsOn') };
  });
}

function readSchemaHosts(value: unknown): readonly string[] {
  const hosts = readNonEmptyList(value, 'hygiene.schemaHosts');
  if (hosts.some((host) => /[/:\s]/u.test(host))) fail('hygiene.schemaHosts', 'must hold bare host names such as "turborepo.com", without a scheme or path.');

  return hosts;
}

function readAggregateTask(value: unknown): AggregateTaskOptions {
  const entry = readEntry(value, 'hygiene.aggregateTask', AGGREGATE_TASK_KEYS);

  return { name: readNonEmptyString(entry['name'], 'hygiene.aggregateTask name'), includes: readNonEmptyList(entry['includes'], 'hygiene.aggregateTask includes') };
}

function readHygiene(value: unknown): TurboHygieneOptions {
  const entry = readEntry(value, 'hygiene', HYGIENE_KEYS);
  const { schemaHosts, requireCiPassThrough, aggregateTask } = entry;

  return {
    ...(schemaHosts !== undefined && { schemaHosts: readSchemaHosts(schemaHosts) }),
    ...(requireCiPassThrough !== undefined && { requireCiPassThrough: readBoolean(requireCiPassThrough, 'hygiene.requireCiPassThrough') }),
    ...(aggregateTask !== undefined && { aggregateTask: readAggregateTask(aggregateTask) }),
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
  const { root, packages, prefix, delegate, exemptTasks, requireEmptyOutputs, fixFlags, toolConfigs, taskGraph, hygiene, boundaries } = entry;
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
    ...(toolConfigs !== undefined && { toolConfigs: readToolConfigs(toolConfigs) }),
    ...(taskGraph !== undefined && { taskGraph: readTaskGraph(taskGraph) }),
    ...(hygiene !== undefined && { hygiene: readHygiene(hygiene) }),
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
  // The defaults with the given entries laid over them, and the tools given an empty list removed.
  readonly toolConfigs: ReadonlyMap<string, readonly string[]>;
  readonly taskGraph: readonly TaskGraphRequirement[];
  readonly schemaHosts: readonly string[];
  readonly requireCiPassThrough: boolean;
  readonly aggregateTask: AggregateTaskOptions | undefined;
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
    toolConfigs: new Map(Object.entries({ ...DEFAULT_TOOL_CONFIGS, ...options.toolConfigs }).filter(([, globs]) => globs.length > 0)),
    taskGraph: options.taskGraph ?? [],
    schemaHosts: options.hygiene?.schemaHosts ?? DEFAULT_SCHEMA_HOSTS,
    requireCiPassThrough: options.hygiene?.requireCiPassThrough ?? false,
    aggregateTask: options.hygiene?.aggregateTask,
    boundaries: options.boundaries,
  };
}

/**
 * Validates the raw rule option and applies the defaults: what every turbo rule calls once per `create()`.
 */
export function loadTurboOptions(raw: unknown): ResolvedTurboOptions {
  return resolveTurboOptions(readTurboOptions(raw));
}
