import { containsTokenRun, tokenizeCommand } from './command-tokens';
import { delegatesTo, invokedTurboWords, runsBoundaries, type TurboDelegate } from './turbo-commands';
import { baseTaskName, isGraphOnly, ROOT_TASK_PREFIX, type TurboJson, type TurboTask } from './turbo-json';
import type { TaskGraphRequirement } from './turbo-options';
import type { TurboPackage } from './turbo-workspace';

// The pure decisions behind the turbo rules, independent of ESLint and momoa so each can be unit-tested against plain maps.

/** Whether a task is skipped by the task-level checks: its full key or its unqualified name is listed. */
export function isExemptTask(key: string, exempt: ReadonlySet<string>): boolean {
  return exempt.has(key) || exempt.has(baseTaskName(key));
}

export type ConventionProblemKind = 'missingPublicScript' | 'notDelegating' | 'bareTaskScript';

export interface ConventionProblem {
  readonly kind: ConventionProblemKind;
  // The script the diagnostic is anchored on.
  readonly script: string;
  // What the problem asks for: the public script to add (missingPublicScript), the delegating command (notDelegating) or the shadowed task (bareTaskScript).
  readonly expected: string;
  // The script's actual command, empty when it has none.
  readonly actual: string;
}

/**
 * The public-script convention for one package. In the root package every script `<prefix>x` needs a public `x` that delegates to it. In any other package a script named `x` must not exist when the root defines the task `<prefix>x`, since the public name belongs to the root's orchestration. `commands` maps each script to its command, or to undefined when the value is not a string.
 */
export function checkConvention(
  input: Readonly<{
    commands: ReadonlyMap<string, string | undefined>;
    isRoot: boolean;
    rootTasks: ReadonlyMap<string, TurboTask>;
    prefix: string;
    delegate: TurboDelegate;
    exempt: ReadonlySet<string>;
  }>,
): readonly ConventionProblem[] {
  const { commands, isRoot, rootTasks, prefix, delegate, exempt } = input;
  const problems: ConventionProblem[] = [];

  for (const [script, command] of commands) {
    if (script.startsWith(prefix)) {
      if (!isRoot || script.length === prefix.length || isExemptTask(script, exempt)) continue;
      const publicScript = script.slice(prefix.length);
      if (!commands.has(publicScript)) {
        problems.push({ kind: 'missingPublicScript', script, expected: publicScript, actual: '' });
        continue;
      }
      const publicCommand = commands.get(publicScript) ?? '';
      if (!delegatesTo(publicCommand, { delegate, task: script })) {
        problems.push({ kind: 'notDelegating', script: publicScript, expected: `${delegate} ${script}`, actual: publicCommand });
      }
    } else if (!isRoot && rootTasks.has(`${prefix}${script}`) && !isExemptTask(`${prefix}${script}`, exempt)) {
      problems.push({ kind: 'bareTaskScript', script, expected: `${prefix}${script}`, actual: command ?? '' });
    }
  }

  return problems;
}

export type TaskProblemKind = 'unimplementedTask' | 'unreachableTask';

export interface TaskProblem {
  readonly kind: TaskProblemKind;
  readonly task: string;
}

// The task key a `dependsOn` or `with` entry points at: the `^` that means "in dependencies" is not part of the key.
function referencedKey(entry: string): string {
  return entry.startsWith('^') ? entry.slice(1) : entry;
}

/** A package that implements a task, with the command of the script that does. */
export interface TaskImplementation {
  readonly pkg: TurboPackage;
  readonly command: string;
}

function withScript(candidates: readonly TurboPackage[], script: string): readonly TaskImplementation[] {
  return candidates.flatMap((pkg) => {
    const command = pkg.scripts.get(script);

    return command === undefined ? [] : [{ pkg, command }];
  });
}

/**
 * The packages whose script implements the task `key`, each with that script's command: the root package for a `//#` key, the member of that name for a `package#` key, and otherwise every workspace member with a script of that name, or the root package when the repository has no members (turbo runs the root package for a bare task only then).
 */
export function implementingScripts(key: string, packages: Readonly<{ root: TurboPackage; members: readonly TurboPackage[] }>): readonly TaskImplementation[] {
  const { root, members } = packages;
  if (key.startsWith(ROOT_TASK_PREFIX)) return withScript([root], key.slice(ROOT_TASK_PREFIX.length));
  const separator = key.lastIndexOf('#');
  if (separator !== -1) return withScript(members.filter((member) => member.name === key.slice(0, separator)), key.slice(separator + 1));

  return withScript(members.length === 0 ? [root] : members, key);
}

