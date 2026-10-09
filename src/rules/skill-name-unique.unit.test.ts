import markdown from '@eslint/markdown';
import { Linter } from 'eslint';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIgnoreMatcher } from './ignore-patterns';
import { createMemoryFs } from './memory-fs';
import { createSkillNameUniqueRule, scanSkillFiles } from './skill-name-unique';
import { realWorkspaceFs, type WorkspaceFs } from './workspace-fs';

const CWD = '/repo';
const SCANS_FOR_THREE_SELECTIONS = 3;
const NOTHING_IGNORED = createIgnoreMatcher([]);
const OWNER_ACCESS = 0o700;
const NO_ACCESS = 0;

class CodedError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

function skill(name: string | undefined): string {
  return name === undefined ? '---\ndescription: d\n---\n' : `---\nname: ${name}\ndescription: d\n---\n\n# ${name}\n`;
}

interface LintExtras {
  readonly options?: readonly unknown[];
  readonly rule?: ReturnType<typeof createSkillNameUniqueRule>;
  readonly cwd?: string;
}

function lintWith(fs: WorkspaceFs, text: string, filename: string, extras: LintExtras = {}): readonly string[] {
  const { options = [], rule = createSkillNameUniqueRule(fs), cwd = CWD } = extras;

  const config = [
    {
      files: ['**/*.md'],
      language: 'markdown/gfm',
      languageOptions: { frontmatter: 'yaml' },
      plugins: { markdown, test: { rules: { 'skill-name-unique': rule } } },
      rules: { 'test/skill-name-unique': ['error', ...options] },
    },
  ];

  return new Linter({ cwd }).verify(text, config as never, { filename }).map((message) => message.message);
}

const tree = {
  [`${CWD}/skills/alpha/SKILL.md`]: skill('alpha'),
  [`${CWD}/skills/beta/SKILL.md`]: skill('beta'),
  [`${CWD}/plugins/p/skills/gamma/SKILL.md`]: skill('gamma'),
};

