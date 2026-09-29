import { dirname, join, relative, resolve } from 'node:path';
import { tokenizeCommand } from './command-tokens';
import { createFileScope } from './file-scope';
import { implementingScripts } from './turbo-checks';
import { baseTaskName, mergeTask, readTurboJsonAt, ROOT_PACKAGE_QUALIFIER, type TurboJson, type TurboTask } from './turbo-json';
import type { TurboPackage } from './turbo-workspace';
import { listFileNames, type WorkspaceFs } from './workspace-fs';

/** The `inputs` entry that stands for the package's own files. */
export const TURBO_DEFAULT = '$TURBO_DEFAULT$';

/** Prefix of an `inputs` glob that is relative to the repository root instead of the package. */
export const TURBO_ROOT_PREFIX = '$TURBO_ROOT$/';

// The final path segment of a token, so `pnpm exec ./node_modules/.bin/eslint` and `eslint` both name eslint.
function commandWord(token: string): string {
  return token.slice(token.lastIndexOf('/') + 1);
}

/**
 * The tools among `tools` that `command` invokes: those named by a word of the command (the final path segment of a token, so `pnpm exec eslint .` and `./node_modules/.bin/eslint .` both count). Read from the command line as written, in the order of `tools`; a script that only calls another script (`pnpm run lint`) names no tool and is not classified.
 */
export function toolsRunBy(command: string, tools: readonly string[]): readonly string[] {
  const words = new Set(tokenizeCommand(command).map(commandWord));

  return [...tools].filter((tool) => words.has(tool));
}

/** The files directly inside `dir` whose names match `globs`, in name order so a report does not depend on the order the filesystem lists them. */
function configFilesIn(fs: WorkspaceFs, dir: string, globs: readonly string[]): readonly string[] {
  const matches = createFileScope(globs);

  return listFileNames(fs, dir)
    .filter((name) => matches(join(dir, name), dir))
    .sort();
}

interface InputGlob {
  // The directory the glob is relative to.
  readonly base: string;
  readonly glob: string;
}

// Each leading `../` of a glob moves its base directory up one level.
function withoutParentSegments(input: Readonly<InputGlob>): InputGlob {
  return input.glob.startsWith('../') ? withoutParentSegments({ base: dirname(input.base), glob: input.glob.slice('../'.length) }) : input;
}

// A glob's base directory and remaining pattern: `$TURBO_ROOT$/x` is relative to the repository root, anything else to the package.
function toInputGlob(entry: string, dirs: Readonly<{ root: string; pkg: string }>): InputGlob {
  const rooted = entry.startsWith(TURBO_ROOT_PREFIX);

  return withoutParentSegments({ base: rooted ? dirs.root : dirs.pkg, glob: rooted ? entry.slice(TURBO_ROOT_PREFIX.length) : entry });
}

function matchesGlob(file: string, input: InputGlob): boolean {
  return createFileScope([input.glob])(file, input.base);
}

/**
 * Whether the cache key of `task`, run in the package at `dirs.pkg`, includes the absolute path `file`. A file is included by `globalDependencies` (relative to the repository root), by the package's own files when `inputs` is unset or lists `$TURBO_DEFAULT$`, or by an `inputs` glob (relative to the package, or to the repository root behind `$TURBO_ROOT$/`), and never when a `!` glob of `inputs` excludes it.
 */
export function cacheKeyIncludes(input: Readonly<{ file: string; task: TurboTask; globalDependencies: readonly string[]; dirs: Readonly<{ root: string; pkg: string }> }>): boolean {
  const { file, task, globalDependencies, dirs } = input;
  const entries = task.inputs ?? [];
  const includes = entries.filter((entry) => !entry.startsWith('!')).map((entry) => toInputGlob(entry, dirs));
  const excludes = entries.filter((entry) => entry.startsWith('!')).map((entry) => toInputGlob(entry.slice('!'.length), dirs));
  const usesDefault = task.inputs === undefined || task.inputs.includes(TURBO_DEFAULT);
  const inPackage = !relative(dirs.pkg, file).startsWith('..');
  const included = (usesDefault && inPackage) || includes.some((glob) => matchesGlob(file, glob));

  return createFileScope(globalDependencies)(file, dirs.root) || (included && !excludes.some((glob) => matchesGlob(file, glob)));
}

