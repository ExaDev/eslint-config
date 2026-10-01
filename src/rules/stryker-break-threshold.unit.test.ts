import { RuleTester } from '@typescript-eslint/rule-tester';
import { TSESLint } from '@typescript-eslint/utils';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import rule, { createStrykerBreakThresholdRule, readBreakThresholdOptions } from './stryker-break-threshold';

describe('stryker-break-threshold meta', () => {
  it('names its docs page after the rule file and says why a missing break matters', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/stryker-break-threshold.ts');
    expect(rule.meta.messages.missingBreak).toBe(
      '`thresholds.break` is {{ state }}, so a mutation run never fails however low the score falls. Set it to the lowest mutation score the suite is allowed to reach.',
    );
    expect(rule.meta.messages.belowFloor).toBe(
      '`thresholds.break` is {{ value }}, below the floor of {{ floor }} {{ source }}. A lower value lets this config fall further than the floor allows without failing the run.',
    );
  });
});

const FULL_SCORE = 100;

describe('readBreakThresholdOptions', () => {
  it('has no floor and the built-in scope by default', () => {
    const read = readBreakThresholdOptions({});
    expect(read.min).toBeUndefined();
    expect(read.base).toBeUndefined();
    expect(read.inScope('/repo/stryker.config.ts', '/repo')).toBe(true);
    expect(read.inScope('/repo/vitest.config.ts', '/repo')).toBe(false);
  });

  it('reads a minimum from 0 to 100 and a file reference', () => {
    expect(readBreakThresholdOptions({ min: 0 }).min).toBe(0);
    expect(readBreakThresholdOptions({ min: FULL_SCORE }).min).toBe(FULL_SCORE);
    expect(readBreakThresholdOptions({ base: { path: 'a.ts', relativeTo: 'root' } }).base).toStrictEqual({ path: 'a.ts', relativeTo: 'root' });
  });

  it('rejects a malformed option, naming it', () => {
    expect(() => readBreakThresholdOptions('min')).toThrow(/"exadev\/stryker-break-threshold" options must be an object/u);
    expect(() => readBreakThresholdOptions({ low: 1 })).toThrow(/unknown key "low"/u);
    expect(() => readBreakThresholdOptions({ min: -1 })).toThrow(/needs "min" to be a number from 0 to 100/u);
    expect(() => readBreakThresholdOptions({ min: 101 })).toThrow(/needs "min" to be a number from 0 to 100/u);
    expect(() => readBreakThresholdOptions({ min: Number.NaN })).toThrow(/needs "min" to be a number from 0 to 100/u);
    expect(() => readBreakThresholdOptions({ min: '50' })).toThrow(/needs "min" to be a number from 0 to 100/u);
    expect(() => readBreakThresholdOptions({ base: 'a.ts' })).toThrow(/"exadev\/stryker-break-threshold base" must be/u);
  });
});

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });

const FILENAME = 'stryker.config.ts';
const missing = (state: string) => ({ messageId: 'missingBreak' as const, data: { state } });

