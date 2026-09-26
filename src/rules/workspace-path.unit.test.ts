import { describe, expect, it } from 'vitest';
import { splitPathSegments } from './workspace-path';

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
