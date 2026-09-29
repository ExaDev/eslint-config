import type { ConfigArrayValue, PublicConfigArray } from './config-types';
import { buildJsonLanguageBlock, requireJsonPlugin } from './json-language-config';
import type { RequireFn } from './optional-plugin';
import { readWorkspaceArchitectureOptions, type WorkspaceArchitectureOptions } from './rules/workspace-options';
import { toPublicConfigArray } from './to-public-config-array';

export interface WorkspaceArchitectureConfigOptions extends WorkspaceArchitectureOptions {
  // Test seam only, never exposed through exadevConfig()'s own public options; defaults to the real resolver, mirroring buildPackageJsonKeyOrderConfig's identical seam.
  readonly requireFn?: RequireFn;
}

/**
 * Wires the workspace-architecture rules onto `**\/package.json`, all sharing the one options object given here. Internal: consumed by create-config.ts as one more `ConfigArrayValue` entry among the rest of `exadevConfig`'s own internally-typed build (see recommendedTypeChecked, buildReactConfig, buildNextjsConfig et al. for the same shape), before that whole array is converted once at `exadevConfig`'s own outer boundary. Never exported directly; a standalone consumer wants `workspaceArchitectureConfig` below instead.
 *
 * Unlike buildPackageJsonKeyOrderConfig, this has no auto-detecting tri-state: workspace architecture rules require real configuration (`groups` has no sensible default), so this is off unless a consumer calls it at all, and, once called, always requires `@eslint/json` to be resolvable (there is no "silently do nothing" case to fall back to the way an unconfigured, purely auto-detected feature can).
 *
 * Takes `WorkspaceArchitectureConfigOptions` (the `requireFn` test seam included) rather than the public `workspaceArchitectureConfig` export's own `WorkspaceArchitectureOptions`, so this internal builder's own tests (workspace-architecture.unit.test.ts) can still simulate an unresolvable `@eslint/json` directly, without the seam ever reaching the public function's parameter type or dist/index.d.ts.
 */
export function buildWorkspaceArchitectureConfig(options: WorkspaceArchitectureConfigOptions): ConfigArrayValue {
  const { requireFn, ...ruleOptions } = options;
  const validated = readWorkspaceArchitectureOptions(ruleOptions);

  const jsonPlugin = requireJsonPlugin('workspace architecture rules', requireFn);

  return [
    buildJsonLanguageBlock({
      jsonPlugin,
      language: 'json/json',
      files: ['**/package.json'],
      rules: {
        'exadev/no-uphill-dependency': ['error', validated],
        'exadev/no-dependency-cycle': ['error', validated],
        ...(validated.naming !== undefined && { 'exadev/package-name-mirrors-path': ['error', validated] }),
        ...(validated.requiredFiles !== undefined && { 'exadev/package-has-files': ['error', validated] }),
        ...(validated.devOnly !== undefined && { 'exadev/dev-dependency-only': ['error', validated] }),
        ...(validated.requiredScripts !== undefined && { 'exadev/required-scripts': ['error', validated] }),
      },
    }),
  ];
}

// Internal to this public export, not part of its consumer-facing contract (tsdown emits only `/** */` blocks into dist/index.d.ts, never `//` comments): this function's own parameter is deliberately WorkspaceArchitectureOptions rather than buildWorkspaceArchitectureConfig's own WorkspaceArchitectureConfigOptions above, which adds a requireFn test seam used only by that internal builder's own unit tests. Omitting requireFn from this exported signature is what keeps the seam out of dist/index.d.ts; passing options straight through still satisfies buildWorkspaceArchitectureConfig's own (structurally wider) parameter type, since WorkspaceArchitectureOptions simply carries no requireFn key rather than one whose type conflicts. This function returns Config[] by delegating to toPublicConfigArray, the same single-cast public-boundary helper exadevConfig's own default export uses (see PublicConfigArray's comment in config-types.ts and the cast itself in to-public-config-array.ts), needed for the same reason: a repo not using the full exadevConfig()/default-export bundle (hive builds its own eslint.config.ts from plugin directly, wiring this export in on its own) spreads this array straight into defineConfig(...) under exactOptionalPropertyTypes, which rejects the internal ConfigArrayValue's own typescript-eslint-typed elements with TS2345 (ExaDev/eslint-config#39) absent that cast.
/**
 * Wires the workspace-architecture rules onto `**\/package.json` from one `WorkspaceArchitectureOptions` object (`no-uphill-dependency` and `no-dependency-cycle` always; `package-name-mirrors-path`, `package-has-files`, `dev-dependency-only` and `required-scripts` only when their own option is given), returning ESLint core's own `Config[]` so the result spreads directly into `defineConfig(...)` (`...workspaceArchitectureConfig(options)`, the README's own standalone usage) alongside a consumer's own configuration.
 */
export function workspaceArchitectureConfig(options: WorkspaceArchitectureOptions): PublicConfigArray {
  return toPublicConfigArray(buildWorkspaceArchitectureConfig(options));
}
