import { describe, expect, it } from 'vitest';
import { buildTurboEnvConfig } from './turbo-env';

const throwingRequireFn = () => {
  throw new Error('simulated missing package');
};

describe('buildTurboEnvConfig', () => {
  it('auto-detect: returns [] when nothing is resolvable', () => {
    expect(buildTurboEnvConfig({ requireFn: throwingRequireFn })).toEqual([]);
  });

  it('auto-detect: returns the plugin\'s flat config, scoped to JavaScript and TypeScript sources, when eslint-plugin-turbo is genuinely installed', () => {
    // No requireFn override: this repo's own devDependency resolves for real.
    const result = buildTurboEnvConfig();
    expect(result).toHaveLength(1);
    expect(result[0]?.files).toStrictEqual(['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
    expect(Object.keys(result[0]?.rules ?? {})).toEqual(['turbo/no-undeclared-env-vars']);
    expect(Object.keys(result[0]?.plugins ?? {})).toEqual(['turbo']);
  });

  it('enabled: false wins over resolvability', () => {
    expect(buildTurboEnvConfig({ enabled: false })).toEqual([]);
  });

  it('enabled: true and the package is missing: throws an actionable error naming the exact install command', () => {
    expect(() => buildTurboEnvConfig({ enabled: true, requireFn: throwingRequireFn })).toThrow(
      "@exadev/eslint-config: Turbo environment variable checking was explicitly requested but 'eslint-plugin-turbo' could not be resolved. Install it with: pnpm add -D eslint-plugin-turbo",
    );
  });

  it('enabled: true and the package is present: succeeds', () => {
    expect(() => buildTurboEnvConfig({ enabled: true })).not.toThrow();
  });

  it('reads configs["flat/recommended"] specifically, not the module root or the legacy recommended config', () => {
    const requireFn = () => ({
      rules: { 'wrong-rule': 'error' },
      configs: { recommended: { rules: { legacy: 'error' } }, 'flat/recommended': { rules: { 'turbo/no-undeclared-env-vars': 'error' } } },
    });
    const result = buildTurboEnvConfig({ requireFn });
    expect(result).toHaveLength(1);
    expect(result[0]?.rules).toStrictEqual({ 'turbo/no-undeclared-env-vars': 'error' });
  });

  it('keeps a config\'s own fields beside the files scope', () => {
    const requireFn = () => ({ configs: { 'flat/recommended': { name: 'turbo/recommended', settings: { turbo: { cacheKey: 1 } }, rules: {} } } });
    expect(buildTurboEnvConfig({ requireFn })[0]).toStrictEqual({ name: 'turbo/recommended', settings: { turbo: { cacheKey: 1 } }, rules: {}, files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'] });
  });
});
