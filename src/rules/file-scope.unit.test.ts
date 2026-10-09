import { Minimatch } from 'minimatch';
import { describe, expect, it } from 'vitest';
import { assertNoExtglob, assertSupportedGlob, createFileScope, createPathMatcher, fileGlobsSchema, readFileGlobs, relativeToCwd } from './file-scope';

const CWD = '/repo';

function inScope(globs: readonly string[], relativePath: string): boolean {
  return createFileScope(globs)(`${CWD}/${relativePath}`, CWD);
}

describe('fileGlobsSchema', () => {
  it('is a non-empty, duplicate-free array of non-empty strings', () => {
    expect(fileGlobsSchema).toStrictEqual({ type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, uniqueItems: true });
  });
});

// ESLint selects files with minimatch, so for every class form below the package matcher must select exactly the candidates minimatch does: a glob handed to both would otherwise lint files the duplicate check cannot match.
describe('character classes against minimatch', () => {
  const candidates = ['ax', 'cx', '-x', '^x', '!x', '[x', 'bx', '\\x', '\\\\x', ']x', '\\]x', 'ax', 'bx', 'x', 'a/a/x', 'a/]/x', 'a/b/x', 'a/\\b]/x', 'a]', 'b]', ']', 'a', 'b', '-', '^', '!', 'c', '[', '\\'];
  it.each([
    '[\\]]x',
    'a/[a\\]b]/x',
    '[a\\]]',
    '[^\\]]x',
    '[!\\]]x',
    '[\\]a]x',
    '[\\]\\]x',
    '[]]x',
    '[]a]x',
    '[^]]x',
    '[a-c]x',
    '[^a]x',
    '[!a]x',
    '[ab]',
    'a/[\\]]/x',
    '[\\\\]x',
    '[\\\\\\]]x',
    '[\\\\]]x',
    '[\\a]x',
    '[\\-]x',
    '[a\\-c]x',
    '[\\!a]x',
    '[\\[]x',
    '[\\^]x',
    '[\\^]]x',
    '[c][\\^]x',
    '[a\\^]x',
  ])('selects what minimatch selects for %s', (glob) => {
    const matches = createPathMatcher([glob], 'any');
    const oracle = new Minimatch(glob, { dot: true });
    for (const candidate of candidates) expect([glob, candidate, matches(candidate)]).toStrictEqual([glob, candidate, oracle.match(candidate)]);
  });

  it.each([
    ['[^a]x', 'bx', true],
    ['[^a]x', 'ax', false],
    ['[!a]x', 'bx', true],
    ['[!a]x', 'ax', false],
  ])('negates %s: %s is %s', (glob, candidate, expected) => {
    expect(createPathMatcher([glob])(candidate)).toBe(expected);
  });
});

describe('assertSupportedGlob', () => {
  it.each(['[[:alpha:]]x', 'a/[[:digit:]a]/x', '!a/[[:alpha:]]'])('rejects the POSIX class in %s, naming the option and the glob', (glob) => {
    expect(() => { assertSupportedGlob(glob, 'opt'); }).toThrow(`@exadev/eslint-config: "opt" must not use a POSIX character class, which this package's glob dialect does not support: "${glob}". List the characters or a range instead.`);
  });

  it.each(['[\\^a]x', '[\\^-x]x', 'a/[\\^b]/x', '!a/[\\^-.]x'])('rejects the class opening with an escaped caret in %s, which minimatch reads as negated only sometimes', (glob) => {
    expect(() => { assertSupportedGlob(glob, 'opt'); }).toThrow(`@exadev/eslint-config: "opt" must not open a character class with an escaped caret, which this package's glob dialect cannot read the way ESLint does: "${glob}". Use "[^...]" to negate, or put the caret after the first member.`);
  });

  it.each(['[\\^]x', '[\\^]]x', '[a\\^]x'])('accepts %s, where the escaped caret is a plain member', (glob) => {
    expect(() => { assertSupportedGlob(glob, 'opt'); }).not.toThrow();
  });

  it.each(['[c-a]x', 'a/[a-\\]]/x', 'a/{b,[z-a]}/x'])('rejects the reversed range in %s, naming the option and the glob', (glob) => {
    expect(() => { assertSupportedGlob(glob, 'opt'); }).toThrow(new RegExp(`^@exadev/eslint-config: "opt" has a character class in "${glob.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}" that is not valid: `, 'u'));
  });

  it.each(['[a-c]x', '[^a-c]x', '[]-a]x', '[a-]x', '[\\]]x', 'a/[[]x', '[x'])('accepts the ordinary class in %s', (glob) => {
    expect(() => { assertSupportedGlob(glob, 'opt'); }).not.toThrow();
  });
});

