import stylistic from '@stylistic/eslint-plugin';
import { Linter, RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import type { Rule } from 'eslint';
import multilineCommentStyle, { withoutTrailingWhitespace } from './multiline-comment-style';

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } });
const upstreamRule = stylistic.rules['multiline-comment-style'];

// Each directive-shaped line `exadev/prefer-doc-comment` recognises and the upstream rule does not, in the spelling a real comment carries after its `//`.
const WRAPPER_DIRECTIVES = ['TODO: revisit', 'FIXME later', 'todo: lower-case marker', 'fixme(scope): message', 'cspell:disable-next-line', 'biome-ignore lint/style: reason', '#region helpers', '#endregion', 'content:claude:start', 'content:claude:end'];

describe('multiline-comment-style meta', () => {
  it('is the upstream rule object itself apart from create, so schema, defaults, messages and fixability cannot drift from upstream', () => {
    expect(multilineCommentStyle.meta).toBe(upstreamRule.meta);
    expect(Object.keys(multilineCommentStyle)).toEqual(Object.keys(upstreamRule));
  });
});

// A fixer whose every method returns the arguments it was called with, so a test reads exactly what text reached it.
const recordingFixer = {
  insertTextAfter: (node: unknown, text: string) => ({ method: 'insertTextAfter', node, text }),
  insertTextAfterRange: (range: unknown, text: string) => ({ method: 'insertTextAfterRange', range, text }),
  insertTextBefore: (node: unknown, text: string) => ({ method: 'insertTextBefore', node, text }),
  insertTextBeforeRange: (range: unknown, text: string) => ({ method: 'insertTextBeforeRange', range, text }),
  replaceText: (node: unknown, text: string) => ({ method: 'replaceText', node, text }),
  replaceTextRange: (range: unknown, text: string) => ({ method: 'replaceTextRange', range, text }),
  remove: (node: unknown) => ({ method: 'remove', node }),
  removeRange: (range: unknown) => ({ method: 'removeRange', range }),
};
const asFixer = (value: typeof recordingFixer): Rule.RuleFixer => value as unknown as Rule.RuleFixer;

describe('withoutTrailingWhitespace', () => {
  it('returns a missing fix unchanged', () => {
    expect(withoutTrailingWhitespace(undefined)).toBeUndefined();
    expect(withoutTrailingWhitespace(null)).toBeNull();
  });

  it('passes a null result from the wrapped fix straight through', () => {
    expect(withoutTrailingWhitespace(() => null)?.(asFixer(recordingFixer))).toBeNull();
  });

  it.each(['insertTextAfter', 'insertTextAfterRange', 'insertTextBefore', 'insertTextBeforeRange', 'replaceText', 'replaceTextRange'] as const)(
    '%s writes its text with trailing spaces and tabs stripped from every line, leaving the rest alone',
    (method) => {
      const fix = withoutTrailingWhitespace((fixer) => fixer[method]([0, 1] as never, ' a \t\n \n b  \n c d') as never);
      expect(fix?.(asFixer(recordingFixer))).toEqual({ method, [method.endsWith('Range') ? 'range' : 'node']: [0, 1], text: ' a\n\n b\n c d' });
    },
  );

  it.each(['remove', 'removeRange'] as const)('%s, which writes no text, still reaches the real fixer', (method) => {
    const fix = withoutTrailingWhitespace((fixer) => fixer[method]([0, 1] as never) as never);
    expect(fix?.(asFixer(recordingFixer))).toEqual({ method, [method.endsWith('Range') ? 'range' : 'node']: [0, 1] });
  });
});