// Whether something makes turbo run the task. `turbo run name` runs `//#name` as well as any `name` task, and inside a `//#` task a bare `dependsOn` or `with` entry `name` resolves to `//#name` (both checked against turbo 2.10.8 with `--dry=json`), so a `//#` task is also reached through its bare name from a root script or from another `//#` task.
function isReachable(key: string, context: Readonly<{ tasks: ReadonlyMap<string, TurboTask>; invoked: ReadonlySet<string> }>): boolean {
  const { tasks, invoked } = context;
  const bareName = key.startsWith(ROOT_TASK_PREFIX) ? key.slice(ROOT_TASK_PREFIX.length) : undefined;
  if (invoked.has(key) || (bareName !== undefined && invoked.has(bareName))) return true;

  return [...tasks].some(
    ([otherKey, other]) =>
      otherKey !== key &&
      [...other.dependsOn, ...other.with].map(referencedKey).some((entry) => entry === key || (otherKey.startsWith(ROOT_TASK_PREFIX) && entry === bareName)),
  );
}

/**
 * The problems in a root `turbo.json`'s `tasks` measured against the repository's scripts. A task that no package implements does nothing, silently, and is reported unless it only wires other tasks together (has `dependsOn`). A `//#` task, or an aggregate (a task with `dependsOn`), that no other task depends on or runs alongside and that no root script invokes through turbo never runs (a `//#name` task is also reached by the bare name `name` in a root script or in another `//#` task's `dependsOn` or `with`) and is reported as unreachable.
 */
export function checkTaskScripts(input: Readonly<{ tasks: ReadonlyMap<string, TurboTask>; root: TurboPackage; members: readonly TurboPackage[]; exempt: ReadonlySet<string> }>): readonly TaskProblem[] {
  const { tasks, root, members, exempt } = input;
  const invoked = new Set([...root.scripts.values()].flatMap(invokedTurboWords));
  const problems: TaskProblem[] = [];

  for (const [key, task] of tasks) {
    if (isExemptTask(key, exempt)) continue;
    const hasDependencies = task.dependsOn.length > 0;
    if (!hasDependencies && implementingScripts(key, { root, members }).length === 0) problems.push({ kind: 'unimplementedTask', task: key });
    if (!key.startsWith(ROOT_TASK_PREFIX) && !hasDependencies) continue;
    if (!isReachable(key, { tasks, invoked })) problems.push({ kind: 'unreachableTask', task: key });
  }

  return problems;
}

export type OutputProblemKind = 'persistentCached' | 'missingOutputs';

/**
 * What is wrong with a task's caching declaration, if anything. A persistent task never completes, so there is nothing to cache and it must set `cache: false`. A cached task that does not declare `outputs` caches its logs only, so the absence must be a stated choice (`outputs: []`); a task that only wires other tasks together, or one that is not cached, has no outputs to state unless `requireEmptyOutputs` asks for the list everywhere.
 */
export function outputProblem(task: TurboTask, options: Readonly<{ requireEmptyOutputs: boolean }>): OutputProblemKind | undefined {
  const cached = task.cache !== false;
  if (task.persistent === true && cached) return 'persistentCached';
  if (task.hasOutputs) return undefined;
  if (cached && !isGraphOnly(task)) return 'missingOutputs';

  return options.requireEmptyOutputs ? 'missingOutputs' : undefined;
}

/**
 * The flags from `flags` that `command` passes to whatever it runs, compared token by token as the required-scripts rule compares them.
 */
export function fixFlagsIn(command: string, flags: readonly string[]): readonly string[] {
  const tokens = tokenizeCommand(command);

  return flags.filter((flag) => containsTokenRun(tokens, tokenizeCommand(flag)));
}

export type TagProblemKind = 'missingTurboJson' | 'notExtendingRoot' | 'missingTags' | 'missingGroupTag';

/**
 * What is wrong with a workspace package's own `turbo.json` for `turbo boundaries`, if anything: it must exist, extend the root configuration, carry at least one tag, and, when the package belongs to a configured group, carry a tag equal to that group's name.
 */
export function tagProblem(own: TurboJson | undefined, groupName: string | undefined): TagProblemKind | undefined {
  if (own === undefined) return 'missingTurboJson';
  if (own.extends?.includes('//') !== true) return 'notExtendingRoot';
  if (own.tags.length === 0) return 'missingTags';
  if (groupName !== undefined && !own.tags.includes(groupName)) return 'missingGroupTag';

  return undefined;
}

export type BoundariesScriptProblemKind = 'missingBoundariesScript' | 'boundariesScriptMismatch' | 'missingAggregateScript' | 'aggregateSkipsBoundaries';

export interface BoundariesScriptProblem {
  readonly kind: BoundariesScriptProblemKind;
  // The script the diagnostic is about.
  readonly script: string;
  readonly actual: string;
}

