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

/**
 * The named export a repo not using the full `exadevConfig()`/default-export bundle (hive, which builds its own `eslint.config.ts` from `plugin` directly) wires in on its own, exactly the same way `plugin`'s own recommended/barrel configs serve a consumer of the lighter `plugin` export.
 *
 * Returns `PublicConfigArray` (ESLint core's own `Config[]`), not the `ConfigArrayValue` buildWorkspaceArchitectureConfig above assembles internally, for the same reason `exadevConfig`'s own return type does (see PublicConfigArray's comment in config-types.ts): this is the one export besides `exadevConfig`/`defaultConfig` a consumer spreads directly into `defineConfig(...)` (`...workspaceArchitectureConfig(options)`, the README's own standalone usage), so it needs the identical cast at the identical boundary, or exactOptionalPropertyTypes rejects the spread with TS2345 (ExaDev/eslint-config#39): monorepo-template and hive both build their config with defineConfig under a tsconfig that sets exactOptionalPropertyTypes.
 */
export function workspaceArchitectureConfig(options: WorkspaceArchitectureConfigOptions): PublicConfigArray {
  return toPublicConfigArray(buildWorkspaceArchitectureConfig(options));
}
