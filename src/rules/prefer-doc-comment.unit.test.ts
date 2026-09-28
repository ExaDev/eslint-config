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
    // A real TypeScript suppression directive, written exactly as one actually appears in source (its own leading `@`, never the bare `ts-expect-error` form): exempt regardless of length, the same as every other directive-shaped comment. Safe to use here as a real `@ts-expect-error`, unlike a real `eslint-disable`, since it is not one of ESLint's own core directive comments and so never trips an unused-directive complaint of its own in this minimal RuleTester setup.
    "// @ts-expect-error deliberately wrong return type because this test needs a long explanation here\nexport function longTs(): number { return 'x'; }",
    // A `prettier-ignore` directive, exempt regardless of length: this one is not one of ESLint's own core directive comments, so safe to use directly, unlike a real `eslint-disable`.
    '// prettier-ignore\nexport const table = (): number[][] => [\n  [1, 0, 0],\n];',
    // Each coverage tool's own ignore directive, exempt regardless of length: same reasoning, none of these is an ESLint core directive either.
    '// c8 ignore next\nexport function coveredByC8() {}',
    '// v8 ignore next\nexport function coveredByV8() {}',
    '// istanbul ignore next\nexport function coveredByIstanbul() {}',
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
    // An exported `let` (not `const`) whose init IS an arrow function: this rule's own scope, both in its header comment and the README, is deliberately "assigned to an exported const", never `let`/`var`, so this is never reported, however substantial its leading comment.
    '// first line\n// second line\nexport let notConst = (): number => 1;',
    // The identical shape with `var` in place of `let`: the same restriction applies regardless of which non-`const` keyword is used.
    '// first line\n// second line\nexport var alsoNotConst = (): number => 1;',
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
    // The identical shape, but with the trailing text deliberately over the substantiality threshold: proves the exemption holds because isTrailingComment's own check fires, not merely because "trailing note" itself happened to be short enough to fail the separate substantiality check regardless.
    `export const before = 1; // ${LONG_LINE}\nexport function foo() {}`,
    // A directive in the middle of a run, with only ONE short explanation line adjacent below it: the lines after the LAST directive are sliced out on their own (never merged with the directive itself), and that one short line alone is not substantial, so nothing is reported at all, proving the split happens before the substantiality check, not after. The "short intro" line above the directive is real prose too, but it is not adjacent to the declaration (the directive sits between it and `foo`), so it is left completely alone regardless of its own substantiality, exactly like the segment above a `#region`/TODO opening a run is. A plain TODO stands in for a real `eslint-disable-next-line` here, the same substitution and reasoning the "directive-shaped (a short TODO marker)" case above already uses: this minimal RuleTester setup has no `no-empty-function` rule registered to report anything for a real disable comment to suppress, so ESLint's own core would flag it as an unused directive, a false failure unrelated to this rule.
    '// short intro\n// TODO: revisit\n// trailing detail\nexport function foo() {}',
    // The regression this rule's own directive-splitting fix must never reintroduce: a directive in the middle of a run, with a genuinely SUBSTANTIAL two-line explanation above it (non-adjacent to the declaration) but only one short line adjacent below it. An earlier build of this rule kept the lines above the FIRST directive found and reported those instead, converting the non-adjacent explanation into a doc comment while leaving the real adjacent line untouched as a plain comment, backwards from what the declaration actually needed documented. Judging only the segment after the LAST directive, the one short adjacent line, correctly reports nothing here at all.
    '// Explanation line one.\n// Explanation line two.\n// TODO: revisit\n// short.\nexport function notBackwards(): void {}',
    // The exact real-world repro from the review that this rule must never regress on: a `prettier-ignore` directive with only ONE short prose line above it. Split out on its own the same as every other directive, that one line alone is not substantial, so nothing is reported and the directive is never touched (an earlier build of this rule failed to recognise `prettier-ignore` at all, merged both lines together as if there were no directive, found the pair substantial, and swallowed the directive into a corrupted doc comment, which then let Prettier reformat the hand-laid-out table).
    '// A lookup table laid out by hand.\n// prettier-ignore\nexport const table = (): number[][] => [\n  [1, 0, 0],\n];',
    // The identical shape, but the directive itself carries extra leading whitespace (three spaces after `//`): still recognised as the same directive, so the single short line above it is still all there is to judge for substantiality, and nothing is reported.
    '// A lookup table laid out by hand.\n//   prettier-ignore\nexport const table = (): number[][] => [\n  [1, 0, 0],\n];',
    // A directive-shaped line found INSIDE an already-consolidated Block comment (the shape multiline-comment-style's own bare-block fixer produces from a `//` run), rather than in a genuine `//` run: never split, and never reported at all, since a Block comment's one comment node has no one-to-one mapping onto its own extracted lines for a partial fix to slice safely (checkAnchor's own `!isLineRun` guard). TWO intro lines above the directive, not one: with only one, the lines "above" the directive would be a single short line, already exempt on substantiality grounds alone, masking whether this guard is doing anything at all; with two, skipping the guard would produce a genuinely substantial (and corrupted) report of its own. A real `eslint-disable-next-line` is safe to use here, unlike in the `//`-run cases above: ESLint's own core directive parsing only ever recognises a comment whose ENTIRE own text matches directive syntax, never a line embedded inside a larger block's prose, so this never risks an unused-directive complaint of its own.
    '/* intro line one\n   intro line two\n   eslint-disable-next-line no-empty-function\n   trailing detail */\nexport function foo() {}',
    // A short `//` comment immediately above the declaration, with an unrelated BLOCK comment further above it: the leading-comment group stops at the type mismatch (Block, not Line), so only the short adjacent line comment is considered, and it alone is not substantial.
    '/* explanatory aside */\n// x\nexport function foo() {}',
    // Two `//` comments with a blank line between them: the leading-comment group stops at that gap, so only the short adjacent line comment (immediately above the declaration) is considered.
    '// first paragraph, unrelated\n\n// x\nexport function foo() {}',
    // A block comment containing nothing but a blank line: extractCommentLines resolves this to zero lines, so there is no first line to test at all.
    '/*\n*/\nexport function foo() {}',
    // A short, single-physical-line block comment.
    '/* short */\nexport function foo() {}',
    // A Block comment directly above the export whose own content happens to read as directive-shaped (`TODO: ...`), with a genuinely substantial, ordinary PROSE Block comment directly above THAT (no blank line either side): getProseGroupBefore's own type check (only a `Line` comment is ever tested for directive-ness at all) must return the directive-shaped BLOCK itself immediately, never treat it as skippable and recurse past it to the prose above, which checkAnchor's own directiveIndex logic then correctly leaves entirely alone (a directive found inside an already-consolidated Block comment leaves the whole comment alone). Were that type check ever weakened to fire for a Block too, this exact fixture would instead surface the prose block as the group and report it.
    '/* This substantial prose block sits above another block entirely and would be reported and fixed if it were ever wrongly selected as the group instead of the real directive block below it. */\n/* TODO: revisit this exact decision later on */\nexport function guardedByDirectiveBlock() {}',
    // A `/*!` license/banner block directly above an exported declaration: exempt regardless of length, the same as an already-consolidated `/**` doc comment, since a banner is real, structural, intentionally-preserved text, never a plain comment this rule should upgrade or otherwise disturb.
    '/*! Copyright ExaDev. Licensed under MIT. This banner must survive minification intact. */\nexport function licensed() {}',
    // A multi-line ESLint inline-config Block comment (`/* eslint\n ... */`), directly above an export: the widened DIRECTIVE_COMMENT_PATTERN now recognises the bare `eslint` keyword at the block's own first extracted line, so directiveIndex lands at 0 and checkAnchor's own `!isLineRun` guard (a directive found anywhere inside an already-consolidated Block comment leaves the whole comment alone, since a partial fix cannot safely be sliced out of one physical comment node) withholds any report at all. Never corrupted into a doc comment containing `* eslint\n * no-console: off, ...`, which would turn live rule configuration into documentation.
    '/* eslint\n  no-console: off,\n  no-alert: off\n*/\nexport function f() {}',
    // The identical shape for a `/* global ... */` block, ESLint's own config-comment marking a variable as an intentional global rather than suppressing a rule at all: recognised the same way, left completely untouched.
    '/* global\n  foo,\n  bar\n*/\nexport function f() {}',
    // A `#region` editor folding marker at the TOP of the run, with only a single SHORT prose line adjacent below it, directly above the export: the segment after the LAST (here, only) directive is what gets judged, and that one short line alone is not substantial, so nothing is reported.
    '// #region helpers\n// Trivial.\nexport function f() {}',
    // An `export` inside a non-exported `namespace`: `hidden`'s own immediate parent is a genuine ExportNamedDeclaration, exactly like a real top-level export, but that wrapper sits inside `Internal`'s own TSModuleBlock, and `Internal` itself is never exported, so isAtPublicSurface's own recursive check must still say no. Never reported, regardless of its own substantial two-line comment: a non-exported declaration is never reported, matching the README's own promise.
    'namespace Internal {\n  // first line of a substantial comment\n  // second line of a substantial comment\n  export function hidden() {}\n}',
    // A `declare global { ... }` augmentation: there is no such syntax as `export declare global`, so the augmentation's own TSModuleDeclaration is never itself wrapped in an export, the identical reason the non-exported `namespace` case just above is never reported either. Proven with the same `export` shape inside it, not merely relying on the absence of one: even an inline `export` inside the augmentation's own block is still never treated as reaching the module's public surface.
    'declare global {\n  // first line of a substantial comment\n  // second line of a substantial comment\n  export interface Hidden {}\n}',
    // A TypeScript function overload set's own implementation signature: TypeScript never shows this signature to callers (only the two separate `TSDeclareFunction` overload signatures above it are ever checked against a call site), so the two-line comment directly above it is internal reasoning about how the overloads are actually implemented, never the public contract this rule should upgrade into a doc comment. Never reported, however substantial its own comment: isOverloadImplementation's own scope-based detection (the overload signatures and the implementation all share one Variable) identifies this as the implementation and skips it before checkAnchor ever runs.
    "export function parse(a: string): number;\nexport function parse(a: number): number;\n// Internal reasoning about how these overloads\n// are actually implemented.\nexport function parse(a: string | number): number {\n  return typeof a === 'string' ? a.length : a;\n}",
    // The identical exemption for an exported class method's own overload implementation: `run`'s own two overload signatures above it (`MethodDefinition`s whose own `value` is `TSEmptyBodyFunctionExpression`) are the real public contract; the two-line comment directly above the body-carrying implementation is internal reasoning, never reported.
    'export class C {\n  run(a: string): void;\n  run(a: number): void;\n  // Internal reasoning about how these overloads\n  // are actually implemented.\n  run(a: string | number): void {}\n}',
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
    // An exported class decorated BEFORE the `export` keyword (`@dec\nexport class ...`), TypeScript's other valid placement for a decorated exported class declaration alongside the one below: getExportWrapper's own wrapper starts at `export`, but the decorator's own range sits strictly before it, so getCommentsBefore(wrapper) alone would find nothing at all (the decorator, a real code token, sits directly between the comment and the wrapper); getDecoratedAnchor redirects the search to anchor on the decorator instead, so the genuine leading comment is still found. `@dec` and `export class Decorated {}` are both left completely untouched; only the comment above the decorator is converted.
    {
      code: '// Describes the decorated class in two\n// lines of prose.\n@dec\nexport class Decorated {}',
      output: '/**\n * Describes the decorated class in two\n * lines of prose.\n */\n@dec\nexport class Decorated {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // The OTHER valid decorator placement, AFTER the `export` keyword (`export @dec class ...`, confirmed directly by compiling both orderings with the installed `typescript`, neither a syntax error): here the decorator's own range sits INSIDE the wrapper's own range, so getCommentsBefore(wrapper) already finds the real leading comment correctly on its own, and getDecoratedAnchor's own `firstDecorator.range[0] < wrapper.range[0]` check must return `wrapper` unchanged rather than the decorator, converging on the identical output the pre-existing "export default class" case above already produces for an undecorated class, proving this ordering behaves exactly like an ordinary exported class.
    {
      code: '// first line\n// second line\nexport @dec class Decorated {}',
      output: '/**\n * first line\n * second line\n */\nexport @dec class Decorated {}',
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
    // A MIXED multi-declarator statement, only one of whose declarators is function-valued (`h2 = 5` is not): still reported, since ANY matching declarator is enough (`.some`, not `.every`, which would instead demand every declarator match).
    {
      code: '// first line\n// second line\nexport const h1 = (): void => {}, h2 = 5;',
      output: '/**\n * first line\n * second line\n */\nexport const h1 = (): void => {}, h2 = 5;',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A hand-written "starred" block comment (opening `/*`, not `/**`): each content line's own leading `* ` is delimiter decoration, not real content, so it is stripped once rather than left in place to double up against the fixer's own `* ` prefix.
    {
      code: '/*\n * A starred block that is not a doc comment\n * second line\n */\nexport function foo() {}',
      output: '/**\n * A starred block that is not a doc comment\n * second line\n */\nexport function foo() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // An indented example line inside the comment (a nested code sample) keeps its own extra indentation relative to the fixer's own `* ` prefix, rather than being flattened to the same level as its neighbours.
    {
      code: '// intro\n//   indented example line\nexport function foo() {}',
      output: '/**\n * intro\n *   indented example line\n */\nexport function foo() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A directive on the LAST line, immediately above the export, with substantial explanation above it: only the explanation lines are converted; the directive itself is left as a plain, untouched `//` comment directly above the export, so it still functions as a real suppression for it. A plain TODO stands in for a real `eslint-disable-next-line` here for the same reason the "directive-shaped (a short TODO marker)" valid case above already gives: a real disable comment naming an unregistered rule would trip ESLint's own unused-directive check in this minimal RuleTester setup, a false failure unrelated to this rule; isDirectiveComment's own internal unit test already exercises the real `eslint-disable` family directly and in isolation.
    {
      code: '// Explanation line one.\n// Explanation line two.\n// TODO: revisit\nexport function d3(): void {}',
      output: '/**\n * Explanation line one.\n * Explanation line two.\n */\n// TODO: revisit\nexport function d3(): void {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A `// eslint-enable no-console` Line comment is NOT itself a live ESLint directive at all: source-code.js's own getInlineConfigNodes only honours `eslint-disable-line`/`eslint-disable-next-line` on a Line comment, every other family member (including bare `eslint-enable`) only on a Block comment (confirmed directly against the installed eslint's own source). So this whole three-line run, including the `eslint-enable` line itself, is ordinary prose to this rule and merges into the doc comment in full; nothing here was ever a working directive for this fix to destroy.
    {
      code: '// Explains why this function exists and\n// what callers must guarantee.\n// eslint-enable no-console\nexport function f() {}',
      output: '/**\n * Explains why this function exists and\n * what callers must guarantee.\n * eslint-enable no-console\n */\nexport function f() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A `#endregion` editor folding marker directly above the export, with substantial explanation above it: only the explanation converts; `// #endregion` is left completely untouched directly above the export, still a real fold boundary for the editor, never silently removed by being folded into the new doc comment's own prose.
    {
      code: '// Explains why this exists and\n// what callers must guarantee.\n// #endregion\nexport function f() {}',
      output: '/**\n * Explains why this exists and\n * what callers must guarantee.\n */\n// #endregion\nexport function f() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A directive in the MIDDLE of a run, with substantial explanation both above and below it: only the lines strictly AFTER the directive, the ones actually adjacent to the declaration, are converted; the non-adjacent explanation above the directive, and the directive line itself, are left completely untouched. An earlier build of this rule instead converted the non-adjacent explanation above the directive and left the real adjacent explanation below it as a plain comment, exactly backwards; the "notBackwards" valid case above pins the narrower version of this same regression where the adjacent segment is too short to be substantial at all.
    {
      code: '// Explanation line one.\n// Explanation line two.\n// TODO: revisit\n// Explanation line three.\n// Explanation line four.\nexport function d4(): void {}',
      output: '// Explanation line one.\n// Explanation line two.\n// TODO: revisit\n/**\n * Explanation line three.\n * Explanation line four.\n */\nexport function d4(): void {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A `#region` editor folding marker at the TOP of the run, with substantial (2-line) prose directly below it, directly above the export: the real repro this rule's own directive-splitting fix must handle. The segment after the LAST (here, only) directive is the declaration's genuine adjacent doc, so it converts; `// #region parsing` is left completely untouched above it, still a real fold boundary for the editor. An earlier build of this rule split at the FIRST directive found and kept only the (here, empty) lines above it, so this exact shape was never reported at all.
    {
      code: '// #region parsing\n// Parses the configuration file and returns a normalised object for callers.\n// Throws when the file is missing.\nexport function parse(): object {\n  return {};\n}',
      output: '// #region parsing\n/**\n * Parses the configuration file and returns a normalised object for callers.\n * Throws when the file is missing.\n */\nexport function parse(): object {\n  return {};\n}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // The identical shape, but with a TODO marker opening the run instead of a `#region`: the same fix applies regardless of which directive kind sits at the top, proving this is not a `#region`-specific special case.
    {
      code: '// TODO(joe): drop the legacy branch once every caller has migrated.\n// Parses the configuration file and returns a normalised object for callers.\n// Throws when the file is missing.\nexport function parseWithTodo(): object {\n  return {};\n}',
      output: '// TODO(joe): drop the legacy branch once every caller has migrated.\n/**\n * Parses the configuration file and returns a normalised object for callers.\n * Throws when the file is missing.\n */\nexport function parseWithTodo(): object {\n  return {};\n}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A `///` triple-slash reference directive at the TOP of the run, with substantial (2-line) prose directly below it: the identical fix again, this time for the directive kind excluded via isTripleSlashDirective's own un-stripped-value check rather than isDirectiveComment's pattern match, proving the LAST-directive search covers both.
    {
      code: '/// <reference types="vite/client" />\n// Explains why this exists and\n// what callers must guarantee.\nexport function f(): void {}',
      output: '/// <reference types="vite/client" />\n/**\n * Explains why this exists and\n * what callers must guarantee.\n */\nexport function f(): void {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // TWO directives in the same run, an opening `#region` and a mid-run TODO, each with substantial prose around them: only the segment after the LAST directive (the TODO) converts; the `#region`, its own following overview, and the TODO itself are all left completely untouched. Proves the search finds the LAST directive specifically, not merely "a" directive: a naive first-found search would instead report the overview lines directly below `#region` and leave the genuine adjacent doc below the TODO untouched.
    {
      code: '// #region helpers\n// Region overview line one.\n// Region overview line two.\n// TODO: tidy up this region\n// Doc line one for helper.\n// Doc line two for helper.\nexport function regionThenTodo(): void {}',
      output: '// #region helpers\n// Region overview line one.\n// Region overview line two.\n// TODO: tidy up this region\n/**\n * Doc line one for helper.\n * Doc line two for helper.\n */\nexport function regionThenTodo(): void {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // The identical `prettier-ignore` shape as the valid one-line repro above, but with a genuinely substantial (2-line) explanation above the directive: only the explanation is converted; `// prettier-ignore` is left completely untouched directly above the export, so Prettier still leaves the hand-laid-out table alone.
    {
      code: '// Explanation line one for the table.\n// Explanation line two for the table.\n// prettier-ignore\nexport const table = (): number[][] => [\n  [1, 0, 0],\n];',
      output: '/**\n * Explanation line one for the table.\n * Explanation line two for the table.\n */\n// prettier-ignore\nexport const table = (): number[][] => [\n  [1, 0, 0],\n];',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // The identical repro, but with the `prettier-ignore` directive written with extra leading whitespace (three spaces) after the `//`, the exact confirmed regression: an earlier build tested the directive patterns against the already-single-space-stripped extracted line, which still carried this extra whitespace, so the pattern's own `^` anchor never matched, the directive was treated as ordinary prose, and it was swallowed into the fix. Still left completely untouched, verbatim including its own extra whitespace, since Prettier's own `comment.value.trim() === 'prettier-ignore'` check still honours it regardless of how much whitespace sits before it.
    {
      code: '// Explanation line one for the table.\n// Explanation line two for the table.\n//   prettier-ignore\nexport const table = (): number[][] => [\n  [1, 0, 0],\n];',
      output: '/**\n * Explanation line one for the table.\n * Explanation line two for the table.\n */\n//   prettier-ignore\nexport const table = (): number[][] => [\n  [1, 0, 0],\n];',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // The identical shape again, this time with a literal TAB before the directive rather than extra spaces: TypeScript's own `commentDirectiveRegExSingleLine` allows arbitrary leading whitespace before a `@ts-*` marker, so a real `// @ts-expect-error` written this way is still live and must be left untouched, verbatim tab included.
    {
      code: "// Explanation line one.\n// Explanation line two.\n//\t@ts-expect-error deliberately wrong return type\nexport function d5(): number { return 'x'; }",
      output: "/**\n * Explanation line one.\n * Explanation line two.\n */\n//\t@ts-expect-error deliberately wrong return type\nexport function d5(): number { return 'x'; }",
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A bare BLOCK comment (the exact shape @stylistic/eslint-plugin's own multiline-comment-style `bare-block` fixer produces from a `//` run) directly above a directive-shaped Line comment, itself directly above the export: getLeadingCommentGroup's own backward walk must skip past the directive entirely to find the block, a DIFFERENT comment shape from the directive sitting below it, rather than stopping at that type boundary the moment the directive is reached (the exact bug a same-type-only walk would hit, since it would otherwise see only the directive as its own one-line "group", find nothing substantial there, and never even look at the block above at all, leaving it unreported and un-fixed forever). Still reported and converted, exactly like the pure `//`-run case above; the directive is left completely untouched, directly above the export, same as every other directive case here. A plain TODO stands in for a real `eslint-disable-next-line` for the same reason every other standalone-directive case above does: this minimal RuleTester setup has no matching rule registered for a real disable comment to suppress, so ESLint's own core would flag it as an unused directive, a false failure unrelated to this rule.
    {
      code: '/* first line\n   second line */\n// TODO: revisit\nexport function withDirective() {}',
      output: '/**\n * first line\n * second line\n */\n// TODO: revisit\nexport function withDirective() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // The comment's own text contains a bare `@` not shaped like a real TSDoc tag: no longer silently exempt from being reported at all (the old character-class gate withheld even the report, hiding a real violation). Still reported, but with no fix, since the exact candidate genuinely fails to parse as valid TSDoc, confirmed directly against the real parser rather than assumed.
    {
      code: '// references an at-sign like this literal one: @ right here\n// second line\nexport function foo() {}',
      output: null,
      errors: [{ messageId: 'preferDocComment' }],
    },
    // The comment's own text contains a literal closing comment delimiter: reported, but the fix is withheld regardless of what the TSDoc parser itself thinks of the rest of the text (containsCommentTerminator, checked independently), since splicing it in verbatim would end the new comment early at the JS/TS tokeniser's own level.
    {
      code: '// contains a literal star-slash close like this: */ right here\n// second line\nexport function foo() {}',
      output: null,
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A bare `{` not shaped like a real TSDoc inline tag: reported, no fix.
    {
      code: '// uses an opening brace like this one: { right here\n// second line\nexport function foo() {}',
      output: null,
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A bare `}`: reported, no fix.
    {
      code: '// uses a closing brace like this one: } right here\n// second line\nexport function foo() {}',
      output: null,
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A bare `<` followed by a space, which TSDoc reads as a malformed HTML element name: reported, no fix.
    {
      code: '// uses a less-than sign like this one: < right here\n// second line\nexport function foo() {}',
      output: null,
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A bare `>`, which TSDoc requires escaping to avoid confusion with an HTML tag close: reported, no fix.
    {
      code: '// uses a greater-than sign like this one: > right here\n// second line\nexport function foo() {}',
      output: null,
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A Windows-style path containing a backslash: fails tsdoc/syntax's own `tsdoc-unnecessary-backslash` once inside a doc comment, exactly the shape the old character-class gate missed entirely (it checked `@{}<>` only, never a backslash). Reported, no fix.
    {
      code: '// a comment mentioning C:\\Users\\joe\n// second line\nexport function foo() {}',
      output: null,
      errors: [{ messageId: 'preferDocComment' }],
    },
    // An unbalanced backtick: fails tsdoc/syntax's own `tsdoc-code-span-missing-delimiter`, the other shape the old gate missed entirely. Reported, no fix.
    {
      code: '// an unbalanced ` backtick here\n// second line\nexport function foo() {}',
      output: null,
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A generic type reference (`Array<string>`): the exact shape the OLD character-class gate wrongly banned outright, since it contains `<`/`>`, even though it parses as perfectly valid TSDoc. Now reported AND fixed, proving the new parser-based gate is not simply a stricter version of the old one.
    {
      code: '// Returns an Array<string> of matches.\n// second line\nexport function foo() {}',
      output: '/**\n * Returns an Array<string> of matches.\n * second line\n */\nexport function foo() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A comment sharing its own line with an EARLIER, unrelated block comment (`/* aside */ // real comment`): isTrailingComment only ever excludes a comment sharing a line with real CODE, never with another comment, so this one still reaches the fixer. The indent taken for every continuation line and the closing delimiter must be only the line's own leading whitespace (here, none at all, since the line starts with `/* aside */`), never the raw `/* aside */ ` text itself: splicing that text onto every line instead (this rule's own previous behaviour) reproduced it before the fixer's own `*` on each continuation line and before its own closing `*/`, corrupting the file into a syntax error.
    {
      code: '/* aside */ // This comment follows a block comment on the same line and is long enough to be substantial for sure.\nexport function afterAside() {}',
      output: '/* aside */ /**\n * This comment follows a block comment on the same line and is long enough to be substantial for sure.\n */\nexport function afterAside() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A Line comment whose own text happens to start with `!` (no space after `//`, so nothing strips it), but is not a `/*!` Block banner at all: the banner exemption's own type check (Block only) must still report and fix this, proving the exemption never fires for a Line comment no matter what its own text starts with.
    {
      code: '//!not actually a license banner, just a coincidentally exclamation-prefixed comment that still deserves conversion to a real doc comment\nexport function notABanner() {}',
      output: '/**\n * !not actually a license banner, just a coincidentally exclamation-prefixed comment that still deserves conversion to a real doc comment\n */\nexport function notABanner() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A CRLF file: every line break in the fixture below, both between the two `//` lines and after them, is a real `\r\n` pair, never a bare `\n`. The fixer's own replacement must use that same `\r\n` throughout its own new text (between `/**` and the first body line, between the two body lines, and before the closing ` */`), never a hard-coded `\n`, which would leave the file with the two conventions mixed.
    {
      code: '// first line\r\n// second line\r\nexport function crlf() {}',
      output: '/**\r\n * first line\r\n * second line\r\n */\r\nexport function crlf() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A `///` triple-slash reference directive directly above the export, with substantial prose above THAT: getProseGroupBefore's own recursive skip (extended by isTripleSlashDirective, the same as its existing eslint-disable/TODO/prettier-ignore skip) excludes the directive from the group entirely, so only the prose converts; the directive is left completely untouched directly above the export, still a real reference to the tokeniser, never merged into the new doc comment's own text.
    {
      code: '// Explains why this exists and\n// what callers must guarantee.\n/// <reference types="vite/client" />\nexport function f() {}',
      output: '/**\n * Explains why this exists and\n * what callers must guarantee.\n */\n/// <reference types="vite/client" />\nexport function f() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // The exact shape that regressed: an ALREADY-BARE-BLOCK comment whose own internal line break is bare `\n` (the shape @stylistic/eslint-plugin's own multiline-comment-style bare-block fixer hard-codes, regardless of the file's real convention), sitting in a file whose REAL line breaks, both before the block and between it and the export, are `\r\n`. Reading the terminator from firstComment.range[0] (the old, buggy call site) would find this internal `\n` first and wrongly adopt it; reading from lastComment.range[1] (right after the block's own closing `*/`, in real untouched source) correctly finds `\r\n` instead, so the fixer's own new doc comment uses `\r\n` throughout, matching the surrounding file exactly, with no mixed line endings.
    {
      code: '/* first line\n   second line */\r\nexport function crlfBareBlock() {}',
      output: '/**\r\n * first line\r\n * second line\r\n */\r\nexport function crlfBareBlock() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // `export namespace N { export function f() {} }`: unlike the non-exported `namespace Internal` valid case above, `N` itself IS exported (its own TSModuleDeclaration sits inside an ExportNamedDeclaration whose own parent is Program), so `f`'s own inner export wrapper genuinely reaches the module's public surface and is reported, exactly like a real top-level export.
    {
      code: 'export namespace N {\n  // first line\n  // second line\n  export function f() {}\n}',
      output: 'export namespace N {\n  /**\n   * first line\n   * second line\n   */\n  export function f() {}\n}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // Five confirmed regressions, each a single `//` line over the default 80-character threshold, none of them a real directive: the widened DIRECTIVE_COMMENT_PATTERN's own `i` flag used to treat ordinary capitalised prose that merely opens with an ESLint-family word ("ESLint"/"Global"/"Exported") as directive-shaped, a case-insensitivity false negative fixed by matching that family case-sensitively; a mixed-case "Todo" opening ordinary prose is fixed by requiring the real marker shape (all-uppercase, or an immediate `:`/`(`); and a genuine lowercase `eslint-enable` opening a Line comment is fixed by recognising that ESLint itself never honours that label as a Line-comment directive at all (only Block), so this rule must not either. Each was silently unreported before this fix, and each is now reported and cleanly autofixed, since none of them collides with any real TSDoc syntax.
    {
      code: '// ESLint plugins resolve their rules lazily, so this cache must warm before the very first lint run completes successfully.\nexport function pluginCache() {}',
      output: '/**\n * ESLint plugins resolve their rules lazily, so this cache must warm before the very first lint run completes successfully.\n */\nexport function pluginCache() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    {
      code: '// Global registry of handlers, keyed by name, shared across every request the process ever serves.\nexport function handlerRegistry() {}',
      output: '/**\n * Global registry of handlers, keyed by name, shared across every request the process ever serves.\n */\nexport function handlerRegistry() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    {
      code: '// Exported for the CLI entry point, this helper must remain stable across every published release.\nexport function cliEntry() {}',
      output: '/**\n * Exported for the CLI entry point, this helper must remain stable across every published release.\n */\nexport function cliEntry() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    {
      code: '// Todo list items are rendered directly from the shared store without any client side filtering applied.\nexport function todoList() {}',
      output: '/**\n * Todo list items are rendered directly from the shared store without any client side filtering applied.\n */\nexport function todoList() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    {
      code: '// eslint-enable is what this helper emits once the temporary suppression block above it has been safely closed.\nexport function emitEnable() {}',
      output: '/**\n * eslint-enable is what this helper emits once the temporary suppression block above it has been safely closed.\n */\nexport function emitEnable() {}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // An anonymous default-exported function (`node.id === null`): isOverloadImplementation's own scope lookup finds no name variable at all for one, so it is never mistaken for an overload implementation, and reported exactly like any other anonymous default export.
    {
      code: "// first line\n// second line\nexport default function (): number { return 0; }",
      output: "/**\n * first line\n * second line\n */\nexport default function (): number { return 0; }",
      errors: [{ messageId: 'preferDocComment' }],
    },
    // The SECOND of two overload signatures for an exported class method (a `MethodDefinition` whose own `value` is `TSEmptyBodyFunctionExpression`, not the implementation): isOverloadImplementationMethod's own `value.type === TSEmptyBodyFunctionExpression` guard returns `false` immediately for it, so it is never itself mistaken for the implementation just because an EARLIER same-key signature precedes it too; still reported like any ordinary method, proving the exemption applies only to the genuine body-carrying implementation, never to another signature in the same overload set.
    {
      code: 'export class C {\n  run(a: string): void;\n  // Doc line one for the second overload signature.\n  // Doc line two for the second overload signature.\n  run(a: number): void;\n  run(a: string | number): void {}\n}',
      output: 'export class C {\n  run(a: string): void;\n  /**\n   * Doc line one for the second overload signature.\n   * Doc line two for the second overload signature.\n   */\n  run(a: number): void;\n  run(a: string | number): void {}\n}',
      errors: [{ messageId: 'preferDocComment' }],
    },
    // A method with a string-literal key (`node.key.type !== Identifier`, distinct from an ordinary named method's `Identifier` key): isOverloadImplementationMethod's own key-shape guard returns `false` immediately, since this rule's own MethodDefinition key comparison only ever covers the ordinary named-method shape a real overload set is written with; still reported normally, proving the guard never wrongly exempts an unrelated non-Identifier-keyed method.
    {
      code: "export class C {\n  // first line\n  // second line\n  'm'() {}\n}",
      output: "export class C {\n  /**\n   * first line\n   * second line\n   */\n  'm'() {}\n}",
      errors: [{ messageId: 'preferDocComment' }],
    },
  ],
});
