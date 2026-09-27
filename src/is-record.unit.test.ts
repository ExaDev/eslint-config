import { describe, expect, it } from 'vitest';
import { isRecord } from './is-record';

describe('isRecord', () => {
  it('accepts a plain object', () => {
    expect(isRecord({ name: 'x' })).toBe(true);
  });

  it('rejects an array', () => {
    expect(isRecord(['x'])).toBe(false);
  });

  it('rejects null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('rejects a string', () => {
    expect(isRecord('x')).toBe(false);
  });

  it('rejects a number', () => {
    expect(isRecord(1)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isRecord(undefined)).toBe(false);
  });

  it('accepts an empty object', () => {
    expect(isRecord({})).toBe(true);
  });
});
