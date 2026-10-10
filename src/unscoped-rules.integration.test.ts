import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { ESLint, type Linter } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exadevConfig, plugin } from './index';

// The README documents an unscoped block of this package's rules placed after the shared config (`{ rules: { 'exadev/barrel-policy': [...] } }`, no `files`, no `plugins`). Such a block applies to every file the shared config lints, JSON and Markdown included, so the `exadev` namespace has to resolve there and a rule written for JavaScript has to leave a file of another language alone.

const PROJECT_FILES: Readonly<Record<string, string>> = {
  'package.json': '{\n  "name": "consumer",\n  "version": "1.0.0"\n}\n',
  'tsconfig.json': '{\n  // comments make this JSONC, which TypeScript accepts\n  "compilerOptions": {\n    "strict": true,\n    "target": "es2022"\n  },\n  "include": ["src"]\n}\n',
  'data.json': '{\n  "a": 1\n}\n',
  'README.md': '# Title\n\nSome text.\n',
  'notes.txt': 'not a file any configuration block selects\n',
  'src/index.ts': 'export const answer = 42;\n',
  'src/options.ts': 'export function read(options: { name: string }): string {\n  return options.name;\n}\n',
};

const JSON_AND_MARKDOWN_FILES = ['package.json', 'tsconfig.json', 'data.json', 'README.md'];
const LINTED_FILES = [...JSON_AND_MARKDOWN_FILES, 'src/index.ts', 'src/options.ts'];

// Options for the rules that cannot be switched on bare; every other rule is enabled with `'error'` alone.
const REQUIRED_OPTIONS: Readonly<Record<string, unknown>> = {
  'require-compiler-options': { strict: true },
  'scoped-first-parameter': { interfaces: 'Repository$', parameter: { name: 'scope', type: 'TenantScope' } },
};

let cwd = '';

beforeAll(() => {
  cwd = mkdtempSync(join(tmpdir(), 'eslint-config-unscoped-rules-'));
  for (const [name, content] of Object.entries(PROJECT_FILES)) {
    const path = join(cwd, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
});

afterAll(() => {
  rmSync(cwd, { force: true, recursive: true });
});

function createEslint(rules: Linter.RulesRecord): ESLint {
  return new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [
      { languageOptions: { parserOptions: { project: './tsconfig.json', tsconfigRootDir: cwd } } },
      ...exadevConfig({
        agentSkills: false,
        gitignore: false,
        markdownHeadings: { files: ['**/*.md'], headings: [{ depth: 1, text: 'Title' }] },
        nextjs: false,
        react: false,
        turboEnv: false,
      }),
      // No `files` and no `plugins`: the documented shape.
      { rules },
    ],
  });
}

async function lintProject(rules: Linter.RulesRecord): Promise<ESLint.LintResult[]> {
  return await createEslint(rules).lintFiles(LINTED_FILES);
}

function reportedFiles(results: readonly ESLint.LintResult[], ruleId: string): string[] {
  return results.filter((result) => result.messages.some((message) => message.ruleId === ruleId)).map((result) => relative(cwd, result.filePath));
}

function fatalMessages(results: readonly ESLint.LintResult[]): string[] {
  return results.flatMap((result) => result.messages.filter((message) => message.fatal).map((message) => `${relative(cwd, result.filePath)}: ${message.message}`));
}

describe('an unscoped block of this package rules after the shared config', () => {
  it('resolves the exadev namespace for every file the shared config lints, and applies a rule to the TypeScript file', async () => {
    const results = await lintProject({ 'exadev/barrel-policy': ['error', { mode: 'banned' }] });

    expect(results.map((result) => relative(cwd, result.filePath))).toStrictEqual(LINTED_FILES);
    expect(fatalMessages(results)).toStrictEqual([]);
    expect(reportedFiles(results, 'exadev/barrel-policy')).toStrictEqual(['src/index.ts']);
  });

  it('applies a type-aware rule to the TypeScript file and does not run it on JSON or Markdown', async () => {
    const results = await lintProject({ 'exadev/prefer-readonly-object-param': 'error' });

    expect(fatalMessages(results)).toStrictEqual([]);
    expect(reportedFiles(results, 'exadev/prefer-readonly-object-param')).toStrictEqual(['src/options.ts']);
  });

  it('does not make ESLint lint a file that no block selects', async () => {
    const eslint = createEslint({ 'exadev/barrel-policy': 'error' });

    expect(await eslint.calculateConfigForFile(join(cwd, 'notes.txt'))).toBeUndefined();
  });

  // The rules that declare `meta.languages` are the JSON and Markdown rules, which ESLint refuses to enable for a JavaScript file by design, so they are wired by a block that selects their files; every other rule must tolerate an unscoped block.
  const javascriptRuleIds = Object.entries(plugin.rules ?? {})
    .filter(([, rule]) => rule.meta?.languages === undefined)
    .map(([id]) => id);

  it('covers every rule that is not a JSON or Markdown rule', () => {
    expect(javascriptRuleIds).toContain('barrel-policy');
    expect(javascriptRuleIds).toContain('prefer-readonly-object-param');
    expect(javascriptRuleIds).not.toContain('package-json-key-order');
  });

  it.each(javascriptRuleIds)('exadev/%s does not throw on a file of another language', async (id) => {
    const setting: Linter.RuleEntry = id in REQUIRED_OPTIONS ? ['error', REQUIRED_OPTIONS[id]] : 'error';
    const results = await lintProject({ [`exadev/${id}`]: setting });

    expect(fatalMessages(results)).toStrictEqual([]);
  });
});
