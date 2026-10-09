import type { Linter } from 'eslint';
import type { ConfigArrayValue, PublicConfigArray } from './config-types';
import { scopeBlock } from './config-globs';
import { isRecord } from './is-record';
import { requireMarkdownPlugin } from './markdown-plugin';
import plugin from './plugin';
import { assertOnlyKeys } from './rules/file-entry';
import { MAX_HEADING_DEPTH, MIN_HEADING_DEPTH, type RequiredHeading } from './rules/markdown-required-heading';
import { toPublicConfigArray } from './to-public-config-array';

const OPTION_NAME = 'markdownHeadings';
const FRONTMATTER_FORMATS = ['yaml', 'toml', 'json'] as const;

/**
 * The frontmatter formats `@eslint/markdown` can parse into a node of their own.
 */
export type MarkdownFrontmatter = (typeof FRONTMATTER_FORMATS)[number];

/**
 * The `markdownHeadings` option of `exadevConfig`, and the argument of `markdownHeadingsConfig`.
 */
export interface MarkdownHeadingsOptions {
  // Globs, relative to ESLint's working directory, of the Markdown files that must contain the headings, as minimatch globs. A leading `!` excludes. Linting `*.md` at all is a repository-wide decision (`.gitignore`-derived ignores and other `ignores` entries may hide those files), so nothing here widens what ESLint lints.
  readonly files: readonly string[];
  // The headings each of these files must contain.
  readonly headings: readonly RequiredHeading[];
  // The frontmatter format parsed into a node of its own, so a frontmatter block is never read as a thematic break followed by a Setext heading. Defaults to `yaml`.
  readonly frontmatter?: MarkdownFrontmatter;
}

function isFrontmatter(value: unknown): value is MarkdownFrontmatter {
  return FRONTMATTER_FORMATS.some((format) => format === value);
}

function readHeadings(value: unknown): readonly RequiredHeading[] {
  const prefix = `@exadev/eslint-config: "${OPTION_NAME}.headings"`;
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${prefix} must be a non-empty array of { depth, text } objects.`);

  return value.map((entry): RequiredHeading => {
    if (!isRecord(entry)) throw new Error(`${prefix} must be a non-empty array of { depth, text } objects.`);
    assertOnlyKeys(entry, ['depth', 'text'], `${OPTION_NAME}.headings`);
    const { depth, text } = entry;
    if (typeof depth !== 'number' || !Number.isInteger(depth) || depth < MIN_HEADING_DEPTH || depth > MAX_HEADING_DEPTH) {
      throw new Error(`${prefix} needs "depth" to be an integer from ${String(MIN_HEADING_DEPTH)} to ${String(MAX_HEADING_DEPTH)}.`);
    }
    if (typeof text !== 'string' || text.trim().length === 0) throw new Error(`${prefix} needs "text" to be a non-blank string.`);

    return { depth, text };
  });
}

// Typed against ESLint's own Linter.Config rather than the typescript-eslint FlatConfig type the config arrays use: only the former knows a language plugin's own language options (`frontmatter`) exist, and the result stays assignable because its languageOptions carries an index signature.
type MarkdownLanguageOptions = NonNullable<Linter.Config['languageOptions']>;

/**
 * Builds the block around a `@eslint/markdown` plugin object supplied by `loadPlugin`, after the options have been validated, so an option error is reported before a missing package. Exported so tests can supply a plugin without touching module resolution; the public options have no such seam.
 */
export function assembleMarkdownHeadingsConfig(options: MarkdownHeadingsOptions, loadPlugin: () => Record<string, unknown>): ConfigArrayValue {
  if (!isRecord(options)) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" must be an object.`);
  assertOnlyKeys(options, ['files', 'headings', 'frontmatter'], OPTION_NAME);
  const scope = scopeBlock(options.files, `${OPTION_NAME}.files`);
  const headings = readHeadings(options.headings);
  const frontmatter = options.frontmatter ?? 'yaml';
  if (!isFrontmatter(frontmatter)) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}.frontmatter" must be one of ${FRONTMATTER_FORMATS.join(', ')}.`);
  const languageOptions: MarkdownLanguageOptions = { frontmatter };

  return [
    {
      ...scope,
      language: 'markdown/gfm',
      languageOptions,
      plugins: { exadev: plugin, markdown: loadPlugin() },
      rules: { 'exadev/markdown-required-heading': ['error', headings] },
    },
  ];
}

/**
 * Wires `exadev/markdown-required-heading` onto the Markdown files `files` selects, under `markdown/gfm` with frontmatter parsed as its own node. The preset is opt-in and always requests `@eslint/markdown`, so it throws with the install command when the package cannot be resolved. Internal: consumed by create-config.ts as one more `ConfigArrayValue` entry.
 */
export function buildMarkdownHeadingsConfig(options: MarkdownHeadingsOptions): ConfigArrayValue {
  return assembleMarkdownHeadingsConfig(options, () => requireMarkdownPlugin('Required Markdown headings'));
}

/**
 * Requires the Markdown files `files` selects to contain each heading, returning ESLint core's own `Config[]` so the result spreads directly into `defineConfig(...)`. Throws at call time for a malformed option or when `@eslint/markdown` is not installed. See the README's "Required Markdown headings" section.
 */
export function markdownHeadingsConfig(options: MarkdownHeadingsOptions): PublicConfigArray {
  return toPublicConfigArray(buildMarkdownHeadingsConfig(options));
}
