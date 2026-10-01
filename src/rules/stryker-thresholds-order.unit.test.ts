import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule from './stryker-thresholds-order';

describe('stryker-thresholds-order meta', () => {
  it('names its docs page after the rule file and says why each ordering matters', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/stryker-thresholds-order.ts');
    expect(rule.meta.messages.breakAboveLow).toBe(
      '`thresholds.break` ({{ break }}) must not exceed `thresholds.low` ({{ low }}). A break above the low mark makes the low and high marks unreachable on a passing run, which usually means they were left at their defaults when the break was raised.',
    );
    expect(rule.meta.messages.lowAboveHigh).toBe(
      '`thresholds.low` ({{ low }}) must not exceed `thresholds.high` ({{ high }}). Stryker rejects a low above the high when it reads the config.',
    );
  });
});

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });

const FILENAME = 'stryker.config.ts';
const breakAbove = (breakText: string, low: string) => ({ messageId: 'breakAboveLow' as const, data: { break: breakText, low } });
const lowAbove = (low: string, high: string) => ({ messageId: 'lowAboveHigh' as const, data: { low, high } });

ruleTester.run('stryker-thresholds-order', rule, {
  valid: [
    { code: 'export default { thresholds: { high: 90, low: 70, break: 50 } };', filename: FILENAME },
    // Equal marks are allowed: a break at the low mark, or a maximal config where every mark is the full score, leaves nothing unreachable that could ever pass.
    { code: 'export default { thresholds: { high: 100, low: 100, break: 100 } };', filename: FILENAME },
    { code: 'export default { thresholds: { high: 90, low: 70, break: 70 } };', filename: FILENAME },
    { code: 'export default { thresholds: { high: 90, low: 90 } };', filename: FILENAME },
    { code: 'export default { thresholds: { break: 60 } };', filename: FILENAME },
    // Keys left out take Stryker's documented defaults of 80 and 60, and no break.
    { code: 'export default { thresholds: { break: 50 } };', filename: FILENAME },
    { code: 'export default { thresholds: { high: 90 } };', filename: FILENAME },
    { code: 'export default { thresholds: { low: 70 } };', filename: FILENAME },
    { code: 'export default { thresholds: {} };', filename: FILENAME },
    { code: 'export default {};', filename: FILENAME },
    // A value that is not a number literal, or a key a spread may supply, is not compared.
    { code: 'export default { thresholds: { high: 90, low: 70, break: base } };', filename: FILENAME },
    { code: 'export default { thresholds: { low: computed, break: 95 } };', filename: FILENAME },
    { code: 'export default { thresholds: { ...base, break: 95 } };', filename: FILENAME },
    { code: 'export default { thresholds: base };', filename: FILENAME },
    { code: 'export default { ...base };', filename: FILENAME },
    // A signed number is read.
    { code: 'export default { thresholds: { break: -1 } };', filename: FILENAME },
    // Outside the filename scope the rule does nothing.
    { code: 'export default { thresholds: { break: 99 } };', filename: 'config.ts' },
    { code: 'export default { thresholds: { break: 99 } };', filename: 'src/stryker-notes.ts' },
  ],
  invalid: [
    { code: 'export default { thresholds: { high: 90, low: 70, break: 71 } };', filename: FILENAME, errors: [{ ...breakAbove('71', '70'), line: 1, column: 51 }] },
    { code: 'export default { thresholds: { high: 90, low: 70, break: 95 } };', filename: FILENAME, errors: [breakAbove('95', '70')] },
    // The default low of 60 applies when low is left out.
    { code: 'export default { thresholds: { break: 70 } };', filename: FILENAME, errors: [breakAbove('70', '60, the default')] },
    { code: 'export default { thresholds: { high: 90, low: 91 } };', filename: FILENAME, errors: [{ ...lowAbove('91', '90'), line: 1, column: 42 }] },
    { code: 'export default { thresholds: { low: 85 } };', filename: FILENAME, errors: [lowAbove('85', '80, the default')] },
    { code: 'export default { thresholds: { high: 50 } };', filename: FILENAME, errors: [lowAbove('60, the default', '50')] },
    // Both orderings broken at once.
    { code: 'export default { thresholds: { high: 40, low: 50, break: 60 } };', filename: FILENAME, errors: [lowAbove('50', '40'), breakAbove('60', '50')] },
    // Followed through a const, a satisfies clause, and a CommonJS export.
    { code: 'const thresholds = { break: 90 }; export default { thresholds } satisfies PartialStrykerOptions;', filename: FILENAME, errors: [breakAbove('90', '60, the default')] },
    { code: 'module.exports = { thresholds: { break: 90 } };', filename: 'stryker.conf.cjs', errors: [breakAbove('90', '60, the default')] },
    // Any stryker config name Stryker searches for, and a mutation profile.
    { code: 'export default { thresholds: { break: 90 } };', filename: 'packages/a/stryker.mutation.config.mjs', errors: [breakAbove('90', '60, the default')] },
    { code: 'export default { thresholds: { break: 90 } };', filename: '.stryker.conf.js', errors: [breakAbove('90', '60, the default')] },
    { code: 'export default { thresholds: { break: 90 } };', filename: 'config/shared.ts', options: [{ files: ['shared.ts'] }], errors: [breakAbove('90', '60, the default')] },
  ],
});
