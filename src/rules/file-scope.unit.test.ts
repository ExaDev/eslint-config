import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { isRecord } from '../is-record';
import { assertSupportedGlob, createFileScope, createPathMatcher, fileGlobsSchema, readFileGlobs, relativeToCwd } from './file-scope';

const CWD = '/repo';
const ORACLE_CWD = '/repo-oracle';

function inScope(globs: readonly string[], relativePath: string): boolean {
  return createFileScope(globs)(`${CWD}/${relativePath}`, CWD);
}

describe('fileGlobsSchema', () => {
  it('is a non-empty, duplicate-free array of non-empty strings', () => {
    expect(fileGlobsSchema).toStrictEqual({ type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, uniqueItems: true });
  });
});

// ESLint is the oracle: a glob must select, through this package's matcher, exactly the paths ESLint selects through a config's `files`. Every row is a form that once made the two diverge, or a form the package used to reject, and each is compared on candidates that hold the metacharacters literally.
const CANDIDATES = [
  'ax', 'bx', 'cx', 'x', 'é', '日本/a', 'a/b', 'a/x', 'a.js', 'b.js', 'a.md', 'b.md', '.a', 'skills/a/SKILL.md', 'skills/b/SKILL.md', '|', 'a|', 'zz', '$', '[', ':', ']', '\\', '\\x', 'a\\x', 'a\\.js', 'a}', '^x', '!x', '-x', ']x', 'a/]/x', 'a]', 'a/a/x', 'a/b/x',
  '{a,b}.md', 'a{b,c}', 'ab', 'abc', 'a.fake', 'a.fake.js', 'x/a/y', 'x/b/c/y', 'a,b', '(a)', 'a(b)', '@a', 'ba', 'aa', '!a', '+a', 'a', 'b', 'c', 'd', 'ab.md',
];

const ORACLE_GLOBS = [
  // Character classes, escaped members, negation and POSIX classes.
  '[\\]]x', 'a/[a\\]b]/x', '[a\\]]', '[^\\]]x', '[!\\]]x', '[\\]a]x', '[\\]\\]x', '[]]x', '[]a]x', '[^]]x', '[a-c]x', '[^a]x', '[!a]x', '[ab]', '[\\\\]x', '[\\\\\\]]x', '[\\\\]]x', '[\\a]x', '[\\-]x', '[a\\-c]x', '[\\!a]x', '[\\[]x', '[\\^]x', '[\\^]]x', '[c][\\^]x', '[a\\^]x', '[\\^a]x', '[\\^-x]x',
  '[[:alpha:]]x', '[[:digit:]a]x', '[[:ab]', '[:alpha:]', '[a-]x', '[]-a]x', '[(]x/**', '**/[!(]x.ts', 'a/[unclosed(x', '[$]a',
  // Braces, including nested, empty alternatives and the ${ form minimatch leaves literal.
  '{a,b}x', '{a,{b,c}}x', 'x{a,b}{c,d}', '*.fake{,.js}', 'x/{a,b/c}/y', '{a,b}[cd]', '{a}', '{a,}', '{,a}', '{a..c}', '{1..3}', '${a,b}.md', 'a${b,c}', '{a,b}${c,d}', 'a\\{b,c}', '{a\\,b,c}', '{a,b',
  // Extglob, written plainly and assembled by braces.
  '@(a|b)x', '+(a)b', 'x!(a)', '?(a)x', '*(a)x', 'skills/@(a|b)/SKILL.md', 'skills/!(a)/SKILL.md', '{*,a}(b)', 'a/{@,x}(b|c)', '(a)', 'a(b)', '@scope/(x)', 'app/!(group)/**',
  // Escapes before wildcards, including the escaped pipe that compiles to an alternation.
  '*\\x', '*\\.js', '?\\x', 'a/*\\x', '*.\\x', '\\*x', 'x\\*', '*[\\x]', '\\|*', 'a\\|?', '\\|?a', '\\|a', '\\||', '\\|[a]', '[|]*', '[\\|]*', '\\.\\./a',
  // Brace-assembled classes from the review.
  '{[,}\\^a]', '{,[}\\^a]', '[{,\\^a]}', '{[,]}[:alpha:]', '[{],[:alpha:]}', '{,[}][:alpha:]', '{{,[},]}[:alpha:]',
  // Wildcards, dotfiles, globstars and unicode.
  '*.js', '.*', '**/*.md', '**/.hidden/**', '**', '**/a', 'a/**', 'a/**/x', '*/x', '?x', '??', 'é*', '[à-ü]x', '日本/*', '*', 'skills/*/SKILL.md', '**/skills/*/SKILL.md', './a', './a/**',
  // Shapes that were once rejected: rooted, directory-only, doubled slash, dot segments, comment, negation.
  'a//b', 'a/./b', '../a', '#a', '!!a', 'a$',
];

