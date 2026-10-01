import { join, parse } from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { plugin } from '../index';
import { relativeToCwd } from './file-scope';
import rule, { readCompilerOptionRequirements } from './require-compiler-options';

const FIXTURES = join(import.meta.dirname, '__fixtures__', 'compiler-options');

// The typed RuleTester lints with the filesystem root of the file as ESLint's working directory, and the rule names the tsconfig relative to that directory.
const tsconfigLabel = (name: string): string => relativeToCwd(join(FIXTURES, name), parse(FIXTURES).root);

describe('require-compiler-options meta', () => {
  it('names its docs page after the rule file', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/require-compiler-options.ts');
  });

  it('says in its message that the lint program and the build must agree', () => {
    expect(rule.meta.messages.differs).toBe(
      'The effective compiler options of {{ tsconfig }} differ from the required ones: {{ differences }}. ESLint type-checks against this tsconfig, so the build must use the same one for the check to mean anything.',
    );
  });
});

describe('readCompilerOptionRequirements', () => {
  it('reads one requirement per option, in the order given', () => {
    expect(readCompilerOptionRequirements({ strict: true, target: ['es2022', 'esnext'] }).map((requirement) => requirement.name)).toStrictEqual(['strict', 'target']);
  });

  it('reads an empty object as no requirements', () => {
    expect(readCompilerOptionRequirements({})).toStrictEqual([]);
  });

  it('rejects options that are not an object', () => {
    expect(() => readCompilerOptionRequirements('strict')).toThrow(/"exadev\/require-compiler-options" options must be an object/u);
    expect(() => readCompilerOptionRequirements(['strict'])).toThrow(/options must be an object/u);
  });

  it('rejects a value that is not true, false or a non-empty list of scalars, naming the option', () => {
    expect(() => readCompilerOptionRequirements({ strict: 'yes' })).toThrow(/needs "strict" to be true, false or a non-empty list/u);
    expect(() => readCompilerOptionRequirements({ target: [] })).toThrow(/needs "target" to be true, false or a non-empty list/u);
    expect(() => readCompilerOptionRequirements({ target: [{}] })).toThrow(/needs "target" to be true, false or a non-empty list/u);
  });

  it('rejects an option the compiler does not know', () => {
    expect(() => readCompilerOptionRequirements({ stricter: true })).toThrow(/Unknown compiler option 'stricter'/u);
  });
});

function testerFor(tsconfig: string): RuleTester {
  return new RuleTester({
    languageOptions: { parserOptions: { project: [`./${tsconfig}`], projectService: false, tsconfigRootDir: FIXTURES } },
  });
}

const code = 'export const value = 1;';

// The rule reports once per program and option set within a run, and a program is shared by the cases below, so each case lints the same file once and is the first of its own run.
testerFor('tsconfig.inherits.json').run('require-compiler-options with an inherited configuration', rule, {
  valid: [
    // strict and target come from the extended base, not from this file.
    { code, filename: 'source.ts', options: [{ strict: true }] },
    { code, filename: 'source.ts', options: [{ noUncheckedIndexedAccess: true, target: ['es2022', 'esnext'] }] },
    // Flags strict controls follow it when they are not set themselves.
    { code, filename: 'source.ts', options: [{ strictNullChecks: true, noImplicitAny: true }] },
    // An unset flag with a plain documented default of false satisfies `false`.
    { code, filename: 'source.ts', options: [{ verbatimModuleSyntax: false }] },
    // The tsconfig states noUnusedParameters; typescript-eslint forces both unused flags on in the lint program, which the rule does not read.
    { code, filename: 'source.ts', options: [{ noUnusedParameters: true }] },
    // No requirements, nothing to report.
    { code, filename: 'source.ts', options: [{}] },
  ],
  invalid: [
    {
      code,
      filename: 'source.ts',
      options: [{ skipLibCheck: false }],
      errors: [{ messageId: 'differs', data: { tsconfig: tsconfigLabel('tsconfig.inherits.json'), differences: 'skipLibCheck is true, required false' } }],
    },
    {
      code,
      filename: 'source.ts',
      options: [{ target: ['es2024', 'esnext'] }],
      errors: [{ messageId: 'differs', data: { tsconfig: tsconfigLabel('tsconfig.inherits.json'), differences: 'target is es2022, required one of es2024, esnext' } }],
    },
    // The tsconfig leaves noUnusedLocals unset although the lint program has it on.
    {
      code,
      filename: 'source.ts',
      options: [{ noUnusedLocals: true }],
      errors: [{ messageId: 'differs', data: { tsconfig: tsconfigLabel('tsconfig.inherits.json'), differences: 'noUnusedLocals is false, required true' } }],
    },
    // An option whose unset state is neither true nor false is reported as not set, even when `false` is required.
    {
      code,
      filename: 'source.ts',
      options: [{ allowUnreachableCode: false }],
      errors: [{ messageId: 'differs', data: { tsconfig: tsconfigLabel('tsconfig.inherits.json'), differences: 'allowUnreachableCode is not set, required false' } }],
    },
  ],
});

