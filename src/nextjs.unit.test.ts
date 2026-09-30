import { describe, expect, it } from 'vitest';
import { JSX_FILE_PATTERNS } from './react';
import { buildNextjsConfig } from './nextjs';
import plugin from './plugin';

const throwingRequireFn = () => {
  throw new Error('simulated missing package');
};

describe('buildNextjsConfig', () => {
  it('auto-detect: returns [] when nothing is resolvable', () => {
    expect(buildNextjsConfig({ plugin, requireFn: throwingRequireFn })).toEqual([]);
  });

  it('auto-detect: returns the upstream config and this package\'s own rule block when @next/eslint-plugin-next is genuinely installed', () => {
    // No requireFn override — this repo's own real devDependency (added specifically to test this branch) resolves for real.
    const result = buildNextjsConfig({ plugin });
    expect(result).toHaveLength(2);
    expect(result[0]?.rules).toBeDefined();
  });

  it('enabled: false wins over resolvability — still [] even when the package is genuinely installed', () => {
    expect(buildNextjsConfig({ plugin, enabled: false })).toEqual([]);
  });

  it('enabled: true and the package is missing — throws an actionable error naming the exact install command', () => {
    expect(() => buildNextjsConfig({ plugin, enabled: true, requireFn: throwingRequireFn })).toThrow(
      "@exadev/eslint-config: Next.js support was explicitly requested but '@next/eslint-plugin-next' could not be resolved. Install it with: pnpm add -D @next/eslint-plugin-next",
    );
  });

  it('enabled: true and the package is present — succeeds, no throw', () => {
    expect(() => buildNextjsConfig({ plugin, enabled: true })).not.toThrow();
  });

  it('reads the config from configs.core-web-vitals specifically, not the module root', () => {
    const requireFn = () => ({
      rules: { 'wrong-rule': 'error' },
      configs: { 'core-web-vitals': { rules: { 'next/no-html-link-for-pages': 'error' } } },
    });
    const [upstream] = buildNextjsConfig({ plugin, requireFn });
    expect(upstream?.rules).toStrictEqual({ 'next/no-html-link-for-pages': 'error' });
  });

  describe('the server component boundary block', () => {
    const requireFn = () => ({ configs: { 'core-web-vitals': { rules: {} } } });
    const [, block, ...rest] = buildNextjsConfig({ plugin, requireFn });

    it('follows the upstream config and is the last block', () => {
      expect(block).toBeDefined();
      expect(rest).toStrictEqual([]);
    });

    it('registers the plugin it was given', () => {
      expect(block?.plugins?.['exadev']).toBe(plugin);
    });

    it('enables both rules as errors, and nothing else', () => {
      expect(block?.rules).toStrictEqual({ 'exadev/no-non-serialisable-server-prop': 'error', 'exadev/no-external-member-jsx-tag': 'error' });
    });

    it('applies to the files that can hold JSX only', () => {
      expect(block?.files).toStrictEqual([...JSX_FILE_PATTERNS]);
    });

    it('is absent when the upstream config is, even for a plugin that is resolvable but has no such config', () => {
      expect(buildNextjsConfig({ plugin, requireFn: () => ({ configs: {} }) })).toStrictEqual([]);
    });
  });
});