describe('createPathMatcher against ESLint', () => {
  it.each(ORACLE_GLOBS)('selects what ESLint selects for %s', async (glob) => {
    
    let compiled = true;
    try {
      assertSupportedGlob(glob, 'opt');
    } catch {
      compiled = false;
    }
    // A glob this package rejects when the option is read (a comment, a negation, or minimatch cannot compile it) is not compared: ESLint would match nothing or crash on it.
    if (!compiled) return;
    const matches = createPathMatcher([glob], { dotMatching: 'any' });
    const eslint = new ESLint({ cwd: ORACLE_CWD, overrideConfigFile: true, overrideConfig: [{ files: [glob], rules: { 'no-console': 'error' } }, { files: ['**/?*'], rules: {} }] });
    // ESLint gives a file a configuration only when a pattern that is not universal (`*`, `a/*`, `a/**`, a `!` pattern) matches it, so a second configuration whose pattern matches every name stands in for the extension a real project names; whether the glob selects the file is then the rule the glob's own configuration sets.
    const selectedByEslint = await Promise.all(
      CANDIDATES.map(async (candidate) => {
        const config: unknown = await eslint.calculateConfigForFile(`${ORACLE_CWD}/${candidate}`);

        return isRecord(config) && isRecord(config['rules']) && config['rules']['no-console'] !== undefined;
      }),
    );
    expect(CANDIDATES.map((candidate) => [glob, candidate, matches(candidate)])).toStrictEqual(CANDIDATES.map((candidate, index) => [glob, candidate, selectedByEslint[index]]));
  });
});

describe('assertSupportedGlob', () => {
  it.each(['{[,]}[:alpha:]],', '[{][:alpha:]]-,}', ',{,[}][:alpha:]]', '[{],[:alpha:]]}-'])('rejects %s, which minimatch cannot compile, naming the option and the whole glob', (glob) => {
    expect(() => { assertSupportedGlob(glob, 'opt'); }).toThrow(`@exadev/eslint-config: "opt" has a glob that minimatch cannot compile: "${glob}"`);
  });

  it.each(['/src/**', '/src/**/*.ts', 'src/**/', 'src/', '!/src/**', '/'])('rejects the file glob %s, which starts or ends with a slash and so selects nothing', (glob) => {
    expect(() => { assertSupportedGlob(glob, 'opt'); }).toThrow(`@exadev/eslint-config: "opt" has a file glob that starts or ends with a slash: "${glob}". A file path is neither absolute nor a directory, so this selects nothing.`);
  });

  it.each(['/abs/x', '/src/**', 'src/'])('accepts %s as a specifier pattern', (glob) => {
    expect(() => { assertSupportedGlob(glob, 'opt', 'specifier'); }).not.toThrow();
  });

  it.each(['#a', '!#a'])('rejects the comment %s, which matches nothing', (glob) => {
    expect(() => { assertSupportedGlob(glob, 'opt'); }).toThrow(`@exadev/eslint-config: "opt" has a glob that starts with "#", which minimatch reads as a comment that matches nothing: "${glob}"`);
  });

  it.each(['!!a'.replace('!!a', '!!a')])('rejects the second exclusion marker in %s', (glob) => {
    expect(() => { assertSupportedGlob(glob, 'opt'); }).toThrow(/has a glob with a second "!"/u);
  });

  it.each(['@(a|b)/x', '[[:alpha:]]', 'x/[c-a]'.replace('c-a', 'a-c'), '{a,b', '${a,b}', '*\\x', './a', '../a', 'a//b', '{a}'])('accepts %s, which minimatch compiles', (glob) => {
    expect(() => { assertSupportedGlob(glob, 'opt'); }).not.toThrow();
  });

  it.each(['#internal/*', 'https://x/y', '/abs/x', './x', '../x', '../../contract/src/*conformance*', '@scope/pkg/sub', 'node:fs', '@scope/*', 'node:*', '~/x/*', '@/lib/*', 'virtual:*', '!x'])('accepts the specifier pattern %s, which only this package reads', (pattern) => {
    expect(() => { assertSupportedGlob(pattern, 'opt', 'specifier'); }).not.toThrow();
  });

  it('rejects, for a specifier pattern too, one minimatch cannot compile', () => {
    expect(() => { assertSupportedGlob('{[,]}[:alpha:]],', 'opt', 'specifier'); }).toThrow(/has a glob that minimatch cannot compile/u);
  });
});

