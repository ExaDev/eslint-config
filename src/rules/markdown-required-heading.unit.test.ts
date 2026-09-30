import markdown from '@eslint/markdown';
import { Linter, RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import rule, { flattenInlineText, normaliseHeadingText } from './markdown-required-heading';

describe('rule metadata', () => {
  it('carries the docs url and the languages it runs under', () => {
    expect(rule.meta?.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/markdown-required-heading.ts');
    expect(rule.meta?.languages).toStrictEqual(['markdown/commonmark', 'markdown/gfm']);
  });
});

describe('flattenInlineText', () => {
  it('reads the value of a text node', () => {
    expect(flattenInlineText({ type: 'text', value: 'Usage' })).toBe('Usage');
  });

  it('reads the source of an inline code span', () => {
    expect(flattenInlineText({ type: 'inlineCode', value: 'fetch' })).toBe('fetch');
  });

  it('concatenates the children of a container, however deeply nested', () => {
    const emphasis = { type: 'emphasis', children: [{ type: 'text', value: 'very ' }, { type: 'strong', children: [{ type: 'text', value: 'nested' }] }] };
    expect(flattenInlineText({ type: 'heading', children: [{ type: 'text', value: 'A ' }, emphasis] })).toBe('A very nested');
  });

  it('reads the alternative text of an image and of an image reference', () => {
    expect(flattenInlineText({ type: 'image', alt: 'logo' })).toBe('logo');
    expect(flattenInlineText({ type: 'imageReference', alt: 'logo' })).toBe('logo');
  });

  it('reads an image without alternative text as empty', () => {
    expect(flattenInlineText({ type: 'image', alt: null })).toBe('');
  });

  it('reads a hard break as a space', () => {
    expect(flattenInlineText({ type: 'break' })).toBe(' ');
  });

  it('reads raw inline html as empty', () => {
    expect(flattenInlineText({ type: 'html', value: '<b>' })).toBe('');
  });

  it('reads a node with neither children nor a value, such as a footnote reference, as empty', () => {
    expect(flattenInlineText({ type: 'footnoteReference' })).toBe('');
  });
});

describe('normaliseHeadingText', () => {
  it('trims and collapses whitespace runs, including line breaks', () => {
    expect(normaliseHeadingText('  Getting \n  started\t')).toBe('Getting started');
  });
});

const ruleTester = new RuleTester({ plugins: { markdown, exadev: { rules: { 'markdown-required-heading': rule } } }, language: 'markdown/gfm', languageOptions: { frontmatter: 'yaml' } });

const usage = [{ depth: 2, text: 'Usage' }];

ruleTester.run('markdown-required-heading', rule, {
  valid: [
    { code: '## Usage\n', options: [usage] },
    { code: '###### Deep\n', options: [[{ depth: 6, text: 'Deep' }]] },
    // No headings required: nothing to check.
    { code: 'no headings at all\n', options: [[]] },
    // Whitespace around and inside the heading text is not part of it.
    { code: '##   Usage   \n', options: [usage] },
    { code: '## Getting   started\n', options: [[{ depth: 2, text: ' Getting started ' }]] },
    // A closed ATX heading and a Setext heading are headings too.
    { code: '## Usage ##\n', options: [usage] },
    { code: 'Usage\n-----\n', options: [usage] },
    // Emphasis, strong, links and code spans contribute their text.
    { code: '## *Us*age\n', options: [usage] },
    { code: '## **Usage**\n', options: [usage] },
    { code: '## [Usage](https://example.com)\n', options: [usage] },
    { code: '## `Usage`\n', options: [usage] },
    { code: '## Using `fetch`\n', options: [[{ depth: 2, text: 'Using fetch' }]] },
    // A hard break inside a Setext heading renders as a space.
    { code: 'Getting  \nstarted\n---\n', options: [[{ depth: 2, text: 'Getting started' }]] },
    // Raw inline html is not text.
    { code: '## <span>Usage</span>\n', options: [usage] },
    // A heading anywhere in the document counts, including inside a blockquote or a list.
    { code: '> ## Usage\n', options: [usage] },
    { code: '- ## Usage\n', options: [usage] },
    // Every required heading present, in any order.
    { code: '## Install\n\n# Title\n\n## Usage\n', options: [[{ depth: 1, text: 'Title' }, ...usage, { depth: 2, text: 'Install' }]] },
    // Frontmatter is a node of its own, so the heading after it is found.
    { code: '---\ntitle: Example\n---\n\n## Usage\n', options: [usage] },
    // A heading in frontmatter-shaped text that is not frontmatter still counts.
    { code: 'text\n\n---\n\n## Usage\n', options: [usage] },
  ],
  invalid: [
    {
      code: 'nothing here\n',
      options: [usage],
      errors: [{ messageId: 'missingHeading', data: { depth: '2', text: 'Usage' }, line: 1, column: 1 }],
    },
    // The depth must match.
    { code: '### Usage\n', options: [usage], errors: [{ messageId: 'missingHeading' }] },
    { code: '# Usage\n', options: [usage], errors: [{ messageId: 'missingHeading' }] },
    { code: '###### Deep\n', options: [[{ depth: 5, text: 'Deep' }]], errors: [{ messageId: 'missingHeading' }] },
    // The text must match exactly, case included.
    { code: '## usage\n', options: [usage], errors: [{ messageId: 'missingHeading' }] },
    { code: '## Usage notes\n', options: [usage], errors: [{ messageId: 'missingHeading' }] },
    // Text that only appears in a paragraph or a code block is not a heading.
    { code: 'Usage\n\n```\n## Usage\n```\n', options: [usage], errors: [{ messageId: 'missingHeading' }] },
    // Frontmatter naming the heading is not a heading.
    { code: '---\ntitle: Usage\n---\n\ntext\n', options: [usage], errors: [{ messageId: 'missingHeading' }] },
    // One report per missing heading, in option order.
    {
      code: '## Usage\n',
      options: [[{ depth: 1, text: 'Title' }, ...usage, { depth: 2, text: 'Install' }]],
      errors: [
        { messageId: 'missingHeading', data: { depth: '1', text: 'Title' } },
        { messageId: 'missingHeading', data: { depth: '2', text: 'Install' } },
      ],
    },
    // An empty document is missing every heading.
    { code: '', options: [usage], errors: [{ messageId: 'missingHeading' }] },
  ],
});

describe('frontmatter handling', () => {
  const entry: Linter.RuleEntry = ['error', usage];
  const config = (languageOptions: Record<string, unknown>): Linter.Config[] => [
    { files: ['**/*.md'], plugins: { markdown, exadev: { rules: { 'markdown-required-heading': rule } } }, language: 'markdown/gfm', languageOptions, rules: { 'exadev/markdown-required-heading': entry } },
  ];
  // The block's first line, read as a Setext heading when the frontmatter is not parsed.
  const document = '---\nUsage\n---\n\ntext\n';

  it('reports the missing heading when the frontmatter is its own node', () => {
    expect(new Linter().verify(document, config({ frontmatter: 'yaml' }), 'a.md').map((message) => message.messageId)).toStrictEqual(['missingHeading']);
  });

  it('is satisfied by the frontmatter text when it is not parsed, which is why the preset parses it', () => {
    expect(new Linter().verify(document, config({}), 'a.md')).toStrictEqual([]);
  });
});

describe('option schema', () => {
  const lint = (options: unknown): void => {
    const entry: Linter.RuleEntry = ['error', options];
    new Linter().verify('## Usage\n', [{ files: ['**/*.md'], plugins: { markdown, exadev: { rules: { 'markdown-required-heading': rule } } }, language: 'markdown/gfm', rules: { 'exadev/markdown-required-heading': entry } }], 'a.md');
  };

  it.each([
    ['a depth above 6', [{ depth: 7, text: 'Usage' }]],
    ['a depth below 1', [{ depth: 0, text: 'Usage' }]],
    ['a non-integer depth', [{ depth: 1.5, text: 'Usage' }]],
    ['blank text', [{ depth: 2, text: '   ' }]],
    ['an unknown key', [{ depth: 2, text: 'Usage', level: 2 }]],
    ['a missing text', [{ depth: 2 }]],
    ['a duplicated entry', [{ depth: 2, text: 'Usage' }, { depth: 2, text: 'Usage' }]],
    ['a single object instead of a list', { depth: 2, text: 'Usage' }],
  ])('rejects %s', (_label, options) => {
    expect(() => {
      lint(options);
    }).toThrow();
  });

  it('accepts a well-formed list', () => {
    expect(() => {
      lint(usage);
    }).not.toThrow();
  });
});
