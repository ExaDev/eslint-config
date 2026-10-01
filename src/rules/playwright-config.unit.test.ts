import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule, { readPlaywrightConfigOptions } from './playwright-config';

describe('playwright-config meta', () => {
  it('names its docs page after the rule file and says why each setting matters', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/playwright-config.ts');
    expect(rule.meta.messages.forbidOnlyNotSet).toBe(
      '`forbidOnly` is not set. Playwright defaults it to false, so a committed `test.only` runs one test and still passes. Set it to `true` or to an expression such as `!!process.env.CI`.',
    );
    expect(rule.meta.messages.forbidOnlyFalse).toBe(
      '`forbidOnly` is false, so a committed `test.only` runs one test and still passes. Set it to `true` or to an expression such as `!!process.env.CI`.',
    );
    expect(rule.meta.messages.fullyParallelNotSet).toBe(
      '`fullyParallel` is not set. Playwright defaults it to false, which runs the tests of one file in order on one worker. Set it to `true`, or to false deliberately if the tests share state.',
    );
    expect(rule.meta.messages.fullyParallelFalse).toBe('`fullyParallel` is false, so the tests of one file run in order on one worker.');
    expect(rule.meta.messages.workersNotSet).toBe(
      '`workers` is not set, so the worker count follows the machine. State it, for example `process.env.CI ? 1 : undefined`, so CI and local runs are chosen deliberately.',
    );
  });
});

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });

const FILENAME = 'playwright.config.ts';
const strict = [{ fullyParallel: true, workers: true }] as const;