describe('multiline-comment-style', () => {
  ruleTester.run('multiline-comment-style', multilineCommentStyle, {
    valid: [
      ...WRAPPER_DIRECTIVES.map((directive) => ({ code: `// Prose line.\n// ${directive}\n// Detail line.\nconst x = 1;\n`, options: ['bare-block'] })),
      ...WRAPPER_DIRECTIVES.map((directive) => ({ code: `// Prose line.\n// ${directive}\n// Detail line.\nconst x = 1;\n`, options: ['starred-block'] })),
      // Upstream's own directives still break a run, through upstream's own filter.
      { code: '// Prose line.\n// prettier-ignore\n// Detail line.\nconst x = 1;\n', options: ['bare-block'] },
      { code: '// Prose line.\n// @ts-expect-error deliberate\n// Detail line.\nconst x = 1;\n', options: ['bare-block'] },
      // A `Todo` opening ordinary prose is not a marker, but a single line is never reported either way.
      { code: '// One line only.\nconst x = 1;\n', options: ['bare-block'] },
      // `separate-lines` leaves `//` runs alone, marker or not.
      { code: '// first line\n// TODO: revisit\nconst x = 1;\n', options: ['separate-lines'] },
    ],
    invalid: [
      {
        name: 'a blank line inside a rewritten starred block carries no trailing whitespace',
        code: '// a\n//\n// b\nconst x = 1;\n',
        options: ['starred-block'],
        output: '/*\n * a\n *\n * b\n */\nconst x = 1;\n',
        errors: [{ messageId: 'expectedBlock' }],
      },
      {
        name: 'a blank line inside a rewritten bare block carries no trailing whitespace',
        code: '// a\n//\n// b\nconst x = 1;\n',
        options: ['bare-block'],
        output: '/* a\n\n   b */\nconst x = 1;\n',
        errors: [{ messageId: 'expectedBlock' }],
      },
      {
        name: 'a blank line and trailing text padding in a block rewritten to separate lines carry no trailing whitespace',
        code: '/* a\n\n   b */\nconst x = 1;\n',
        options: ['separate-lines'],
        output: '// a\n//\n// b\nconst x = 1;\n',
        errors: [{ messageId: 'expectedLines' }],
      },
      {
        name: 'a content marker is never merged into the prose on either side of it',
        code: '// Before one.\n// Before two.\n// content:claude:start\n// After one.\n// After two.\nconst x = 1;\n',
        options: ['bare-block'],
        output: '/* Before one.\n   Before two. */\n// content:claude:start\n/* After one.\n   After two. */\nconst x = 1;\n',
        errors: [{ messageId: 'expectedBlock', line: 1 }, { messageId: 'expectedBlock', line: 4 }],
      },
      {
        code: '// first line\n// second line\nconst x = 1;\n',
        options: ['bare-block'],
        output: '/* first line\n   second line */\nconst x = 1;\n',
        errors: [{ messageId: 'expectedBlock' }],
      },
      {
        name: 'converts the prose on both sides of a TODO, each as its own run, and leaves the marker as a // line',
        code: '// Before one.\n// Before two.\n// TODO: revisit\n// After one.\n// After two.\nconst x = 1;\n',
        options: ['bare-block'],
        output: '/* Before one.\n   Before two. */\n// TODO: revisit\n/* After one.\n   After two. */\nconst x = 1;\n',
        errors: [{ messageId: 'expectedBlock', line: 1 }, { messageId: 'expectedBlock', line: 4 }],
      },
      {
        name: 'starred-block, the upstream default, passes through and splits at a FIXME the same way',
        code: '// Before one.\n// Before two.\n// FIXME later\n// After one.\n// After two.\nconst x = 1;\n',
        options: ['starred-block'],
        output: '/*\n * Before one.\n * Before two.\n */\n// FIXME later\n/*\n * After one.\n * After two.\n */\nconst x = 1;\n',
        errors: [{ messageId: 'expectedBlock', line: 1 }, { messageId: 'expectedBlock', line: 4 }],
      },
      {
        name: 'no options falls back to the upstream default, starred-block',
        code: '// first line\n// second line\nconst x = 1;\n',
        output: '/*\n * first line\n * second line\n */\nconst x = 1;\n',
        errors: [{ messageId: 'expectedBlock' }],
      },
      {
        name: 'separate-lines passes through with its options object',
        code: '/* first line\n   second line */\nconst x = 1;\n',
        options: ['separate-lines', { checkJSDoc: false }],
        // Upstream keeps the space that sat before the closing delimiter as trailing whitespace; the wrapper strips it.
        output: '// first line\n// second line\nconst x = 1;\n',
        errors: [{ messageId: 'expectedLines' }],
      },
      {
        name: 'bare-block still rewrites a starred block comment, a check that never consults the comment grouping',
        code: '/*\n * first line\n * second line\n */\nconst x = 1;\n',
        options: ['bare-block'],
        output: '/* first line\n   second line */\nconst x = 1;\n',
        errors: [{ messageId: 'expectedBareBlock' }],
      },
    ],
  });
});

describe('multiline-comment-style options validation', () => {
  it('rejects an option the upstream schema rejects, since the schema is upstream\'s own', () => {
    const linter = new Linter();
    const config: Linter.Config[] = [{ plugins: { probe: { rules: { 'multiline-comment-style': multilineCommentStyle } } }, rules: { 'probe/multiline-comment-style': ['error', 'no-such-style'] } }];
    expect(() => linter.verify('const x = 1;\n', config)).toThrow(/"probe\/multiline-comment-style":\s+Value "no-such-style" should be equal to one of the allowed values/u);
  });
});
