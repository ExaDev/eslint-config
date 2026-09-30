import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule, { readRequiredExportsEntries } from './required-exports';

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

const ERRORS_FILE = 'packages/contract/src/errors.ts';
const ERRORS: readonly [unknown] = [[{ files: '**/contract/src/errors.ts', exports: ['ContractError', 'contractErrorSchema'] }]];

describe('required-exports metadata', () => {
  it('names its docs page after the rule file', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/required-exports.ts');
  });

  it('rejects an option that is not an array of entries', () => {
    expect(() => readRequiredExportsEntries({ files: 'x.ts', exports: ['a'] })).toThrow(/must be an array of objects/u);
  });

  it('rejects an unknown key, an empty or duplicated export list and an entry without a scope', () => {
    const read = (entry: unknown) => () => readRequiredExportsEntries([entry]);
    expect(read({ files: 'x.ts', exports: ['a'], nope: true })).toThrow(/unknown key "nope"/u);
    expect(read({ files: 'x.ts', exports: [] })).toThrow(/non-empty array of distinct non-empty strings/u);
    expect(read({ files: 'x.ts', exports: ['a', 'a'] })).toThrow(/non-empty array of distinct non-empty strings/u);
    expect(read({ exports: ['a'] })).toThrow(/must be an array of glob strings/u);
  });
});

ruleTester.run('required-exports', rule, {
  valid: [
    // Not in scope: no-ops whatever the file contains.
    { code: 'export const other = 1;', filename: 'packages/contract/src/other.ts', options: ERRORS },
    { code: '', filename: 'src/errors.ts', options: ERRORS },
    // No entries: nothing required.
    { code: '', filename: ERRORS_FILE, options: [[]] },
    {
      code: 'export class ContractError extends Error {}\nexport const contractErrorSchema = {};',
      filename: ERRORS_FILE,
      options: ERRORS,
    },
    // Names arrive through specifiers, aliases, type-only exports and re-exports.
    {
      code: "class A {}\nconst schema = {};\nexport { A as ContractError, schema as contractErrorSchema };",
      filename: ERRORS_FILE,
      options: ERRORS,
    },
    {
      code: "export type { ContractError } from './types';\nexport { contractErrorSchema } from './schema';",
      filename: ERRORS_FILE,
      options: ERRORS,
    },
    { code: "export * as ContractError from './a';\nexport { schema as contractErrorSchema } from './b';", filename: ERRORS_FILE, options: ERRORS },
    { code: "export type ContractError = string;\nexport interface contractErrorSchema {}", filename: ERRORS_FILE, options: ERRORS },
    { code: "export enum ContractError { A }\nexport namespace contractErrorSchema { export const x = 1; }", filename: ERRORS_FILE, options: ERRORS },
    { code: "export function ContractError() {}\nexport declare function contractErrorSchema(): void;", filename: ERRORS_FILE, options: ERRORS },
    { code: 'export const { ContractError, nested: [contractErrorSchema] } = source;', filename: ERRORS_FILE, options: ERRORS },
    { code: 'export const { ContractError = 1, ...contractErrorSchema } = source;', filename: ERRORS_FILE, options: ERRORS },
    { code: 'export const [ContractError = 1, ...contractErrorSchema] = source;', filename: ERRORS_FILE, options: ERRORS },
    { code: "export { x as 'ContractError', y as contractErrorSchema };", filename: ERRORS_FILE, options: ERRORS },
    // default is a name like any other.
    { code: 'export default function () {}', filename: 'src/fake.ts', options: [[{ files: 'fake.ts', exports: ['default'] }]] },
    { code: 'export default class {}', filename: 'src/fake.ts', options: [[{ files: 'fake.ts', exports: ['default'] }]] },
    { code: 'export { x as default };', filename: 'src/fake.ts', options: [[{ files: 'fake.ts', exports: ['default'] }]] },
    // A bare filename pattern matches at any depth, and an exclude removes a file from the scope.
    { code: 'export const createFake = () => 1;', filename: 'a/b/fake.ts', options: [[{ files: 'fake.ts', exports: ['createFake'] }]] },
    { code: '', filename: 'src/skip/fake.ts', options: [[{ files: ['fake.ts', '!src/skip/fake.ts'], exports: ['createFake'] }]] },
    // Two matching entries both apply: the union is required and present.
    {
      code: 'export const a = 1;\nexport const b = 2;',
      filename: 'src/fake.ts',
      options: [
        [
          { files: 'fake.ts', exports: ['a'] },
          { files: 'src/*.ts', exports: ['b'] },
        ],
      ],
    },
  ],
  invalid: [
    {
      code: '',
      filename: ERRORS_FILE,
      options: ERRORS,
      errors: [{ messageId: 'missingExports', data: { names: 'ContractError, contractErrorSchema' }, line: 1 }],
    },
    // Only the missing names are listed.
    {
      code: 'export class ContractError extends Error {}',
      filename: ERRORS_FILE,
      options: ERRORS,
      errors: [{ messageId: 'missingExports', data: { names: 'contractErrorSchema' } }],
    },
    // A local declaration that is not exported does not count.
    {
      code: 'const ContractError = 1;\nconst contractErrorSchema = 2;\nexport const other = 3;',
      filename: ERRORS_FILE,
      options: ERRORS,
      errors: [{ messageId: 'missingExports', data: { names: 'ContractError, contractErrorSchema' } }],
    },
    // A bare `export *` forwards names this rule cannot see, so it satisfies nothing.
    {
      code: "export * from './everything';",
      filename: ERRORS_FILE,
      options: ERRORS,
      errors: [{ messageId: 'missingExports', data: { names: 'ContractError, contractErrorSchema' } }],
    },
    // `export =` and an ambient module declaration name nothing this rule counts.
    {
      code: "declare module 'x' {}\nexport declare module 'y' {}",
      filename: ERRORS_FILE,
      options: ERRORS,
      errors: [{ messageId: 'missingExports' }],
    },
    // default is missing when only a named export exists.
    {
      code: 'export const createFake = 1;',
      filename: 'src/fake.ts',
      options: [[{ files: 'fake.ts', exports: ['default'] }]],
      errors: [{ messageId: 'missingExports', data: { names: 'default' } }],
    },
    // Overlapping entries are reported once, deduplicated, in first-seen order.
    {
      code: '',
      filename: 'src/fake.ts',
      options: [
        [
          { files: 'fake.ts', exports: ['a', 'b'] },
          { files: 'src/*.ts', exports: ['b', 'c'] },
        ],
      ],
      errors: [{ messageId: 'missingExports', data: { names: 'a, b, c' } }],
    },
    // A bare filename pattern is anchored to whole names: `fake.ts` does not select `notfake.ts`, but `**/fake.ts` style depth does.
    {
      code: '',
      filename: 'deep/er/fake.ts',
      options: [[{ files: 'fake.ts', exports: ['createFake'] }]],
      errors: [{ messageId: 'missingExports' }],
    },
  ],
});
