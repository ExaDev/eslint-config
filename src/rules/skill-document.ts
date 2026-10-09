import { parseDocument } from 'yaml';
import { isRecord } from '../is-record';
import { assertIsError } from './workspace-errors';

/**
 * The file name the Agent Skills specification gives a skill's entry point (https://agentskills.io/specification).
 */
export const SKILL_FILE_NAME = 'SKILL.md';

/**
 * The outcome of reading a frontmatter block as YAML: a syntax error with its message, a mapping (the only shape that can hold `name` and `description`), or some other valid YAML value (a scalar, a sequence or an empty document).
 */
export type ParsedFrontmatter =
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'mapping'; readonly value: Readonly<Record<string, unknown>> }
  | { readonly kind: 'other' };

// An opening `---` line, then the body (each of its lines ending in a line break, so it is empty for an empty block) up to a closing `---` line. The closing delimiter must start its own line, so a body line merely ending in `---` does not close it.
const FRONTMATTER_BLOCK = /^---[ \t]*\r?\n((?:[\s\S]*?\r?\n)?)---[ \t]*(?:\r?\n|$)/u;

/**
 * The text between the delimiters of the YAML frontmatter block a document starts with, or `undefined` when it does not start with one. Used for files read straight from disk; a document ESLint lints already has its frontmatter as a node of its own.
 */
export function extractFrontmatter(text: string): string | undefined {
  return FRONTMATTER_BLOCK.exec(text.replace(/^\uFEFF/u, ''))?.[1];
}

/**
 * Parses frontmatter text as YAML without throwing, reporting a syntax error, or an alias that cannot be resolved, as a value so a rule can attach it to the block.
 */
export function parseFrontmatter(yamlText: string): ParsedFrontmatter {
  const document = parseDocument(yamlText);
  const [firstError] = document.errors;
  if (firstError !== undefined) return { kind: 'invalid', message: firstError.message };
  // Not in `document.errors`: converting throws for an alias with no anchor (a value such as `*Required*` is one) and for an alias explosion, and both are invalid frontmatter like any other syntax error.
  try {
    const value: unknown = document.toJS();

    return isRecord(value) ? { kind: 'mapping', value } : { kind: 'other' };
  } catch (error) {
    assertIsError(error, 'converting a parsed YAML document');

    return { kind: 'invalid', message: error.message };
  }
}

/**
 * The `name` a SKILL.md's frontmatter declares, or `undefined` when the document has no frontmatter, the frontmatter is not a valid mapping, or `name` is not a string with text in it. The name is returned trimmed of surrounding whitespace and otherwise exactly as written, the way the skills CLI compares names. A file that cannot name itself is reported by `skill-frontmatter`, so cross-file checks simply do not count it.
 */
export function readSkillName(text: string): string | undefined {
  const yamlText = extractFrontmatter(text);
  if (yamlText === undefined) return undefined;
  const parsed = parseFrontmatter(yamlText);
  if (parsed.kind !== 'mapping') return undefined;
  const { name } = parsed.value;

  const trimmed = typeof name === 'string' ? name.trim() : '';

  return trimmed.length > 0 ? trimmed : undefined;
}
