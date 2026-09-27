import { defineConfig } from 'eslint/config';

import tseslint from 'typescript-eslint';

import { exadevConfig, plugin, workspaceArchitectureConfig } from './index';

/* Not imported by index.ts (see tsdown.config.ts's own entry, only src/index.ts is bundled), so this file contributes nothing to the published package. Its only job is to be included in `tsc -p tsconfig.json` (see tsconfig.json's own `include`), so `pnpm typecheck` fails the moment any of README.md's own defineConfig() examples that reference the named `plugin` export stops compiling, the same regression-test role consumer-compatibility.ts already plays for the default export (see its own comment). Reproduces ExaDev/eslint-config#39/#42's own real failure: `plugin` (a plain object) satisfied @typescript-eslint/utils' own FlatConfig.Plugin type but not @eslint/core's Plugin type that defineConfig()'s own ConfigObject requires for its `plugins` field, under `exactOptionalPropertyTypes`.

   Each example is a function, called from its own unit test, rather than a top-level constant: tsc typechecks a function body exactly the same as a top-level statement, so this loses no typecheck coverage, but it moves defineConfig()'s own call (and any error a broken example would throw, such as an unresolvable extends target) into the test's own execution, where a mutation-testing run can attribute a resulting throw to that specific test. A top-level throw during this module's own import would reach vitest before any test ran, surfacing as a bare import failure with no per-test mutant coverage recorded against it. */

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
