import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule, { DEFAULT_ASSERT_NAMES, readInjectedTestHygieneOptions } from './injected-test-hygiene';

describe('injected-test-hygiene metadata', () => {
  it('names its docs page after the rule file', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/injected-test-hygiene.ts');
  });
});

describe('readInjectedTestHygieneOptions', () => {
  it('defaults to expect and assert, and to reporting skipped tests', () => {
    const read = readInjectedTestHygieneOptions({});
    expect(read.names).toStrictEqual(DEFAULT_ASSERT_NAMES);
    expect(read.reportDisabled).toBe(true);
  });

  it('matches a name exactly, with a dotted member of it, and through a wildcard', () => {
    const { assertions } = readInjectedTestHygieneOptions({ assertFunctionNames: ['assert', 'check*', 'kit.verify'] });
    const matches = (name: string) => assertions.some((pattern) => pattern.test(name));
    expect(matches('assert')).toBe(true);
    expect(matches('assert.equal')).toBe(true);
    expect(matches('assertion')).toBe(false);
    expect(matches('checkThing')).toBe(true);
    expect(matches('recheck')).toBe(false);
    expect(matches('kit.verify')).toBe(true);
    expect(matches('kitXverify')).toBe(false);
  });

  it('keeps reportDisabled when it is false', () => {
    expect(readInjectedTestHygieneOptions({ reportDisabled: false }).reportDisabled).toBe(false);
  });

  it('throws naming the rule for options it cannot use', () => {
    expect(() => readInjectedTestHygieneOptions(undefined)).toThrow('"injected-test-hygiene" must be an object.');
    expect(() => readInjectedTestHygieneOptions({ assertFunctionName: ['x'] })).toThrow('has an unknown key "assertFunctionName"');
    expect(() => readInjectedTestHygieneOptions({ reportDisabled: 'yes' })).toThrow('needs "reportDisabled" to be a boolean when given.');
    expect(() => readInjectedTestHygieneOptions({ assertFunctionNames: [] })).toThrow('needs "assertFunctionNames" to be a non-empty array of non-empty strings when given.');
    expect(() => readInjectedTestHygieneOptions({ assertFunctionNames: ['expect', ''] })).toThrow('non-empty array of non-empty strings');
    expect(() => readInjectedTestHygieneOptions({ assertFunctionNames: 'expect' })).toThrow('non-empty array of non-empty strings');
  });
});

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

const focused = (name: string) => ({ messageId: 'focused' as const, data: { name } });
const disabled = (name: string) => ({ messageId: 'disabled' as const, data: { name } });
const noAssertion = (names = 'expect, assert') => ({ messageId: 'noAssertion' as const, data: { names } });

