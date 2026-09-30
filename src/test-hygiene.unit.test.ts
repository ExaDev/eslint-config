import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { exadevConfig } from './create-config';
import plugin from './plugin';
import { buildTestHygieneConfig, DEFAULT_CONFORMANCE_FILES, DEFAULT_GUARD_FILES, testHygieneConfig } from './test-hygiene';

// A block naming the extension, as exadevConfig() supplies, and the parser the vitest rules need to read TypeScript.
const SOURCE_BLOCK = { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser, sourceType: 'module' as const } };

function lint(code: string, filename: string, options: Parameters<typeof testHygieneConfig>[0] = {}): string[] {
  const linter = new Linter({ configType: 'flat', cwd: '/repo' });

  return linter.verify(code, [SOURCE_BLOCK, ...testHygieneConfig(options)], { filename: `/repo/${filename}` }).map((message) => `${message.ruleId ?? 'parse'}:${String(message.line)}`);
}

const HEADER = "import { describe, it, expect } from 'vitest';\n";
// A guard that shows all three things non-vacuous-guard asks for, so a case can be about one other rule.
const GUARD_EVIDENCE = "it('evidence', () => { expect(files.length).toBeGreaterThan(0); expect(PATTERN.test('bad')).toBe(true); expect(PATTERN.test('good')).toBe(false); });\n";

describe('defaults', () => {
  it('cover guard tests and conformance suites by name', () => {
    expect(DEFAULT_GUARD_FILES).toStrictEqual(['**/*.guard.test.ts']);
    expect(DEFAULT_CONFORMANCE_FILES).toStrictEqual(['**/*conformance*.test.ts']);
  });
});

describe('testHygieneConfig blocks', () => {
  it('wires the vitest rules onto guard and conformance files separately, and the guard rule onto guard files only', () => {
    const blocks = testHygieneConfig();
    const rulesOf = (files: readonly string[]) => blocks.filter((block) => JSON.stringify(block.files) === JSON.stringify(files)).map((block) => Object.keys(block.rules ?? {}).sort());
    expect(rulesOf(DEFAULT_GUARD_FILES)).toStrictEqual([['vitest/expect-expect', 'vitest/no-disabled-tests', 'vitest/no-focused-tests'], ['exadev/non-vacuous-guard']]);
    expect(rulesOf(DEFAULT_CONFORMANCE_FILES)).toStrictEqual([['vitest/expect-expect', 'vitest/no-disabled-tests', 'vitest/no-focused-tests']]);
  });

  it('registers the exadev plugin for the guard rule', () => {
    const guardBlock = testHygieneConfig().find((block) => block.rules?.['exadev/non-vacuous-guard'] !== undefined);
    expect(guardBlock?.plugins?.['exadev']).toBe(plugin);
  });

  it('counts expect and assert, plus any helper names given, as assertions', () => {
    const expectRule = (options: Parameters<typeof testHygieneConfig>[0]) => testHygieneConfig(options)[0]?.rules?.['vitest/expect-expect'];
    expect(expectRule({})).toStrictEqual(['error', { assertFunctionNames: ['expect', 'assert'] }]);
    expect(expectRule({ assertFunctionNames: ['check*', 'expect'] })).toStrictEqual(['error', { assertFunctionNames: ['expect', 'assert', 'check*'] }]);
  });

  it('gives no-disabled-tests its own block, ignoring the skippable files, only when there are some', () => {
    const blocks = testHygieneConfig({ skippableFiles: ['**/live.conformance.test.ts'] });
    const disabledBlocks = blocks.filter((block) => block.rules?.['vitest/no-disabled-tests'] !== undefined);
    expect(disabledBlocks.map((block) => block.ignores)).toStrictEqual([['**/live.conformance.test.ts'], ['**/live.conformance.test.ts']]);
    expect(blocks.filter((block) => block.rules?.['vitest/expect-expect'] !== undefined).every((block) => block.ignores === undefined)).toBe(true);
  });

  it('turns a leading ! glob into an ignore of that list only', () => {
    const blocks = testHygieneConfig({ guardFiles: ['**/*.guard.test.ts', '!**/legacy/**'] });
    const guardBlocks = blocks.filter((block) => block.files?.length === 1 && block.files[0] === '**/*.guard.test.ts');
    expect(guardBlocks.every((block) => JSON.stringify(block.ignores) === JSON.stringify(['**/legacy/**']))).toBe(true);
    expect(blocks.filter((block) => block.files?.[0] === DEFAULT_CONFORMANCE_FILES[0]).every((block) => block.ignores === undefined)).toBe(true);
  });
});

