import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { includeIgnoreFile } from '@eslint/config-helpers';
import json from '@eslint/json';
import markdown from '@eslint/markdown';
import { ESLint } from 'eslint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  agentSkillsConfig,
  buildAgentSkillsConfig,
  DEFAULT_MARKETPLACE_FILES,
  DEFAULT_PLUGIN_FILES,
  DEFAULT_SKILL_FILES,
  hasAgentSkillsLayout,
} from './agent-skills';
import { exadevConfig } from './create-config';
import { isRecord } from './is-record';
import { buildGitignoreConfig } from './gitignore';
import plugin from './plugin';
import { createMemoryFs } from './rules/memory-fs';
import { realWorkspaceFs } from './rules/workspace-fs';
import { toPublicConfigArray } from './to-public-config-array';
import type { RequireFn } from './optional-plugin';

const CWD = '/repo';
// One block for the SKILL.md files and one for each of the two manifest kinds.
const BLOCK_COUNT = 3;
const MARKDOWN_MISSING = "'@eslint/markdown' but it could not be resolved. Install it with: pnpm add -D @eslint/markdown";
const JSON_MISSING = "'@eslint/json' but it could not be resolved. Install it with: pnpm add -D @eslint/json";

const peers: Readonly<Record<string, unknown>> = { '@eslint/json': json, '@eslint/markdown': markdown };

// A resolver that finds only the named peers, so a missing optional peer can be simulated without touching node_modules.
function resolveOnly(...available: readonly string[]): RequireFn {
  return (specifier) => {
    if (!available.includes(specifier)) throw new Error(`simulated missing package ${specifier}`);

    return peers[specifier];
  };
}

const marketplaceRepo = createMemoryFs({ [`${CWD}/.claude-plugin/marketplace.json`]: '{}' });
const noSkills = createMemoryFs({ [`${CWD}/src/index.ts`]: '' });

describe('default globs', () => {
  it('select a skill anywhere, the marketplace manifest at the root and a plugin manifest anywhere', () => {
    expect(DEFAULT_SKILL_FILES).toStrictEqual(['**/skills/*/SKILL.md']);
    expect(DEFAULT_MARKETPLACE_FILES).toStrictEqual(['.claude-plugin/marketplace.json']);
    expect(DEFAULT_PLUGIN_FILES).toStrictEqual(['**/.claude-plugin/plugin.json']);
  });
});

describe('hasAgentSkillsLayout', () => {
  it.each([
    ['a marketplace manifest', { [`${CWD}/.claude-plugin/marketplace.json`]: '{}' }, true],
    ['a skill at the root', { [`${CWD}/skills/a/SKILL.md`]: '' }, true],
    ['a skill inside a plugin', { [`${CWD}/plugins/p/skills/a/SKILL.md`]: '' }, true],
    ['a skills directory with no skill in it', { [`${CWD}/skills/a/notes.md`]: '' }, false],
    ['a plugin with no skills', { [`${CWD}/plugins/p/.claude-plugin/plugin.json`]: '{}' }, false],
    ['a skill outside both locations', { [`${CWD}/docs/skills/a/SKILL.md`]: '' }, false],
    ['a plugin manifest but no marketplace', { [`${CWD}/.claude-plugin/plugin.json`]: '{}' }, false],
    ['an empty tree', {}, false],
  ])('for %s is %s', (_label, files, expected) => {
    expect(hasAgentSkillsLayout(createMemoryFs(files), CWD)).toBe(expected);
  });
});

