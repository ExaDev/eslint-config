import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { exadevConfig, importPolicyConfig, plugin, pureModulesConfig, testHygieneConfig, workspaceArchitectureConfig } from './index';

// Not imported by index.ts (see tsdown.config.ts's own entry, only src/index.ts is bundled), so this file contributes nothing to the published package. Its only job is to be included in `tsc -p tsconfig.json` (see tsconfig.json's own `include`), so `pnpm typecheck` fails the moment any of README.md's own defineConfig() examples that reference the named `plugin` export stops compiling, the same regression-test role consumer-compatibility.ts already plays for the default export (see its own comment). Reproduces ExaDev/eslint-config#39/#42's own real failure: `plugin` (a plain object) satisfied @typescript-eslint/utils' own FlatConfig.Plugin type but not @eslint/core's Plugin type that defineConfig()'s own ConfigObject requires for its `plugins` field, under `exactOptionalPropertyTypes`.
//
// Each example is a function, called from its own unit test, rather than a top-level constant: tsc typechecks a function body exactly the same as a top-level statement, so this loses no typecheck coverage, but it moves defineConfig()'s own call (and any error a broken example would throw, such as an unresolvable extends target) into the test's own execution, where a mutation-testing run can attribute a resulting throw to that specific test. A top-level throw during this module's own import would reach vitest before any test ran, surfacing as a bare import failure with no per-test mutant coverage recorded against it.

// README's "lighter option" section, the manual single-rule pattern.
export function buildViaManualRules() {
  return defineConfig({
    files: ['src/**/*.ts'],
    ignores: ['src/index.ts'],
    plugins: { exadev: plugin },
    rules: {
      'exadev/no-non-barrel-reexport': 'error',
    },
  });
}

// README's "lighter option" section, the string-`extends` bundled-config pattern.
export function buildViaStringExtends() {
  return defineConfig([
    {
      files: ['**/*.ts'],
      plugins: { exadev: plugin },
      extends: ['exadev/recommended'],
    },
  ]);
}

/**
 * README's "lighter option" section, the tseslint.config() pattern for a consumer who hasn't migrated to defineConfig() yet: tseslint.config() has no string `extends`, so the config value (plugin.configs.recommended, read by name off the named `plugin` export) is passed directly instead.
 */
export function buildViaTseslintPluginConfigsRecommended() {
  return tseslint.config(
    {
      files: ['**/*.ts'],
      plugins: { exadev: plugin },
      // or plugin.configs.barrel
      extends: [plugin.configs.recommended],
    },
  );
}

/**
 * README's "Optional features" section, the explicit-tier-selection pattern: `plugin.configs.react`/`.nextjs` read by name off the named `plugin` export, mirroring `plugin.configs.recommended`/`.barrel` above but for the optional React and Next.js rule blocks.
 */
export function buildViaPluginConfigsReactAndNextjs() {
  return defineConfig(
    {
      files: ['**/*.tsx'],
      plugins: { exadev: plugin },
      // throws if eslint-plugin-react isn't installed
      extends: [plugin.configs.react],
    },
    {
      files: ['**/*.ts', '**/*.tsx'],
      plugins: { exadev: plugin },
      // throws if @next/eslint-plugin-next isn't installed
      extends: [plugin.configs.nextjs],
    },
  );
}

/**
 * README's "Example: a group-ranked repo" workspace architecture section, spread straight into defineConfig() alongside exadevConfig() the way a consumer combining both would.
 */
export function buildViaWorkspaceArchitecture() {
  return defineConfig(
    ...workspaceArchitectureConfig({
      groups: [
        { name: 'core', rank: 0 },
        { name: 'features', rank: 1 },
        { name: 'product', rank: 2 },
        { name: 'targets', rank: 3 },
        { name: 'test', rank: 4, naming: 'keep-group' },
      ],
      naming: { scope: '@novus' },
    }),
    ...exadevConfig({ react: false, nextjs: false }),
  );
}

/**
 * README's "Import policy" section: the three policy shapes (deny, confine, an exact exception edge) spread into defineConfig() alongside exadevConfig().
 */
export function buildViaImportPolicy() {
  return defineConfig(
    ...exadevConfig({ react: false, nextjs: false }),
    ...importPolicyConfig([
      {
        files: ['src/worker/**'],
        deny: [{ specifiers: ['fs', 'path', 'child_process'], message: 'worker code runs where Node builtins do not exist' }],
      },
      {
        files: ['src/**'],
        ignores: ['src/**/*.test.ts'],
        confine: [{ specifiers: ['@anthropic-ai/sdk'], onlyIn: ['src/agent/adapter.ts'], allowTypeImports: true }],
      },
      {
        files: ['src/routes/**'],
        deny: [{ specifiers: ['src/db'], message: 'routes reach data through the service layer' }],
        exceptEdges: [{ file: 'src/routes/legacy.ts', specifier: '../db/client', reason: 'predates the service layer' }],
      },
    ]),
  );
}

/**
 * README's "Pure modules" section: the standalone form, spread into defineConfig() alongside exadevConfig().
 */
export function buildViaPureModules() {
  return defineConfig(
    ...exadevConfig({ react: false, nextjs: false }),
    ...pureModulesConfig({ files: ['src/core/**', '!src/core/**/*.gen.ts'], allowImports: ['node:stream'], noControlFlow: true }),
  );
}

/**
 * README's "Pure modules" section: the same option passed through exadevConfig().
 */
export function buildViaPureModulesOption() {
  return defineConfig(exadevConfig({ react: false, nextjs: false, pureModules: { files: ['src/core/**'] } }));
}

/**
 * README's "A complexity ceiling for logic-free modules" section: a files-scoped block after the shared config.
 */
export function buildViaScopedComplexity() {
  return defineConfig(...exadevConfig({ react: false, nextjs: false }), {
    files: ['src/views/**/*.ts', 'src/main.ts'],
    rules: { complexity: ['error', { max: 2 }] },
  });
}

/**
 * README's "Guard and conformance test hygiene" section: every option, through exadevConfig().
 */
export function buildViaTestHygiene() {
  return defineConfig(
    ...exadevConfig({
      react: false,
      nextjs: false,
      testHygiene: {
        guardFiles: ['**/*.guard.test.ts'],
        conformanceFiles: ['**/*conformance*.test.ts', 'packages/*/src/conformance.ts'],
        assertFunctionNames: ['check*'],
        skippableFiles: ['**/live.conformance.test.ts'],
      },
    }),
    ...testHygieneConfig(),
    { rules: { 'exadev/test-file-kind': ['error', { kinds: ['unit', 'integration', 'e2e', 'guard', 'conformance'] }] } },
  );
}
