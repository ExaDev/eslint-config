import markdown from '@eslint/markdown';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import { createSkillNameUniqueRule, scanSkillFiles } from './skill-name-unique';
import type { WorkspaceFs } from './workspace-fs';

const CWD = '/repo';
const SCANS_FOR_THREE_SELECTIONS = 3;

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
    expect([...scanSkillFiles(fs, CWD, () => true)].sort((left, right) => (left.path < right.path ? -1 : 1))).toStrictEqual([
      { path: 'plugins/p/skills/gamma/SKILL.md', name: 'gamma' },
      { path: 'skills/alpha/SKILL.md', name: 'alpha' },
      { path: 'skills/beta/SKILL.md', name: 'beta' },
    ]);
  });

  it('lists only the files the matcher selects', () => {
    expect(scanSkillFiles(fs, CWD, (path) => path.startsWith('plugins/'))).toStrictEqual([{ path: 'plugins/p/skills/gamma/SKILL.md', name: 'gamma' }]);
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

  it('matches a dot-prefixed directory with a wildcard or ** in the files option, as ESLint does', () => {
    const fs = createMemoryFs({ ...tree, [`${CWD}/.agents/skills/copy/SKILL.md`]: skill('alpha') });
    expect(lintWith(fs, skill('alpha'), `${CWD}/skills/alpha/SKILL.md`, { options: [{ files: ['**/skills/*/SKILL.md'] }] })).toStrictEqual([
      'The skill name "alpha" is also defined in .agents/skills/copy/SKILL.md, so the skills CLI lists only one of them.',
    ]);
  });

  it('rejects an unknown option and an empty files list', () => {
    const fs = createMemoryFs(tree);
    const own = `${CWD}/skills/alpha/SKILL.md`;
    expect(() => lintWith(fs, skill('alpha'), own, { options: [{ file: [] }] })).toThrow(/should NOT have additional properties/u);
    expect(() => lintWith(fs, skill('alpha'), own, { options: [{ files: [] }] })).toThrow(/should NOT have fewer than 1 items/u);
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
