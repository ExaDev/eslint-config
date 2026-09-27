import { describe, expect, it } from 'vitest';
import { requireChar, splitPathSegments } from './workspace-path';

describe('splitPathSegments', () => {
  it('splits a clean path into its segments', () => {
    expect(splitPathSegments('core/clock/contract')).toEqual(['core', 'clock', 'contract']);
  });

  it('drops an empty segment from a leading slash', () => {
    expect(splitPathSegments('/core/clock')).toEqual(['core', 'clock']);
  });

  it('drops an empty segment from a trailing slash', () => {
    expect(splitPathSegments('core/clock/')).toEqual(['core', 'clock']);
  });

  it('drops an empty segment from a doubled separator', () => {
    expect(splitPathSegments('core//clock')).toEqual(['core', 'clock']);
  });

  it('returns an empty array for an empty string', () => {
    expect(splitPathSegments('')).toEqual([]);
  });

  it('returns a single segment for a path with no separator at all', () => {
    expect(splitPathSegments('core')).toEqual(['core']);
  });
});

describe('requireChar', () => {
  it('returns the character at a genuinely in-bounds index', () => {
    expect(requireChar('abc', 1)).toBe('b');
  });

  it('throws for an out-of-bounds index, a shape no real call site (each bounded by its own loop\'s "index < length" condition) can produce', () => {
    const outOfBoundsIndex = 3;
    expect(() => requireChar('abc', outOfBoundsIndex)).toThrow(/Unreachable/);
  });
});
