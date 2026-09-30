import type { TSESLint } from '@typescript-eslint/utils';
import type { ConfigArrayValue, PublicConfigArray } from './config-types';
import { scopeBlock, type GlobScope } from './config-globs';
import { isRecord } from './is-record';
import { tryRequire, type RequireFn } from './optional-plugin';
import plugin from './plugin';
import { assertOnlyKeys } from './rules/file-entry';
import { readFileGlobs } from './rules/file-scope';
import { isExcludePattern } from './rules/workspace-glob';
import { toPublicConfigArray } from './to-public-config-array';

const OPTION_NAME = 'testHygiene';
const PLUGIN_PACKAGE = '@vitest/eslint-plugin';
const REQUIRED_RULES: readonly string[] = ['expect-expect', 'no-disabled-tests', 'no-focused-tests'];

/**
 * The globs of the source-scanning guard tests when `guardFiles` is not given.
 */
export const DEFAULT_GUARD_FILES: readonly string[] = ['**/*.guard.test.ts'];

/**
 * The globs of the conformance suites when `conformanceFiles` is not given.
 */
export const DEFAULT_CONFORMANCE_FILES: readonly string[] = ['**/*conformance*.test.ts'];

/**
 * The function names `expect-expect` counts as an assertion when `assertFunctionNames` adds none.
 */
export const DEFAULT_ASSERT_FUNCTION_NAMES: readonly string[] = ['expect', 'assert'];

/**
 * The `testHygiene` option of `exadevConfig`, and the argument of `testHygieneConfig`. Every field is optional, so `{}` enables the preset with the defaults.
 */
export interface TestHygieneOptions {
  // Globs of source-scanning guard tests. They get the vitest hygiene rules and `exadev/non-vacuous-guard`. A leading `!` excludes.
  readonly guardFiles?: readonly string[];
  // Globs of conformance suites, which get the vitest hygiene rules. A kit that is not named `*.test.ts` (`conformance.ts`) is listed here by its own name.
  readonly conformanceFiles?: readonly string[];
  // Helper names `expect-expect` counts as assertions besides `expect` and `assert`, for a kit that asserts by throwing from local helpers. Wildcards are the plugin's own (`check*`).
  readonly assertFunctionNames?: readonly string[];
  // Globs of files deliberately skipped (an opt-in live-network project), exempted from `no-disabled-tests` only.
  readonly skippableFiles?: readonly string[];
}

/**
 * Resolves `@vitest/eslint-plugin` and checks it provides the rules the preset relies on. Throws with the install command when it is missing or too old. `requireFn` replaces the module resolver in tests.
 */
export function readVitestPlugin(requireFn?: RequireFn): TSESLint.FlatConfig.Plugin {
  const loaded = tryRequire(PLUGIN_PACKAGE, requireFn);
  const candidate = isRecord(loaded) && isRecord(loaded['default']) ? loaded['default'] : loaded;
  if (!isRecord(candidate) || !isRecord(candidate['rules'])) {
    throw new Error(`@exadev/eslint-config: Guard and conformance test hygiene was requested but '${PLUGIN_PACKAGE}' could not be resolved. Install it with: pnpm add -D ${PLUGIN_PACKAGE}`);
  }
  const { rules } = candidate;
  const missing = REQUIRED_RULES.filter((name) => !(name in rules));
  if (missing.length > 0) {
    throw new Error(`@exadev/eslint-config: '${PLUGIN_PACKAGE}' does not provide the rules ${missing.join(', ')}, which test hygiene relies on. Upgrade it with: pnpm add -D ${PLUGIN_PACKAGE}`);
  }

  return candidate;
}

function readNames(value: unknown): readonly string[] {
  if (value === undefined) return DEFAULT_ASSERT_FUNCTION_NAMES;
  if (!Array.isArray(value) || value.length === 0 || !value.every((item): item is string => typeof item === 'string' && item.length > 0)) {
    throw new Error(`@exadev/eslint-config: "${OPTION_NAME}.assertFunctionNames" must be a non-empty array of non-empty strings.`);
  }

  return [...new Set([...DEFAULT_ASSERT_FUNCTION_NAMES, ...value])];
}

function assertShape(options: unknown): void {
  if (!isRecord(options)) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" must be an object.`);
  assertOnlyKeys(options, ['guardFiles', 'conformanceFiles', 'assertFunctionNames', 'skippableFiles'], OPTION_NAME);
}

