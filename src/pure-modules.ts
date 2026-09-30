import type { ConfigArrayValue, PublicConfigArray } from './config-types';
import { isRecord } from './is-record';
import plugin from './plugin';
import { assertOnlyKeys } from './rules/file-entry';
import { readFileGlobs } from './rules/file-scope';
import { readPureModuleOptions, type PureModuleOptions } from './rules/pure-module-options';
import { isExcludePattern } from './rules/workspace-glob';
import { toPublicConfigArray } from './to-public-config-array';

/**
 * The `pureModules` option of `exadevConfig`, and the argument of `pureModulesConfig`.
 */
export interface PureModulesOptions extends PureModuleOptions {
  // Globs, relative to ESLint's working directory, of the modules that must stay pure, in the dialect of every file glob in this package. A leading `!` excludes. ESLint lints a file only if some block names its extension, so this needs `exadevConfig()` or another block for JavaScript and TypeScript files beside it.
  readonly files: readonly string[];
  // Also bans `if`, `switch`, loops and the ternary operator in these files (`exadev/no-control-flow`), for a module that should hold a lookup table and nothing else. Off unless true.
  readonly noControlFlow?: boolean;
}

const OPTION_NAME = 'pureModules';

/**
 * Wires `exadev/pure-module` onto the files `files` selects, plus `exadev/no-control-flow` when asked for. One block carries both, and no other rule name is used, so a `no-restricted-imports`, `no-restricted-globals` or `no-restricted-syntax` block of the consumer's that overlaps the same files replaces nothing of it. Internal: consumed by create-config.ts as one more `ConfigArrayValue` entry.
 */
export function buildPureModulesConfig(options: PureModulesOptions): ConfigArrayValue {
  if (!isRecord(options)) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" must be an object.`);
  assertOnlyKeys(options, ['files', 'allowImports', 'noControlFlow'], OPTION_NAME);
  const { files, noControlFlow, ...ruleOptions } = options;
  if (noControlFlow !== undefined && typeof noControlFlow !== 'boolean') throw new Error(`@exadev/eslint-config: "${OPTION_NAME}.noControlFlow" must be a boolean.`);

  const globs = readFileGlobs(files, `${OPTION_NAME}.files`);

  return [
    {
      files: globs.filter((glob) => !isExcludePattern(glob)),
      ...(globs.some(isExcludePattern) && { ignores: globs.filter(isExcludePattern).map((glob) => glob.slice(1)) }),
      plugins: { exadev: plugin },
      rules: { 'exadev/pure-module': ['error', readPureModuleOptions(ruleOptions)], ...(noControlFlow === true && { 'exadev/no-control-flow': 'error' }) },
    },
  ];
}

/**
 * Wires the pure-module bans onto `files`, returning ESLint core's own `Config[]` so the result spreads directly into `defineConfig(...)` (`...pureModulesConfig({ files: ['src/core/**'] })`). Throws at call time for a malformed option, including an `allowImports` entry that selects no banned module. See the README's "Pure modules" section.
 */
export function pureModulesConfig(options: PureModulesOptions): PublicConfigArray {
  return toPublicConfigArray(buildPureModulesConfig(options));
}
