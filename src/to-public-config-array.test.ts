import { describe, expect, it } from 'vitest';
import type { ConfigArrayValue } from './config-types';
import { toPublicConfigArray } from './to-public-config-array';

describe('toPublicConfigArray', () => {
  it('returns the same array reference, unmodified -- a type-only relabelling, not a runtime transform', () => {
    const built: ConfigArrayValue = [{ rules: { 'no-console': 'warn' } }, { files: ['**/*.spec.ts'] }];

    expect(toPublicConfigArray(built)).toBe(built);
  });
});
