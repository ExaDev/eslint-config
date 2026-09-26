import type { ConfigArrayValue } from './config-types';
import { resolveJsonPlugin } from './json-plugin';
import { tryRequire, type RequireFn } from './optional-plugin';
import plugin from './plugin';
import { readWorkspaceArchitectureOptions, type WorkspaceArchitectureOptions } from './rules/workspace-options';

export interface WorkspaceArchitectureConfigOptions extends WorkspaceArchitectureOptions {
  // Test seam only, never exposed through exadevConfig()'s own public options; defaults to the real resolver, mirroring buildPackageJsonKeyOrderConfig's identical seam.
  readonly requireFn?: RequireFn;
}

/**
 * Wires the three workspace-architecture rules (no-uphill-dependency, no-dependency-cycle, and, when the shared `naming` option is given, package-name-mirrors-path) onto `**\/package.json`, all three sharing the one options object given here. This is the named export a repo not using the full `exadevConfig()`/default-export bundle (hive, which builds its own `eslint.config.ts` from `plugin` directly) wires in on its own, exactly the same way `plugin`'s own recommended/barrel configs serve a consumer of the lighter `plugin` export.
 *
 * Unlike buildPackageJsonKeyOrderConfig, this has no auto-detecting tri-state: workspace architecture rules require real configuration (`groups` has no sensible default), so this is off unless a consumer calls it at all, and, once called, always requires `@eslint/json` to be resolvable (there is no "silently do nothing" case to fall back to the way an unconfigured, purely auto-detected feature can).
 */
export function workspaceArchitectureConfig(options: WorkspaceArchitectureConfigOptions): ConfigArrayValue {
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
