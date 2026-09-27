import { Linter, RuleTester } from 'eslint';
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

// The rule's own meta.schema is the FIRST line of defence against a bad `{ kinds }` option, rejected by ESLint itself before create() ever runs. A plain Linter instance, not ruleTester.run: a schema-validation failure surfaces deep inside RuleTester's own nested, deferred it() registration rather than as a synchronous throw back to the caller (see barrel-policy.unit.test.ts's own identical comment on this), so Linter#verify is what actually lets these assert the rejection directly.
const schemaLinter = new Linter();
const schemaLintConfig = [{ files: ['**'], plugins: { exadev: { rules: { 'test-file-kind': rule } } } }];

function lintWithOptions(options: unknown): void {
  schemaLinter.verify('test();', [...schemaLintConfig, { rules: { 'exadev/test-file-kind': ['error', options] } }], 'src/foo.unit.test.ts');
}

describe('test-file-kind meta.messages', () => {
  const { meta } = rule;
  if (meta === undefined) throw new Error('Unreachable: the rule always defines its own meta object literal.');

  it('carries the exact missingKind message text', () => {
    expect(meta.messages?.['missingKind']).toBe(
      "Test file names must declare their test kind via a filename suffix (e.g. 'foo.unit.test.ts'). '{{ filename }}' has none — expected one of: {{ kinds }}.",
    );
  });

  it('carries the exact invalidKind message text', () => {
    expect(meta.messages?.['invalidKind']).toBe(
      "Test file names must declare a recognised test kind via a filename suffix. '{{ filename }}' declares '{{ found }}', which is not one of: {{ kinds }}.",
    );
  });
});

describe('test-file-kind schema', () => {
  it('accepts an options object with no kinds key at the schema level', () => {
    expect(() => {
      lintWithOptions({});
    }).not.toThrow();
  });

  it('accepts a kinds array holding at least one string', () => {
    expect(() => {
      lintWithOptions({ kinds: ['unit'] });
    }).not.toThrow();
  });

  it('rejects a non-array kinds value at the schema level', () => {
    expect(() => {
      lintWithOptions({ kinds: 'unit' });
    }).toThrow(/should be array/);
  });

  it('rejects a kinds array holding a non-string element at the schema level', () => {
    expect(() => {
      lintWithOptions({ kinds: [1] });
    }).toThrow(/should be string/);
  });

  it('rejects an empty kinds array at the schema level (minItems: 1)', () => {
    expect(() => {
      lintWithOptions({ kinds: [] });
    }).toThrow(/should NOT have fewer than 1 items/);
  });

  it('rejects an unrecognised property alongside kinds at the schema level', () => {
    expect(() => {
      lintWithOptions({ kinds: ['unit'], extra: true });
    }).toThrow(/should NOT have additional properties/);
  });

  it('rejects a non-object options value at the schema level', () => {
    expect(() => {
      lintWithOptions('unit');
    }).toThrow(/should be object/);
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
