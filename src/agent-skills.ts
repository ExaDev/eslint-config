import { join } from 'node:path';
import type { Linter } from 'eslint';
import { scopeOfValidated } from './config-globs';
import type { ConfigArrayValue, PublicConfigArray } from './config-types';
import { isRecord } from './is-record';
import { buildJsonLanguageBlock, requireJsonPlugin, tryResolveJsonPlugin } from './json-language-config';
import { requireMarkdownPlugin, tryResolveMarkdownPlugin } from './markdown-plugin';
import type { RequireFn } from './optional-plugin';
import plugin from './plugin';
import { assertOnlyKeys } from './rules/file-entry';
import { readFileGlobs } from './rules/file-scope';
import { CLAUDE_PLUGIN_DIR, MARKETPLACE_FILE_NAME, PLUGIN_MANIFEST_FILE } from './rules/claude-plugin-json';
import { PLUGINS_DIR } from './rules/marketplace-manifest';
import { SKILL_FILE_NAME } from './rules/skill-document';
import { listSubdirectoriesThroughLinks, realWorkspaceFs, type WorkspaceFs } from './rules/workspace-fs';
import { toPublicConfigArray } from './to-public-config-array';

const OPTION_NAME = 'agentSkills';
const FEATURE = 'Agent skills linting';
const SKILLS_DIR = 'skills';

/**
 * The SKILL.md files linted unless `skillFiles` says otherwise: a skill is `skills/<name>/SKILL.md`, at the repository root or inside a plugin.
 */
export const DEFAULT_SKILL_FILES: readonly string[] = [`**/${SKILLS_DIR}/*/${SKILL_FILE_NAME}`];

/**
 * The marketplace manifest linted unless `marketplaceFiles` says otherwise.
 */
export const DEFAULT_MARKETPLACE_FILES: readonly string[] = [`${CLAUDE_PLUGIN_DIR}/${MARKETPLACE_FILE_NAME}`];

/**
 * The plugin manifests linted unless `pluginFiles` says otherwise: one per plugin, wherever the plugin sits.
 */
export const DEFAULT_PLUGIN_FILES: readonly string[] = [`**/${CLAUDE_PLUGIN_DIR}/${PLUGIN_MANIFEST_FILE}`];

/**
 * The `agentSkills` option of `exadevConfig` in its object form, and the argument of `agentSkillsConfig`. Every field is a list of globs, relative to ESLint's working directory, in the dialect of every file glob in this package, where a leading `!` excludes.
 */
export interface AgentSkillsOptions {
  // The SKILL.md files to lint with `exadev/skill-frontmatter`. `exadev/skill-name-unique` compares names across this same selection. Defaults to DEFAULT_SKILL_FILES.
  readonly skillFiles?: readonly string[];
  // The Claude Code marketplace manifests to lint with `exadev/marketplace-manifest`. Defaults to DEFAULT_MARKETPLACE_FILES.
  readonly marketplaceFiles?: readonly string[];
  // The Claude Code plugin manifests to lint with `exadev/plugin-manifest`. Defaults to DEFAULT_PLUGIN_FILES.
  readonly pluginFiles?: readonly string[];
}

/**
 * The environment `buildAgentSkillsConfig` reads, exposed as a test seam only. Never exposed through exadevConfig()'s own public options.
 */
export interface AgentSkillsEnvironment {
  // Where to look for a skills or marketplace layout when auto-detecting. Defaults to process.cwd().
  readonly cwd?: string;
  readonly fs?: WorkspaceFs;
  readonly requireFn?: RequireFn;
  // The entries of the flat config's `ignores` that hide files from ESLint, handed to `exadev/skill-name-unique` so it does not count a skill ESLint never lints. exadevConfig() passes the ones it derives from the project's `.gitignore`; the standalone `agentSkillsConfig` passes none, so a repository using it excludes build output with a `!` glob in `skillFiles`. Defaults to none.
  readonly ignores?: readonly string[];
}

// Typed against ESLint's own Linter.Config rather than the typescript-eslint FlatConfig type the config arrays use: only the former knows a language plugin's own language options (`frontmatter`) exist, and the result stays assignable because its languageOptions carries an index signature.
type MarkdownLanguageOptions = NonNullable<Linter.Config['languageOptions']>;

function hasSkillBelow(fs: WorkspaceFs, skillsDirectory: string): boolean {
  return listSubdirectoriesThroughLinks(fs, skillsDirectory).some((name) => fs.existsSync(join(skillsDirectory, name, SKILL_FILE_NAME)));
}

/**
 * Whether the directory looks like it holds agent skills or a Claude Code marketplace, the auto-detection signal for the `undefined` case: a `.claude-plugin/marketplace.json`, a `skills/<name>/SKILL.md` at its root, or a `plugins/<plugin>/skills/<name>/SKILL.md`.
 */