describe('assertNoExtglob', () => {
  it('words the whole error, hint included', () => {
    expect(() => { assertNoExtglob('a/@(b)', 'opt'); }).toThrow(
      new Error('@exadev/eslint-config: "opt" must not use extglob syntax, which this package\'s glob dialect does not support: "a/@(b)". Use braces, "*", "?" and "[...]", or several globs.'),
    );
  });

  const accepted = [
    'app/(marketing)/**',
    'src/(group)/**',
    '(group)/**',
    '!app/(marketing)/**',
    'app/@modal/(.)photo/**',
    'a/{(b),c}/**',
    'a/{b,(c)}',
    '[(]x/**',
    '@scope/(x)',
    '@scope/pkg',
    '!(group)/**',
    '**/[!(]x.ts',
    '**/[^(]x.ts',
    '**/[]!(]x.ts',
    '\\@(a)',
    'a/\\!(b)/c',
    'src\\(a)\\x',
    'a/(b|c)/**',
    'notes (old)/*.md',
    'a/[@+?*!](b)/c',
    'a/[unclosed(x',
    '[^]@(b)]x',
    '[!]@(b)]x',
    '[]@(b)]x',
    '**/*.ts',
    'skills/*/SKILL.md',
    'a/*/b',
  ];
  const rejected = [
    'skills/@(a|b)/SKILL.md',
    'src/+(a|b)/x',
    'a/!(b)/c',
    'a/?(b)/c',
    'a/*(b)/c',
    '@(a|b)/x',
    '!skills/@(a)/**',
    '!a/!(b)/c',
    'a/{@(b),c}/**',
    'a/[x]@(b)/c',
    'a/\\@x/@(b)',
    '**/+(a).ts',
  ];

  it.each(accepted)('accepts %s', (glob) => {
    expect(() => { assertNoExtglob(glob, 'opt'); }).not.toThrow();
  });

  it.each(rejected)('rejects %s, naming the option and the glob', (glob) => {
    expect(() => { assertNoExtglob(glob, 'opt'); }).toThrow(`@exadev/eslint-config: "opt" must not use extglob syntax, which this package's glob dialect does not support: "${glob}"`);
  });
});