describe('agentSkillsConfig', () => {
  it('wires the skill rules under markdown/gfm with frontmatter parsed as yaml', () => {
    const [block] = agentSkillsConfig();
    expect(block?.files).toStrictEqual(['**/skills/*/SKILL.md']);
    expect(block).not.toHaveProperty('ignores');
    expect(block?.language).toBe('markdown/gfm');
    expect(block?.languageOptions).toStrictEqual({ frontmatter: 'yaml' });
    expect(block?.plugins?.['exadev']).toBe(plugin);
    expect(block?.plugins?.['markdown']).toBe(markdown);
    expect(block?.rules).toStrictEqual({ 'exadev/skill-frontmatter': 'error', 'exadev/skill-name-unique': ['error', { files: ['**/skills/*/SKILL.md'] }] });
  });

  it('wires the manifest rules under json/json, one block per manifest kind', () => {
    const [, marketplace, pluginManifest, ...rest] = agentSkillsConfig();
    expect(rest).toStrictEqual([]);
    expect(marketplace?.files).toStrictEqual(['.claude-plugin/marketplace.json']);
    expect(marketplace?.language).toBe('json/json');
    expect(marketplace?.plugins?.['exadev']).toBe(plugin);
    expect(marketplace?.plugins?.['json']).toBe(json);
    expect(marketplace?.rules).toStrictEqual({ 'exadev/marketplace-manifest': 'error' });
    expect(pluginManifest?.files).toStrictEqual(['**/.claude-plugin/plugin.json']);
    expect(pluginManifest?.language).toBe('json/json');
    expect(pluginManifest?.rules).toStrictEqual({ 'exadev/plugin-manifest': 'error' });
  });

  it('applies the globs it is given, turning each ! glob into an ignore', () => {
    const [skills, marketplace, pluginManifest] = agentSkillsConfig({
      skillFiles: ['skills/*/SKILL.md', '!skills/drafts/**'],
      marketplaceFiles: ['market/.claude-plugin/marketplace.json'],
      pluginFiles: ['plugins/*/.claude-plugin/plugin.json', '!plugins/legacy/**'],
    });
    expect(skills?.files).toStrictEqual(['skills/*/SKILL.md']);
    expect(skills?.ignores).toStrictEqual(['skills/drafts/**']);
    expect(skills?.rules?.['exadev/skill-name-unique']).toStrictEqual(['error', { files: ['skills/*/SKILL.md', '!skills/drafts/**'] }]);
    expect(marketplace?.files).toStrictEqual(['market/.claude-plugin/marketplace.json']);
    expect(marketplace).not.toHaveProperty('ignores');
    expect(pluginManifest?.files).toStrictEqual(['plugins/*/.claude-plugin/plugin.json']);
    expect(pluginManifest?.ignores).toStrictEqual(['plugins/legacy/**']);
  });

  it('keeps a default for each glob list it is not given', () => {
    const [skills, marketplace] = agentSkillsConfig({ pluginFiles: ['p/.claude-plugin/plugin.json'] });
    expect(skills?.files).toStrictEqual(DEFAULT_SKILL_FILES);
    expect(marketplace?.files).toStrictEqual(DEFAULT_MARKETPLACE_FILES);
  });
});

describe('option validation', () => {
  it.each([
    ['a non-object', 'x', /"agentSkills" must be true, false or an object/u],
    ['null', null, /"agentSkills" must be true, false or an object/u],
    ['an unknown key', { skills: [] }, /"agentSkills" has an unknown key "skills". Allowed keys: skillFiles, marketplaceFiles, pluginFiles/u],
    ['a non-array skillFiles', { skillFiles: 'a' }, /"agentSkills.skillFiles" must be an array of glob strings/u],
    ['an exclude-only marketplaceFiles', { marketplaceFiles: ['!a'] }, /"agentSkills.marketplaceFiles" must contain at least one glob that does not start with "!"/u],
    ['an empty-string pluginFiles entry', { pluginFiles: [''] }, /"agentSkills.pluginFiles" must contain only non-empty strings/u],
  ])('rejects %s', (_label, given, message) => {
    // The options are deliberately malformed, which the declared option type would reject at compile time.
    expect(() => buildAgentSkillsConfig(given as never, { requireFn: resolveOnly('@eslint/json', '@eslint/markdown') })).toThrow(message);
  });

  it('validates the options even when the feature is forced off', () => {
    expect(() => buildAgentSkillsConfig({ skillFiles: 'a' } as never)).toThrow(/"agentSkills.skillFiles"/u);
  });
});

