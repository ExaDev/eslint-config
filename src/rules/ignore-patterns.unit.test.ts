import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createIgnoreMatcher } from './ignore-patterns';

// ESLint's public API decides only whether a file has a configuration, not whether a directory is ignored, so the directory decisions are read from the config array ESLint itself builds, and the public API is used for the file decisions.
const requireFrom = createRequire(import.meta.url);
const { FlatConfigArray } = requireFrom(join(dirname(requireFrom.resolve('eslint')), 'config', 'flat-config-array.js')) as {
  FlatConfigArray: new (configs: unknown[], options: { basePath: string }) => { normalize: () => Promise<void>; isDirectoryIgnored: (path: string) => boolean; isFileIgnored: (path: string) => boolean };
};
const BASE = '/repo-ignore-oracle';
const MINIMUM_LISTS = 300;
const NEGATIONS_PER_PATTERN = 5;

const PATTERNS = [
  'x', 'x/', 'x/**', 'x/**/', 'x/*', '**/x', '**/x/', '**/x/**', '!x', 'dist', 'dist/', 'dist/**', '**/dist', '**/dist/', '.hidden', '.hidden/', '.*', '**/.hidden/**', '*.log', '**/*.log', 'a/skills/foo', 'a/skills/foo/', 'a/skills/foo/**', 'a/skills/foo/**/', 'a/skills/{foo,}', 'a/skills/{foo,bar}', 'a/skills/{foo,bar}/', 'a/skills/?(foo)', 'a/skills/@(foo|bar)', 'a/skills/!(foo)', 'a/skills/+(foo)/', '**/skills/*/', '**/skills/*', 'a/**', 'a/**/', 'a/**/c', '**/c/', 'é', 'é/', '日本/**', '{x,dist}', '{x,dist}/', '[a-c]', '[!x]*/', '*/', '*', '**', '/x', '/x/', 'x/y/', './x', 'x\\*', 'src/**/generated/', 'a/b/c/', 'a/b/c',
];
const NEGATIONS = ['!x', '!x/', '!dist/keep', '!dist/keep/', '!**/keep.log', '!a/skills/foo/SKILL.md', '!a/skills/foo/**', '!.hidden/keep', '!*/', '!a/b'];
const IGNORE_LISTS: readonly (readonly string[])[] = [
  ...PATTERNS.map((pattern) => [pattern]),
  ...PATTERNS.flatMap((pattern) => NEGATIONS.slice(0, NEGATIONS_PER_PATTERN).map((negation) => [pattern, negation])),
  ...NEGATIONS.flatMap((negation) => ['**', 'dist/**', 'x/**', 'a/**/', '**/*.log'].map((pattern) => [pattern, negation])),
  ['**/*.log', '!**/keep.log', 'a/*.log'],
  ['dist/', '!dist/', 'dist/**'],
  ['x', '!x', 'x/'],
];

const FILES = ['x', 'x/a', 'x/a/b', 'x/y', 'dist', 'dist/a.js', 'dist/keep', 'dist/keep/a', '.hidden', '.hidden/a', '.hidden/keep', 'a/skills/foo', 'a/skills/foo/SKILL.md', 'a/skills/bar/SKILL.md', 'a/skills/baz/SKILL.md', 'a/b', 'a/b/c', 'a/b/c/d.ts', 'a/c', 'a/x/c', 'é', 'é/a', '日本/a', 'run.log', 'a/run.log', 'a/keep.log', 'src/generated/a.ts', 'src/x/generated/b.ts', 'b/x', 'b/x/z', 'xx', 'x*', 'c', 'c/d'];
const DIRECTORIES = ['x', 'x/a', 'x/y', 'dist', 'dist/keep', '.hidden', 'a', 'a/skills', 'a/skills/foo', 'a/skills/bar', 'a/b', 'a/b/c', 'a/c', 'a/x', 'é', '日本', 'src', 'src/generated', 'src/x', 'src/x/generated', 'b', 'b/x', 'c', 'xx', 'x*'];

// ESLint ignores a path when it, or any directory above it, is ignored; a caller of the matcher prunes the directories and skips the files, which together is the same decision.
function ignoredWithAncestors(matcher: ReturnType<typeof createIgnoreMatcher>, path: string, isDirectory: boolean): boolean {
  const parts = path.split('/');
  const ancestors = parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));

  return matcher(path, isDirectory) || ancestors.some((ancestor) => matcher(ancestor, true));
}