describe('rule metadata', () => {
  it('carries the docs url, the languages and the option schema', () => {
    const rule = createSkillNameUniqueRule(createMemoryFs({}));
    expect(rule.meta?.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/skill-name-unique.ts');
    expect(rule.meta?.languages).toStrictEqual(['markdown/commonmark', 'markdown/gfm']);
    expect(rule.meta?.defaultOptions).toStrictEqual([{}]);
  });
});

describe('scanSkillFiles', () => {
  const fs = createMemoryFs({
    ...tree,
    [`${CWD}/node_modules/dep/skills/alpha/SKILL.md`]: skill('alpha'),
    [`${CWD}/.git/worktrees/skills/alpha/SKILL.md`]: skill('alpha'),
    [`${CWD}/skills/alpha/SKILL.md.bak`]: skill('alpha'),
    [`${CWD}/skills/alpha/skill.md`]: skill('alpha'),
    [`${CWD}/skills/nameless/SKILL.md`]: skill(undefined),
    [`${CWD}/skills/plain/SKILL.md`]: '# no frontmatter\n',
  });

  it('lists every SKILL.md that declares a name, relative to the root, skipping node_modules and .git', () => {
    expect([...scanSkillFiles(fs, CWD, () => true, NOTHING_IGNORED)].sort((left, right) => (left.path < right.path ? -1 : 1))).toStrictEqual([
      { path: 'plugins/p/skills/gamma/SKILL.md', name: 'gamma' },
      { path: 'skills/alpha/SKILL.md', name: 'alpha' },
      { path: 'skills/beta/SKILL.md', name: 'beta' },
    ]);
  });

  it('lists only the files the matcher selects', () => {
    expect(scanSkillFiles(fs, CWD, (path) => path.startsWith('plugins/'), NOTHING_IGNORED)).toStrictEqual([{ path: 'plugins/p/skills/gamma/SKILL.md', name: 'gamma' }]);
  });
});

describe('scanSkillFiles with ignore patterns', () => {
  const fs = createMemoryFs({
    ...tree,
    [`${CWD}/dist/skills/alpha/SKILL.md`]: skill('alpha'),
    [`${CWD}/skills/alpha-copy/SKILL.md`]: skill('alpha'),
    [`${CWD}/.cache/build/skills/alpha/SKILL.md`]: skill('alpha'),
  });
  const paths = (ignores: readonly string[]) =>
    scanSkillFiles(fs, CWD, () => true, createIgnoreMatcher(ignores))
      .map((entry) => entry.path)
      .sort();

  it('does not descend into a directory the patterns ignore', () => {
    expect(paths(['**/dist/', '.cache'])).toStrictEqual(['plugins/p/skills/gamma/SKILL.md', 'skills/alpha-copy/SKILL.md', 'skills/alpha/SKILL.md', 'skills/beta/SKILL.md']);
  });

  it('skips a file the patterns ignore and reads one a later ! pattern brings back', () => {
    expect(paths(['**/SKILL.md', '!**/skills/alpha-copy/SKILL.md'])).toStrictEqual(['skills/alpha-copy/SKILL.md']);
    expect(paths(['!**/skills/alpha-copy/SKILL.md', '**/SKILL.md'])).toStrictEqual([]);
  });
});

describe('scanSkillFiles over a tree it cannot read', () => {
  let root: string;
  const restricted: string[] = [];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'exadev-eslint-config-skill-scan-'));
    mkdirSync(join(root, 'skills', 'a'), { recursive: true });
    mkdirSync(join(root, 'skills', 'b'), { recursive: true });
    mkdirSync(join(root, 'data', 'secret'), { recursive: true });
    writeFileSync(join(root, 'skills', 'a', 'SKILL.md'), skill('a'));
    writeFileSync(join(root, 'skills', 'b', 'SKILL.md'), skill('b'));
    writeFileSync(join(root, 'data', 'secret', 'x.txt'), 'x');
  });

  afterEach(() => {
    for (const path of restricted.splice(0)) chmodSync(path, OWNER_ACCESS);
    rmSync(root, { recursive: true, force: true });
  });

  // Whether the process can still read the path after it was restricted, which is the case for root and makes the fixture unable to fail.
  function restrict(path: string, probe: (path: string) => unknown): boolean {
    chmodSync(path, NO_ACCESS);
    restricted.push(path);
    try {
      probe(path);

      return false;
    } catch {
      return true;
    }
  }

  it('treats a directory it is not permitted to list as empty, as ESLint never reads what it is not asked to lint', (context) => {
    if (!restrict(join(root, 'data', 'secret'), readdirSync)) context.skip();
    expect(
      scanSkillFiles(realWorkspaceFs, root, () => true, NOTHING_IGNORED)
        .map((entry) => entry.path)
        .sort(),
    ).toStrictEqual(['skills/a/SKILL.md', 'skills/b/SKILL.md']);
  });

  it('fails loudly for a SKILL.md it cannot read, naming the file and the cause', (context) => {
    if (!restrict(join(root, 'skills', 'b', 'SKILL.md'), (path) => readFileSync(path))) context.skip();
    expect(() => scanSkillFiles(realWorkspaceFs, root, () => true, NOTHING_IGNORED)).toThrow(/cannot read ".*skills\/b\/SKILL\.md".*EACCES/u);
  });

  it.each(['EACCES', 'EPERM'])('treats a directory refused with %s as empty', (code) => {
    const inner = createMemoryFs({ [`${CWD}/skills/a/SKILL.md`]: skill('a'), [`${CWD}/data/secret/x.txt`]: 'x' });
    const refusing: WorkspaceFs = {
      ...inner,
      readdirSync: (path) => {
        if (path.endsWith('/data')) throw new CodedError(`${code}: refused`, code);

        return inner.readdirSync(path);
      },
    };
    expect(scanSkillFiles(refusing, CWD, () => true, NOTHING_IGNORED).map((entry) => entry.path)).toStrictEqual(['skills/a/SKILL.md']);
  });

  it('rethrows a listing error that is not a permission error', () => {
    const failing: WorkspaceFs = {
      ...createMemoryFs({}),
      readdirSync: () => {
        throw new CodedError('ENOENT: gone', 'ENOENT');
      },
    };
    expect(() => scanSkillFiles(failing, CWD, () => true, NOTHING_IGNORED)).toThrow(/ENOENT: gone/u);
  });
});

