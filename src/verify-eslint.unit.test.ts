import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PublicConfigArray } from './config-types';
import { exadevConfig } from './create-config';
import { assertEslintConfig, normaliseSeverity, verifyEslintConfig, type VerifyEslintOptions } from './verify-eslint';

const FIXTURES = resolve(import.meta.dirname, '__fixtures__/verify-eslint');
const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');

const BASELINE: PublicConfigArray = [{ files: ['**/*.ts'], rules: { 'no-debugger': 'error', 'no-console': 'warn', eqeqeq: 'error', 'no-var': 'off' } }];

function options(directory: string, overrides: Partial<VerifyEslintOptions> = {}): VerifyEslintOptions {
  return { cwd: resolve(FIXTURES, directory), samples: ['src/index.ts'], baseline: BASELINE, ...overrides };
}

describe('normaliseSeverity', () => {
  it.each([
    [0, 'off'],
    [1, 'warn'],
    [2, 'error'],
    ['off', 'off'],
    ['warn', 'warn'],
    ['error', 'error'],
    [[0], 'off'],
    [[1, 'x'], 'warn'],
    [[2, 'always'], 'error'],
    [['error', { a: 1 }], 'error'],
    [['warn'], 'warn'],
  ])('reads %j as %s', (entry, expected) => {
    expect(normaliseSeverity(entry)).toBe(expected);
  });

  it.each([[-1], ['fatal'], [[]], [undefined], [null], [['3']], [{}]])('throws for %j', (entry) => {
    expect(() => normaliseSeverity(entry)).toThrow(/cannot read .* as a rule severity/u);
  });
});

