import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule, { readVitestConfigOptions } from './vitest-config';

describe('vitest-config meta', () => {
  it('names its docs page after the rule file', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/vitest-config.ts');
  });

  it('states why each setting is reported', () => {
    expect(rule.meta.messages.passWithNoTests).toBe(
      '`passWithNoTests: true` makes the run pass when no test file is found, so a mistyped include glob or a deleted suite goes unnoticed. Remove it.',
    );
    expect(rule.meta.messages.allowOnly).toBe(
      '`allowOnly: true` lets a focused test (`.only`) through, so the rest of the suite is skipped without failing the run. Vitest already allows `.only` outside CI by default; remove this or set it to false.',
    );
    expect(rule.meta.messages.bareNodeModules).toBe(
      'The bare string "node_modules" excludes only a top-level directory of that name and misses nested copies. Use "**/node_modules/**".',
    );
    expect(rule.meta.messages.unknownThresholdKey).toBe(
      'The key "{{ key }}" under `coverage.thresholds` is not one Vitest reads (statements, branches, functions, lines, perFile, autoUpdate, 100), so it is treated as a file glob and matches no file; the threshold enforces nothing. Move the values up a level, or use a glob such as "src/**".',
    );
  });
});

describe('readVitestConfigOptions', () => {
  it('defaults to the built-in scope and no worker check', () => {
    const { inScope, forbidNumericMaxWorkers } = readVitestConfigOptions({});
    expect(forbidNumericMaxWorkers).toBe(false);
    expect(inScope('/repo/vitest.config.ts', '/repo')).toBe(true);
    expect(inScope('/repo/vitest.mutation.config.mts', '/repo')).toBe(true);
    expect(inScope('/repo/packages/a/vitest.workspace.ts', '/repo')).toBe(true);
    expect(inScope('/repo/vite.config.ts', '/repo')).toBe(false);
  });

  it('rejects options that are not an object, an unknown key and a non-boolean flag', () => {
    expect(() => readVitestConfigOptions('files')).toThrow(/"exadev\/vitest-config" options must be an object/u);
    expect(() => readVitestConfigOptions({ fils: [] })).toThrow(/unknown key "fils"/u);
    expect(() => readVitestConfigOptions({ forbidNumericMaxWorkers: 'yes' })).toThrow(/needs "forbidNumericMaxWorkers" to be a boolean/u);
    expect(() => readVitestConfigOptions({ files: [] })).toThrow(/"exadev\/vitest-config files"/u);
  });
});

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });

const FILENAME = 'vitest.config.ts';
const inert = (key: string) => ({ messageId: 'unknownThresholdKey' as const, data: { key } });