ruleTester.run('stryker-break-threshold', rule, {
  valid: [
    { code: 'export default { thresholds: { break: 80 } };', filename: FILENAME },
    { code: 'export default { thresholds: { break: 0 } };', filename: FILENAME },
    { code: 'export default { thresholds: { high: 90, low: 70, break: 50 } } satisfies PartialStrykerOptions;', filename: FILENAME },
    { code: 'module.exports = { thresholds: { break: 80 } };', filename: 'stryker.conf.cjs' },
    // Not visible, so not judged.
    { code: 'export default { thresholds: { break: shared } };', filename: FILENAME },
    { code: 'export default { thresholds: { break: shared.break } };', filename: FILENAME },
    { code: 'export default { thresholds: { ...shared } };', filename: FILENAME },
    { code: 'export default { thresholds: shared };', filename: FILENAME },
    { code: 'export default { ...shared };', filename: FILENAME },
    { code: 'export default buildConfig({});', filename: FILENAME },
    // A floor met exactly, and one computed at run time.
    { code: 'export default { thresholds: { break: 70 } };', filename: FILENAME, options: [{ min: 70 }] },
    { code: 'export default { thresholds: { break: floor } };', filename: FILENAME, options: [{ min: 70 }] },
    // Out of scope.
    { code: 'export default {};', filename: 'config.ts' },
    { code: 'export default {};', filename: 'vitest.config.ts' },
    { code: 'export default {};', filename: 'packages/a/tests.config.ts', options: [{ files: ['stryker.config.ts'] }] },
  ],
  invalid: [
    { code: 'export default {};', filename: FILENAME, errors: [{ ...missing('not set'), line: 1, column: 16 }] },
    { code: 'export default { thresholds: { high: 90, low: 70 } };', filename: FILENAME, errors: [{ ...missing('not set'), line: 1, column: 18 }] },
    { code: 'export default { thresholds: { break: null } };', filename: FILENAME, errors: [{ ...missing('null'), line: 1, column: 32 }] },
    { code: 'export default { thresholds: { break: undefined } };', filename: FILENAME, errors: [missing('null')] },
    { code: "export default { thresholds: { break: '80' } };", filename: FILENAME, errors: [missing('not a number')] },
    { code: 'export default { thresholds: { break: true } };', filename: FILENAME, errors: [missing('not a number')] },
    { code: 'const thresholds = { low: 50 }; export default { thresholds };', filename: FILENAME, errors: [missing('not set')] },
    { code: 'module.exports = {};', filename: '.stryker.conf.js', errors: [missing('not set')] },
    { code: 'export default {};', filename: 'packages/a/stryker.mutation.config.mjs', errors: [missing('not set')] },
    // A minimum that the value does not reach: a value of 2 never fails a real run.
    {
      code: 'export default { thresholds: { break: 2 } };',
      filename: FILENAME,
      options: [{ min: 50 }],
      errors: [{ messageId: 'belowFloor', data: { value: '2', floor: '50', source: 'set by the "min" option' }, line: 1, column: 32 }],
    },
    {
      code: 'export default { thresholds: { break: -5 } };',
      filename: FILENAME,
      options: [{ min: 0 }],
      errors: [{ messageId: 'belowFloor', data: { value: '-5', floor: '0', source: 'set by the "min" option' } }],
    },
  ],
});

const baseFs = createMemoryFs({
  '/repo/pnpm-workspace.yaml': 'packages: []\n',
  '/repo/stryker.base.ts': 'export default { thresholds: { high: 95, low: 85, break: 80 } };\n',
  '/repo/packages/a/placeholder.txt': '',
  '/repo/no-break.ts': 'export default { thresholds: { low: 85 } };\n',
  '/repo/computed.ts': 'export default { thresholds: { break: shared } };\n',
  '/repo/second.ts': 'const first = { thresholds: { low: 1 } }; export default [first, { thresholds: { break: 60 } }];\n',
  '/repo/base.cjs': 'module.exports = { thresholds: { break: 65 } };\n',
});
const withBase = createStrykerBreakThresholdRule(baseFs);
const belowBase = (value: string, floor: string, path: string) => ({
  messageId: 'belowFloor' as const,
  data: { value, floor, source: `declared in the shared base config ${path}` },
});

