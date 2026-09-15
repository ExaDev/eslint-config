import { describe, expect, it, vi } from 'vitest';
import { JSX_FILE_PATTERNS } from './react';
import plugin from './plugin';

describe('plugin.meta', () => {
  it('carries the exact package name and rule-reference namespace', () => {
    expect(plugin.meta?.name).toBe('@exadev/eslint-config');
    expect(plugin.meta?.namespace).toBe('exadev');
  });
});

describe('plugin.configs.recommended', () => {
  it('bundles the banned barrel policy plus this plugin\'s own always-present non-type-aware rules, referencing the fully-built plugin object', () => {
    const config = plugin.configs?.['recommended'];
    expect(Array.isArray(config)).toBe(false);
    if (!Array.isArray(config)) {
      expect(config?.plugins?.['exadev']).toBe(plugin);
      expect(config?.linterOptions).toStrictEqual({ noInlineConfig: true });
      expect(config?.rules?.['exadev/barrel-policy']).toStrictEqual(['error', { mode: 'banned' }]);
      expect(config?.rules?.['exadev/no-mutable-union-array-param']).toBe('error');
      expect(config?.rules?.['exadev/no-object-assign']).toBe('error');
      expect(config?.rules?.['exadev/no-pointless-reassignment']).toBe('error');
      expect(config?.rules?.['exadev/prefer-readonly-array-param']).toBe('error');
    }
  });
});

describe('plugin.configs.barrel', () => {
  it('bundles the single barrel policy, referencing the fully-built plugin object', () => {
    const config = plugin.configs?.['barrel'];
    expect(Array.isArray(config)).toBe(false);
    if (!Array.isArray(config)) {
      expect(config?.plugins?.['exadev']).toBe(plugin);
      expect(config?.rules?.['exadev/barrel-policy']).toStrictEqual(['error', { mode: 'single' }]);
    }
  });
});

describe('plugin.configs.react', () => {
  it('succeeds given this repo\'s own real devDependencies, returning properly files-scoped blocks', () => {
    const config = plugin.configs?.['react'];
    expect(Array.isArray(config)).toBe(true);
    if (Array.isArray(config)) {
      expect(config.length).toBeGreaterThan(0);
      for (const entry of config) {
        expect(entry.files).toEqual([...JSX_FILE_PATTERNS]);
      }
    }
  });
});

describe('plugin.configs.nextjs', () => {
  it('succeeds given this repo\'s own real devDependencies, returning a real config block', () => {
    const config = plugin.configs?.['nextjs'];
    expect(Array.isArray(config)).toBe(true);
    if (Array.isArray(config)) {
      expect(config).toHaveLength(1);
    }
  });
});

describe('plugin.configs.react/.nextjs options forwarding', () => {
  it('calls buildReactConfig with enabled: true specifically — not an empty options object, which would silently auto-detect instead of throwing on a missing peer', async () => {
    vi.resetModules();
    const buildReactConfig = vi.fn(() => []);
    vi.doMock('./react', () => ({ buildReactConfig, JSX_FILE_PATTERNS: ['**/*.jsx', '**/*.tsx'] }));
    const freshPlugin = (await import('./plugin')).default;
    void freshPlugin.configs?.['react'];
    expect(buildReactConfig).toHaveBeenCalledWith({ enabled: true });
    vi.doUnmock('./react');
    vi.resetModules();
  });

  it('calls buildNextjsConfig with enabled: true specifically — not an empty options object, which would silently auto-detect instead of throwing on a missing peer', async () => {
    vi.resetModules();
    const buildNextjsConfig = vi.fn(() => []);
    vi.doMock('./nextjs', () => ({ buildNextjsConfig }));
    const freshPlugin = (await import('./plugin')).default;
    void freshPlugin.configs?.['nextjs'];
    expect(buildNextjsConfig).toHaveBeenCalledWith({ enabled: true });
    vi.doUnmock('./nextjs');
    vi.resetModules();
  });
});
