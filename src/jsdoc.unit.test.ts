import type { Linter } from 'eslint';
import { Linter as LinterClass } from 'eslint';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tseslint from 'typescript-eslint';
import jsdocAndTsdoc from './jsdoc';

// Exercises the real exported array directly against ESLint's own Linter, the same pattern react.test.ts/recommended-type-checked.test.ts already use — proving the shipped config's actual runtime behaviour rather than describing its shape in a comment.
const linter = new LinterClass();

function lint(code: string, filename: string) {
  const config: Linter.Config[] = [{ files: ['**'], languageOptions: { sourceType: 'module', ecmaVersion: 2022 } }, ...jsdocAndTsdoc] as Linter.Config[];

  return linter.verify(code, config, filename).map((message) => message.ruleId);
}

describe('jsdocAndTsdoc', () => {
  it('has exactly two config blocks: the jsdoc bundle, then the standalone tsdoc rule', () => {
    expect(jsdocAndTsdoc).toHaveLength(2);
  });

  it('keeps a logical-tier jsdoc rule on (check-param-names): a documented @param that does not match the real parameter name is flagged', () => {
    const code = '/**\n * @param y unrelated\n */\nfunction f(x) {\n  return x;\n}\n';
    expect(lint(code, 'foo.ts')).toContain('jsdoc/check-param-names');
  });

  it('does not require a doc block to exist at all (jsdoc/require-jsdoc is turned off)', () => {
    const code = 'function f(x) {\n  return x;\n}\n';
    expect(lint(code, 'foo.ts')).not.toContain('jsdoc/require-jsdoc');
  });

  it('does not require an existing doc block to document its parameter (jsdoc/require-param is turned off)', () => {
    const code = '/**\n * Does a thing.\n */\nfunction f(x) {\n  return x;\n}\n';
    expect(lint(code, 'foo.ts')).not.toContain('jsdoc/require-param');
  });

  it('flags invalid TSDoc syntax via the standalone tsdoc/syntax rule', () => {
    const code = '/**\n * {@link}\n */\nfunction f() {}\n';
    expect(lint(code, 'foo.ts')).toContain('tsdoc/syntax');
  });

  it('is scoped to JS/TS files: reports nothing for the identical violating content outside the glob', () => {
    const code = '/**\n * @param y unrelated\n */\nfunction f(x) {\n  return x;\n}\n';
    const ruleIds = lint(code, 'foo.txt');
    expect(ruleIds.some((id) => id?.startsWith('jsdoc/') === true || id?.startsWith('tsdoc/') === true)).toBe(false);
  });

  it('turns off every requirements-tier rule, not just the two exercised above', () => {
    const jsdocBlock = jsdocAndTsdoc[0];
    const requirementsTierRules = [
      'jsdoc/require-example',
      'jsdoc/require-jsdoc',
      'jsdoc/require-next-type',
      'jsdoc/require-param',
      'jsdoc/require-param-description',
      'jsdoc/require-param-name',
      'jsdoc/require-param-type',
      'jsdoc/require-property',
      'jsdoc/require-property-description',
      'jsdoc/require-property-name',
      'jsdoc/require-property-type',
      'jsdoc/require-returns',
      'jsdoc/require-returns-description',
      'jsdoc/require-returns-type',
      'jsdoc/require-template',
      'jsdoc/require-throws-type',
      'jsdoc/require-yields',
      'jsdoc/require-yields-type',
    ];
    for (const rule of requirementsTierRules) {
      expect(jsdocBlock?.rules?.[rule]).toBe('off');
    }
  });
});

// Each snippet is a doc comment a consumer wrote by hand, using a tag that exists in TSDoc (or is a TypeScript modifier tag TSDoc accepts) but not in JSDoc's own vocabulary, or that JSDoc expects to be empty. A tag the config validates against the wrong vocabulary is deleted, rewritten or fought over by --fix, so the whole run must leave the source byte-for-byte unchanged.
const TSDOC_ONLY_TAG_SNIPPETS: readonly (readonly [tag: string, code: string])[] = [
  ['@internal', '/**\n * Does a thing.\n * @internal\n */\nexport function internalThing(): void {}\n'],
  ['@public', '/**\n * Does a thing.\n * @public\n */\nexport function publicThing(): void {}\n'],
  ['@readonly', '/**\n * Holds a thing.\n * @readonly\n */\nexport const readonlyThing = 1;\n'],
  ['@typeParam', '/**\n * Identity.\n * @typeParam T - The value type.\n * @param value - The value.\n */\nexport function identity<T>(value: T): T {\n  return value;\n}\n'],
  ['@virtual', '/**\n * Overridable hook.\n * @virtual\n */\nexport function virtualThing(): void {}\n'],
  ['@override', 'class Base {\n  run(): void {}\n}\n\nexport class Derived extends Base {\n  /**\n   * Replaces the base behaviour.\n   * @override\n   */\n  run(): void {}\n}\n'],
  ['@defaultValue', '/**\n * Retry count.\n * @defaultValue 3\n */\nexport const retries = 3;\n'],
];

describe('jsdocAndTsdoc tag vocabulary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(TSDOC_ONLY_TAG_SNIPPETS)('leaves a hand-written %s tag untouched through verifyAndFix, with no circular-fix warning and no tsdoc/syntax report', (_tag, code) => {
    // ESLint's warning service captures process.emitWarning when the Linter is constructed, so the spy must exist first.
    const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    // A TypeScript parser, so a parse error cannot make the assertions below pass vacuously.
    const config: Linter.Config[] = [{ files: ['**'], languageOptions: { parser: tseslint.parser, sourceType: 'module' } }, ...jsdocAndTsdoc] as Linter.Config[];

    const result = new LinterClass().verifyAndFix(code, config, 'foo.ts');

    expect(result.messages.filter((message) => message.fatal === true)).toStrictEqual([]);
    expect(result.output).toBe(code);
    expect(emitWarning).not.toHaveBeenCalled();
    expect(result.messages.filter((message) => message.ruleId === 'tsdoc/syntax')).toStrictEqual([]);
    expect(result.messages.filter((message) => message.ruleId?.startsWith('jsdoc/') === true)).toStrictEqual([]);
  });

  // jsdoc/empty-tags is off because its fixer deletes any prose written after a modifier tag. jsdoc/valid-types still reports that prose (report only, no fixer), so the author decides what to do with it.
  it('never deletes prose written after a modifier tag: the text survives --fix and is still reported by jsdoc/valid-types', () => {
    const code = '/**\n * Does a thing.\n * @internal Not part of the public API surface.\n */\nexport function internalThing(): void {}\n';
    const config: Linter.Config[] = [{ files: ['**'], languageOptions: { parser: tseslint.parser, sourceType: 'module' } }, ...jsdocAndTsdoc] as Linter.Config[];

    const result = new LinterClass().verifyAndFix(code, config, 'foo.ts');

    expect(result.output).toBe(code);
    expect(result.messages.map((message) => message.ruleId)).toStrictEqual(['jsdoc/valid-types']);
  });
});