describe('skill-name-unique', () => {
  it('reports nothing when every name is defined once', () => {
    expect(lintWith(createMemoryFs(tree), skill('alpha'), `${CWD}/skills/alpha/SKILL.md`)).toStrictEqual([]);
  });

  it('reports a name another SKILL.md defines, naming that path', () => {
    const fs = createMemoryFs({ ...tree, [`${CWD}/skills/alpha-copy/SKILL.md`]: skill('alpha') });
    expect(lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`)).toStrictEqual([
      'The skill name "alpha" is also defined in skills/alpha-copy/SKILL.md, so the skills CLI lists only one of them.',
    ]);
  });

  it('lists every other definition, sorted', () => {
    const fs = createMemoryFs({ ...tree, [`${CWD}/skills/z/SKILL.md`]: skill('alpha'), [`${CWD}/plugins/p/skills/a/SKILL.md`]: skill('alpha') });
    expect(lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`)).toStrictEqual([
      'The skill name "alpha" is also defined in plugins/p/skills/a/SKILL.md, skills/z/SKILL.md, so the skills CLI lists only one of them.',
    ]);
  });

  it('compares the text being linted, not the copy on disk, and never the file with itself', () => {
    const fs = createMemoryFs(tree);
    expect(lintWith(fs, skill('beta'), `${CWD}/skills/alpha/SKILL.md`)).toStrictEqual([
      'The skill name "beta" is also defined in skills/beta/SKILL.md, so the skills CLI lists only one of them.',
    ]);
    expect(lintWith(fs, skill('renamed'), `${CWD}/skills/alpha/SKILL.md`)).toStrictEqual([]);
  });

  it('ignores copies under node_modules and .git', () => {
    const fs = createMemoryFs({ ...tree, [`${CWD}/node_modules/dep/skills/alpha/SKILL.md`]: skill('alpha'), [`${CWD}/.git/x/SKILL.md`]: skill('alpha') });
    expect(lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`)).toStrictEqual([]);
  });

  it.each([
    ['no frontmatter', '# Skill\n'],
    ['invalid yaml', '---\nname: [x\n---\n'],
    ['a non-mapping', '---\n- a\n---\n'],
    ['no name', skill(undefined)],
    ['an empty name', '---\nname: ""\n---\n'],
    ['a non-string name', '---\nname: 3\n---\n'],
  ])('reports nothing for a linted file with %s, which skill-frontmatter reports', (_label, text) => {
    const fs = createMemoryFs({ ...tree, [`${CWD}/skills/other/SKILL.md`]: skill('alpha') });
    expect(lintWith(fs, text, `${CWD}/skills/alpha/SKILL.md`)).toStrictEqual([]);
  });

  describe('names compared trimmed and exactly, as the skills CLI compares them', () => {
    const own = `${CWD}/skills/a/SKILL.md`;
    const other = `${CWD}/plugins/p/skills/a/SKILL.md`;
    const duplicate = 'The skill name "a" is also defined in';

    it.each([
      ['a leading space', '" a"'],
      ['a trailing space', '"a "'],
      ['a tab and a newline', '"\\ta\\n"'],
    ])('reports %s as the same name from both sides', (_label, padded) => {
      const fs = createMemoryFs({ [own]: `---\nname: a\ndescription: d\n---\n`, [other]: `---\nname: ${padded}\ndescription: d\n---\n` });
      expect(lintWith(fs, skill('a'), own)).toStrictEqual([`${duplicate} plugins/p/skills/a/SKILL.md, so the skills CLI lists only one of them.`]);
      expect(lintWith(fs, `---\nname: ${padded}\ndescription: d\n---\n`, other)).toStrictEqual([`${duplicate} skills/a/SKILL.md, so the skills CLI lists only one of them.`]);
    });

    it.each([
      ['a fullwidth letter', '\uff41'],
      ['a decomposed accent', 'cafe\u0301'],
    ])('keeps %s distinct from its normalised form', (_label, name) => {
      const normal = name === '\uff41' ? 'a' : 'caf\u00e9';
      const fs = createMemoryFs({ [`${CWD}/skills/x/SKILL.md`]: skill(normal) });
      expect(lintWith(fs, skill(name), `${CWD}/skills/y/SKILL.md`)).toStrictEqual([]);
    });
  });

  it('compares only the files the files option selects', () => {
    const fs = createMemoryFs({ ...tree, [`${CWD}/skills/alpha-copy/SKILL.md`]: skill('alpha'), [`${CWD}/fixtures/skills/alpha/SKILL.md`]: skill('alpha') });
    const own = `${CWD}/skills/alpha/SKILL.md`;
    expect(lintWith(fs, skill('alpha'), own, { options: [{ files: ['skills/*/SKILL.md'] }] })).toStrictEqual([
      'The skill name "alpha" is also defined in skills/alpha-copy/SKILL.md, so the skills CLI lists only one of them.',
    ]);
    expect(lintWith(fs, skill('alpha'), own, { options: [{ files: ['**/SKILL.md', '!skills/alpha-copy/**'] }] })).toStrictEqual([
      'The skill name "alpha" is also defined in fixtures/skills/alpha/SKILL.md, so the skills CLI lists only one of them.',
    ]);
    expect(lintWith(fs, skill('alpha'), own, { options: [{ files: ['**/SKILL.md', '!skills/alpha-copy/**', '!fixtures/**'] }] })).toStrictEqual([]);
  });

  it('selects files with an extglob in the files option, as ESLint does', () => {
    const fs = createMemoryFs({ ...tree, [`${CWD}/skills/alpha-copy/SKILL.md`]: skill('alpha'), [`${CWD}/skills/beta-copy/SKILL.md`]: skill('alpha') });
    expect(lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`, { options: [{ files: ['skills/@(alpha|alpha-copy)/SKILL.md'] }] })).toStrictEqual([
      'The skill name "alpha" is also defined in skills/alpha-copy/SKILL.md, so the skills CLI lists only one of them.',
    ]);
  });

  it('matches a dot-prefixed directory with a wildcard or ** in the files option, as ESLint does', () => {
    const fs = createMemoryFs({ ...tree, [`${CWD}/.agents/skills/copy/SKILL.md`]: skill('alpha') });
    expect(lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`, { options: [{ files: ['**/skills/*/SKILL.md'] }] })).toStrictEqual([
      'The skill name "alpha" is also defined in .agents/skills/copy/SKILL.md, so the skills CLI lists only one of them.',
    ]);
  });

  it('does not count a copy under a directory the ignores option names, which ESLint does not lint either', () => {
    const fs = createMemoryFs({ ...tree, [`${CWD}/dist/skills/alpha/SKILL.md`]: skill('alpha') });
    const own = `${CWD}/skills/alpha/SKILL.md`;
    expect(lintWith(fs, skill('alpha'), own, { options: [{ ignores: ['**/dist/'] }] })).toStrictEqual([]);
    expect(lintWith(fs, skill('alpha'), own, { options: [{ ignores: ['**/other/'] }] })).toStrictEqual([
      'The skill name "alpha" is also defined in dist/skills/alpha/SKILL.md, so the skills CLI lists only one of them.',
    ]);
  });

  it('rejects an unknown option and an empty files list', () => {
    const fs = createMemoryFs(tree);
    const own = `${CWD}/skills/alpha/SKILL.md`;
    expect(() => lintWith(fs, skill('alpha'), own, { options: [{ file: [] }] })).toThrow(/should NOT have additional properties/u);
    expect(() => lintWith(fs, skill('alpha'), own, { options: [{ files: [] }] })).toThrow(/should NOT have fewer than 1 items/u);
    expect(() => lintWith(fs, skill('alpha'), own, { options: [{ ignores: 'dist' }] })).toThrow(/should be array/u);
    expect(() => lintWith(fs, skill('alpha'), own, { options: [{ files: ['skills/*/SKILL.md', '{[,]}[:alpha:]],'] }] })).toThrow(/"skill-name-unique\.files" has a glob that minimatch cannot compile: "\{\[,\]\}\[:alpha:\]\],"/u);
  });

  describe('scan caching', () => {
    // Counts the listings of each scan root, which is the first directory a scan reads.
    function countingFs(files: Readonly<Record<string, string>>): { readonly fs: WorkspaceFs; readonly scans: (root?: string) => number } {
      const inner = createMemoryFs(files);
      const listings = new Map<string, number>();

      return {
        fs: {
          ...inner,
          readdirSync: (path) => {
            listings.set(path, (listings.get(path) ?? 0) + 1);

            return inner.readdirSync(path);
          },
        },
        scans: (root = CWD) => listings.get(root) ?? 0,
      };
    }

    it('scans a directory once per rule, however many files are linted', () => {
      const { fs, scans } = countingFs(tree);
      const rule = createSkillNameUniqueRule(fs);
      lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`, { rule });
      lintWith(fs, skill('beta'), `${CWD}/skills/beta/SKILL.md`, { rule });
      expect(scans()).toBe(1);
    });

    it('scans again for a different file selection', () => {
      const { fs, scans } = countingFs(tree);
      const rule = createSkillNameUniqueRule(fs);
      lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`, { options: [{ files: ['**/SKILL.md'] }], rule });
      lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`, { options: [{ files: ['skills/*/SKILL.md'] }], rule });
      lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`, { rule });
      expect(scans()).toBe(SCANS_FOR_THREE_SELECTIONS);
    });

    it('scans again for a different ignore list', () => {
      const { fs, scans } = countingFs(tree);
      const rule = createSkillNameUniqueRule(fs);
      lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`, { options: [{ ignores: ['**/dist/'] }], rule });
      lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`, { options: [{ ignores: ['**/dist/'] }], rule });
      lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`, { options: [{ ignores: ['**/build/'] }], rule });
      expect(scans()).toBe(2);
    });

    it('scans again for a different working directory', () => {
      const other = '/other';
      const { fs, scans } = countingFs({ ...tree, [`${other}/skills/alpha/SKILL.md`]: skill('alpha') });
      const rule = createSkillNameUniqueRule(fs);
      lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`, { rule });
      lintWith(fs, skill('alpha'), `${other}/skills/alpha/SKILL.md`, { rule, cwd: other });
      expect(scans(CWD)).toBe(1);
      expect(scans(other)).toBe(1);
    });

    it('starts each rule with an empty cache', () => {
      const { fs, scans } = countingFs(tree);
      lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`);
      lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`);
      expect(scans()).toBe(2);
    });
  });
});
