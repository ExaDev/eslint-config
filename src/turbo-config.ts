import type { ConfigArrayValue, PublicConfigArray } from './config-types';
import { buildJsonLanguageBlock, requireJsonPlugin } from './json-language-config';
import type { RequireFn } from './optional-plugin';
import plugin from './plugin';
import { readTurboOptions, type TurboOptions } from './rules/turbo-options';
import { toPublicConfigArray } from './to-public-config-array';

export interface TurboConfigOptions extends TurboOptions {
  // Test seam only, never exposed through turboConfig()'s own public parameter; defaults to the real resolver, mirroring buildWorkspaceArchitectureConfig's identical seam.
  readonly requireFn?: RequireFn;
}

/** The JavaScript and TypeScript source files the source-level turbo rules apply to: where a `@boundaries-ignore` comment can appear and where `process.env` is read. */
export const SOURCE_FILE_GLOBS: readonly string[] = ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];

function buildSourceBlock(options: TurboOptions): ConfigArrayValue[number] {
  return { files: [...SOURCE_FILE_GLOBS], plugins: { exadev: plugin }, rules: { 'exadev/no-boundaries-ignore': ['error', options] } };
}

/**
 * Wires the turbo rules from one `TurboOptions` object. `turbo-script-convention`, `turbo-script-has-task` and `no-fix-in-cached-task-script` go onto `**\/package.json`; `turbo-task-has-script` and `turbo-task-outputs` onto `**\/turbo.json` (linted as JSONC, since turbo allows comments there). The `turbo boundaries` rules are opt-in and wired only when the `boundaries` option is given: `turbo-boundaries-config` on `turbo.json`, `turbo-package-tags` and `turbo-boundaries-script` on `package.json`, and `no-boundaries-ignore` on JavaScript and TypeScript sources. Internal: consumed by create-config.ts as one more `ConfigArrayValue` entry, and by `turboConfig` for a standalone consumer. Always needs `@eslint/json` resolvable, as workspace architecture does, since there is no auto-detected default to fall back to.
 */
export function buildTurboConfig(options: TurboConfigOptions = {}): ConfigArrayValue {
  const { requireFn, ...ruleOptions } = options;
  const validated = readTurboOptions(ruleOptions);
  const jsonPlugin = requireJsonPlugin('turbo rules', requireFn);
  const boundaries = validated.boundaries !== undefined;

  return [
    buildJsonLanguageBlock({
      jsonPlugin,
      language: 'json/json',
      files: ['**/package.json'],
      rules: {
        'exadev/turbo-script-convention': ['error', validated],
        'exadev/turbo-script-has-task': ['error', validated],
        'exadev/no-fix-in-cached-task-script': ['error', validated],
        ...(boundaries && { 'exadev/turbo-package-tags': ['error', validated], 'exadev/turbo-boundaries-script': ['error', validated] }),
      },
    }),
    buildJsonLanguageBlock({
      jsonPlugin,
      language: 'json/jsonc',
      files: ['**/turbo.json'],
      rules: {
        'exadev/turbo-task-has-script': ['error', validated],
        'exadev/turbo-task-outputs': ['error', validated],
        'exadev/turbo-task-config-inputs': ['error', validated],
        'exadev/turbo-task-graph': ['error', validated],
        'exadev/turbo-json-hygiene': ['error', validated],
        ...(boundaries && { 'exadev/turbo-boundaries-config': ['error', validated] }),
      },
    }),
    ...(boundaries ? [buildSourceBlock(validated)] : []),
  ];
}

/**
 * Wires the turbo rules from one `TurboOptions` object, returning ESLint core's own `Config[]` so the result spreads directly into `defineConfig(...)` (`...turboConfig(options)`) alongside a consumer's own configuration. See `buildTurboConfig` for which rules go onto which files. The options are optional: every default is the convention the README describes.
 *
 * Retyped at the same public boundary `workspaceArchitectureConfig` is, through `toPublicConfigArray`. Its parameter is `TurboOptions` rather than `TurboConfigOptions`, which keeps the `requireFn` test seam out of the published declarations.
 */
export function turboConfig(options: TurboOptions = {}): PublicConfigArray {
  return toPublicConfigArray(buildTurboConfig(options));
}