testerFor('tsconfig.unused.json').run('require-compiler-options with the unused flags turned off', rule, {
  valid: [],
  invalid: [
    {
      code,
      filename: 'source.ts',
      options: [{ noUnusedLocals: true, noUnusedParameters: true }],
      errors: [{ messageId: 'differs', data: { tsconfig: tsconfigLabel('tsconfig.unused.json'), differences: 'noUnusedLocals is false, required true; noUnusedParameters is false, required true' } }],
    },
  ],
});

testerFor('tsconfig.loose.json').run('require-compiler-options with an overriding configuration', rule, {
  valid: [{ code, filename: 'source.ts', options: [{ skipLibCheck: true }] }],
  invalid: [
    {
      code,
      filename: 'source.ts',
      options: [{ strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true }],
      errors: [
        {
          messageId: 'differs',
          data: {
            tsconfig: tsconfigLabel('tsconfig.loose.json'),
            differences: 'strict is false, required true; noUncheckedIndexedAccess is false, required true; exactOptionalPropertyTypes is false, required true',
          },
        },
      ],
    },
    // A flag strict controls is judged on its effective value, so strict: false turns it off.
    {
      code,
      filename: 'source.ts',
      options: [{ strictNullChecks: true }],
      errors: [{ messageId: 'differs', data: { tsconfig: tsconfigLabel('tsconfig.loose.json'), differences: 'strictNullChecks is false, required true' } }],
    },
    {
      code,
      filename: 'source.ts',
      options: [{ target: ['es2022'] }],
      errors: [{ messageId: 'differs', data: { tsconfig: tsconfigLabel('tsconfig.loose.json'), differences: 'target is es2020, required es2022' } }],
    },
  ],
});

describe('require-compiler-options once per program', () => {
  function onceEslint(): ESLint {
    return new ESLint({
      cwd: FIXTURES,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: tseslint.parser, parserOptions: { project: ['./tsconfig.once.json'], projectService: false, tsconfigRootDir: FIXTURES } },
          plugins: { exadev: plugin },
          rules: { 'exadev/require-compiler-options': ['error', { strict: true }] },
        },
      ],
    });
  }

  it('reports once for a program shared by several linted files', async () => {
    const results = await onceEslint().lintFiles(['source.ts', 'second.ts']);
    const messages = results.flatMap((result) => result.messages);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe('exadev/require-compiler-options');
    expect(messages[0]?.line).toBe(1);
    expect(messages[0]?.message).toContain('strict is false, required true');
  });

  it('reports again in the next run of one long-lived ESLint instance while the tsconfig still violates the requirement', async () => {
    const eslint = onceEslint();
    const first = await eslint.lintFiles(['source.ts', 'second.ts']);
    const second = await eslint.lintFiles(['source.ts', 'second.ts']);
    expect(first.flatMap((result) => result.messages)).toHaveLength(1);
    expect(second.flatMap((result) => result.messages)).toHaveLength(1);
  });

  it('starts a new run at the first file the previous run had already linted', async () => {
    const eslint = onceEslint();
    await eslint.lintFiles(['source.ts', 'second.ts']);
    const results = await eslint.lintFiles(['second.ts']);
    expect(results.flatMap((result) => result.messages)).toHaveLength(1);
  });
});
