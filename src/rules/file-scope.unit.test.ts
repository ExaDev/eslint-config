import { describe, expect, it } from 'vitest';
import { createFileScope, fileGlobsSchema, readFileGlobs } from './file-scope';

const CWD = '/repo';

function inScope(globs: readonly string[], relativePath: string): boolean {
  return createFileScope(globs)(`${CWD}/${relativePath}`, CWD);
}

describe('fileGlobsSchema', () => {
  it('is a non-empty, duplicate-free array of non-empty strings', () => {
    expect(fileGlobsSchema).toStrictEqual({ type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, uniqueItems: true });
  });
});

describe('readFileGlobs', () => {
  it('returns a valid list unchanged', () => {
    const globs = ['**/turbo.json', '!packages/legacy/**'];
    expect(readFileGlobs(globs, 'files')).toBe(globs);
  });

  it.each([
    ['not an array', 'x'],
    ['an empty array', []],
    ['a non-string entry', ['a', 1]],
    ['an empty-string entry', ['a', '']],
    ['excludes only', ['!a', '!b']],
  ])('rejects %s, naming the option', (_label, value) => {
    expect(() => readFileGlobs(value, 'myOption')).toThrow(
      '@exadev/eslint-config: "myOption" must be an array of non-empty glob strings with at least one that does not start with "!".',
    );
  });

  it('rejects a pattern with unbalanced braces', () => {
    expect(() => readFileGlobs(['{a,b'], 'files')).toThrow(/unmatched "\{"/);
  });
});

describe('createFileScope', () => {
  it('matches a literal path exactly', () => {
    expect(inScope(['turbo.json'], 'turbo.json')).toBe(true);
    expect(inScope(['turbo.json'], 'apps/turbo.json')).toBe(false);
    expect(inScope(['turbo.json'], 'turbo.json.bak')).toBe(false);
  });

  it('does not let a pattern match a path that continues past it', () => {
    expect(inScope(['turbo.json'], 'turbo.json/extra')).toBe(false);
    expect(inScope(['packages/*'], 'packages/a/b')).toBe(false);
  });

  it('never reads an exclude pattern as a literal include', () => {
    expect(inScope(['other.json', '!a/**'], '!a/x.json')).toBe(false);
  });

  it('lets ** match zero or more leading segments', () => {
    expect(inScope(['**/turbo.json'], 'turbo.json')).toBe(true);
    expect(inScope(['**/turbo.json'], 'a/turbo.json')).toBe(true);
    expect(inScope(['**/turbo.json'], 'a/b/c/turbo.json')).toBe(true);
    expect(inScope(['**/turbo.json'], 'a/b/turbo.jsonc')).toBe(false);
  });

  it('lets ** match zero or more middle and trailing segments', () => {
    expect(inScope(['packages/**/tsconfig.json'], 'packages/tsconfig.json')).toBe(true);
    expect(inScope(['packages/**/tsconfig.json'], 'packages/a/b/tsconfig.json')).toBe(true);
    expect(inScope(['packages/**/tsconfig.json'], 'apps/a/tsconfig.json')).toBe(false);
    expect(inScope(['packages/**'], 'packages/a/b.json')).toBe(true);
    expect(inScope(['packages/**'], 'packages')).toBe(true);
  });

  it('matches * within one segment only', () => {
    expect(inScope(['tsconfig*.json'], 'tsconfig.json')).toBe(true);
    expect(inScope(['tsconfig*.json'], 'tsconfig.build.json')).toBe(true);
    expect(inScope(['*/package.json'], 'a/package.json')).toBe(true);
    expect(inScope(['*/package.json'], 'a/b/package.json')).toBe(false);
  });

  it('supports ? and character classes per segment', () => {
    expect(inScope(['a?.json'], 'ab.json')).toBe(true);
    expect(inScope(['a?.json'], 'a.json')).toBe(false);
    expect(inScope(['[ab].json'], 'b.json')).toBe(true);
    expect(inScope(['[ab].json'], 'c.json')).toBe(false);
  });

  it('expands braces into alternatives', () => {
    expect(inScope(['{apps,packages}/*/package.json'], 'apps/x/package.json')).toBe(true);
    expect(inScope(['{apps,packages}/*/package.json'], 'packages/x/package.json')).toBe(true);
    expect(inScope(['{apps,packages}/*/package.json'], 'libs/x/package.json')).toBe(false);
  });

  it('never lets a wildcard or ** match a dot-prefixed segment', () => {
    expect(inScope(['*.json'], '.eslintrc.json')).toBe(false);
    expect(inScope(['**/package.json'], '.cache/package.json')).toBe(false);
    expect(inScope(['**/package.json'], 'a/.cache/package.json')).toBe(false);
  });

  it('matches a dot-prefixed segment the pattern names explicitly', () => {
    expect(inScope(['.github/*.json'], '.github/labels.json')).toBe(true);
    expect(inScope(['**/.eslintrc.json'], 'a/.eslintrc.json')).toBe(true);
    expect(inScope(['.*.json'], '.eslintrc.json')).toBe(true);
  });

  it('ignores "./" prefixes and doubled separators in a pattern', () => {
    expect(inScope(['./packages//*/package.json'], 'packages/a/package.json')).toBe(true);
  });

  it('applies excludes on top of includes, in any list order', () => {
    expect(inScope(['**/package.json', '!packages/legacy/**'], 'packages/legacy/package.json')).toBe(false);
    expect(inScope(['!packages/legacy/**', '**/package.json'], 'packages/legacy/package.json')).toBe(false);
    expect(inScope(['**/package.json', '!packages/legacy/**'], 'packages/new/package.json')).toBe(true);
  });

  it('matches nothing when no include matches', () => {
    expect(inScope(['a.json'], 'b.json')).toBe(false);
  });

  it('treats a file outside the working directory as out of scope', () => {
    expect(createFileScope(['**/*.json'])('/elsewhere/a.json', CWD)).toBe(false);
  });

  it('treats a file outside the working directory as out of scope even for a pattern that names or wildcards the parent segment', () => {
    expect(createFileScope(['../x.json'])('/a/x.json', '/a/b')).toBe(false);
    expect(createFileScope(['.*/x.json'])('/a/x.json', '/a/b')).toBe(false);
    expect(createFileScope(['.*/x.json'])('/a/b/.c/x.json', '/a/b')).toBe(true);
  });

  it('matches on the path relative to cwd, not the absolute path', () => {
    expect(createFileScope(['turbo.json'])('/other/root/turbo.json', '/other/root')).toBe(true);
  });

  it('is reusable across files', () => {
    const scope = createFileScope(['**/a.json']);
    expect(scope('/repo/x/a.json', CWD)).toBe(true);
    expect(scope('/repo/x/b.json', CWD)).toBe(false);
    expect(scope('/repo/y/a.json', CWD)).toBe(true);
  });
});