describe('buildAgentSkillsConfig', () => {
  const both = resolveOnly('@eslint/json', '@eslint/markdown');

  it('builds nothing for false, even in a marketplace', () => {
    expect(buildAgentSkillsConfig(false, { fs: marketplaceRepo, cwd: CWD, requireFn: both })).toStrictEqual([]);
  });

  it('builds nothing for false without resolving any peer', () => {
    expect(buildAgentSkillsConfig(false, { fs: marketplaceRepo, cwd: CWD, requireFn: resolveOnly() })).toStrictEqual([]);
  });

  it('auto-detects nothing in a directory without skills or a marketplace', () => {
    expect(buildAgentSkillsConfig(undefined, { fs: noSkills, cwd: CWD, requireFn: both })).toStrictEqual([]);
  });

  it('auto-detects all three blocks in a marketplace', () => {
    expect(buildAgentSkillsConfig(undefined, { fs: marketplaceRepo, cwd: CWD, requireFn: both }).map((block) => block.language)).toStrictEqual(['markdown/gfm', 'json/json', 'json/json']);
  });

  it('auto-detects from a root skill when no marketplace exists', () => {
    const fs = createMemoryFs({ [`${CWD}/skills/a/SKILL.md`]: '' });
    expect(buildAgentSkillsConfig(undefined, { fs, cwd: CWD, requireFn: both })).toHaveLength(BLOCK_COUNT);
  });

  it('auto-detects only the blocks whose optional peer resolves', () => {
    expect(buildAgentSkillsConfig(undefined, { fs: marketplaceRepo, cwd: CWD, requireFn: resolveOnly('@eslint/json') }).map((block) => block.language)).toStrictEqual(['json/json', 'json/json']);
    expect(buildAgentSkillsConfig(undefined, { fs: marketplaceRepo, cwd: CWD, requireFn: resolveOnly('@eslint/markdown') }).map((block) => block.language)).toStrictEqual(['markdown/gfm']);
    expect(buildAgentSkillsConfig(undefined, { fs: marketplaceRepo, cwd: CWD, requireFn: resolveOnly() })).toStrictEqual([]);
  });

  it('forces the feature on with true, in a directory that holds no skills', () => {
    expect(buildAgentSkillsConfig(true, { fs: noSkills, cwd: CWD, requireFn: both })).toHaveLength(BLOCK_COUNT);
  });

  it('forces the feature on with an options object', () => {
    const blocks = buildAgentSkillsConfig({ skillFiles: ['s/*/SKILL.md'] }, { fs: noSkills, cwd: CWD, requireFn: both });
    expect(blocks).toHaveLength(BLOCK_COUNT);
    expect(blocks[0]?.files).toStrictEqual(['s/*/SKILL.md']);
  });

  it('throws with the install command when a forced feature lacks @eslint/markdown', () => {
    expect(() => buildAgentSkillsConfig(true, { fs: noSkills, cwd: CWD, requireFn: resolveOnly('@eslint/json') })).toThrow(`@exadev/eslint-config: Agent skills linting needs ${MARKDOWN_MISSING}`);
  });

  it('throws with the install command when a forced feature lacks @eslint/json', () => {
    expect(() => buildAgentSkillsConfig({}, { fs: noSkills, cwd: CWD, requireFn: resolveOnly('@eslint/markdown') })).toThrow(`@exadev/eslint-config: Agent skills linting needs ${JSON_MISSING}`);
  });

  it('hands the ignores it is given to skill-name-unique, and none when it is given none', () => {
    const withIgnores = buildAgentSkillsConfig(true, { fs: noSkills, cwd: CWD, requireFn: both, ignores: ['**/dist/', '!**/dist/keep'] });
    expect(withIgnores[0]?.rules?.['exadev/skill-name-unique']).toStrictEqual(['error', { files: DEFAULT_SKILL_FILES, ignores: ['**/dist/', '!**/dist/keep'] }]);
    const without = buildAgentSkillsConfig(true, { fs: noSkills, cwd: CWD, requireFn: both, ignores: [] });
    expect(without[0]?.rules?.['exadev/skill-name-unique']).toStrictEqual(['error', { files: DEFAULT_SKILL_FILES }]);
  });

  it('detects from the process working directory by default, which holds neither skills nor a marketplace', () => {
    expect(buildAgentSkillsConfig(undefined)).toStrictEqual([]);
  });
});

