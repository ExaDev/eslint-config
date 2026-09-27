import { defineConfig } from 'eslint/config';
import { exadevConfig, plugin, workspaceArchitectureConfig } from './index';

// Not imported by index.ts (see tsdown.config.ts's own entry, only src/index.ts is bundled), so this file contributes nothing to the published package. Its only job is to be included in `tsc -p tsconfig.json` (see tsconfig.json's own `include`), so `pnpm typecheck` fails the moment any of README.md's own defineConfig() examples that reference the named `plugin` export stops compiling, the same regression-test role consumer-compatibility.ts already plays for the default export (see its own comment). Reproduces ExaDev/eslint-config#39/#42's own real failure: `plugin` (a plain object) satisfied @typescript-eslint/utils' own FlatConfig.Plugin type but not @eslint/core's Plugin type that defineConfig()'s own ConfigObject requires for its `plugins` field, under `exactOptionalPropertyTypes`.

// README's "lighter option" section, the manual single-rule pattern.
export const viaManualRules = defineConfig({
  files: ['src/**/*.ts'],
  ignores: ['src/index.ts'],
  plugins: { exadev: plugin },
  rules: {
    'exadev/no-non-barrel-reexport': 'error',
  },
});

// README's "lighter option" section, the string-`extends` bundled-config pattern.
export const viaStringExtends = defineConfig([
  {
    files: ['**/*.ts'],
    plugins: { exadev: plugin },
    extends: ['exadev/recommended'],
  },
]);

// README's "Example: a group-ranked repo" workspace architecture section, spread straight into defineConfig() alongside exadevConfig() the way a consumer combining both would.
export const viaWorkspaceArchitecture = defineConfig(
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
