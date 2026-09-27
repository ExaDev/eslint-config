import { Linter } from 'eslint';

import { RuleTester } from '@typescript-eslint/rule-tester';

import tseslint from 'typescript-eslint';

import { describe, expect, it } from 'vitest';

import rule from './prefer-doc-comment';

describe('rule metadata', () => {
  it('carries the exact docs url, built from this rule\'s own name', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/prefer-doc-comment.ts');
  });

  it('carries the exact docs description', () => {
    expect(rule.meta.docs?.description).toBe(
      'Require a substantial leading comment on an exported declaration to be written as a doc comment (/** ... */) rather than a plain // or /* */ comment, so eslint-plugin-jsdoc/eslint-plugin-tsdoc can actually validate it.',
    );
  });

  it('carries the exact reported message text', () => {
    expect(rule.meta.messages.preferDocComment).toBe("A public symbol's contract belongs in a doc comment (/** ... */), not a plain comment.");
  });

  it('declares the default maxLineLength', () => {
    expect(rule.meta.defaultOptions).toEqual([{ maxLineLength: 80 }]);
  });
});

// The rule's own meta.schema is what actually rejects an unrecognised option key; a plain Linter instance is used rather than ruleTester.run, matching barrel-policy.unit.test.ts's own established reasoning for why a RuleTester `invalid` case's schema rejection cannot be observed with `expect(...).toThrow()` (it surfaces deep inside RuleTester's own deferred `it()` registration, not as a synchronous throw back to the caller), while Linter#verify throws synchronously. A schema-only stand-in rule, not `rule` itself: this rule is built with ESLintUtils.RuleCreator (needed for typed TSESTree access), whose own readonly Options tuple type is not assignable to plain eslint's own mutable-array RuleDefinition shape a plain Linter's Plugin['rules'] expects; the schema array itself carries none of that generic baggage, so re-wrapping just it in a minimal, plain-eslint-shaped rule sidesteps the mismatch entirely while still exercising the identical schema this rule actually ships.
const schemaLinter = new Linter();
const schemaOnlyRule = { meta: { schema: rule.meta.schema }, create: () => ({}) };
const schemaLintConfig = [{ files: ['**'], plugins: { exadev: { rules: { 'prefer-doc-comment': schemaOnlyRule } } } }];

function lintWithOptions(options: unknown): void {
  schemaLinter.verify('export function foo() {}', [...schemaLintConfig, { rules: { 'exadev/prefer-doc-comment': ['error', options] } }], 'src/index.ts');
}

describe('prefer-doc-comment schema', () => {
  it('accepts an options object with just maxLineLength', () => {
    expect(() => {
      lintWithOptions({ maxLineLength: 80 });
    }).not.toThrow();
  });

  it('rejects an unrecognised property alongside maxLineLength at the schema level', () => {
    expect(() => {
      lintWithOptions({ maxLineLength: 80, extra: true });
    }).toThrow(/should NOT have additional properties/);
  });
});

// No type information is needed at lint time (every check matches on TSESTree node/comment shape alone), so parserOptions.project/projectService is deliberately omitted, matching this codebase's own no-object-assign.test.ts/prefer-readonly-array-param.test.ts precedent.
const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

// Mirrors the rule's own declared default (pinned separately by the "declares the default maxLineLength" metadata test above, which fails first if this ever drifts out of sync).
const DEFAULT_MAX_LINE_LENGTH = 80;
const LINE_LENGTH_MARGIN = 10;
// A single logical line comfortably over the rule's own default threshold, used for the "single long line" invalid case.
const LONG_LINE = 'x'.repeat(DEFAULT_MAX_LINE_LENGTH + LINE_LENGTH_MARGIN);

