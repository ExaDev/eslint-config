import { describe, expect, it } from 'vitest';
import { readToolConfigFlag, readToolConfigRecord, readToolConfigScope } from './tool-config-options';

describe('readToolConfigRecord', () => {
  it('returns an object whose keys are all allowed', () => {
    expect(readToolConfigRecord({ files: 'a.ts' }, 'exadev/x', ['files', 'flag'])).toStrictEqual({ files: 'a.ts' });
    expect(readToolConfigRecord({}, 'exadev/x', ['files'])).toStrictEqual({});
  });

  it('throws naming the rule for a non-object and for an unknown key', () => {
    expect(() => readToolConfigRecord(undefined, 'exadev/x', ['files'])).toThrow('"exadev/x" options must be an object.');
    expect(() => readToolConfigRecord([], 'exadev/x', ['files'])).toThrow('"exadev/x" options must be an object.');
    expect(() => readToolConfigRecord({ nope: 1 }, 'exadev/x', ['files'])).toThrow('"exadev/x" has an unknown key "nope". Allowed keys: files.');
  });
});

describe('readToolConfigScope', () => {
  it('uses the default globs when files is omitted', () => {
    const inScope = readToolConfigScope({}, 'exadev/x', ['**/tool.config.*']);
    expect(inScope('/repo/tool.config.ts', '/repo')).toBe(true);
    expect(inScope('/repo/a/b/tool.config.mjs', '/repo')).toBe(true);
    expect(inScope('/repo/other.ts', '/repo')).toBe(false);
  });

  it('lets files replace the defaults, widening a bare name to any depth', () => {
    const inScope = readToolConfigScope({ files: 'mine.config.ts' }, 'exadev/x', ['**/tool.config.*']);
    expect(inScope('/repo/a/mine.config.ts', '/repo')).toBe(true);
    expect(inScope('/repo/tool.config.ts', '/repo')).toBe(false);
  });

  it('honours excludes in a files list and rejects an empty or malformed one', () => {
    const inScope = readToolConfigScope({ files: ['**/*.config.ts', '!legacy/**'] }, 'exadev/x', []);
    expect(inScope('/repo/a.config.ts', '/repo')).toBe(true);
    expect(inScope('/repo/legacy/a.config.ts', '/repo')).toBe(false);
    expect(() => readToolConfigScope({ files: [] }, 'exadev/x', [])).toThrow('"exadev/x files"');
    expect(() => readToolConfigScope({ files: 3 }, 'exadev/x', [])).toThrow('"exadev/x files"');
  });
});

describe('readToolConfigFlag', () => {
  it('defaults to false and reads a boolean', () => {
    expect(readToolConfigFlag({}, 'flag', 'exadev/x')).toBe(false);
    expect(readToolConfigFlag({ flag: true }, 'flag', 'exadev/x')).toBe(true);
    expect(readToolConfigFlag({ flag: false }, 'flag', 'exadev/x')).toBe(false);
  });

  it('throws naming the key for anything else', () => {
    expect(() => readToolConfigFlag({ flag: 1 }, 'flag', 'exadev/x')).toThrow('"exadev/x" needs "flag" to be a boolean.');
  });
});
