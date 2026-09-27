import { defineConfig } from 'eslint/config';

import { describe, expect, it } from 'vitest';

import { buildWorkspaceArchitectureConfig, workspaceArchitectureConfig } from './workspace-architecture';

const throwingRequireFn = () => {
  throw new Error('simulated missing package');
};

const MINIMAL = { groups: [{ name: 'core', rank: 0 }] };

describe('workspaceArchitectureConfig', () => {
  // requireFn is buildWorkspaceArchitectureConfig's own test seam, deliberately absent from workspaceArchitectureConfig's public parameter type (see that function's own comment), so the two requireFn-driven cases below call the internal builder directly rather than the public export.
  it('throws naming the real install command when @eslint/json is not resolvable', () => {
    expect(() => buildWorkspaceArchitectureConfig({ ...MINIMAL, requireFn: throwingRequireFn })).toThrow(/pnpm add -D @eslint\/json/);
  });

  it('wires no-uphill-dependency and no-dependency-cycle onto **/package.json, but not package-name-mirrors-path when "naming" is omitted', () => {
    // No requireFn override: this repo's own real devDependency resolves for real.
    const result = workspaceArchitectureConfig(MINIMAL);
    expect(result).toHaveLength(1);
    const [config] = result;
    expect(config?.files).toStrictEqual(['**/package.json']);
    expect(config?.language).toBe('json/json');
    expect(config?.rules?.['exadev/no-uphill-dependency']).toStrictEqual(['error', { groups: MINIMAL.groups }]);
    expect(config?.rules?.['exadev/no-dependency-cycle']).toStrictEqual(['error', { groups: MINIMAL.groups }]);
    expect(config?.rules).not.toHaveProperty('exadev/package-name-mirrors-path');
  });

  it('also wires package-name-mirrors-path when "naming" is given', () => {
    const result = workspaceArchitectureConfig({ ...MINIMAL, naming: { scope: '@acme' } });
    const [config] = result;
    expect(config?.rules?.['exadev/package-name-mirrors-path']).toStrictEqual(['error', { groups: MINIMAL.groups, naming: { scope: '@acme' } }]);
  });

  it('validates its own options through readWorkspaceArchitectureOptions, throwing for a missing "groups"', () => {
    expect(() => workspaceArchitectureConfig({} as never)).toThrow(/groups/);
  });

  it('resolves a json-language plugin that is its own default export directly, not nested under .default', () => {
    const directPlugin = { languages: { json: {} } };
    const result = buildWorkspaceArchitectureConfig({ ...MINIMAL, requireFn: () => directPlugin });
    expect(result[0]?.plugins?.['json']).toBe(directPlugin);
  });

  // Type-level: this file's own tsconfig sets exactOptionalPropertyTypes (the same setting monorepo-template and hive both build their real config under), so a regression that widens workspaceArchitectureConfig's return type back to the internal, typescript-eslint-typed ConfigArrayValue is caught here at compile time, not merely at runtime (ExaDev/eslint-config#39: TS2345, Config not assignable to InfiniteArray<ConfigWithExtends>, wherever a consumer spread the standalone export straight into defineConfig).
  it('spreads directly into defineConfig under exactOptionalPropertyTypes, the README\'s own standalone usage', () => {
    const config = defineConfig(...workspaceArchitectureConfig(MINIMAL));
    expect(config).toHaveLength(1);
  });
});