describe('createIgnoreMatcher against ESLint', () => {
  it('has at least three hundred ignore lists', () => {
    expect(IGNORE_LISTS.length).toBeGreaterThanOrEqual(MINIMUM_LISTS);
  });

  it.each(IGNORE_LISTS.map((list) => [list.join('  '), list] as const))('decides every file and directory as ESLint does for ignores [%s]', async (_label, list) => {
    const configs = new FlatConfigArray([{ ignores: [...list] }], { basePath: BASE });
    await configs.normalize();
    const matcher = createIgnoreMatcher(list);
    const actual = [...FILES.map((path) => [`file ${path}`, ignoredWithAncestors(matcher, path, false)] as const), ...DIRECTORIES.map((path) => [`directory ${path}`, ignoredWithAncestors(matcher, path, true)] as const)];
    const expected = [...FILES.map((path) => [`file ${path}`, configs.isFileIgnored(`${BASE}/${path}`)] as const), ...DIRECTORIES.map((path) => [`directory ${path}`, configs.isDirectoryIgnored(`${BASE}/${path}/`)] as const)];
    expect(actual).toStrictEqual(expected);
  });

  it.each([[['a/skills/foo/**/']], [['a/skills/{foo,}']], [['a/skills/?(foo)']], [['x']], [['x/']], [['x/**']]])('agrees with the public isPathIgnored for the files under ignores %j', async (list) => {
    const eslint = new ESLint({ cwd: BASE, overrideConfigFile: true, overrideConfig: [{ ignores: [...list] }, { files: ['**/?*'], rules: {} }] });
    const matcher = createIgnoreMatcher(list);
    const ignoredByEslint = await Promise.all(FILES.map(async (path) => eslint.isPathIgnored(`${BASE}/${path}`)));
    const ignoredHere = FILES.map((path) => ignoredWithAncestors(matcher, path, false));
    expect(ignoredHere).toStrictEqual(ignoredByEslint);
  });
});

describe('createIgnoreMatcher', () => {
  it('ignores nothing without patterns', () => {
    expect(createIgnoreMatcher([])('dist', true)).toBe(false);
  });

  it('ignores a file or a directory a plain pattern selects, at any depth when it starts with **/', () => {
    const isIgnored = createIgnoreMatcher(['**/dist', 'out']);
    expect(isIgnored('dist', true)).toBe(true);
    expect(isIgnored('packages/a/dist', true)).toBe(true);
    expect(isIgnored('dist', false)).toBe(true);
    expect(isIgnored('out', true)).toBe(true);
    expect(isIgnored('src/out', true)).toBe(false);
    expect(isIgnored('distance', true)).toBe(false);
  });

  it.each([
    ['a/skills/foo/**/', 'a/skills/foo'],
    ['a/skills/{foo,}', 'a/skills/foo'],
    ['a/skills/?(foo)', 'a/skills/foo'],
  ])('ignores the directory %s selects once ESLint expands it, as ESLint does', (pattern, directory) => {
    expect(createIgnoreMatcher([pattern])(directory, true)).toBe(true);
  });

  it('still matches a plain name against a directory', () => {
    expect(createIgnoreMatcher(['x'])('x', true)).toBe(true);
    expect(createIgnoreMatcher(['x/'])('x', true)).toBe(true);
    expect(createIgnoreMatcher(['x/'])('x', false)).toBe(false);
  });

  it('selects only directories for a pattern ending in a slash', () => {
    const isIgnored = createIgnoreMatcher(['**/build/']);
    expect(isIgnored('build', true)).toBe(true);
    expect(isIgnored('a/build', true)).toBe(true);
    expect(isIgnored('a/build', false)).toBe(false);
  });

  it('matches everything under a directory with a trailing **', () => {
    const isIgnored = createIgnoreMatcher(['generated/**']);
    expect(isIgnored('generated/a/SKILL.md', false)).toBe(true);
    expect(isIgnored('generated/a', true)).toBe(true);
    expect(isIgnored('handwritten/a/SKILL.md', false)).toBe(false);
  });

  it('matches dot-prefixed segments with a wildcard and **', () => {
    const isIgnored = createIgnoreMatcher(['**/*.log', 'cache/*']);
    expect(isIgnored('.state/run.log', false)).toBe(true);
    expect(isIgnored('cache/.entry', false)).toBe(true);
  });

  it('lets the last pattern that selects a path decide it, so a ! pattern brings a path back', () => {
    const isIgnored = createIgnoreMatcher(['**/*.log', '!**/keep.log']);
    expect(isIgnored('a/run.log', false)).toBe(true);
    expect(isIgnored('a/keep.log', false)).toBe(false);
    expect(createIgnoreMatcher(['!**/keep.log', '**/*.log'])('a/keep.log', false)).toBe(true);
  });

  it('ignores nothing outside the working directory', () => {
    expect(createIgnoreMatcher(['**'])('../x', false)).toBe(false);
  });

  it.each(['/dist/', '/dist', '/dist/**', '/**/dist', '/*'])('matches nothing for %s, as ESLint does for a pattern with a leading slash', (pattern) => {
    const isIgnored = createIgnoreMatcher([pattern]);
    expect(isIgnored('dist', true)).toBe(false);
    expect(isIgnored('dist/a.md', false)).toBe(false);
  });

  it('lets a leading-slash ! pattern bring nothing back', () => {
    expect(createIgnoreMatcher(['dist/**', '!/dist/keep.md'])('dist/keep.md', false)).toBe(true);
  });
});