ruleTester.run('playwright-config', rule, {
  valid: [
    { code: 'export default defineConfig({ forbidOnly: true });', filename: FILENAME },
    // A non-literal expression is accepted: it is how a config forbids only on CI.
    { code: 'export default defineConfig({ forbidOnly: !!process.env.CI });', filename: FILENAME },
    { code: "export default defineConfig({ forbidOnly: process.env['CI'] !== undefined });", filename: FILENAME },
    { code: 'export default defineConfig({ forbidOnly: isCi });', filename: FILENAME },
    { code: 'const isCi = true; export default defineConfig({ forbidOnly: isCi });', filename: FILENAME },
    // Not visible, so not judged.
    { code: 'export default defineConfig({ ...shared });', filename: FILENAME },
    { code: 'export default defineConfig({ ...shared, projects: [] });', filename: FILENAME },
    { code: 'export default shared;', filename: FILENAME },
    { code: 'export default { forbidOnly: true } satisfies PlaywrightTestConfig;', filename: FILENAME },
    // defineConfig merges every argument, so a setting made by any visible argument, or possibly by one that is not visible, counts.
    { code: "import base from './base'; export default defineConfig(base, { use: {} });", filename: FILENAME },
    { code: 'export default defineConfig({ forbidOnly: true }, { projects: [] });', filename: FILENAME },
    { code: 'export default defineConfig({ projects: [] }, { forbidOnly: true });', filename: FILENAME },
    { code: 'export default defineConfig({ forbidOnly: false }, ...overrides);', filename: FILENAME },
    { code: 'export default defineConfig({ forbidOnly: false }, base);', filename: FILENAME },
    { code: 'export default defineConfig(base, { forbidOnly: true, fullyParallel: true }, { projects: [] });', filename: FILENAME, options: [{ fullyParallel: true }] as const },
    { code: 'export default defineConfig(base, { forbidOnly: true }, { projects: [] });', filename: FILENAME, options: [{ workers: true }] },
    // The optional checks are off unless asked for.
    { code: 'export default defineConfig({ forbidOnly: true, fullyParallel: false });', filename: FILENAME },
    { code: 'export default defineConfig({ forbidOnly: true, fullyParallel: true, workers: process.env.CI ? 1 : undefined });', filename: FILENAME, options: strict },
    { code: 'export default defineConfig({ forbidOnly: true, fullyParallel: parallel, workers: 4 });', filename: FILENAME, options: strict },
    { code: 'export default defineConfig({ forbidOnly: true, workers: undefined });', filename: FILENAME, options: [{ workers: true }] },
    { code: 'export default defineConfig({ forbidOnly: true, ...rest });', filename: FILENAME, options: strict },
    // Out of scope.
    { code: 'export default defineConfig({});', filename: 'vitest.config.ts' },
    { code: 'export default defineConfig({});', filename: 'e2e.ts' },
    { code: 'export default defineConfig({});', filename: 'e2e.config.ts', options: [{ files: ['other.config.ts'] }] },
  ],
  invalid: [
    { code: 'export default defineConfig({});', filename: FILENAME, errors: [{ messageId: 'forbidOnlyNotSet', line: 1, column: 29 }] },
    { code: 'export default defineConfig({ retries: 2 });', filename: FILENAME, errors: [{ messageId: 'forbidOnlyNotSet' }] },
    { code: 'export default defineConfig({ forbidOnly: false });', filename: FILENAME, errors: [{ messageId: 'forbidOnlyFalse', line: 1, column: 31 }] },
    { code: 'export default defineConfig({ forbidOnly: undefined });', filename: FILENAME, errors: [{ messageId: 'forbidOnlyFalse' }] },
    { code: 'export default defineConfig({ forbidOnly: null });', filename: FILENAME, errors: [{ messageId: 'forbidOnlyFalse' }] },
    { code: 'export default { retries: 2 };', filename: FILENAME, errors: [{ messageId: 'forbidOnlyNotSet' }] },
    { code: 'module.exports = defineConfig({});', filename: 'playwright.config.cjs', errors: [{ messageId: 'forbidOnlyNotSet' }] },
    { code: 'export default defineConfig(() => ({}));', filename: FILENAME, errors: [{ messageId: 'forbidOnlyNotSet' }] },
    { code: 'export default defineConfig({});', filename: 'e2e/playwright.ci.config.mts', errors: [{ messageId: 'forbidOnlyNotSet' }] },
    { code: 'export default defineConfig({});', filename: 'e2e.config.ts', options: [{ files: ['e2e.config.ts'] }], errors: [{ messageId: 'forbidOnlyNotSet' }] },
    // The merged configuration is judged: the last argument that spells a setting decides it.
    { code: 'export default defineConfig({ retries: 1 }, { projects: [] });', filename: FILENAME, errors: [{ messageId: 'forbidOnlyNotSet', line: 1, column: 45 }] },
    { code: 'export default defineConfig({ forbidOnly: true }, { forbidOnly: false });', filename: FILENAME, errors: [{ messageId: 'forbidOnlyFalse', line: 1, column: 53 }] },
    { code: 'export default defineConfig(base, { forbidOnly: false });', filename: FILENAME, errors: [{ messageId: 'forbidOnlyFalse' }] },
    {
      code: 'export default defineConfig({ forbidOnly: true, fullyParallel: true }, { projects: [] });',
      filename: FILENAME,
      options: [{ workers: true }] as const,
      errors: [{ messageId: 'workersNotSet', line: 1, column: 72 }],
    },
    // The optional checks, when asked for.
    {
      code: 'export default defineConfig({ forbidOnly: true });',
      filename: FILENAME,
      options: strict,
      errors: [{ messageId: 'fullyParallelNotSet' }, { messageId: 'workersNotSet' }],
    },
    {
      code: 'export default defineConfig({ forbidOnly: true, fullyParallel: false, workers: 2 });',
      filename: FILENAME,
      options: [{ fullyParallel: true }] as const,
      errors: [{ messageId: 'fullyParallelFalse', line: 1, column: 49 }],
    },
    { code: 'export default defineConfig({ forbidOnly: true, fullyParallel: undefined });', filename: FILENAME, options: [{ fullyParallel: true }] as const, errors: [{ messageId: 'fullyParallelFalse' }] },
    { code: 'export default defineConfig({ forbidOnly: true, fullyParallel: true });', filename: FILENAME, options: [{ workers: true }], errors: [{ messageId: 'workersNotSet' }] },
  ],
});

describe('readPlaywrightConfigOptions', () => {
  it('defaults to the built-in scope and no optional checks', () => {
    const { inScope, requireFullyParallel, requireWorkers } = readPlaywrightConfigOptions({});
    expect(requireFullyParallel).toBe(false);
    expect(requireWorkers).toBe(false);
    expect(inScope('/repo/playwright.config.ts', '/repo')).toBe(true);
    expect(inScope('/repo/e2e/playwright.ci.config.mts', '/repo')).toBe(true);
    expect(inScope('/repo/vitest.config.ts', '/repo')).toBe(false);
  });

  it('rejects a non-object, an unknown key and a non-boolean flag', () => {
    expect(() => readPlaywrightConfigOptions(true)).toThrow(/"exadev\/playwright-config" options must be an object/u);
    expect(() => readPlaywrightConfigOptions({ worker: true })).toThrow(/unknown key "worker"/u);
    expect(() => readPlaywrightConfigOptions({ workers: 'yes' })).toThrow(/needs "workers" to be a boolean/u);
    expect(() => readPlaywrightConfigOptions({ fullyParallel: 1 })).toThrow(/needs "fullyParallel" to be a boolean/u);
  });
});
