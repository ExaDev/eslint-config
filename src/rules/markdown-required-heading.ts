import type { MarkdownRuleDefinition } from '@eslint/markdown';

/**
 * One heading a document must contain: its level (1 for `#`, through 6 for `######`) and its text as it renders.
 */
export interface RequiredHeading {
  readonly depth: number;
  readonly text: string;
}

/**
 * The heading levels Markdown has: `#` is 1 and `######` is 6.
 */
export const MIN_HEADING_DEPTH = 1;
export const MAX_HEADING_DEPTH = 6;

export type MarkdownRequiredHeadingMessageIds = 'missingHeading';

export type MarkdownRequiredHeadingRuleDefinition = MarkdownRuleDefinition<{
  RuleOptions: [readonly RequiredHeading[]];
  MessageIds: MarkdownRequiredHeadingMessageIds;
}>;

/**
 * The part of an mdast phrasing node this rule reads. Structural rather than the `mdast` types, so the rule needs no dependency on them and a test can pass a plain object.
 */
export interface InlineNode {
  readonly type: string;
  readonly value?: string | undefined;
  readonly alt?: string | null | undefined;
  readonly children?: readonly InlineNode[] | undefined;
}

/**
 * The text of an inline node as a reader sees it rendered: the concatenated text of its children for a container (emphasis, strong, a link, a deletion), the source of an inline code span, the alternative text of an image, a space for a hard break, and nothing for raw inline HTML or a footnote reference. Reading only text nodes would drop the code span of a heading written as Using, a space, then `fetch` in backticks, which is an `inlineCode` node.
 */
export function flattenInlineText(node: InlineNode): string {
  if (node.children !== undefined) return node.children.map(flattenInlineText).join('');
  if (node.type === 'break') return ' ';
  if (node.type === 'html') return '';
  if (node.type === 'image' || node.type === 'imageReference') return node.alt ?? '';

  return node.value ?? '';
}

/**
 * Trims the text and collapses each run of whitespace to one space, the way a renderer shows a heading. A Setext heading spanning two lines, or a heading with a hard break, then still equals the single-line text it is written as.
 */
export function normaliseHeadingText(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

function keyOf(depth: number, text: string): string {
  return `${String(depth)}:${normaliseHeadingText(text)}`;
}


/**
 * Requires a Markdown document to contain each configured heading: a heading of the given depth whose flattened text equals the given text once trimmed and with whitespace runs collapsed. The check is at document level, so one report per missing heading is made at the top of the file, after the whole document is read. A frontmatter block is a node of its own only when the language is configured with `frontmatter` (`yaml`, `toml` or `json`); without it, a leading `---` block is read as a thematic break followed by a Setext heading whose text is the first frontmatter line, so `markdownRequiredHeadingConfig` sets it. The files the rule applies to are the `files` of the block that enables it.
 */
export const markdownRequiredHeading: MarkdownRequiredHeadingRuleDefinition = {
  meta: {
    type: 'problem',
    languages: ['markdown/commonmark', 'markdown/gfm'],
    docs: {
      recommended: false,
      description: 'Require a Markdown document to contain each configured heading.',
      url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/markdown-required-heading.ts',
    },
    schema: [
      {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            depth: { type: 'integer', minimum: MIN_HEADING_DEPTH, maximum: MAX_HEADING_DEPTH },
            text: { type: 'string', pattern: '\\S' },
          },
          required: ['depth', 'text'],
          additionalProperties: false,
        },
        uniqueItems: true,
      },
    ],
    defaultOptions: [[]],
    messages: {
      missingHeading: 'This document must contain a level {{ depth }} heading "{{ text }}".',
    },
  },
  create(context) {
    const [required] = context.options;
    const found = new Set<string>();

    return {
      heading(node) {
        found.add(keyOf(node.depth, flattenInlineText(node)));
      },
      'root:exit'() {
        for (const { depth, text } of required) {
          if (found.has(keyOf(depth, text))) continue;
          context.report({ loc: { line: 1, column: 1 }, messageId: 'missingHeading', data: { depth: String(depth), text: normaliseHeadingText(text) } });
        }
      },
    };
  },
};

export default markdownRequiredHeading;
