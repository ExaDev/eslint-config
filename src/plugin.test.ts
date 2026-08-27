import { describe, expect, it } from 'vitest';
import { JSX_FILE_PATTERNS } from './react';
import plugin from './plugin';

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