export function hasAgentSkillsLayout(fs: WorkspaceFs, cwd: string): boolean {
  return (
    fs.existsSync(join(cwd, CLAUDE_PLUGIN_DIR, MARKETPLACE_FILE_NAME)) ||
    hasSkillBelow(fs, join(cwd, SKILLS_DIR)) ||
    listSubdirectoriesThroughLinks(fs, join(cwd, PLUGINS_DIR)).some((pluginName) => hasSkillBelow(fs, join(cwd, PLUGINS_DIR, pluginName, SKILLS_DIR)))
  );
}

function readOptions(setting: unknown): Required<AgentSkillsOptions> {
  if (!isRecord(setting)) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" must be true, false or an object.`);
  assertOnlyKeys(setting, ['skillFiles', 'marketplaceFiles', 'pluginFiles'], OPTION_NAME);

  return {
    skillFiles: readFileGlobs(setting['skillFiles'] ?? DEFAULT_SKILL_FILES, `${OPTION_NAME}.skillFiles`),
    marketplaceFiles: readFileGlobs(setting['marketplaceFiles'] ?? DEFAULT_MARKETPLACE_FILES, `${OPTION_NAME}.marketplaceFiles`),
    pluginFiles: readFileGlobs(setting['pluginFiles'] ?? DEFAULT_PLUGIN_FILES, `${OPTION_NAME}.pluginFiles`),
  };
}

/**
 * Builds the blocks that lint agent skills and Claude Code plugin manifests: SKILL.md files under `markdown/gfm` with frontmatter parsed as a node of its own, and the two manifest kinds under `json/json`. The setting is tri-state like the other optional features: `false` builds nothing and resolves nothing; `true` or an options object forces the feature on and throws with the install command when `@eslint/markdown` or `@eslint/json` cannot be resolved; `undefined` auto-detects, building only when the working directory holds skills or a marketplace (`hasAgentSkillsLayout`) and then only the blocks whose peer resolves. Options are validated whenever given, even when the feature ends up off. Internal: consumed by create-config.ts as one more `ConfigArrayValue` entry.
 */
export function buildAgentSkillsConfig(setting: boolean | AgentSkillsOptions | undefined, environment: AgentSkillsEnvironment = {}): ConfigArrayValue {
  const { cwd = process.cwd(), fs = realWorkspaceFs, requireFn, ignores = [] } = environment;
  const { skillFiles, marketplaceFiles, pluginFiles } = readOptions(typeof setting === 'boolean' || setting === undefined ? {} : setting);
  const skillScope = scopeOfValidated(skillFiles);
  const marketplaceScope = scopeOfValidated(marketplaceFiles);
  const pluginScope = scopeOfValidated(pluginFiles);
  if (setting === false) return [];
  const forced = setting !== undefined;
  if (!forced && !hasAgentSkillsLayout(fs, cwd)) return [];

  const markdownPlugin = forced ? requireMarkdownPlugin(FEATURE, requireFn) : tryResolveMarkdownPlugin(requireFn);
  const jsonPlugin = forced ? requireJsonPlugin(FEATURE, requireFn) : tryResolveJsonPlugin(requireFn);
  const languageOptions: MarkdownLanguageOptions = { frontmatter: 'yaml' };

  return [
    ...(markdownPlugin === undefined
      ? []
      : [
          {
            ...skillScope,
            language: 'markdown/gfm',
            languageOptions,
            plugins: { exadev: plugin, markdown: markdownPlugin },
            rules: { 'exadev/skill-frontmatter': 'error', 'exadev/skill-name-unique': ['error', { files: skillFiles, ...(ignores.length > 0 && { ignores }) }] },
          } satisfies ConfigArrayValue[number],
        ]),
    ...(jsonPlugin === undefined
      ? []
      : [
          buildJsonLanguageBlock({ jsonPlugin, language: 'json/json', ...marketplaceScope, rules: { 'exadev/marketplace-manifest': 'error' } }),
          buildJsonLanguageBlock({ jsonPlugin, language: 'json/json', ...pluginScope, rules: { 'exadev/plugin-manifest': 'error' } }),
        ]),
  ];
}

/**
 * Lints agent SKILL.md files and Claude Code plugin manifests, returning ESLint core's own `Config[]` so the result spreads directly into `defineConfig(...)`. Always on: it throws at call time for a malformed option or when `@eslint/markdown` or `@eslint/json` is not installed. See the README's "Agent skills and plugin marketplaces" section.
 */
export function agentSkillsConfig(options: AgentSkillsOptions = {}): PublicConfigArray {
  return toPublicConfigArray(buildAgentSkillsConfig(options));
}