describe('readFileGlobs', () => {
  it.each(['skills/@(a|b)/SKILL.md', 'skills/+(a)/SKILL.md', 'skills/!(a)/SKILL.md', 'skills/?(a)/SKILL.md', 'skills/*(a)/SKILL.md', '!skills/@(a)/**'])('rejects the extglob form %s, naming the option and the glob', (glob) => {
    expect(() => readFileGlobs(['**/SKILL.md', glob], 'someOption')).toThrow(`"someOption" must not use extglob syntax, which this package's glob dialect does not support: "${glob}"`);
  });

  it.each(['[[:alpha:]]x', '[c-a]x'])('rejects the unsupported class in %s through the reader', (glob) => {
    expect(() => readFileGlobs(['**/*.ts', glob], 'someOption')).toThrow(/"someOption"/u);
  });

  it.each(['app/(marketing)/**', '!(group)/**', '!app/(marketing)/**', '**/[!(]x.ts'])('accepts the route group or class form %s', (glob) => {
    expect(readFileGlobs(['**/*.ts', glob], 'someOption')).toStrictEqual(['**/*.ts', glob]);
  });

  it('still accepts braces, classes and a literal parenthesis', () => {
    expect(readFileGlobs(['skills/{a,b}/[cd]*.md', 'notes (old)/*.md'], 'someOption')).toStrictEqual(['skills/{a,b}/[cd]*.md', 'notes (old)/*.md']);
  });

  it('returns a valid list unchanged', () => {
    const globs = ['**/turbo.json', '!packages/legacy/**'];
    expect(readFileGlobs(globs, 'files')).toBe(globs);
  });

  it.each([
    ['not an array', 'x', 'be an array of glob strings.'],
    ['a non-string entry', ['a', 1], 'contain only non-empty strings.'],
    ['an empty-string entry', ['a', ''], 'contain only non-empty strings.'],
    ['a duplicate glob', ['a', 'b', 'a'], 'not contain duplicate globs.'],
    ['an empty array', [], 'contain at least one glob that does not start with "!".'],
    ['excludes only', ['!a', '!b'], 'contain at least one glob that does not start with "!".'],
  ])('rejects %s with a message naming the option and the failure', (_label, value, failure) => {
    expect(() => readFileGlobs(value, 'myOption')).toThrow(`@exadev/eslint-config: "myOption" must ${failure}`);
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

describe('createPathMatcher', () => {
  it('matches a plain path, not only a file path, in the same dialect', () => {
    const matches = createPathMatcher(['@scope/*', '!@scope/private']);
    expect(matches('@scope/pkg')).toBe(true);
    expect(matches('@scope/private')).toBe(false);
    expect(matches('@other/pkg')).toBe(false);
  });

  it('matches nothing that starts by leaving the root', () => {
    expect(createPathMatcher(['**'])('../x')).toBe(false);
    expect(createPathMatcher(['**'])('a/x')).toBe(true);
  });
});

describe('createPathMatcher with dot matching on any segment', () => {
  it('lets a wildcard and ** match a dot-prefixed segment, as ESLint does for a config\'s files', () => {
    const matches = createPathMatcher(['**/skills/*/SKILL.md', 'docs/*'], 'any');
    expect(matches('.agents/skills/x/SKILL.md')).toBe(true);
    expect(matches('a/.hidden/skills/x/SKILL.md')).toBe(true);
    expect(matches('skills/.x/SKILL.md')).toBe(true);
    expect(matches('docs/.hidden')).toBe(true);
  });

  it('still honours a ! exclude, a literal segment and the length of the path', () => {
    const matches = createPathMatcher(['**/skills/*/SKILL.md', '!.agents/**'], 'any');
    expect(matches('skills/x/SKILL.md')).toBe(true);
    expect(matches('.agents/skills/x/SKILL.md')).toBe(false);
    expect(matches('.agents/skills/x/y/SKILL.md')).toBe(false);
    expect(createPathMatcher(['**'], 'any')('../x')).toBe(false);
  });

  it('is not what the default dialect does, where neither a wildcard nor ** crosses a dot-prefixed segment', () => {
    for (const matches of [createPathMatcher(['**/skills/*/SKILL.md']), createPathMatcher(['**/skills/*/SKILL.md'], 'explicit')]) {
      expect(matches('.agents/skills/x/SKILL.md')).toBe(false);
      expect(matches('skills/x/SKILL.md')).toBe(true);
    }
  });
});

describe('relativeToCwd', () => {
  it('spells the path relative to cwd with forward slashes, and starts with .. outside it', () => {
    expect(relativeToCwd('/repo/src/a.ts', '/repo')).toBe('src/a.ts');
    expect(relativeToCwd('/elsewhere/a.ts', '/repo')).toBe('../elsewhere/a.ts');
  });
});
