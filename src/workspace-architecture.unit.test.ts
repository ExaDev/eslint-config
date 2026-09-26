import { describe, expect, it } from 'vitest';
import { workspaceArchitectureConfig } from './workspace-architecture';

const throwingRequireFn = () => {
  throw new Error('simulated missing package');
};

const MINIMAL = { groups: [{ name: 'core', rank: 0 }] };

describe('workspaceArchitectureConfig', () => {
  it('throws naming the real install command when @eslint/json is not resolvable', () => {
    expect(() => workspaceArchitectureConfig({ ...MINIMAL, requireFn: throwingRequireFn })).toThrow(/pnpm add -D @eslint\/json/);
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
    const result = workspaceArchitectureConfig({ ...MINIMAL, requireFn: () => directPlugin });
    expect(result[0]?.plugins?.['json']).toBe(directPlugin);
  });
});
