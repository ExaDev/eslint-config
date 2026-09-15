import type { Linter } from 'eslint';
import { Linter as LinterClass } from 'eslint';
import { describe, expect, it } from 'vitest';
import { buildReactConfig, JSX_FILE_PATTERNS } from './react';

const throwingRequireFn = () => {
  throw new Error('simulated missing package');
};

describe('buildReactConfig', () => {
  it('exports the exact JSX file glob pair', () => {
    expect(JSX_FILE_PATTERNS).toStrictEqual(['**/*.jsx', '**/*.tsx']);
  });

  it('auto-detect: returns [] when nothing is resolvable', () => {
    expect(buildReactConfig({ requireFn: throwingRequireFn })).toEqual([]);
  });

  it('auto-detect: returns real config blocks when the packages are genuinely installed', () => {
    // No requireFn override — this repo's own real devDependencies (added specifically to test this branch) resolve for real.
    const result = buildReactConfig();
    expect(result.length).toBeGreaterThan(0);
    for (const config of result) {
      expect(config.files).toEqual([...JSX_FILE_PATTERNS]);
      expect(config.rules).toBeDefined();
    }
  });

  it('partial resolution: anchor present, companions missing — no throw, anchor-only result', () => {
    const requireFn = (specifier: string) => {
      if (specifier === 'eslint-plugin-react') return { configs: { flat: { recommended: { rules: { 'react/jsx-key': 'error' } } } } };
      throw new Error('simulated missing companion');
    };
    const result = buildReactConfig({ requireFn });
    expect(result).toHaveLength(1);
    expect(result[0]?.files).toEqual([...JSX_FILE_PATTERNS]);
  });

  it('enabled: false wins over resolvability — still [] even when packages are genuinely installed', () => {
    expect(buildReactConfig({ enabled: false })).toEqual([]);
  });

  it('enabled: true and the anchor is missing — throws an actionable error naming the exact install command', () => {
    expect(() => buildReactConfig({ enabled: true, requireFn: throwingRequireFn })).toThrow(
      "@exadev/eslint-config: React support was explicitly requested but 'eslint-plugin-react' could not be resolved. Install it with: pnpm add -D eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y",
    );
  });

  it('enabled: true and the anchor is present — succeeds, no throw', () => {
    expect(() => buildReactConfig({ enabled: true })).not.toThrow();
  });

  it('does not fall through to react-hooks/jsx-a11y config when the anchor eslint-plugin-react config itself is unresolvable', () => {
    const requireFn = (specifier: string) => {
      if (specifier === 'eslint-plugin-react') return {};
      if (specifier === 'eslint-plugin-react-hooks') {
        return { configs: { flat: { 'recommended-latest': { rules: { 'react-hooks/rules-of-hooks': 'error' } } } } };
      }
      throw new Error('simulated missing companion');
    };
    expect(buildReactConfig({ requireFn })).toEqual([]);
  });

  it('falls back to configs.recommended-latest (no "flat" nesting) for eslint-plugin-react-hooks when the flat-nested variant is absent', () => {
    const requireFn = (specifier: string) => {
      if (specifier === 'eslint-plugin-react') return { configs: { flat: { recommended: { rules: { 'react/jsx-key': 'error' } } } } };
      if (specifier === 'eslint-plugin-react-hooks') {
        return { rules: { 'top-level-rule': 'error' }, configs: { 'recommended-latest': { rules: { 'react-hooks/rules-of-hooks': 'error' } } } };
      }
      throw new Error('simulated missing companion');
    };
    const result = buildReactConfig({ requireFn });
    const mergedRules = result.reduce<Record<string, unknown>>((acc, config) => ({ ...acc, ...config.rules }), {});
    expect(mergedRules['react-hooks/rules-of-hooks']).toBe('error');
    expect(mergedRules['top-level-rule']).toBeUndefined();
  });

  it('pairs recommended with jsx-runtime: react-in-jsx-scope and jsx-uses-react are off, not merely absent', () => {
    // The classic-runtime rules must be explicitly turned off (0/'off'), not just missing from the merged rules map — 'missing' would mean flat/recommended never enabled them at all, which is a different (and false) claim than "jsx-runtime turned them back off after recommended turned them on".
    const result = buildReactConfig();
    const mergedRules = result.reduce<Record<string, unknown>>((acc, config) => ({ ...acc, ...config.rules }), {});
    expect(mergedRules['react/react-in-jsx-scope']).toBe(0);
    expect(mergedRules['react/jsx-uses-react']).toBe(0);
  });
});

describe('buildReactConfig — file-glob scoping proof (the false-positive-activation safety net)', () => {
  const linter = new LinterClass();

  // Plain espree with ecmaFeatures.jsx (not the TypeScript parser) so both file cases below parse identically — the only thing that differs is the filename, isolating the file-glob mechanism itself rather than any parser difference.
  function lint(code: string, filename: string) {
    const config: Linter.Config[] = [
      { files: ['**'], languageOptions: { sourceType: 'module', ecmaVersion: 2022, parserOptions: { ecmaFeatures: { jsx: true } } } },
      ...buildReactConfig(),
    ] as Linter.Config[];
    return linter.verify(code, config, filename).map((message) => message.ruleId);
  }

  // Missing `key` prop on a list of JSX elements — a real react/jsx-key violation.
  const jsxViolatingCode = 'const els = [1, 2, 3].map((x) => <span>{x}</span>);\n';

  it('reports a react/ violation when the file is .jsx', () => {
    const ruleIds = lint(jsxViolatingCode, 'component.jsx');
    expect(ruleIds.some((id) => id?.startsWith('react/') === true)).toBe(true);
  });

  it('reports NO react/ violation for the identical code when the file is .js', () => {
    const ruleIds = lint(jsxViolatingCode, 'component.js');
    expect(ruleIds.some((id) => id?.startsWith('react/') === true)).toBe(false);
  });

  // Regression test for the jsx-runtime pairing above: flat/recommended alone assumes the classic runtime and flags this exact, otherwise-correct component with react/react-in-jsx-scope; every React 17+ project (the automatic-runtime default, and the only mode Next.js's own compiler supports) writes JSX with no React import in scope at all.
  it('reports NO react-in-jsx-scope for a component with no React import (the automatic JSX runtime)', () => {
    const automaticRuntimeCode = 'export function Greeting() {\n  return <span>hi</span>;\n}\n';
    const ruleIds = lint(automaticRuntimeCode, 'component.jsx');
    expect(ruleIds).not.toContain('react/react-in-jsx-scope');
    expect(ruleIds).not.toContain('react/jsx-uses-react');
  });
});