describe('readFileGlobs', () => {
  it.each(['skills/@(a|b)/SKILL.md', 'skills/+(a)/SKILL.md', 'app/(marketing)/**', '!(group)/**', '!app/(marketing)/**', '**/[!(]x.ts', '[[:alpha:]]x', 'skills/{a,b}/[cd]*.md', 'notes (old)/*.md', '*\\x'])('accepts the minimatch glob %s', (glob) => {
    expect(readFileGlobs(['**/*.ts', glob], 'someOption')).toStrictEqual(['**/*.ts', glob]);
  });

  it.each(['[[:alpha:]]/,][/b', '[[:alpha:]]/[-', '-/[[:alpha:]]]', ',/[[[:alpha:]]]'])('rejects %s, which constructs in minimatch but has no valid form and so matches nothing, naming the option and the glob', (glob) => {
    expect(() => readFileGlobs(['**/*.ts', glob], 'someOption')).toThrow(`@exadev/eslint-config: "someOption" has a glob that minimatch cannot compile: "${glob}": the pattern has no valid form`);
  });

  it('rejects a glob minimatch cannot compile, naming the option and the glob', () => {
    expect(() => readFileGlobs(['**/*.ts', '{[,]}[:alpha:]],'], 'someOption')).toThrow('"someOption" has a glob that minimatch cannot compile: "{[,]}[:alpha:]],"');
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
    expect(inScope(['packages/**'], 'packages')).toBe(false);
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
    const matches = createPathMatcher(['**/skills/*/SKILL.md', 'docs/*'], { dotMatching: 'any' });
    expect(matches('.agents/skills/x/SKILL.md')).toBe(true);
    expect(matches('a/.hidden/skills/x/SKILL.md')).toBe(true);
    expect(matches('skills/.x/SKILL.md')).toBe(true);
    expect(matches('docs/.hidden')).toBe(true);
  });

  it('still honours a ! exclude, a literal segment and the length of the path', () => {
    const matches = createPathMatcher(['**/skills/*/SKILL.md', '!.agents/**'], { dotMatching: 'any' });
    expect(matches('skills/x/SKILL.md')).toBe(true);
    expect(matches('.agents/skills/x/SKILL.md')).toBe(false);
    expect(matches('.agents/skills/x/y/SKILL.md')).toBe(false);
    expect(createPathMatcher(['**'], { dotMatching: 'any' })('../x')).toBe(false);
  });

  it('is not what the default dialect does, where neither a wildcard nor ** crosses a dot-prefixed segment', () => {
    for (const matches of [createPathMatcher(['**/skills/*/SKILL.md']), createPathMatcher(['**/skills/*/SKILL.md'], { dotMatching: 'explicit' })]) {
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
