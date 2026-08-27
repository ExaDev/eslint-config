import type { Linter } from 'eslint';
import { Linter as LinterClass } from 'eslint';
import { describe, expect, it } from 'vitest';
import { buildReactConfig, JSX_FILE_PATTERNS } from './react';

const throwingRequireFn = () => {
  throw new Error('simulated missing package');
};

describe('buildReactConfig', () => {
  it('auto-detect: returns [] when nothing is resolvable', () => {
    expect(buildReactConfig({ requireFn: throwingRequireFn })).toEqual([]);
  });

  it('auto-detect: returns real config blocks when the packages are genuinely installed', () => {
    // No requireFn override -- this repo's own real devDependencies (added specifically to test this branch) resolve for real.
    const result = buildReactConfig();
    expect(result.length).toBeGreaterThan(0);
    for (const config of result) {
      expect(config.files).toEqual([...JSX_FILE_PATTERNS]);
      expect(config.rules).toBeDefined();
    }
  });

  it('partial resolution: anchor present, companions missing -- no throw, anchor-only result', () => {
    const requireFn = (specifier: string) => {
      if (specifier === 'eslint-plugin-react') return { configs: { flat: { recommended: { rules: { 'react/jsx-key': 'error' } } } } };
      throw new Error('simulated missing companion');
    };
    const result = buildReactConfig({ requireFn });
    expect(result).toHaveLength(1);
    expect(result[0]?.files).toEqual([...JSX_FILE_PATTERNS]);
  });

  it('enabled: false wins over resolvability -- still [] even when packages are genuinely installed', () => {
    expect(buildReactConfig({ enabled: false })).toEqual([]);
  });

  it('enabled: true and the anchor is missing -- throws an actionable error', () => {
    expect(() => buildReactConfig({ enabled: true, requireFn: throwingRequireFn })).toThrow(/eslint-plugin-react/);
  });

  it('enabled: true and the anchor is present -- succeeds, no throw', () => {
    expect(() => buildReactConfig({ enabled: true })).not.toThrow();
  });
});

describe('buildReactConfig -- file-glob scoping proof (the false-positive-activation safety net)', () => {
  const linter = new LinterClass();

  // Plain espree with ecmaFeatures.jsx (not the TypeScript parser) so both file cases below parse identically -- the only thing that differs is the filename, isolating the file-glob mechanism itself rather than any parser difference.
  function lint(code: string, filename: string) {
    const config: Linter.Config[] = [
      { files: ['**'], languageOptions: { sourceType: 'module', ecmaVersion: 2022, parserOptions: { ecmaFeatures: { jsx: true } } } },
      ...buildReactConfig(),
    ] as Linter.Config[];
    return linter.verify(code, config, filename).map((message) => message.ruleId);
  }

  // Missing `key` prop on a list of JSX elements -- a real react/jsx-key violation.
  const jsxViolatingCode = 'const els = [1, 2, 3].map((x) => <span>{x}</span>);\n';

  it('reports a react/ violation when the file is .jsx', () => {
    const ruleIds = lint(jsxViolatingCode, 'component.jsx');
    expect(ruleIds.some((id) => id?.startsWith('react/') === true)).toBe(true);
  });

  it('reports NO react/ violation for the identical code when the file is .js', () => {
    const ruleIds = lint(jsxViolatingCode, 'component.js');
    expect(ruleIds.some((id) => id?.startsWith('react/') === true)).toBe(false);
  });
});
