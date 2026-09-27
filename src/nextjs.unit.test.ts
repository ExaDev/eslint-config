import { describe, expect, it } from 'vitest';
import { buildNextjsConfig } from './nextjs';

const throwingRequireFn = () => {
  throw new Error('simulated missing package');
};

describe('buildNextjsConfig', () => {
  it('auto-detect: returns [] when nothing is resolvable', () => {
    expect(buildNextjsConfig({ requireFn: throwingRequireFn })).toEqual([]);
  });

  it('auto-detect: returns a real config block when @next/eslint-plugin-next is genuinely installed', () => {
    // No requireFn override — this repo's own real devDependency (added specifically to test this branch) resolves for real.
    const result = buildNextjsConfig();
    expect(result).toHaveLength(1);
    expect(result[0]?.rules).toBeDefined();
  });

  it('enabled: false wins over resolvability — still [] even when the package is genuinely installed', () => {
    expect(buildNextjsConfig({ enabled: false })).toEqual([]);
  });

  it('enabled: true and the package is missing — throws an actionable error naming the exact install command', () => {
    expect(() => buildNextjsConfig({ enabled: true, requireFn: throwingRequireFn })).toThrow(
      "@exadev/eslint-config: Next.js support was explicitly requested but '@next/eslint-plugin-next' could not be resolved. Install it with: pnpm add -D @next/eslint-plugin-next",
    );
  });

  it('enabled: true and the package is present — succeeds, no throw', () => {
    expect(() => buildNextjsConfig({ enabled: true })).not.toThrow();
  });

  it('reads the config from configs.core-web-vitals specifically, not the module root', () => {
    const requireFn = () => ({
      rules: { 'wrong-rule': 'error' },
      configs: { 'core-web-vitals': { rules: { 'next/no-html-link-for-pages': 'error' } } },
    });
    const result = buildNextjsConfig({ requireFn });
    expect(result).toHaveLength(1);
    expect(result[0]?.rules).toStrictEqual({ 'next/no-html-link-for-pages': 'error' });
  });
});