describe('testHygieneConfig validation', () => {
  it('throws, naming the option, for malformed options', () => {
    expect(() => buildTestHygieneConfig('guards' as never)).toThrow('"testHygiene" must be an object.');
    expect(() => buildTestHygieneConfig({ guardFile: ['a'] } as never)).toThrow('has an unknown key "guardFile"');
    expect(() => testHygieneConfig({ guardFiles: [] })).toThrow('"testHygiene.guardFiles" must contain at least one glob');
    expect(() => testHygieneConfig({ conformanceFiles: ['!x'] })).toThrow('"testHygiene.conformanceFiles" must contain at least one glob that does not start with "!".');
    expect(() => testHygieneConfig({ assertFunctionNames: [] })).toThrow('"testHygiene.assertFunctionNames" must be a non-empty array of non-empty strings.');
    expect(() => testHygieneConfig({ assertFunctionNames: [''] })).toThrow('"testHygiene.assertFunctionNames" must be a non-empty array of non-empty strings.');
    expect(() => testHygieneConfig({ skippableFiles: ['a', '!b'] })).toThrow('"testHygiene.skippableFiles" entry "!b" is an exclude.');
  });

  it('throws with the install command when the plugin cannot be resolved', () => {
    const missing = () => {
      throw new Error('simulated missing package');
    };
    expect(() => buildTestHygieneConfig({ requireFn: missing })).toThrow(
      "@exadev/eslint-config: Guard and conformance test hygiene was requested but '@vitest/eslint-plugin' could not be resolved. Install it with: pnpm add -D @vitest/eslint-plugin",
    );
    expect(() => buildTestHygieneConfig({ requireFn: () => ({}) })).toThrow('could not be resolved');
  });

  it('throws naming every rule the installed plugin lacks', () => {
    const outdated = () => ({ rules: { 'expect-expect': {} } });
    expect(() => buildTestHygieneConfig({ requireFn: outdated })).toThrow("'@vitest/eslint-plugin' does not provide the rules no-disabled-tests, no-focused-tests, which test hygiene relies on.");
  });

  it('accepts the plugin under either module shape', () => {
    const rules = { 'expect-expect': {}, 'no-disabled-tests': {}, 'no-focused-tests': {} };
    expect(() => buildTestHygieneConfig({ requireFn: () => ({ rules }) })).not.toThrow();
    expect(() => buildTestHygieneConfig({ requireFn: () => ({ default: { rules } }) })).not.toThrow();
  });
});

describe('testHygieneConfig in a real linter run', () => {
  it('reports a skipped test, a focused test and a test with no assertion in a guard file', () => {
    const code = `${HEADER}${GUARD_EVIDENCE}it.skip('a', () => { expect(1).toBe(1); });\nit.only('b', () => { expect(1).toBe(1); });\nit('c', () => {});`;
    expect(lint(code, 'src/a.guard.test.ts')).toStrictEqual(['vitest/no-disabled-tests:3', 'vitest/no-focused-tests:4', 'vitest/expect-expect:5']);
  });

  it('holds a conformance suite to the same three rules but not to the guard rule', () => {
    const code = `${HEADER}it.skip('a', () => { expect(1).toBe(1); });\nit('c', () => {});`;
    expect(lint(code, 'src/kv.conformance.test.ts')).toStrictEqual(['vitest/no-disabled-tests:2', 'vitest/expect-expect:3']);
  });

  it('leaves other test files alone', () => {
    expect(lint(`${HEADER}it.skip('a', () => {});\nit.only('b', () => {});`, 'src/a.unit.test.ts')).toStrictEqual([]);
  });

  it('requires a guard to show it can fail, and only a guard', () => {
    const code = `${HEADER}it('a', () => { expect(1).toBe(1); });`;
    expect(lint(code, 'src/a.guard.test.ts')).toStrictEqual(['exadev/non-vacuous-guard:1', 'exadev/non-vacuous-guard:1', 'exadev/non-vacuous-guard:1']);
    expect(lint(code, 'src/kv.conformance.test.ts')).toStrictEqual([]);
  });

  it('does not report a conditional skip, which is how an opt-in project is written', () => {
    const code = `${HEADER}${GUARD_EVIDENCE}describe.skipIf(!process.env['LIVE'])('live', () => { it('a', () => { expect(1).toBe(1); }); });`;
    expect(lint(code, 'src/a.guard.test.ts')).toStrictEqual([]);
  });

  it('exempts a file listed as skippable from no-disabled-tests only', () => {
    const code = `${HEADER}it.skip('a', () => { expect(1).toBe(1); });\nit.only('b', () => { expect(1).toBe(1); });\nit('c', () => {});`;
    const options = { skippableFiles: ['**/live.conformance.test.ts'] };
    expect(lint(code, 'src/live.conformance.test.ts', options)).toStrictEqual(['vitest/no-focused-tests:3', 'vitest/expect-expect:4']);
    expect(lint(code, 'src/kv.conformance.test.ts', options)).toStrictEqual(['vitest/no-disabled-tests:2', 'vitest/no-focused-tests:3', 'vitest/expect-expect:4']);
  });

  it('counts a kit helper as an assertion once its name is given', () => {
    const code = `${HEADER}it('a', () => { checkRoundTrip(store); });`;
    expect(lint(code, 'src/kv.conformance.test.ts')).toStrictEqual(['vitest/expect-expect:2']);
    expect(lint(code, 'src/kv.conformance.test.ts', { assertFunctionNames: ['check*'] })).toStrictEqual([]);
  });

  it('applies to a kit named by its own file name', () => {
    const code = `${HEADER}it('a', () => {});`;
    expect(lint(code, 'src/conformance.ts', { conformanceFiles: ['**/conformance.ts'] })).toStrictEqual(['vitest/expect-expect:2']);
  });
});

describe('exadevConfig testHygiene', () => {
  const base = { react: false, nextjs: false, turboEnv: false, packageJsonKeyOrder: false, gitignore: false } as const;
  const hasHygiene = (blocks: ReturnType<typeof exadevConfig>) => blocks.some((block) => block.rules !== undefined && 'exadev/non-vacuous-guard' in block.rules);

  it('adds the blocks only when the option is given, before any trailing user config', () => {
    expect(hasHygiene(exadevConfig(base))).toBe(false);
    const extra = { name: 'user' };
    const withHygiene = exadevConfig({ ...base, testHygiene: {} }, extra);
    expect(hasHygiene(withHygiene)).toBe(true);
    expect(withHygiene.at(-1)).toBe(extra);
    expect(hasHygiene(withHygiene.slice(0, -1))).toBe(true);
  });
});