describe('exadevConfig({ agentSkills })', () => {
  const isAgentSkillsBlock = (rules: Readonly<Record<string, unknown>> | undefined): boolean => Object.keys(rules ?? {}).some((rule) => /^exadev\/(skill-|marketplace-|plugin-manifest)/u.test(rule));

  it('adds the blocks when forced on', () => {
    expect(exadevConfig({ agentSkills: true }).filter((block) => isAgentSkillsBlock(block.rules))).toHaveLength(BLOCK_COUNT);
  });

  it('adds the blocks, with its globs, for an options object', () => {
    const skills = exadevConfig({ agentSkills: { skillFiles: ['s/*/SKILL.md'] } }).find((block) => block.language === 'markdown/gfm');
    expect(skills?.files).toStrictEqual(['s/*/SKILL.md']);
  });

  it('tells skill-name-unique what the .gitignore-derived ignores hide, as long as those ignores are on', () => {
    const optionsOf = (config: readonly { readonly language?: string; readonly rules?: Readonly<Record<string, unknown>> }[]) => config.find((block) => block.language === 'markdown/gfm')?.rules?.['exadev/skill-name-unique'];
    const derived = buildGitignoreConfig().flatMap(({ ignores = [] }) => ignores);
    expect(derived).not.toStrictEqual([]);
    expect(optionsOf(exadevConfig({ agentSkills: true }))).toStrictEqual(['error', { files: DEFAULT_SKILL_FILES, ignores: derived }]);
    expect(optionsOf(exadevConfig({ agentSkills: true, gitignore: false }))).toStrictEqual(['error', { files: DEFAULT_SKILL_FILES }]);
  });

  it('keeps the SKILL.md frontmatter as YAML when markdownHeadings selects the same file with another frontmatter format', async () => {
    const config = exadevConfig({ react: false, nextjs: false, agentSkills: true, markdownHeadings: { files: ['**/*.md'], headings: [{ depth: 1, text: 'Title' }], frontmatter: 'toml' } });
    const eslint = new ESLint({ cwd: import.meta.dirname, overrideConfigFile: true, overrideConfig: [...config] });
    const skill: unknown = await eslint.calculateConfigForFile('skills/a/SKILL.md');
    const readme: unknown = await eslint.calculateConfigForFile('docs/readme.md');
    const frontmatterOf = (resolved: unknown): unknown => (isRecord(resolved) && isRecord(resolved['languageOptions']) ? resolved['languageOptions']['frontmatter'] : undefined);

    expect(frontmatterOf(skill)).toBe('yaml');
    expect(frontmatterOf(readme)).toBe('toml');
  });

  it('adds nothing when off, or when auto-detection finds no skills', () => {
    expect(exadevConfig({ agentSkills: false }).some((block) => isAgentSkillsBlock(block.rules))).toBe(false);
    expect(exadevConfig().some((block) => isAgentSkillsBlock(block.rules))).toBe(false);
  });
});