function readSkippable(value: unknown): readonly string[] {
  if (value === undefined) return [];
  const globs = readFileGlobs(value, `${OPTION_NAME}.skippableFiles`);
  const exclude = globs.find(isExcludePattern);
  if (exclude !== undefined) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}.skippableFiles" entry "${exclude}" is an exclude. The list only exempts files, so name the files to exempt.`);

  return globs;
}

function hygieneBlocks(vitest: TSESLint.FlatConfig.Plugin, scope: GlobScope, assertFunctionNames: readonly string[], skippable: readonly string[]): ConfigArrayValue {
  const files = scope.files;
  const scopedBlock = (ignored: readonly string[]) => {
    const ignores = [...(scope.ignores ?? []), ...ignored];

    return { files, ...(ignores.length > 0 && { ignores }), plugins: { vitest, exadev: plugin } };
  };
  // The vitest plugin reads a test function a kit receives as a parameter as a local binding and skips it, so the same three checks run there through `exadev/injected-test-hygiene`. Its `.skip` report is the counterpart of `vitest/no-disabled-tests`, and is exempted the same way.
  const injected = (reportDisabled: boolean): Record<string, TSESLint.FlatConfig.RuleEntry> => ({ 'exadev/injected-test-hygiene': ['error', { assertFunctionNames: [...assertFunctionNames], reportDisabled }] });
  const always: Record<string, TSESLint.FlatConfig.RuleEntry> = { 'vitest/no-focused-tests': 'error', 'vitest/expect-expect': ['error', { assertFunctionNames: [...assertFunctionNames] }] };
  const disabled: Record<string, TSESLint.FlatConfig.RuleEntry> = { 'vitest/no-disabled-tests': 'error' };

  // no-disabled-tests gets its own block only when some files are exempt from it: the exemption is an `ignores` entry, which would otherwise exempt those files from the other rules as well. The later block sets the injected rule's options again for the files that are not exempt.
  return skippable.length === 0
    ? [{ ...scopedBlock([]), rules: { ...always, ...disabled, ...injected(true) } }]
    : [
        { ...scopedBlock([]), rules: { ...always, ...injected(false) } },
        { ...scopedBlock(skippable), rules: { ...disabled, ...injected(true) } },
      ];
}

/**
 * Builds the blocks around a vitest plugin loaded by `loadPlugin`, after the options have been validated, so an option error is reported before a missing plugin. Exported so tests can supply a plugin without touching module resolution; the public options have no such seam.
 */
export function assembleTestHygieneConfig(options: TestHygieneOptions, loadPlugin: () => TSESLint.FlatConfig.Plugin): ConfigArrayValue {
  assertShape(options);
  const guard = scopeBlock(options.guardFiles ?? DEFAULT_GUARD_FILES, `${OPTION_NAME}.guardFiles`);
  const conformance = scopeBlock(options.conformanceFiles ?? DEFAULT_CONFORMANCE_FILES, `${OPTION_NAME}.conformanceFiles`);
  const assertFunctionNames = readNames(options.assertFunctionNames);
  const skippable = readSkippable(options.skippableFiles);
  const vitest = loadPlugin();

  return [
    ...hygieneBlocks(vitest, guard, assertFunctionNames, skippable),
    ...hygieneBlocks(vitest, conformance, assertFunctionNames, skippable),
    { ...guard, plugins: { exadev: plugin }, rules: { 'exadev/non-vacuous-guard': 'error' } },
  ];
}

/**
 * Wires `no-focused-tests`, `expect-expect` and `no-disabled-tests` from `@vitest/eslint-plugin` onto guard tests and conformance suites at `error`, `exadev/injected-test-hygiene` beside them for the test functions a kit receives as parameters, and `exadev/non-vacuous-guard` onto guard tests. The preset is opt-in and always requests the plugin, so it throws with the install command when the plugin cannot be resolved, or when it lacks a rule the preset relies on. Internal: consumed by create-config.ts as more `ConfigArrayValue` entries.
 */
export function buildTestHygieneConfig(options: TestHygieneOptions = {}): ConfigArrayValue {
  return assembleTestHygieneConfig(options, readVitestPlugin);
}

/**
 * Wires guard and conformance test hygiene, returning ESLint core's own `Config[]` so the result spreads directly into `defineConfig(...)` (`...testHygieneConfig()`). Throws at call time for a malformed option or a missing plugin. See the README's "Guard and conformance test hygiene" section.
 */
export function testHygieneConfig(options: TestHygieneOptions = {}): PublicConfigArray {
  return toPublicConfigArray(buildTestHygieneConfig(options));
}
