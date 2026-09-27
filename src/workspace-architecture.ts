import type { ConfigArrayValue, PublicConfigArray } from './config-types';
import { resolveJsonPlugin } from './json-plugin';
import { tryRequire, type RequireFn } from './optional-plugin';
import plugin from './plugin';
import { readWorkspaceArchitectureOptions, type WorkspaceArchitectureOptions } from './rules/workspace-options';
import { toPublicConfigArray } from './to-public-config-array';

export interface WorkspaceArchitectureConfigOptions extends WorkspaceArchitectureOptions {
  // Test seam only, never exposed through exadevConfig()'s own public options; defaults to the real resolver, mirroring buildPackageJsonKeyOrderConfig's identical seam.
  readonly requireFn?: RequireFn;
}

/**
 * Wires the three workspace-architecture rules (no-uphill-dependency, no-dependency-cycle, and, when the shared `naming` option is given, package-name-mirrors-path) onto `**\/package.json`, all three sharing the one options object given here. Internal: consumed by create-config.ts as one more `ConfigArrayValue` entry among the rest of `exadevConfig`'s own internally-typed build (see recommendedTypeChecked, buildReactConfig, buildNextjsConfig et al. for the same shape), before that whole array is converted once at `exadevConfig`'s own outer boundary. Never exported directly; a standalone consumer wants `workspaceArchitectureConfig` below instead.
 *
 * Unlike buildPackageJsonKeyOrderConfig, this has no auto-detecting tri-state: workspace architecture rules require real configuration (`groups` has no sensible default), so this is off unless a consumer calls it at all, and, once called, always requires `@eslint/json` to be resolvable (there is no "silently do nothing" case to fall back to the way an unconfigured, purely auto-detected feature can).
 *
 * Takes `WorkspaceArchitectureConfigOptions` (the `requireFn` test seam included) rather than the public `workspaceArchitectureConfig` export's own `WorkspaceArchitectureOptions`, so this internal builder's own tests (workspace-architecture.unit.test.ts) can still simulate an unresolvable `@eslint/json` directly, without the seam ever reaching the public function's parameter type or dist/index.d.ts.
 */
export function buildWorkspaceArchitectureConfig(options: WorkspaceArchitectureConfigOptions): ConfigArrayValue {
  const { requireFn, ...ruleOptions } = options;
  const validated = readWorkspaceArchitectureOptions(ruleOptions);

  const jsonPlugin = resolveJsonPlugin(tryRequire('@eslint/json', requireFn));
  if (jsonPlugin === undefined) {
    throw new Error(
      "@exadev/eslint-config: workspace architecture rules require '@eslint/json' but it could not be resolved. Install it with: pnpm add -D @eslint/json",
    );
  }

  return [
    {
      files: ['**/package.json'],
      language: 'json/json',
      plugins: { exadev: plugin, json: jsonPlugin },
      rules: {
        'exadev/no-uphill-dependency': ['error', validated],
        'exadev/no-dependency-cycle': ['error', validated],
        ...(validated.naming !== undefined && { 'exadev/package-name-mirrors-path': ['error', validated] }),
      },
    },
  ];
}

// Internal to this public export, not part of its consumer-facing contract (tsdown emits only `/** */` blocks into dist/index.d.ts, never `//` comments): this function's own parameter is deliberately WorkspaceArchitectureOptions rather than buildWorkspaceArchitectureConfig's own WorkspaceArchitectureConfigOptions above, which adds a requireFn test seam used only by that internal builder's own unit tests. Omitting requireFn from this exported signature is what keeps the seam out of dist/index.d.ts; passing options straight through still satisfies buildWorkspaceArchitectureConfig's own (structurally wider) parameter type, since WorkspaceArchitectureOptions simply carries no requireFn key rather than one whose type conflicts. The Config[] cast this function applies is the identical public-boundary cast exadevConfig's own default export applies (see PublicConfigArray's comment in config-types.ts), needed for the same reason: a repo not using the full exadevConfig()/default-export bundle (hive builds its own eslint.config.ts from plugin directly, wiring this export in on its own) spreads this array straight into defineConfig(...) under exactOptionalPropertyTypes, which rejects the internal ConfigArrayValue's own typescript-eslint-typed elements with TS2345 (ExaDev/eslint-config#39) absent this cast.
/**
 * Wires the three workspace-architecture rules (`no-uphill-dependency`, `no-dependency-cycle`, and, when the shared `naming` option is given, `package-name-mirrors-path`) onto `**\/package.json` from one `WorkspaceArchitectureOptions` object, returning ESLint core's own `Config[]` so the result spreads directly into `defineConfig(...)` (`...workspaceArchitectureConfig(options)`, the README's own standalone usage) alongside a consumer's own configuration.
 */
export function workspaceArchitectureConfig(options: WorkspaceArchitectureOptions): PublicConfigArray {
  return toPublicConfigArray(buildWorkspaceArchitectureConfig(options));
}
