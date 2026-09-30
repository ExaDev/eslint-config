import { basename, dirname, extname, resolve } from 'node:path';
import { ESLintUtils, type TSESLint } from '@typescript-eslint/utils';
import { assertOnlyKeys, createEntryScope, entryFilesSchema, readEntryFiles, readEntryRecords, readRequiredStrings } from './file-entry';
import { realWorkspaceFs, type WorkspaceFs } from './workspace-fs';

const OPTION_NAME = 'exadev/filename-pattern';

type FilenamePatternMessageId = 'nameMismatch' | 'oversizedNameMismatch' | 'missingSibling';

/**
 * The placeholder in a `sibling` template that stands for the linted file's name without its final extension (`Button` for `Button.tsx`).
 */
export const SIBLING_NAME_PLACEHOLDER = '{name}';

/**
 * One entry of the rule's option list. Files matching `files` (and, with `overLines`, longer than that many lines) must have a name matching `pattern`, and must have one of the `sibling` files beside them. At least one of `pattern` and `sibling` is required.
 */
export interface FilenamePatternEntry {
  readonly files: string | readonly string[];
  // A regular expression source the whole file name (final path segment, extension included) must match.
  readonly pattern?: string;
  // Paths relative to the linted file's directory, `{name}` standing for its name without the final extension; at least one of them must exist.
  readonly sibling?: string | readonly string[];
  // Only files with more lines than this are subject to the entry.
  readonly overLines?: number;
}

export interface ReadEntry {
  readonly inScope: ReturnType<typeof createEntryScope>;
  readonly pattern: { readonly source: string; readonly regexp: RegExp } | undefined;
  readonly siblings: readonly string[];
  readonly overLines: number | undefined;
}

function readPattern(value: unknown): ReadEntry['pattern'] {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" needs "pattern" to be a non-empty regular expression source.`);

  // The source must compile on its own: wrapped in the anchoring group, an unbalanced `z)|(q` would still compile and silently stop being anchored.
  try {
    new RegExp(value, 'u');
  } catch (error) {
    throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" needs "pattern" to be a valid regular expression, but "${value}" is not: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }

  return { source: value, regexp: new RegExp(`^(?:${value})$`, 'u') };
}

// Only `{name}` is a placeholder, so any other brace group is a misspelling that would otherwise look for a file literally called `{nam}.css`.
const UNKNOWN_PLACEHOLDER = /\{(?!name\})[^{}]*\}/u;

function readSiblings(value: unknown): readonly string[] {
  if (value === undefined) return [];
  const siblings = readRequiredStrings({ sibling: typeof value === 'string' ? [value] : value }, 'sibling', OPTION_NAME);
  const unknown = siblings.find((template) => UNKNOWN_PLACEHOLDER.test(template));
  if (unknown !== undefined) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" has a "sibling" template "${unknown}" with a placeholder other than ${SIBLING_NAME_PLACEHOLDER}.`);

  return siblings;
}

function readOverLines(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" needs "overLines" to be a non-negative integer.`);

  return value;
}

/**
 * Validates the rule's option list, compiling each entry. Throws naming the offending field, including a `pattern` that is not a valid regular expression.
 */
export function readFilenamePatternEntries(value: unknown): readonly ReadEntry[] {
  return readEntryRecords(value, OPTION_NAME).map((entry) => {
    assertOnlyKeys(entry, ['files', 'pattern', 'sibling', 'overLines'], OPTION_NAME);
    const pattern = readPattern(entry['pattern']);
    const siblings = readSiblings(entry['sibling']);
    if (pattern === undefined && siblings.length === 0) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" needs every entry to have a "pattern" or a "sibling".`);

    return { inScope: createEntryScope(readEntryFiles(entry['files'], `${OPTION_NAME}.files`)), pattern, siblings, overLines: readOverLines(entry['overLines']) };
  });
}

function stem(name: string): string {
  const extension = extname(name);

  return extension.length === 0 ? name : name.slice(0, -extension.length);
}

// The final newline of a file ends its last line rather than starting an empty one, so it is not counted as a line of its own.
function countLines(lines: readonly string[]): number {
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

/**
 * Builds the rule around an injectable filesystem, so a test drives the sibling check from an in-memory tree.
 */
export function createFilenamePatternRule(fs: WorkspaceFs = realWorkspaceFs): TSESLint.RuleModule<FilenamePatternMessageId, [unknown]> {
  const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

  return createRule<[unknown], FilenamePatternMessageId>({
    name: 'filename-pattern',
    meta: {
      type: 'problem',
      docs: {
        description: 'Require the names of files matching a glob to match a pattern, to sit beside a sibling file, or, once over a line count, to follow a split naming scheme.',
      },
      schema: [
        {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              files: entryFilesSchema,
              pattern: { type: 'string', minLength: 1 },
              sibling: entryFilesSchema,
              overLines: { type: 'integer', minimum: 0 },
            },
            required: ['files'],
            additionalProperties: false,
          },
        },
      ],
      messages: {
        nameMismatch: 'The file name "{{ name }}" must match /{{ pattern }}/.',
        oversizedNameMismatch: 'This file has {{ lines }} lines, more than {{ limit }}. Split it, and name each part so that it matches /{{ pattern }}/; "{{ name }}" does not.',
        missingSibling: 'The file "{{ name }}" needs a sibling file beside it: {{ siblings }}.',
      },
    },
    defaultOptions: [[]],
    create(context, [options]) {
      const entries = readFilenamePatternEntries(options).filter((entry) => entry.inScope(context.filename, context.cwd));
      if (entries.length === 0) return {};
      const name = basename(context.filename);

      return {
        Program(node) {
          const lines = countLines(context.sourceCode.lines);
          for (const entry of entries) {
            if (entry.overLines !== undefined && lines <= entry.overLines) continue;
            if (entry.pattern !== undefined && !entry.pattern.regexp.test(name)) {
              if (entry.overLines === undefined) context.report({ node, messageId: 'nameMismatch', data: { name, pattern: entry.pattern.source } });
              else context.report({ node, messageId: 'oversizedNameMismatch', data: { name, pattern: entry.pattern.source, lines: String(lines), limit: String(entry.overLines) } });
            }
            if (entry.siblings.length === 0) continue;
            const expected = entry.siblings.map((template) => template.replaceAll(SIBLING_NAME_PLACEHOLDER, stem(name)));
            if (!expected.some((sibling) => fs.existsSync(resolve(dirname(context.filename), sibling)))) {
              context.report({ node, messageId: 'missingSibling', data: { name, siblings: expected.join(' or ') } });
            }
          }
        },
      };
    },
  });
}

export default createFilenamePatternRule();
