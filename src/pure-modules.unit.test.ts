import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { exadevConfig } from './create-config';
import plugin from './plugin';
import { buildPureModulesConfig, pureModulesConfig } from './pure-modules';

const FILES = ['src/core/**'] as const;
// A block naming the extension, as exadevConfig() supplies: ESLint lints a file only when some non-wildcard-only files pattern matches it.
const SOURCE_BLOCK = { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser, sourceType: 'module' as const } };
// One violation on each line.
const OVERLAPPING_CONSUMER_BLOCK: Linter.Config = {
  files: ['src/**'],
  rules: { 'no-restricted-syntax': ['error', 'DebuggerStatement'], 'no-restricted-globals': ['error', 'name'], 'no-restricted-imports': ['error', 'lodash'] },
};
const IMPURE_LINES = ["import { readFile } from 'node:fs';", 'export const now = () => Date.now();', 'export const load = async () => 1;'];
const IMPURE = IMPURE_LINES.join('\n');
const impureLineNumbers = IMPURE_LINES.map((_line, index) => index + 1);

describe('pureModulesConfig', () => {
  it('wires one block onto the given files, registering the plugin and using one rule name', () => {
    const [block, ...rest] = pureModulesConfig({ files: FILES });
    expect(rest).toHaveLength(0);
    expect(block?.files).toStrictEqual([...FILES]);
    expect(block).not.toHaveProperty('ignores');
    expect(block?.plugins?.['exadev']).toBe(plugin);
    expect(block?.rules).toStrictEqual({ 'exadev/pure-module': ['error', {}] });
  });

  it('passes the allowed imports through to the rule', () => {
    expect(pureModulesConfig({ files: FILES, allowImports: ['fs/promises'] })[0]?.rules).toStrictEqual({ 'exadev/pure-module': ['error', { allowImports: ['fs/promises'] }] });
  });

  it('turns a leading ! glob into an ignore of the block, since a files pattern cannot exclude', () => {
    const [block] = pureModulesConfig({ files: ['src/core/**', '!src/core/**/*.gen.ts'] });
    expect(block?.files).toStrictEqual(['src/core/**']);
    expect(block?.ignores).toStrictEqual(['src/core/**/*.gen.ts']);
  });

  it('adds no-control-flow only when asked for', () => {
    expect(pureModulesConfig({ files: FILES, noControlFlow: true })[0]?.rules).toStrictEqual({ 'exadev/pure-module': ['error', {}], 'exadev/no-control-flow': 'error' });
    expect(pureModulesConfig({ files: FILES, noControlFlow: false })[0]?.rules).toStrictEqual({ 'exadev/pure-module': ['error', {}] });
  });

  it('validates at call time, naming the option', () => {
    expect(() => pureModulesConfig({ files: [] })).toThrow('"pureModules.files" must contain at least one glob');
    expect(() => pureModulesConfig({ files: ['!src/core/**'] })).toThrow('"pureModules.files" must contain at least one glob that does not start with "!".');
    expect(() => pureModulesConfig({ files: FILES, allowImports: ['path'] })).toThrow('selects no banned module');
    expect(() => buildPureModulesConfig({ files: FILES, noControlFlow: 'yes' } as never)).toThrow('"pureModules.noControlFlow" must be a boolean.');
    expect(() => buildPureModulesConfig({ files: FILES, allowImport: ['fs'] } as never)).toThrow('has an unknown key "allowImport"');
    expect(() => buildPureModulesConfig('src/core' as never)).toThrow('"pureModules" must be an object.');
  });

  it('reports the bans through a real linter run, and only in the selected files', () => {
    const linter = new Linter({ configType: 'flat', cwd: '/repo' });
    const config = [SOURCE_BLOCK, ...pureModulesConfig({ files: FILES })];
    const messages = linter.verify(IMPURE, config, { filename: '/repo/src/core/clock.ts' });
    expect(messages.map((message) => [message.ruleId, message.line])).toStrictEqual(impureLineNumbers.map((line) => ['exadev/pure-module', line]));
    expect(linter.verify(IMPURE, config, { filename: '/repo/src/shell/clock.ts' })).toStrictEqual([]);
  });

  it('leaves an excluded file alone', () => {
    const linter = new Linter({ configType: 'flat', cwd: '/repo' });
    const config = [SOURCE_BLOCK, ...pureModulesConfig({ files: ['src/core/**', '!src/core/**/*.gen.ts'] })];
    expect(linter.verify(IMPURE, config, { filename: '/repo/src/core/table.gen.ts' })).toStrictEqual([]);
    expect(linter.verify(IMPURE, config, { filename: '/repo/src/core/table.ts' })).not.toStrictEqual([]);
  });

  it('keeps every ban when a later block sets the core no-restricted-* rules for the same files', () => {
    const linter = new Linter({ configType: 'flat', cwd: '/repo' });
    const config = [
      SOURCE_BLOCK,
      ...pureModulesConfig({ files: FILES }),
      OVERLAPPING_CONSUMER_BLOCK,
    ];
    const messages = linter.verify(IMPURE, config, { filename: '/repo/src/core/clock.ts' });
    expect(messages.filter((message) => message.ruleId === 'exadev/pure-module').map((message) => message.line)).toStrictEqual(impureLineNumbers);
  });

  it('bans control flow with the same block when requested', () => {
    const linter = new Linter({ configType: 'flat', cwd: '/repo' });
    const config = [SOURCE_BLOCK, ...pureModulesConfig({ files: FILES, noControlFlow: true })];
    const messages = linter.verify('export const pick = (a: boolean) => (a ? 1 : 2);', config, { filename: '/repo/src/core/pick.ts' });
    expect(messages.map((message) => message.ruleId)).toStrictEqual(['exadev/no-control-flow']);
  });

  it('honours allowImports through a real linter run', () => {
    const linter = new Linter({ configType: 'flat', cwd: '/repo' });
    const config = [SOURCE_BLOCK, ...pureModulesConfig({ files: FILES, allowImports: ['node:fs'] })];
    expect(linter.verify("import { readFile } from 'fs/promises';", config, { filename: '/repo/src/core/io.ts' })).toStrictEqual([]);
  });
});

describe('exadev/pure-module configured directly', () => {
  it('names the rule in an option error rather than the pureModules config option', () => {
    const linter = new Linter({ configType: 'flat', cwd: '/repo' });
    const config = [SOURCE_BLOCK, { files: FILES, plugins: { exadev: plugin }, rules: { 'exadev/pure-module': ['error', { allowImports: ['path'] }] } }];
    expect(() => linter.verify('export const x = 1;', config, { filename: '/repo/src/core/x.ts' })).toThrow('"pure-module.allowImports" entry "path" selects no banned module');
  });
});

describe('exadevConfig pureModules', () => {
  const base = { react: false, nextjs: false, turboEnv: false, packageJsonKeyOrder: false, gitignore: false } as const;
  const hasPureRule = (blocks: ReturnType<typeof exadevConfig>) => blocks.some((block) => block.rules !== undefined && 'exadev/pure-module' in block.rules);

  it('adds the pure-module block only when the option is given, before any trailing user config', () => {
    expect(hasPureRule(exadevConfig(base))).toBe(false);
    const extra = { name: 'user' };
    const withPure = exadevConfig({ ...base, pureModules: { files: FILES } }, extra);
    expect(hasPureRule(withPure)).toBe(true);
    expect(withPure.at(-1)).toBe(extra);
    expect(hasPureRule(withPure.slice(0, -1))).toBe(true);
  });
});