describe('linting a repository', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'exadev-eslint-config-agent-skills-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  function write(path: string, text: string): void {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), text);
  }

  function skill(name: string): string {
    return `---\nname: ${name}\ndescription: Does a thing.\n---\n\n# ${name}\n`;
  }

  async function lint(): Promise<Readonly<Record<string, readonly string[]>>> {
    const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: agentSkillsConfig() });
    const results = await eslint.lintFiles(['.']);

    return Object.fromEntries(results.map((result) => [result.filePath.slice(cwd.length + 1), result.messages.map((message) => `${message.ruleId ?? 'none'}: ${message.message}`)]));
  }

  it('reports a skill whose name differs from its directory, a repeated skill name, and the manifests it cannot trust', async () => {
    write('skills/word-count/SKILL.md', skill('words'));
    write('skills/dup/SKILL.md', skill('dup'));
    write('plugins/p/skills/dup/SKILL.md', skill('dup'));
    write('.claude-plugin/marketplace.json', JSON.stringify({ name: 'm', owner: { name: 'o' }, plugins: [{ name: 'p', source: 'plugins/p', version: '1.0.0' }] }));
    write('plugins/p/.claude-plugin/plugin.json', JSON.stringify({ name: 'q' }));

    expect(await lint()).toStrictEqual({
      '.claude-plugin/marketplace.json': [
        // ESLint orders messages by position: the plugins array comes before the entry, and the entry's source before its version.
        'exadev/marketplace-manifest: plugins/p holds a plugin manifest but is not listed in the marketplace.',
        'exadev/marketplace-manifest: Marketplace entry "p" has source "plugins/p", which does not start with "./", so the skills CLI skips it.',
        'exadev/marketplace-manifest: Marketplace entry "p" must not have a "version": the plugin\'s own plugin.json owns it, and Claude Code ignores the entry\'s once plugin.json sets one.',
      ],
      'plugins/p/.claude-plugin/plugin.json': ['exadev/plugin-manifest: The plugin name "q" must equal its directory name "p".'],
      'plugins/p/skills/dup/SKILL.md': ['exadev/skill-name-unique: The skill name "dup" is also defined in skills/dup/SKILL.md, so the skills CLI lists only one of them.'],
      'skills/dup/SKILL.md': ['exadev/skill-name-unique: The skill name "dup" is also defined in plugins/p/skills/dup/SKILL.md, so the skills CLI lists only one of them.'],
      'skills/word-count/SKILL.md': ['exadev/skill-frontmatter: The skill name "words" must equal its directory name "word-count".'],
    });
  });

  it('reads a sibling manifest with a byte order mark, and reports one that is not JSON without aborting the run', async () => {
    write('.claude-plugin/marketplace.json', JSON.stringify({ name: 'm', owner: { name: 'o' }, plugins: [{ name: 'p1', source: './plugins/p1' }, { name: 'p2', source: './plugins/p2' }, { name: 'p3', source: 'tools/p3' }] }));
    write('plugins/p1/.claude-plugin/plugin.json', `\uFEFF${JSON.stringify({ name: 'p1' })}`);
    write('plugins/p2/.claude-plugin/plugin.json', '{"name":');
    write('plugins/p1/package.json', '{"version":"1.0.0",}');

    const results = await lint();
    expect(results['.claude-plugin/marketplace.json']).toHaveLength(2);
    expect(results['.claude-plugin/marketplace.json']?.[0]).toMatch(/^exadev\/marketplace-manifest: Marketplace entry "p2" has source ".\/plugins\/p2", whose \.claude-plugin\/plugin\.json is not valid JSON: /u);
    expect(results['.claude-plugin/marketplace.json']?.[1]).toBe('exadev/marketplace-manifest: Marketplace entry "p3" has source "tools/p3", which does not start with "./", so the skills CLI skips it.');
    expect(results['plugins/p1/.claude-plugin/plugin.json']).toStrictEqual(['exadev/plugin-manifest: The plugin version is unset but package.json is 1.0.0; they must be equal.']);
  });

  it('lists a plugin directory that is a symbolic link, so an unlisted one is found', async () => {
    write('real/p1/.claude-plugin/plugin.json', JSON.stringify({ name: 'p1' }));
    mkdirSync(join(cwd, 'plugins'));
    symlinkSync(join(cwd, 'real', 'p1'), join(cwd, 'plugins', 'p1'));
    write('.claude-plugin/marketplace.json', JSON.stringify({ name: 'm', owner: { name: 'o' }, plugins: [] }));

    expect((await lint())['.claude-plugin/marketplace.json']).toStrictEqual(['exadev/marketplace-manifest: plugins/p1 holds a plugin manifest but is not listed in the marketplace.']);
  });

  it.each([
    ['skill directory', 'skills/a', 'real/a'],
    ['plugin directory', 'plugins/p', 'real/p'],
  ])('detects a layout whose %s is a symbolic link', (_label, link, target) => {
    const skillsBase = link.startsWith('plugins') ? join(target, 'skills', 'a') : target;
    write(`${skillsBase}/SKILL.md`, skill('a'));
    mkdirSync(dirname(join(cwd, link)), { recursive: true });
    symlinkSync(join(cwd, target), join(cwd, link));

    expect(hasAgentSkillsLayout(realWorkspaceFs, cwd)).toBe(true);
  });

  it('finds a repeated skill name from either side when one copy sits in a dot-prefixed directory', async () => {
    write('skills/a/SKILL.md', skill('a'));
    write('.agents/skills/a2/SKILL.md', skill('a'));

    expect(await lint()).toStrictEqual({
      '.agents/skills/a2/SKILL.md': [
        'exadev/skill-frontmatter: The skill name "a" must equal its directory name "a2".',
        'exadev/skill-name-unique: The skill name "a" is also defined in skills/a/SKILL.md, so the skills CLI lists only one of them.',
      ],
      'skills/a/SKILL.md': ['exadev/skill-name-unique: The skill name "a" is also defined in .agents/skills/a2/SKILL.md, so the skills CLI lists only one of them.'],
    });
  });

  it('does not count a copy under a .gitignore-d directory as a duplicate, since ESLint does not lint it', async () => {
    write('.gitignore', 'dist\n');
    write('skills/a/SKILL.md', skill('a'));
    write('dist/skills/a/SKILL.md', skill('a'));
    const gitignore = includeIgnoreFile(join(cwd, '.gitignore'));
    const { ignores = [] } = gitignore;
    const overrideConfig = [gitignore, ...toPublicConfigArray(buildAgentSkillsConfig(true, { fs: realWorkspaceFs, cwd, ignores }))];
    const results = await new ESLint({ cwd, overrideConfigFile: true, overrideConfig }).lintFiles(['.']);

    expect(results.map((result) => [result.filePath.slice(cwd.length + 1), result.messages.map((message) => message.message)])).toStrictEqual([['skills/a/SKILL.md', []]]);
  });

  it('does not hold a plugin at the working directory to the name of the checkout folder', async () => {
    write('.claude-plugin/marketplace.json', JSON.stringify({ name: 'm', owner: { name: 'o' }, plugins: [{ name: 'solo', source: './' }] }));
    write('.claude-plugin/plugin.json', JSON.stringify({ name: 'solo' }));

    expect(await lint()).toStrictEqual({ '.claude-plugin/marketplace.json': [], '.claude-plugin/plugin.json': [] });
  });

  it('does not hold a plugin at a nested marketplace root to the name of that directory either', async () => {
    write('sub/.claude-plugin/marketplace.json', JSON.stringify({ name: 'm', owner: { name: 'o' }, plugins: [{ name: 'solo', source: './' }] }));
    write('sub/.claude-plugin/plugin.json', JSON.stringify({ name: 'solo' }));
    const eslint = new ESLint({
      cwd,
      overrideConfigFile: true,
      overrideConfig: agentSkillsConfig({ marketplaceFiles: ['sub/.claude-plugin/marketplace.json'], pluginFiles: ['sub/.claude-plugin/plugin.json'] }),
    });
    const results = await eslint.lintFiles(['sub']);

    expect(results.map((result) => [result.filePath.slice(cwd.length + 1), result.messages.map((message) => message.message)])).toStrictEqual([
      ['sub/.claude-plugin/marketplace.json', []],
      ['sub/.claude-plugin/plugin.json', []],
    ]);
  });

  it('reports nothing for a consistent repository', async () => {
    write('skills/word-count/SKILL.md', skill('word-count'));
    write('plugins/p/skills/other/SKILL.md', skill('other'));
    write('.claude-plugin/marketplace.json', JSON.stringify({ name: 'm', owner: { name: 'o' }, plugins: [{ name: 'p', source: './plugins/p' }] }));
    write('plugins/p/.claude-plugin/plugin.json', JSON.stringify({ name: 'p', version: '1.0.0' }));
    write('plugins/p/package.json', JSON.stringify({ name: 'p', version: '1.0.0' }));

    expect(await lint()).toStrictEqual({
      '.claude-plugin/marketplace.json': [],
      'plugins/p/.claude-plugin/plugin.json': [],
      'plugins/p/skills/other/SKILL.md': [],
      'skills/word-count/SKILL.md': [],
    });
  });
});
