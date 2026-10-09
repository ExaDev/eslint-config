import { describe, expect, it } from 'vitest';
import { assertOnlyKeys, createEntryScope, readEntryFiles, readEntryRecords, readRequiredString, readRequiredStrings, readSpecifierPatterns } from './file-entry';

const CWD = '/repo';

function scoped(globs: readonly string[], relativePath: string): boolean {
  return createEntryScope(globs)(`${CWD}/${relativePath}`, CWD);
}

describe('createEntryScope', () => {
  it('treats a glob without a slash as a filename at any depth', () => {
    expect(scoped(['fake.ts'], 'fake.ts')).toBe(true);
    expect(scoped(['fake.ts'], 'a/b/fake.ts')).toBe(true);
    expect(scoped(['fake.ts'], 'a/notfake.ts')).toBe(false);
    expect(scoped(['*.stories.tsx'], 'ui/Button.stories.tsx')).toBe(true);
  });

  it('keeps a glob with a slash anchored to the working directory', () => {
    expect(scoped(['src/*.ts'], 'src/a.ts')).toBe(true);
    expect(scoped(['src/*.ts'], 'other/src/a.ts')).toBe(false);
  });

  it('widens an exclude the same way', () => {
    expect(scoped(['**/*.ts', '!fake.ts'], 'a/fake.ts')).toBe(false);
    expect(scoped(['**/*.ts', '!fake.ts'], 'a/real.ts')).toBe(true);
    expect(scoped(['**/*.ts', '!src/fake.ts'], 'other/src/fake.ts')).toBe(true);
  });
});

describe('option readers', () => {
  it('reads files as one glob or a list', () => {
    expect(readEntryFiles('a.ts', 'o')).toStrictEqual(['a.ts']);
    expect(readEntryFiles(['a.ts', '!b.ts'], 'o')).toStrictEqual(['a.ts', '!b.ts']);
    expect(() => readEntryFiles(['!b.ts'], 'o')).toThrow(/does not start with "!"/u);
    expect(() => readEntryFiles(false, 'o')).toThrow(/array of glob strings/u);
  });

  it('reads records', () => {
    expect(readEntryRecords([{ a: 1 }], 'o')).toStrictEqual([{ a: 1 }]);
    expect(() => readEntryRecords([1], 'o')).toThrow(/array of objects/u);
    expect(() => readEntryRecords([[]], 'o')).toThrow(/array of objects/u);
  });

  it('reads required strings', () => {
    expect(readRequiredString({ a: 'x' }, 'a', 'o')).toBe('x');
    expect(() => readRequiredString({ a: '' }, 'a', 'o')).toThrow(/non-empty string "a"/u);
    expect(() => readRequiredString({}, 'a', 'o')).toThrow(/non-empty string "a"/u);
    expect(readRequiredStrings({ a: ['x', 'y'] }, 'a', 'o')).toStrictEqual(['x', 'y']);
    expect(() => readRequiredStrings({ a: ['x', 1] }, 'a', 'o')).toThrow(/"a"/u);
    expect(() => readRequiredStrings({ a: [''] }, 'a', 'o')).toThrow(/"a"/u);
    expect(() => readRequiredStrings({ a: 'x' }, 'a', 'o')).toThrow(/"a"/u);
  });

  it('rejects a key outside the allowed list, naming it', () => {
    expect(() => {
      assertOnlyKeys({ a: 1 }, ['a'], 'o');
    }).not.toThrow();
    expect(() => {
      assertOnlyKeys({ a: 1, b: 2 }, ['a'], 'o');
    }).toThrow(/unknown key "b".*Allowed keys: a\./u);
  });
});

describe('readSpecifierPatterns', () => {
  it('returns a list without extglob unchanged', () => {
    expect(readSpecifierPatterns({ s: ['fs', '@scope/pkg', 'src/(group)/x'] }, 's', 'o')).toStrictEqual(['fs', '@scope/pkg', 'src/(group)/x']);
  });

  it.each([0, 1, 2])('rejects an extglob entry at position %i, naming the option, the field and the pattern', (position) => {
    const list = ['fs', 'path', 'os'];
    list[position] = '@(a|b)';
    expect(() => readSpecifierPatterns({ s: list }, 's', 'o')).toThrow('"o.s" must not use extglob syntax, which this package\'s glob dialect does not support: "@(a|b)"');
  });
});