const CUSTOM_MAX_LINE_LENGTH = 20;
// A single logical line under the default threshold (so it is VALID unmodified) but over a configured `maxLineLength: 20` (so the identical text becomes INVALID once that option is set), proving the option genuinely changes the outcome rather than merely being accepted by the schema.
const MEDIUM_LINE = 'y'.repeat(CUSTOM_MAX_LINE_LENGTH + LINE_LENGTH_MARGIN / 2);
// A single logical line of EXACTLY the default threshold's own length: pins the boundary as strictly-greater-than, not greater-than-or-equal (this line stays valid; LONG_LINE, one margin longer, is the invalid boundary already covered above).
const EXACT_THRESHOLD_LINE = 'z'.repeat(DEFAULT_MAX_LINE_LENGTH);

ruleTester.run('prefer-doc-comment', rule, {
  valid: [
    // Not exported at all: a substantial two-line comment on a plain top-level function is never reported, however long or however many lines.
    '// first line\n// second line\nfunction foo() {}',
    // Exported, but the comment is short (well under the default 80-character threshold) and only a single line.
    '// short comment\nexport function foo() {}',
    // Exported, but the leading comment is already a genuine `/**` doc comment: left alone regardless of its own length or line count.
    '/**\n * already documented\n * multi line\n */\nexport function foo() {}',
    // Exported, but the leading comment is directive-shaped (a short TODO marker): exempt regardless of length. (Not tested here with a real `eslint-disable` comment: ESLint's own core directive handling would independently flag it as an unused disable directive in this minimal RuleTester setup, a false failure unrelated to this rule; isDirectiveComment's own internal unit test exercises every recognised marker, including the eslint-disable family, directly and in isolation.)
    '// TODO: revisit\nexport function foo() {}',
    // Exported, directive-shaped (FIXME), and deliberately far longer than the default threshold: still exempt, since a directive is exempt regardless of length.
    `// FIXME: ${LONG_LINE}\nexport function foo() {}`,
    // Exported class, but the method itself is private: never reported regardless of its own comment.
    'export class C {\n  // first line\n  // second line\n  private m() {}\n}',
    // Exported class, but the method itself is protected: never reported regardless of its own comment.
    'export class C {\n  // first line\n  // second line\n  protected m() {}\n}',
    // Exported class, but the method is a genuine `#`-private field: never reported, the PrivateIdentifier-key branch distinct from the accessibility-modifier branch above.
    'export class C {\n  // first line\n  // second line\n  #m() {}\n}',
    // A public method, but the class itself is not exported: never reported.
    'class C {\n  // first line\n  // second line\n  m() {}\n}',
    // A public method of a class EXPRESSION assigned to an exported const, not a class DECLARATION: this rule's own enumerated target list never names a class expression, so it is never reported here either.
    'export const C = class {\n  // first line\n  // second line\n  m() {}\n};',
    // An exported const whose init is neither an arrow function nor a function expression: this rule's own enumerated target list only ever names those two shapes for a const, so a plain value is never reported, however substantial its leading comment.
    '// first line\n// second line\nexport const x = 5;',
    // A public method of a class EXPRESSION that IS directly default-exported (parenthesised, so the parser keeps it a ClassExpression rather than an anonymous ClassDeclaration): still never reported, since isMethodOfExportedClass's own type check requires a genuine ClassDeclaration specifically, not merely "some kind of exported class".
    'export default (class {\n  // first line\n  // second line\n  m() {}\n});',
    // A single logical line of exactly the default threshold's own length: not substantial (strictly greater than, not greater-than-or-equal).
    `// ${EXACT_THRESHOLD_LINE}\nexport function foo() {}`,
    // The comment is substantial and the declaration is exported, but a blank line separates the two: not really "attached" to the declaration it would otherwise document.
    '// first line\n// second line\n\nexport function foo() {}',
    // No leading comment at all.
    'export function foo() {}',
    // A single trailing `//` comment sitting on the same line as the PRECEDING statement, directly above an export with nothing else between them: getLeadingCommentGroup treats this as not really `foo`'s own leading comment at all (isTrailingComment), so there is no group, and no report, however long the trailing text.
    'export const before = 1; // trailing note\nexport function foo() {}',
    // Substantial, exported, but the comment's own text contains a bare `@`: withheld from reporting entirely, since promoting it into a doc comment would trip tsdoc/syntax on the very first character TSDoc treats as a tag opener.
    '// references an at-sign like this literal one: @ right here\n// second line\nexport function foo() {}',
    // Substantial, exported, but the comment's own text contains a literal closing comment delimiter: promoting it would prematurely end the new doc comment mid-content.
    '// contains a literal star-slash close like this: */ right here\n// second line\nexport function foo() {}',
    // Substantial, exported, but the comment's own text contains a bare `{`: TSDoc reads this as opening an inline tag.
    '// uses an opening brace like this one: { right here\n// second line\nexport function foo() {}',
    // Substantial, exported, but the comment's own text contains a bare `}`: TSDoc reads this as closing an inline tag.
    '// uses a closing brace like this one: } right here\n// second line\nexport function foo() {}',
    // Substantial, exported, but the comment's own text contains a bare `<`: TSDoc reads this as opening an HTML element.
    '// uses a less-than sign like this one: < right here\n// second line\nexport function foo() {}',
    // Substantial, exported, but the comment's own text contains a bare `>`: TSDoc reads this as closing an HTML element.
    '// uses a greater-than sign like this one: > right here\n// second line\nexport function foo() {}',
    // A short `//` comment immediately above the declaration, with an unrelated BLOCK comment further above it: the leading-comment group stops at the type mismatch (Block, not Line), so only the short adjacent line comment is considered, and it alone is not substantial.
    '/* explanatory aside */\n// x\nexport function foo() {}',
    // Two `//` comments with a blank line between them: the leading-comment group stops at that gap, so only the short adjacent line comment (immediately above the declaration) is considered.
    '// first paragraph, unrelated\n\n// x\nexport function foo() {}',
    // A block comment containing nothing but a blank line: extractCommentLines resolves this to zero lines, so there is no first line to test at all.
    '/*\n*/\nexport function foo() {}',
    // A short, single-physical-line block comment.
    '/* short */\nexport function foo() {}',
  ],
  invalid: [
    // A run of two `//` lines directly above an exported function: merged into a single doc comment, verbatim.
    {
      code: '// first line\n// second line\nexport function foo() {}',
      output: '/**\n * first line\n * second line\n */\nexport function foo() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // The identical two lines, but already consolidated into a bare block comment (the exact shape @stylistic/eslint-plugin's own multiline-comment-style `bare-block` fixer produces): converges to the SAME final doc comment as the `//`-run case above, proving both source shapes convert cleanly.
    {
      code: '/* first line\n   second line */\nexport function foo() {}',
      output: '/**\n * first line\n * second line\n */\nexport function foo() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A single `//` line exceeding the default 80-character threshold.
    {
      code: `// ${LONG_LINE}\nexport function foo() {}`,
      output: `/**\n * ${LONG_LINE}\n */\nexport function foo() {}`,
      errors: [{ messageId: 'preferDocComment' }],
    },
    // The identical 25-character line that stayed VALID under the default threshold above becomes INVALID once `maxLineLength` is configured to 20, proving the option is genuinely read.
    {
      code: `// ${MEDIUM_LINE}\nexport function foo() {}`,
      options: [{ maxLineLength: CUSTOM_MAX_LINE_LENGTH }],
      output: `/**\n * ${MEDIUM_LINE}\n */\nexport function foo() {}`,
      errors: [{ messageId: 'preferDocComment' }],
    },
    // The first of three lines is a bare, empty `//`: the fixer renders it as a bare ` *` line with no trailing space, distinct from every non-empty line's ` * text` form.
    {
      code: '//\n// second line\n// third line\nexport function foo() {}',
      output: '/**\n *\n * second line\n * third line\n */\nexport function foo() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // An arrow function assigned to an exported const.
    {
      code: '// first line\n// second line\nexport const foo = () => {};',
      output: '/**\n * first line\n * second line\n */\nexport const foo = () => {};',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A plain function expression assigned to an exported const.
    {
      code: '// first line\n// second line\nexport const foo = function () {};',
      output: '/**\n * first line\n * second line\n */\nexport const foo = function () {};',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // An exported class declaration.
    {
      code: '// first line\n// second line\nexport class C {}',
      output: '/**\n * first line\n * second line\n */\nexport class C {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // An exported default class declaration.
    {
      code: '// first line\n// second line\nexport default class C {}',
      output: '/**\n * first line\n * second line\n */\nexport default class C {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // An exported default function declaration.
    {
      code: '// first line\n// second line\nexport default function foo() {}',
      output: '/**\n * first line\n * second line\n */\nexport default function foo() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A public method (no accessibility modifier at all) of an exported class, indented two spaces: the fixer's own indentation tracks the comment's real column, not just column zero.
    {
      code: 'export class C {\n  // first line\n  // second line\n  m() {}\n}',
      output: 'export class C {\n  /**\n   * first line\n   * second line\n   */\n  m() {}\n}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A method with the explicit `public` accessibility modifier: isPublicMethod's own `=== 'public'` branch, distinct from the "no modifier at all" (`undefined`) case above.
    {
      code: 'export class C {\n  // first line\n  // second line\n  public m() {}\n}',
      output: 'export class C {\n  /**\n   * first line\n   * second line\n   */\n  public m() {}\n}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // An exported interface declaration.
    {
      code: '// first line\n// second line\nexport interface I {}',
      output: '/**\n * first line\n * second line\n */\nexport interface I {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // An exported type alias declaration.
    {
      code: '// first line\n// second line\nexport type T = string;',
      output: '/**\n * first line\n * second line\n */\nexport type T = string;',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // The first line, after the leading `//`, itself starts with a literal `*`: still a genuine Line comment, not a Block one, so the "already a doc comment" exemption (which requires Block type specifically) never applies here, however much the text alone might resemble one.
    {
      code: '//* looks like a marker\n// second line\nexport function foo() {}',
      output: '/**\n * * looks like a marker\n * second line\n */\nexport function foo() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A trailing comment on the PRECEDING statement's own line, followed by a genuine run of standalone doc lines above the export: getLeadingCommentGroup's backward walk stops at the trailing comment, so only the two standalone lines are converted, leaving the trailing note on the preceding statement's own line completely untouched.
    {
      code: 'export const before = 1; // trailing note\n// Doc line one for g.\n// Doc line two for g.\nexport function g(): void {}',
      output: 'export const before = 1; // trailing note\n/**\n * Doc line one for g.\n * Doc line two for g.\n */\nexport function g(): void {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // The identical shape against a class method: a trailing comment on the previous method's own line, followed by a standalone doc-line run above the next method. Only the run above `n` is converted; `m`'s own trailing comment is untouched.
    {
      code: 'export class C {\n  m(): void {} // trailing\n  // Doc line one for n.\n  // Doc line two for n.\n  n(): void {}\n}',
      output: 'export class C {\n  m(): void {} // trailing\n  /**\n   * Doc line one for n.\n   * Doc line two for n.\n   */\n  n(): void {}\n}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A single statement with two function-valued declarators (`export const h1 = ..., h2 = ...;`): reported and fixed exactly ONCE, on the declaration as a whole, never once per declarator (the `errors` array below asserts exactly one error).
    {
      code: '// first line\n// second line\nexport const h1 = (): void => {}, h2 = (): void => {};',
      output: '/**\n * first line\n * second line\n */\nexport const h1 = (): void => {}, h2 = (): void => {};',
      errors: [{ messageId: 'preferDocComment' }],
    },
  ],
});