ruleTester.run('injected-test-hygiene', rule, {
  valid: [
    // A kit whose tests assert.
    "export function runConformance({ describe, it }: Api) { describe('kit', () => { it('a', () => { expect(1).toBe(1); }); }); }",
    "export function runConformance({ describe, it }: Api) { describe('kit', () => { it('a', () => { assert.equal(1, 1); }); }); }",
    // A helper named in assertFunctionNames is an assertion, however the body reaches it.
    { code: "export function runConformance({ it }: Api) { it('a', () => { checkThing(); }); }", options: [{ assertFunctionNames: ['check*'] }] },
    { code: "export function runConformance({ it }: Api) { it('a', async () => { await verify.ok(); }); }", options: [{ assertFunctionNames: ['verify.ok'] }] },
    // Tests reached through a parameter object.
    "export function runConformance(t: Api) { t.describe('kit', () => { t.it('a', () => { expect(1).toBe(1); }); }); }",
    // A renamed local binding is the same function.
    "export function runConformance({ it: run }: Api) { run('a', () => { expect(1).toBe(1); }); }",
    // A suite has no body to assert in, and a todo has no body at all.
    "export function runConformance({ describe, it }: Api) { describe('kit', () => { it.todo('later'); }); }",
    // A conditional skip is deliberate, and a test table is a test.
    "export function runConformance({ it }: Api) { it.skipIf(process.env.CI)('a', () => { expect(1).toBe(1); }); it.each([1, 2])('b', (n) => { expect(n).toBeTruthy(); }); }",
    // A skip is allowed when the option says so.
    { code: "export function runConformance({ it, describe }: Api) { it.skip('a', () => {}); describe.skip('b', () => {}); }", options: [{ reportDisabled: false }] },
    // Imported and global test functions are the vitest plugin's, not this rule's.
    "import { it } from 'vitest'; it.only('a', () => {}); it.skip('b', () => {});",
    "it.only('a', () => {}); describe.skip('b', () => {});",
    // A parameter that is not a test function, and a member that is not one either.
    "export function run(logger: Logger) { logger.info('a', () => {}); logger.only('b', () => {}); }",
    // A local function that happens to be called it is not injected.
    "export function run() { const it = (name: string, body: () => void) => { body(); }; it.only('a', () => {}); }",
    // A call that is not a member chain from an identifier.
    "export function run({ it }: Api) { it['skip']('a', () => {}); (get()).it('b', () => {}); }",
  ],
  invalid: [
    // A focused test or suite.
    { code: "export function run({ it }: Api) { it.only('a', () => { expect(1).toBe(1); }); }", errors: [focused('it.only')] },
    { code: "export function run({ describe }: Api) { describe.only('a', () => {}); }", errors: [focused('describe.only')] },
    { code: "export function run(t: Api) { t.it.only('a', () => { expect(1).toBe(1); }); }", errors: [focused('t.it.only')] },
    { code: "export function run({ it: run }: Api) { run.only('a', () => { expect(1).toBe(1); }); }", errors: [focused('run.only')] },
    { code: "export function run({ test }: Api) { test.only('a', () => { expect(1).toBe(1); }); }", errors: [focused('test.only')] },
    // A table that is also focused is one report, not one per call in the chain.
    { code: "export function run({ it }: Api) { it.only.each([1])('a', (n) => { expect(n).toBe(1); }); }", errors: [focused('it.only.each([1])')] },
    // A skipped test or suite.
    { code: "export function run({ it }: Api) { it.skip('a', () => { expect(1).toBe(1); }); }", errors: [disabled('it.skip')] },
    { code: "export function run({ describe }: Api) { describe.skip('a', () => {}); }", errors: [disabled('describe.skip')] },
    { code: "export function run(t: Api) { t.it.skip('a', () => {}); }", errors: [disabled('t.it.skip')] },
    { code: "export function run({ suite }: Api) { suite.skip('a', () => {}); }", errors: [disabled('suite.skip')] },
    // A skip is still reported when only focus is exempt, and a focus when only skips are.
    { code: "export function run({ it }: Api) { it.only('a', () => { expect(1).toBe(1); }); }", options: [{ reportDisabled: false }], errors: [focused('it.only')] },
    // A test with no assertion.
    { code: "export function run({ it }: Api) { it('a', () => { const x = 1; }); }", errors: [noAssertion()] },
    { code: "export function run({ it }: Api) { it('a', async function () { await thing(); }); }", errors: [noAssertion()] },
    { code: "export function run(t: Api) { t.it('a', () => {}); }", errors: [noAssertion()] },
    { code: "export function run({ test }: Api) { test('a', () => {}); }", errors: [noAssertion()] },
    { code: "export function run({ it }: Api) { it.each([1])('a', (n) => { use(n); }); }", errors: [noAssertion()] },
    { code: "export function run({ it }: Api) { it.each`a\n${1}`('a', (n) => { use(n); }); }", errors: [noAssertion()] },
    // A helper that is not named as an assertion is not one, and the message lists the names that are.
    { code: "export function run({ it }: Api) { it('a', () => { checkThing(); }); }", options: [{ assertFunctionNames: ['expect', 'verify*'] }], errors: [noAssertion('expect, verify*')] },
    // An assertion in a sibling test does not cover this one.
    { code: "export function run({ it }: Api) { it('a', () => { expect(1).toBe(1); }); it('b', () => {}); }", errors: [noAssertion()] },
    // Each defect in a kit is reported separately.
    {
      code: "export function run({ describe, it }: Api) { describe('kit', () => { it.only('a', () => {}); it.skip('b', () => {}); it('c', () => {}); }); }",
      errors: [focused('it.only'), noAssertion(), disabled('it.skip'), noAssertion()],
    },
  ],
});