describe('verifyEslintConfig', () => {
  it('finds nothing when every enabled baseline rule is enabled at least as strongly, and ignores a baseline rule that is off', async () => {
    expect(await verifyEslintConfig(options('applied'))).toEqual([]);
  });

  it('reads numeric severities the same as named ones', async () => {
    expect(await verifyEslintConfig(options('numeric'))).toEqual([]);
  });

  it('accepts a stronger severity than the one required', async () => {
    expect(await verifyEslintConfig(options('applied', { baseline: [{ files: ['**/*.ts'], rules: { 'no-debugger': 'warn' } }] }))).toEqual([]);
  });

  it('names the rule and the file of a rule that is off', async () => {
    expect(await verifyEslintConfig(options('off'))).toEqual([
      { kind: 'off', file: 'src/index.ts', rule: 'no-debugger', required: 'error', actual: 'off', message: 'Rule "no-debugger" is off for "src/index.ts" (required: error).' },
    ]);
  });

  it('reports a rule weaker than required', async () => {
    expect(await verifyEslintConfig(options('weak'))).toEqual([
      { kind: 'too-weak', file: 'src/index.ts', rule: 'no-debugger', required: 'error', actual: 'warn', message: 'Rule "no-debugger" is "warn" for "src/index.ts" (required: error).' },
    ]);
  });

  it('reports a rule the config does not mention', async () => {
    const baseline: PublicConfigArray = [{ files: ['**/*.ts'], rules: { 'no-eval': 'warn' } }];
    expect(await verifyEslintConfig(options('applied', { baseline }))).toEqual([
      { kind: 'missing', file: 'src/index.ts', rule: 'no-eval', required: 'warn', message: 'Rule "no-eval" is not configured for "src/index.ts" (required: warn).' },
    ]);
  });

  it('reports a file that ignores exclude, and a file no configuration block matches', async () => {
    expect(await verifyEslintConfig(options('ignored'))).toEqual([{ kind: 'not-linted', file: 'src/index.ts', message: '"src/index.ts" is not linted: it is ignored, or no configuration block matches it.' }]);
    expect(await verifyEslintConfig(options('unmatched'))).toEqual([expect.objectContaining({ kind: 'not-linted', file: 'src/index.ts' })]);
    expect(await verifyEslintConfig(options('unmatched', { samples: ['lib/index.ts'] }))).toEqual([
      expect.objectContaining({ kind: 'missing', file: 'lib/index.ts', rule: 'no-console' }),
      expect.objectContaining({ kind: 'missing', file: 'lib/index.ts', rule: 'eqeqeq' }),
    ]);
  });

  it('checks every sample and reports each file it fails on', async () => {
    const violations = await verifyEslintConfig(options('ignored', { samples: ['lib/index.ts', 'src/index.ts'] }));
    expect(violations.map((violation) => (violation.kind === 'not-linted' ? [violation.kind, violation.file] : [violation.kind, violation.file, violation.rule]))).toEqual([
      ['missing', 'lib/index.ts', 'no-console'],
      ['missing', 'lib/index.ts', 'eqeqeq'],
      ['not-linted', 'src/index.ts'],
    ]);
  });

  it('exempts the excepted rules, for every sample or for one', async () => {
    expect(await verifyEslintConfig(options('off', { except: ['no-debugger'] }))).toEqual([]);
    expect(await verifyEslintConfig(options('off', { samples: [{ path: 'src/index.ts', except: ['no-debugger'] }] }))).toEqual([]);
    expect(await verifyEslintConfig(options('off', { samples: [{ path: 'src/index.ts', except: ['eqeqeq'] }] }))).toHaveLength(1);
  });

  it('requires explicit rules on top of the baseline, and lets them replace the baseline severity', async () => {
    expect(await verifyEslintConfig(options('applied', { rules: { 'no-eval': 'error' } }))).toEqual([expect.objectContaining({ kind: 'missing', rule: 'no-eval', required: 'error' })]);
    expect(await verifyEslintConfig(options('applied', { samples: [{ path: 'src/index.ts', rules: { 'no-console': 'error' } }] }))).toEqual([
      expect.objectContaining({ kind: 'too-weak', rule: 'no-console', required: 'error', actual: 'warn' }),
    ]);
  });

  it('keeps an explicit rule required even when it is also excepted from the baseline', async () => {
    expect(await verifyEslintConfig(options('off', { except: ['no-debugger'], rules: { 'no-debugger': 'error' } }))).toEqual([expect.objectContaining({ kind: 'off', rule: 'no-debugger' })]);
  });

  it('requires only the explicit rules when the baseline is false', async () => {
    expect(await verifyEslintConfig(options('off', { baseline: false }))).toEqual([]);
    expect(await verifyEslintConfig(options('off', { baseline: false, rules: { 'no-debugger': 'warn' } }))).toEqual([expect.objectContaining({ kind: 'off', required: 'warn' })]);
  });

  it('judges the config file it is given instead of the one ESLint finds', async () => {
    const violations = await verifyEslintConfig(options('applied', { configFile: resolve(FIXTURES, 'off/eslint.config.mjs') }));
    expect(violations).toEqual([expect.objectContaining({ kind: 'off', rule: 'no-debugger' })]);
  });

  it('defaults the baseline to this package\'s default export, so a config that enables none of it fails', async () => {
    const violations = await verifyEslintConfig({ cwd: resolve(FIXTURES, 'applied'), samples: ['src/index.ts'] });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((violation) => violation.kind === 'missing' || violation.kind === 'too-weak')).toBe(true);
    expect(violations).toContainEqual(expect.objectContaining({ kind: 'missing', rule: '@typescript-eslint/no-explicit-any' }));
  });

  it('holds this repository to the preset it builds from, on its source, test and manifest files', async () => {
    // The default baseline would also require the React and Next.js rules this repository switches off, so the baseline is the same call its own config makes.
    const baseline = exadevConfig({ react: false, nextjs: false });
    expect(await verifyEslintConfig({ cwd: REPOSITORY_ROOT, baseline, samples: ['src/index.ts', 'src/create-config.unit.test.ts', 'package.json'] })).toEqual([]);
  });

  it('needs at least one sample', async () => {
    await expect(verifyEslintConfig(options('applied', { samples: [] }))).rejects.toThrow('verifyEslintConfig needs at least one sample file');
  });
});

describe('assertEslintConfig', () => {
  it('resolves when the config holds', async () => {
    await expect(assertEslintConfig(options('applied'))).resolves.toBeUndefined();
  });

  it('rejects with one line per violation, naming each rule and file', async () => {
    await expect(assertEslintConfig(options('off', { samples: ['src/a.ts', 'src/b.ts'] }))).rejects.toThrow(
      'ESLint is not applied as required (2 violation(s)):\n  Rule "no-debugger" is off for "src/a.ts" (required: error).\n  Rule "no-debugger" is off for "src/b.ts" (required: error).',
    );
  });
});