ruleTester.run('vitest-config', rule, {
  valid: [
    { code: "export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });", filename: FILENAME },
    // Only the literal `true` is reported: false, unset, and a value computed at run time are left alone.
    { code: 'export default defineConfig({ test: { passWithNoTests: false, allowOnly: false } });', filename: FILENAME },
    { code: 'export default defineConfig({ test: { passWithNoTests: !!process.env.X, allowOnly: process.env.CI === undefined } });', filename: FILENAME },
    { code: 'export default defineConfig({ test: { passWithNoTests: flag } });', filename: FILENAME },
    // Anything that hides the key stays silent instead of guessing.
    { code: 'export default defineConfig({ test: { ...shared } });', filename: FILENAME },
    { code: 'export default defineConfig({ ...shared });', filename: FILENAME },
    { code: 'export default defineConfig({ test: shared });', filename: FILENAME },
    { code: "export default mergeConfig(base, defineConfig({ test: { exclude: [...defaults, extra] } }));", filename: FILENAME },
    { code: 'export default defineConfig(buildConfig());', filename: FILENAME },
    // A nested pattern is the form that works.
    { code: "export default defineConfig({ test: { exclude: ['**/node_modules/**', 'dist'], coverage: { exclude: ['**/node_modules/**'] } } });", filename: FILENAME },
    { code: "export default defineConfig({ test: { exclude: [pattern, 'node_modules/**'] } });", filename: FILENAME },
    // Every documented threshold key, and keys that are clearly globs.
    {
      code: "export default defineConfig({ test: { coverage: { thresholds: { statements: 80, branches: 80, functions: 80, lines: 80, perFile: true, autoUpdate: false, 'src/**/*.ts': { lines: 90 }, 'a/b.ts': { lines: 1 }, '{a,b}': { lines: 1 }, '!x': { lines: 1 }, 'f?.ts': { lines: 1 }, '[ab].ts': { lines: 1 } } } } });",
      filename: FILENAME,
    },
    { code: 'export default defineConfig({ test: { coverage: { thresholds: { 100: true } } } });', filename: FILENAME },
    { code: "export default defineConfig({ test: { coverage: { thresholds: { '100': true } } } });", filename: FILENAME },
    { code: 'export default defineConfig({ test: { coverage: { thresholds: { ...base } } } });', filename: FILENAME },
    { code: 'export default defineConfig({ test: { coverage: { thresholds: base } } });', filename: FILENAME },
    { code: 'export default defineConfig({ test: { coverage: { thresholds: { [key]: 1 } } } });', filename: FILENAME },
    { code: 'export default defineConfig({ test: { coverage: base } });', filename: FILENAME },
    // A fixed worker count is only reported when the option asks for it.
    { code: 'export default defineConfig({ test: { maxWorkers: 4 } });', filename: FILENAME },
    { code: "export default defineConfig({ test: { maxWorkers: '50%' } });", filename: FILENAME, options: [{ forbidNumericMaxWorkers: true }] },
    { code: 'export default defineConfig({ test: { maxWorkers: workers } });', filename: FILENAME, options: [{ forbidNumericMaxWorkers: true }] },
    { code: 'export default defineConfig({ test: {} });', filename: FILENAME, options: [{ forbidNumericMaxWorkers: true }] },
    // A project given as a path or glob is not visible.
    { code: "export default defineConfig({ test: { projects: ['packages/*', './vitest.unit.config.ts'] } });", filename: FILENAME },
    // Outside the filename scope the rule does nothing.
    { code: 'export default defineConfig({ test: { passWithNoTests: true } });', filename: 'other.config.ts' },
    { code: 'export default defineConfig({ test: { passWithNoTests: true } });', filename: 'src/vitest-helper.ts' },
    // `files` replaces the built-in scope.
    { code: 'export default defineConfig({ test: { passWithNoTests: true } });', filename: FILENAME, options: [{ files: ['tests.config.ts'] }] },
    // No default export, nothing to judge.
    { code: 'export const config = { test: { passWithNoTests: true } };', filename: FILENAME },
  ],
  invalid: [
    { code: 'export default defineConfig({ test: { passWithNoTests: true } });', filename: FILENAME, errors: [{ messageId: 'passWithNoTests', line: 1, column: 39 }] },
    { code: 'export default defineConfig({ test: { allowOnly: true } });', filename: FILENAME, errors: [{ messageId: 'allowOnly', line: 1, column: 39 }] },
    {
      code: 'export default defineConfig({ test: { passWithNoTests: true, allowOnly: true } });',
      filename: FILENAME,
      errors: [{ messageId: 'passWithNoTests' }, { messageId: 'allowOnly' }],
    },
    // Wrapped, aliased and returned forms are all followed.
    { code: 'export default { test: { passWithNoTests: true } } satisfies UserConfig;', filename: FILENAME, errors: [{ messageId: 'passWithNoTests' }] },
    { code: 'const test = { passWithNoTests: true }; export default defineConfig({ test });', filename: FILENAME, errors: [{ messageId: 'passWithNoTests' }] },
    { code: 'export default defineConfig(() => ({ test: { allowOnly: true } }));', filename: FILENAME, errors: [{ messageId: 'allowOnly' }] },
    { code: 'export default mergeConfig(base, { test: { passWithNoTests: true } });', filename: FILENAME, errors: [{ messageId: 'passWithNoTests' }] },
    // A mutation-specific config is a vitest config too.
    { code: 'export default defineConfig({ test: { passWithNoTests: true } });', filename: 'vitest.mutation.config.ts', errors: [{ messageId: 'passWithNoTests' }] },
    { code: 'export default defineConfig({ test: { passWithNoTests: true } });', filename: 'packages/a/vitest.config.mts', errors: [{ messageId: 'passWithNoTests' }] },
    // Inline projects, at any depth, and a workspace file.
    {
      code: "export default defineConfig({ test: { projects: [{ test: { name: 'a', passWithNoTests: true } }, 'packages/*', { extends: true, test: { allowOnly: true } }] } });",
      filename: FILENAME,
      errors: [{ messageId: 'passWithNoTests' }, { messageId: 'allowOnly' }],
    },
    {
      code: 'export default defineConfig({ test: { projects: [defineProject({ test: { projects: [{ test: { allowOnly: true } }] } })] } });',
      filename: FILENAME,
      errors: [{ messageId: 'allowOnly' }],
    },
    { code: 'export default defineWorkspace([{ test: { allowOnly: true } }, { test: { passWithNoTests: true } }]);', filename: 'vitest.workspace.ts', errors: [{ messageId: 'allowOnly' }, { messageId: 'passWithNoTests' }] },
    // A bare node_modules entry, with or without a trailing slash, in either exclude list.
    {
      code: "export default defineConfig({ test: { exclude: ['node_modules', 'dist'], coverage: { exclude: ['node_modules/', 'src/**'] } } });",
      filename: FILENAME,
      errors: [
        { messageId: 'bareNodeModules', line: 1, column: 49 },
        { messageId: 'bareNodeModules', line: 1, column: 96 },
      ],
    },
    { code: 'const exclude = ["node_modules"]; export default defineConfig({ test: { exclude } });', filename: FILENAME, errors: [{ messageId: 'bareNodeModules' }] },
    { code: 'export default defineConfig({ test: { exclude: [`node_modules`] } });', filename: FILENAME, errors: [{ messageId: 'bareNodeModules' }] },
    // Thresholds under a key Vitest does not read.
    {
      code: 'export default defineConfig({ test: { coverage: { thresholds: { global: { lines: 80 } } } } });',
      filename: FILENAME,
      errors: [{ ...inert('global'), line: 1, column: 65 }],
    },
    {
      code: "export default defineConfig({ test: { coverage: { thresholds: { lines: 80, overall: 1, 'strict': 1, 7: 1 } } } });",
      filename: FILENAME,
      errors: [inert('overall'), inert('strict'), inert('7')],
    },
    {
      code: 'const thresholds = { global: { lines: 80 } }; export default defineConfig({ test: { coverage: { thresholds } } });',
      filename: FILENAME,
      errors: [inert('global')],
    },
    // The fixed worker count, when asked for.
    { code: 'export default defineConfig({ test: { maxWorkers: 4 } });', filename: FILENAME, options: [{ forbidNumericMaxWorkers: true }], errors: [{ messageId: 'numericMaxWorkers' }] },
    // `files` replaces the built-in scope, matching a bare name at any depth.
    { code: 'export default defineConfig({ test: { passWithNoTests: true } });', filename: 'packages/a/tests.config.ts', options: [{ files: ['tests.config.ts'] }], errors: [{ messageId: 'passWithNoTests' }] },
  ],
});