ruleTester.run('stryker-break-threshold with a shared base', withBase, {
  valid: [
    // Meeting or exceeding the base.
    { code: 'export default { thresholds: { break: 80 } };', filename: '/repo/packages/a/stryker.config.ts', options: [{ base: { path: '../../stryker.base.ts' } }] },
    { code: 'export default { thresholds: { break: 95 } };', filename: '/repo/packages/a/stryker.config.ts', options: [{ base: { path: '../../stryker.base.ts' } }] },
    // The base located from the workspace root, and a CommonJS base.
    { code: 'export default { thresholds: { break: 80 } };', filename: '/repo/packages/a/stryker.config.ts', options: [{ base: { path: 'stryker.base.ts', relativeTo: 'root' } }] },
    { code: 'export default { thresholds: { break: 65 } };', filename: '/repo/packages/a/stryker.config.ts', options: [{ base: { path: '../../base.cjs' } }] },
    // The first object with a visible numeric break decides.
    { code: 'export default { thresholds: { break: 60 } };', filename: '/repo/packages/a/stryker.config.ts', options: [{ base: { path: '../../second.ts' } }] },
    // A value that is not visible is not compared.
    { code: 'export default { thresholds: { break: local } };', filename: '/repo/packages/a/stryker.config.ts', options: [{ base: { path: '../../stryker.base.ts' } }] },
    // The base's own value is the stricter floor when the minimum is lower.
    { code: 'export default { thresholds: { break: 85 } };', filename: '/repo/packages/a/stryker.config.ts', options: [{ min: 50, base: { path: '../../stryker.base.ts' } }] },
    // The base itself passes against itself.
    { code: 'export default { thresholds: { high: 95, low: 85, break: 80 } };', filename: '/repo/stryker.base.ts', options: [{ base: { path: 'stryker.base.ts' } }] },
    // The stricter of the minimum and the base is the floor; each is met.
    { code: 'export default { thresholds: { break: 90 } };', filename: '/repo/packages/a/stryker.config.ts', options: [{ min: 90, base: { path: '../../stryker.base.ts' } }] },
    // A file outside the scope never reads the base, so a missing base does not throw there.
    { code: 'export default {};', filename: '/repo/packages/a/other.ts', options: [{ base: { path: '../../absent.ts' } }] },
  ],
  invalid: [
    { code: 'export default { thresholds: { break: 2 } };', filename: '/repo/packages/a/stryker.config.ts', options: [{ base: { path: '../../stryker.base.ts' } }], errors: [belowBase('2', '80', '/repo/stryker.base.ts')] },
    { code: 'export default { thresholds: { break: 79 } };', filename: '/repo/packages/a/stryker.config.ts', options: [{ base: { path: 'stryker.base.ts', relativeTo: 'root' } }], errors: [belowBase('79', '80', '/repo/stryker.base.ts')] },
    // The higher of the two floors is the one named.
    {
      code: 'export default { thresholds: { break: 85 } };',
      filename: '/repo/packages/a/stryker.config.ts',
      options: [{ min: 90, base: { path: '../../stryker.base.ts' } }],
      errors: [{ messageId: 'belowFloor', data: { value: '85', floor: '90', source: 'set by the "min" option' } }],
    },
    {
      code: 'export default { thresholds: { break: 70 } };',
      filename: '/repo/packages/a/stryker.config.ts',
      options: [{ min: 50, base: { path: '../../stryker.base.ts' } }],
      errors: [belowBase('70', '80', '/repo/stryker.base.ts')],
    },
    // An absent break is still reported when a base is set.
    { code: 'export default {};', filename: '/repo/packages/a/stryker.config.ts', options: [{ base: { path: '../../stryker.base.ts' } }], errors: [missing('not set')] },
  ],
});

describe('stryker-break-threshold with an unreadable base', () => {
  const lint = (options: unknown): readonly TSESLint.Linter.LintMessage[] => {
    const linter = new TSESLint.Linter({ configType: 'flat', cwd: '/repo' });

    return linter.verify(
      'export default { thresholds: { break: 80 } };',
      [{ files: ['**/*.ts'], languageOptions: { parser: tseslint.parser }, plugins: { local: { rules: { 'break-threshold': withBase } } }, rules: { 'local/break-threshold': ['error', options] } }],
      { filename: '/repo/packages/a/stryker.config.ts' },
    );
  };

  it('throws when the base does not exist, naming the resolved path', () => {
    expect(() => lint({ base: { path: '../../absent.ts' } })).toThrow(/"exadev\/stryker-break-threshold base" names "\/repo\/absent\.ts", which does not exist/u);
  });

  it('throws when the base spells out no numeric break', () => {
    expect(() => lint({ base: { path: '../../no-break.ts' } })).toThrow(/names "\/repo\/no-break\.ts", which does not spell out a numeric thresholds\.break/u);
    expect(() => lint({ base: { path: '../../computed.ts' } })).toThrow(/does not spell out a numeric thresholds\.break/u);
  });
});
