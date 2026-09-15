import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import tseslint from 'typescript-eslint';
import rule, { readKinds } from './test-file-kind';

describe('readKinds', () => {
  it('returns the default kinds when no kinds option is given', () => {
    expect(readKinds({})).toStrictEqual(['unit', 'integration', 'e2e']);
  });

  it('returns the configured kinds when given', () => {
    expect(readKinds({ kinds: ['smoke'] })).toStrictEqual(['smoke']);
  });

  it('throws for a non-object options value — a safety net behind the rule schema, which real linting always enforces first', () => {
    expect(() => readKinds('nonsense')).toThrow(/Unreachable/);
  });

  it('throws for null', () => {
    expect(() => readKinds(null)).toThrow(/Unreachable/);
  });

  it('throws when kinds is present but is not an array', () => {
    expect(() => readKinds({ kinds: 'unit' })).toThrow(/Unreachable/);
  });

  it('throws when kinds is an array containing a non-string element', () => {
    const nonStringElement = 42;
    expect(() => readKinds({ kinds: ['unit', nonStringElement] })).toThrow(/Unreachable/);
  });
});

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });

ruleTester.run('test-file-kind', rule, {
  valid: [
    // A non-test file is out of this rule's scope entirely, regardless of its own name.
    { code: 'export const x = 1;', filename: './src/foo.ts' },
    { code: 'export const x = 1;', filename: './src/foo.unit.ts' },
    // Every default kind, for both the .test. and .spec. forms.
    { code: 'test();', filename: './src/foo.unit.test.ts' },
    { code: 'test();', filename: './src/foo.integration.test.ts' },
    { code: 'test();', filename: './src/foo.e2e.test.ts' },
    { code: 'test();', filename: './src/foo.unit.spec.ts' },
    { code: 'test();', filename: './src/foo.integration.spec.ts' },
    { code: 'test();', filename: './src/foo.e2e.spec.ts' },
    // A name part carrying its own further dots still resolves the kind correctly.
    { code: 'test();', filename: './src/foo.bar.baz.unit.test.ts' },
    // A configured kinds list accepts a kind outside the default set.
    { code: 'test();', filename: './src/foo.smoke.test.ts', options: [{ kinds: ['smoke'] }] },
  ],
  invalid: [
    // No kind tag at all.
    {
      code: 'test();',
      filename: './src/foo.test.ts',
      errors: [{ messageId: 'missingKind', data: { filename: './src/foo.test.ts', kinds: 'unit, integration, e2e' } }],
    },
    {
      code: 'test();',
      filename: './src/foo.spec.ts',
      errors: [{ messageId: 'missingKind', data: { filename: './src/foo.spec.ts', kinds: 'unit, integration, e2e' } }],
    },
    // A kind tag that is not one of the configured (default) kinds.
    {
      code: 'test();',
      filename: './src/foo.smoke.test.ts',
      errors: [{ messageId: 'invalidKind', data: { filename: './src/foo.smoke.test.ts', found: 'smoke', kinds: 'unit, integration, e2e' } }],
    },
    // A configured kinds list still rejects a kind outside that configured set (not merely outside the default set).
    {
      code: 'test();',
      filename: './src/foo.unit.test.ts',
      options: [{ kinds: ['smoke'] }],
      errors: [{ messageId: 'invalidKind', data: { filename: './src/foo.unit.test.ts', found: 'unit', kinds: 'smoke' } }],
    },
  ],
});
