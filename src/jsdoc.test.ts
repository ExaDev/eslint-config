import type { Linter } from 'eslint';
import { Linter as LinterClass } from 'eslint';
import { describe, expect, it } from 'vitest';
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
