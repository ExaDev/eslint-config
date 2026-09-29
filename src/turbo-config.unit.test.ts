import { defineConfig } from 'eslint/config';
import { describe, expect, it } from 'vitest';
import plugin from './plugin';
import { buildTurboConfig, turboConfig } from './turbo-config';

const throwingRequireFn = () => {
  throw new Error('simulated missing package');
};

const PACKAGE_JSON_RULES = ['exadev/turbo-script-convention', 'exadev/turbo-script-has-task', 'exadev/no-fix-in-cached-task-script'];
const TURBO_JSON_RULES = ['exadev/turbo-task-has-script', 'exadev/turbo-task-outputs', 'exadev/turbo-task-config-inputs', 'exadev/turbo-task-graph', 'exadev/turbo-json-hygiene'];
const BLOCKS_WITHOUT_BOUNDARIES = 2;
const BLOCKS_WITH_BOUNDARIES = 3;

describe('buildTurboConfig', () => {
  it('throws naming the real install command when @eslint/json is not resolvable', () => {
    expect(() => buildTurboConfig({ requireFn: throwingRequireFn })).toThrow(/^@exadev\/eslint-config: turbo rules needs '@eslint\/json'.*pnpm add -D @eslint\/json$/u);
  });

  it('rejects an unknown option before resolving anything', () => {
    expect(() => buildTurboConfig({ requireFn: throwingRequireFn, nope: true } as never)).toThrow(/"turbo options" must be an object/u);
  });
});

describe('turboConfig', () => {
  it('wires the package.json and turbo.json rules, each block registering the plugin, and no boundaries rules by default', () => {
    const result = turboConfig();
    expect(result).toHaveLength(BLOCKS_WITHOUT_BOUNDARIES);
    const [packageJson, turboJson] = result;
    expect(packageJson?.files).toStrictEqual(['**/package.json']);
    expect(packageJson?.language).toBe('json/json');
    expect(Object.keys(packageJson?.rules ?? {})).toEqual(PACKAGE_JSON_RULES);
    expect(turboJson?.files).toStrictEqual(['**/turbo.json']);
    expect(turboJson?.language).toBe('json/jsonc');
    expect(turboJson?.languageOptions).toStrictEqual({ allowTrailingCommas: true });
    expect(Object.keys(turboJson?.rules ?? {})).toEqual(TURBO_JSON_RULES);
    expect(packageJson?.plugins?.['exadev']).toBe(plugin);
  });

  it('passes the validated options to every rule at error severity', () => {
    const options = { prefix: '__', delegate: 'turbo' } as const;
    const [packageJson, turboJson] = turboConfig(options);
    for (const rule of PACKAGE_JSON_RULES) expect(packageJson?.rules?.[rule]).toStrictEqual(['error', options]);
    for (const rule of TURBO_JSON_RULES) expect(turboJson?.rules?.[rule]).toStrictEqual(['error', options]);
  });

  it('wires the boundaries rules, including one for source files, only when the boundaries option is given', () => {
    const options = { boundaries: { aggregateScript: 'check' } };
    const result = turboConfig(options);
    expect(result).toHaveLength(BLOCKS_WITH_BOUNDARIES);
    const [packageJson, turboJson, source] = result;
    expect(Object.keys(packageJson?.rules ?? {})).toEqual([...PACKAGE_JSON_RULES, 'exadev/turbo-package-tags', 'exadev/turbo-boundaries-script']);
    expect(Object.keys(turboJson?.rules ?? {})).toEqual([...TURBO_JSON_RULES, 'exadev/turbo-boundaries-config']);
    expect(source?.files).toStrictEqual(['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
    expect(source?.language).toBeUndefined();
    expect(source?.plugins?.['exadev']).toBe(plugin);
    expect(source?.rules).toStrictEqual({ 'exadev/no-boundaries-ignore': ['error', options] });
  });

  it('treats an empty boundaries object as opting in', () => {
    expect(turboConfig({ boundaries: {} })).toHaveLength(BLOCKS_WITH_BOUNDARIES);
  });

  it('spreads straight into defineConfig', () => {
    expect(defineConfig(...turboConfig({ boundaries: {} }))).toHaveLength(BLOCKS_WITH_BOUNDARIES);
  });
});