/** The one command the `boundaries` script must be. */
export const BOUNDARIES_COMMAND = 'turbo boundaries';

/**
 * What is wrong with the root package's scripts for running `turbo boundaries`: the `boundaries` script must exist and be exactly `turbo boundaries`, and `aggregateScript`, when given, must exist and invoke it, so the check runs wherever the aggregate does.
 */
export function checkBoundariesScripts(commands: ReadonlyMap<string, string | undefined>, aggregateScript: string | undefined): readonly BoundariesScriptProblem[] {
  const problems: BoundariesScriptProblem[] = [];
  const boundaries = commands.get('boundaries') ?? '';
  if (!commands.has('boundaries')) {
    problems.push({ kind: 'missingBoundariesScript', script: 'boundaries', actual: '' });
  } else if (tokenizeCommand(boundaries).join(' ') !== BOUNDARIES_COMMAND) {
    problems.push({ kind: 'boundariesScriptMismatch', script: 'boundaries', actual: boundaries });
  }
  if (aggregateScript === undefined) return problems;
  const aggregate = commands.get(aggregateScript) ?? '';
  if (!commands.has(aggregateScript)) {
    problems.push({ kind: 'missingAggregateScript', script: aggregateScript, actual: '' });
  } else if (!runsBoundaries(aggregate)) {
    problems.push({ kind: 'aggregateSkipsBoundaries', script: aggregateScript, actual: aggregate });
  }

  return problems;
}

/**
 * The `dependsOn` entries the `taskGraph` option requires of the task at `key`. A requirement names a task either exactly (`_build`, `//#_build`, `web#_build`) or, when written without a package qualifier, all of its package entries too: `_build` also covers `web#_build`, since a `package#task` entry replaces the generic task instead of adding to it, but not `//#_build`, the root package's own task, which only a requirement written `//#_build` covers.
 */
export function requiredEdges(key: string, graph: readonly TaskGraphRequirement[]): readonly string[] {
  return [...new Set(graph.filter(({ task }) => requirementCovers(task, key)).flatMap(({ dependsOn }) => dependsOn))];
}

// Whether a `taskGraph` requirement written for `task` applies to the task entry `key`.
function requirementCovers(task: string, key: string): boolean {
  return task === key || (!task.includes('#') && !key.startsWith(ROOT_TASK_PREFIX) && baseTaskName(key) === task);
}

/** The task names of `graph`, in order, that cover none of the task entries `keys`: a requirement that can never apply, usually a misspelt task name. */
export function unmatchedGraphTasks(graph: readonly TaskGraphRequirement[], keys: readonly string[]): readonly string[] {
  return graph.map(({ task }) => task).filter((task) => !keys.some((key) => requirementCovers(task, key)));
}

/** The entries of `required` that `task` does not list in its `dependsOn`, compared as written. */
export function missingEdges(task: TurboTask, required: readonly string[]): readonly string[] {
  return required.filter((edge) => !task.dependsOn.includes(edge));
}

// The schema file the `turbo` package ships, referenced from a turbo.json by a relative path that starts with `./` or `../` (turbo 2.4 and later, https://turborepo.dev/docs/getting-started/editor-integration).
const LOCAL_SCHEMA_PATTERN = /^(?:\.{1,2}\/)+(?:[^/]+\/)*node_modules\/turbo\/schema\.json$/u;

// The versioned subdomain label of a host, `v<major>-<minor>-<patch>` with optional pre-release segments (turbo 2.5.7 and later).
const VERSIONED_SUBDOMAIN_PATTERN = /^v\d+-\d+-\d+(?:-[a-z0-9]+)*$/u;

function isSchemaUrlOn(schema: string, host: string): boolean {
  const scheme = 'https://';
  const suffix = `.${host}/schema.json`;

  return schema === `${scheme}${host}/schema.json` || (schema.startsWith(scheme) && schema.endsWith(suffix) && VERSIONED_SUBDOMAIN_PATTERN.test(schema.slice(scheme.length, -suffix.length)));
}

/**
 * Whether `schema`, a turbo.json's `$schema`, is one turbo documents: `https://<host>/schema.json` for one of `hosts`, the same URL on a versioned subdomain of one of them (`https://v2-10-8.<host>/schema.json`), or the schema the installed `turbo` package ships, referenced by a relative path ending in `node_modules/turbo/schema.json`. The local path names no host, so `hosts` does not restrict it.
 */
export function isKnownSchema(schema: string | undefined, hosts: readonly string[]): boolean {
  if (schema === undefined) return false;

  return LOCAL_SCHEMA_PATTERN.test(schema) || hosts.some((host) => isSchemaUrlOn(schema, host));
}
