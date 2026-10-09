import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule, { readRequiredImportsEntries } from './required-imports';

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

const ADAPTER_TEST = 'packages/adapters/pg/src/pg.test.ts';
const KIT_GLOB = '**/contract/src/*conformance*';
const PACKAGE_KIT = '@acme/contract/conformance';
const CALLED: readonly [unknown] = [[{ files: '**/adapters/*/src/**/*.test.ts', from: [KIT_GLOB, PACKAGE_KIT], call: true }]];
const IMPORTED: readonly [unknown] = [[{ files: '**/adapters/*/src/**/*.test.ts', from: [KIT_GLOB, PACKAGE_KIT] }]];

describe('required-imports options', () => {
  it('names its docs page after the rule file', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/required-imports.ts');
  });

  it('accepts a single string or a list for from, and defaults call to false', () => {
    const [single, list] = readRequiredImportsEntries([
      { files: 'a.ts', from: 'x' },
      { files: 'a.ts', from: ['x', 'y'], call: true },
    ]);
    expect(single?.from).toStrictEqual(['x']);
    expect(single?.call).toBe(false);
    expect(list?.from).toStrictEqual(['x', 'y']);
    expect(list?.call).toBe(true);
  });

  it('rejects malformed entries', () => {
    const read = (entry: unknown) => () => readRequiredImportsEntries([entry]);
    expect(() => readRequiredImportsEntries('nope')).toThrow(/must be an array of objects/u);
    expect(read({ files: 'a.ts', from: 'x', nope: 1 })).toThrow(/unknown key "nope"/u);
    expect(read({ files: 'a.ts' })).toThrow(/"from"/u);
    expect(read({ files: 'a.ts', from: [] })).toThrow(/"from"/u);
    expect(read({ files: 'a.ts', from: 'x', call: 'yes' })).toThrow(/"call" to be a boolean/u);
    expect(read({ from: 'x' })).toThrow(/glob strings/u);
    expect(read({ files: 'a.ts', from: ['x', '@(a|b)/y'] })).toThrow(/"exadev\/required-imports\.from" must not use extglob syntax/u);
  });
});