export type ConfigInputProblemKind = 'missingPackageConfig' | 'missingRootConfig';

interface MissingConfig {
  readonly kind: ConfigInputProblemKind;
  readonly tool: string;
  // The config file's name, relative to the package (missingPackageConfig) or to the repository root (missingRootConfig).
  readonly file: string;
}

export interface ConfigInputProblem extends MissingConfig {
  // Every package whose run of the task misses the file, the root package as `//`, in name order.
  readonly packages: readonly string[];
}

// The config files of the tools `pkg`'s script invokes that the cache key of `task` misses: those inside the package, and for a package other than the root package those at the repository root.
function missingConfigs(
  input: Readonly<{ fs: WorkspaceFs; config: TurboJson; task: TurboTask; pkg: TurboPackage; command: string; dirs: Readonly<{ root: string; pkg: string }>; toolConfigs: ReadonlyMap<string, readonly string[]> }>,
): readonly MissingConfig[] {
  const { fs, config, task, pkg, command, dirs, toolConfigs } = input;

  return toolsRunBy(command, [...toolConfigs.keys()]).flatMap((tool) => {
    const globs = toolConfigs.get(tool) ?? [];
    const candidates: readonly (MissingConfig & Readonly<{ path: string }>)[] = [
      ...configFilesIn(fs, dirs.pkg, globs).map((file) => ({ kind: 'missingPackageConfig' as const, tool, file, path: join(dirs.pkg, file) })),
      ...(pkg.dir === '' ? [] : configFilesIn(fs, dirs.root, globs).map((file) => ({ kind: 'missingRootConfig' as const, tool, file, path: join(dirs.root, file) }))),
    ];

    return candidates.filter(({ path }) => !cacheKeyIncludes({ file: path, task, globalDependencies: config.globalDependencies, dirs })).map(({ kind, file }) => ({ kind, tool, file }));
  });
}

/**
 * The tool config files the cache key of the task `key` of the root turbo configuration `config` misses. Each package that implements the task is checked with its effective task (its own turbo.json laid over the entry that governs it) unless that task is uncached: every tool of `toolConfigs` that the package's script invokes needs the config files it reads in the cache key, those inside the package (missed only when `inputs` replaces the default without listing them) and, for a package other than the root package, those at the repository root. A script that invokes none of the tools cannot be classified and is skipped. Problems for the same tool and file are merged across packages.
 */
export function checkConfigInputs(
  input: Readonly<{
    fs: WorkspaceFs;
    rootDir: string;
    config: TurboJson;
    key: string;
    // The entry of the root turbo configuration under `key`.
    entry: TurboTask;
    packages: Readonly<{ root: TurboPackage; members: readonly TurboPackage[] }>;
    toolConfigs: ReadonlyMap<string, readonly string[]>;
  }>,
): readonly ConfigInputProblem[] {
  const { fs, rootDir, config, key, entry, packages, toolConfigs } = input;
  const script = baseTaskName(key);
  const grouped = new Map<string, ConfigInputProblem>();

  for (const { pkg, command } of implementingScripts(key, packages)) {
    const qualifier = pkg.dir === '' ? ROOT_PACKAGE_QUALIFIER : pkg.name;
    // A package with a `package#task` entry of its own is checked under that key, not under the generic one.
    if (qualifier !== undefined && key === script && config.tasks.has(`${qualifier}#${script}`)) continue;
    const local = pkg.dir === '' ? undefined : readTurboJsonAt(fs, join(rootDir, pkg.dir))?.tasks.get(script);
    const task = local === undefined ? entry : mergeTask(entry, local);
    if (task.cache === false) continue;
    const dirs = { root: rootDir, pkg: resolve(rootDir, pkg.dir) };
    for (const missing of missingConfigs({ fs, config, task, pkg, command, dirs, toolConfigs })) {
      const identity = `${missing.kind}\0${missing.tool}\0${missing.file}`;
      grouped.set(identity, { ...missing, packages: [...(grouped.get(identity)?.packages ?? []), pkg.dir === '' ? ROOT_PACKAGE_QUALIFIER : (pkg.name ?? pkg.dir)] });
    }
  }

  return [...grouped.values()].map((problem) => ({ ...problem, packages: [...problem.packages].sort() }));
}