ruleTester.run('required-imports', rule, {
  valid: [
    // Out of scope.
    { code: 'export const x = 1;', filename: 'packages/adapters/pg/src/pg.ts', options: CALLED },
    { code: '', filename: ADAPTER_TEST, options: [[]] },
    // The relative form, resolved against the file's own directory, and called at module top level with a factory.
    {
      code: "import { runConformance } from '../../../contract/src/conformance';\nrunConformance({ describe, it }, factory);",
      filename: ADAPTER_TEST,
      options: CALLED,
    },
    // The package form of the same kit.
    { code: "import { runConformance } from '@acme/contract/conformance';\nrunConformance({ describe, it }, factory);", filename: ADAPTER_TEST, options: CALLED },
    { code: "import { runConformance } from '@acme/contract/conformance/pg';\nrunConformance(a);", filename: ADAPTER_TEST, options: CALLED },
    // Default and namespace imports; a namespace member call and a call inside a callback count.
    { code: "import kit from '@acme/contract/conformance';\nkit(a);", filename: ADAPTER_TEST, options: CALLED },
    { code: "import * as kit from '@acme/contract/conformance';\nkit.run(a);", filename: ADAPTER_TEST, options: CALLED },
    { code: "import * as kit from '@acme/contract/conformance';\nkit.nested.run?.(a);", filename: ADAPTER_TEST, options: CALLED },
    { code: "import { run } from '@acme/contract/conformance';\ndescribe('x', () => { run(a); });", filename: ADAPTER_TEST, options: CALLED },
    // A construction, a non-null-asserted callee and a tagged template invoke the binding too.
    { code: "import { Kit } from '@acme/contract/conformance';\nnew Kit(a);", filename: ADAPTER_TEST, options: CALLED },
    { code: "import { run } from '@acme/contract/conformance';\nrun!(a);", filename: ADAPTER_TEST, options: CALLED },
    { code: "import * as kit from '@acme/contract/conformance';\nkit.run!(a);", filename: ADAPTER_TEST, options: CALLED },
    { code: "import { run } from '@acme/contract/conformance';\nrun`x`;", filename: ADAPTER_TEST, options: CALLED },
    // Without call, a bare import of a binding is enough, even unused.
    { code: "import { run } from '@acme/contract/conformance';", filename: ADAPTER_TEST, options: IMPORTED },
    { code: "import { type Kit, run } from '@acme/contract/conformance';", filename: ADAPTER_TEST, options: IMPORTED },
    // One satisfying declaration among several from the same kit is enough.
    {
      code: "import type { Kit } from '@acme/contract/conformance';\nimport { run } from '@acme/contract/conformance';\nrun(a);",
      filename: ADAPTER_TEST,
      options: CALLED,
    },
    // Several entries: each is satisfied by its own import.
    {
      code: "import { a } from 'first';\nimport { b } from 'second';\na();\nb();",
      filename: 'src/x.ts',
      options: [
        [
          { files: 'x.ts', from: 'first', call: true },
          { files: 'src/*.ts', from: 'second', call: true },
        ],
      ],
    },
  ],
  invalid: [
    { code: 'export const x = 1;', filename: ADAPTER_TEST, options: CALLED, errors: [{ messageId: 'missingImport', data: { from: `${KIT_GLOB}, ${PACKAGE_KIT}` }, line: 1 }] },
    // A specifier that does not match the pattern.
    { code: "import { run } from '@acme/other';\nrun();", filename: ADAPTER_TEST, options: CALLED, errors: [{ messageId: 'missingImport' }] },
    // A relative import outside the kit's directory.
    { code: "import { run } from '../conformance-helpers';\nrun();", filename: ADAPTER_TEST, options: CALLED, errors: [{ messageId: 'missingImport' }] },
    // Side-effect, type-only and all-inline-type imports bind no runtime value.
    { code: "import '@acme/contract/conformance';", filename: ADAPTER_TEST, options: IMPORTED, errors: [{ messageId: 'missingImport' }] },
    { code: "import type { Kit } from '@acme/contract/conformance';", filename: ADAPTER_TEST, options: IMPORTED, errors: [{ messageId: 'missingImport' }] },
    { code: "import { type Kit } from '@acme/contract/conformance';", filename: ADAPTER_TEST, options: IMPORTED, errors: [{ messageId: 'missingImport' }] },
    // Imported but never called: unused, merely referenced, or passed as a value.
    {
      code: "import { run } from '@acme/contract/conformance';",
      filename: ADAPTER_TEST,
      options: CALLED,
      errors: [{ messageId: 'missingCall', data: { from: `${KIT_GLOB}, ${PACKAGE_KIT}` } }],
    },
    { code: "import { run } from '@acme/contract/conformance';\nregister(run);", filename: ADAPTER_TEST, options: CALLED, errors: [{ messageId: 'missingCall' }] },
    { code: "import { run } from '@acme/contract/conformance';\nother.run(run);", filename: ADAPTER_TEST, options: CALLED, errors: [{ messageId: 'missingCall' }] },
    { code: "import { run } from '@acme/contract/conformance';\nconst x = run.length;", filename: ADAPTER_TEST, options: CALLED, errors: [{ messageId: 'missingCall' }] },
    // An argument of a construction or a tagged template is not the invoked binding.
    { code: "import { run } from '@acme/contract/conformance';\nnew Other(run);", filename: ADAPTER_TEST, options: CALLED, errors: [{ messageId: 'missingCall' }] },
    { code: "import { run } from '@acme/contract/conformance';\nother`${run}`;", filename: ADAPTER_TEST, options: CALLED, errors: [{ messageId: 'missingCall' }] },
    // Used as a computed key, the binding is not what is called.
    { code: "import { run } from '@acme/contract/conformance';\nother[run]();", filename: ADAPTER_TEST, options: CALLED, errors: [{ messageId: 'missingCall' }] },
    // A call to something else does not satisfy it.
    { code: "import { run } from '@acme/contract/conformance';\nother();", filename: ADAPTER_TEST, options: CALLED, errors: [{ messageId: 'missingCall' }] },
    // Each unsatisfied entry reports.
    {
      code: '',
      filename: 'src/x.ts',
      options: [
        [
          { files: 'x.ts', from: 'first' },
          { files: 'src/*.ts', from: 'second' },
        ],
      ],
      errors: [{ messageId: 'missingImport', data: { from: 'first' } }, { messageId: 'missingImport', data: { from: 'second' } }],
    },
  ],
});
