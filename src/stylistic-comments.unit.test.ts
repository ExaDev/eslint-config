import stylistic from '@stylistic/eslint-plugin';

import type { Linter } from 'eslint';

import { Linter as LinterClass } from 'eslint';

import { describe, expect, it } from 'vitest';

import plugin from './plugin';

import { JSX_FILE_PATTERNS } from './react';

import stylisticCommentsConfig from './stylistic-comments';

// The three blocks this file's own shape assertions below each check in turn: the hand-picked JS/TS rules, the .d.ts multiline-comment-style override, and the JSX-specific rules. Named here since a bare `3` would itself trip @typescript-eslint/no-magic-numbers with nothing explaining what it denotes.
const EXPECTED_CONFIG_BLOCK_COUNT = 3;

// Deep-equality (toEqual) against each block's full expected shape, not toMatchObject: a mutant that empties any nested object literal (`plugins: {}`, `rules: {}`) or the whole block (`{}`) is only caught by an assertion that would fail on a MISSING expected key too, not just a changed value on a key that happens to already be present.
describe('stylisticCommentsConfig', () => {
  it('has exactly three config blocks', () => {
    expect(stylisticCommentsConfig).toHaveLength(EXPECTED_CONFIG_BLOCK_COUNT);
  });

  it('the first block scopes the hand-picked comment/class-member/statement rules to every JS/TS file, with their exact options', () => {
    expect(stylisticCommentsConfig[0]).toEqual({
      files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
      plugins: { '@stylistic': stylistic, exadev: plugin },
      rules: {
        '@stylistic/multiline-comment-style': ['error', 'bare-block'],
        '@stylistic/spaced-comment': ['error', 'always', { block: { markers: ['!'] } }],
        '@stylistic/lines-between-class-members': 'error',
        '@stylistic/line-comment-position': ['error', 'above'],
        '@stylistic/padding-line-between-statements': [
          'error',
          { blankLine: 'always', prev: 'directive', next: '*' },
          { blankLine: 'always', prev: ['cjs-import', 'import'], next: '*' },
          { blankLine: 'always', prev: '*', next: 'return' },
        ],
        'exadev/prefer-doc-comment': 'error',
      },
    });
  });

  it("the second block turns multiline-comment-style back off for .d.ts files only, changing nothing else the first block turns on for them", () => {
    expect(stylisticCommentsConfig[1]).toEqual({
      files: ['**/*.d.ts'],
      plugins: { '@stylistic': stylistic },
      rules: {
        '@stylistic/multiline-comment-style': 'off',
      },
    });
  });

  it("the third block scopes exactly the three JSX-specific rules, at their bare defaults, to react.ts's own JSX_FILE_PATTERNS", () => {
    expect(stylisticCommentsConfig[2]).toEqual({
      files: [...JSX_FILE_PATTERNS],
      plugins: { '@stylistic': stylistic },
      rules: {
        '@stylistic/jsx-curly-brace-presence': 'error',
        '@stylistic/jsx-pascal-case': 'error',
        '@stylistic/jsx-self-closing-comp': 'error',
      },
    });
  });
});

// A real Linter run, not just the config shape asserted above: `block.markers: ['!']` only matters through spaced-comment's own actual pass/fail decision, which the config-shape test above cannot observe (a mutant swapping `'!'` for any other single character would still produce an object of the identical shape).
describe('spaced-comment (the /*! license/banner marker)', () => {
  const linter = new LinterClass();

  function lint(code: string): (string | null)[] {
    const config: Linter.Config[] = [{ files: ['**'], languageOptions: { sourceType: 'module', ecmaVersion: 2022 } }, ...stylisticCommentsConfig] as Linter.Config[];

    return linter.verify(code, config, 'banner.js').map((message) => message.ruleId);
  }

  it('reports no spaced-comment violation for a /*! banner with no space of its own between the ! and the delimiter', () => {
    const ruleIds = lint('/*! Copyright ExaDev. Licensed under MIT. This banner must survive minification intact. */\nexport function licensed() {}\n');
    expect(ruleIds).not.toContain('@stylistic/spaced-comment');
  });

  it('still reports the bare-default violation for an ordinary block comment missing its own leading space, proving the added marker is scoped to `!` and does not disable the rule generally', () => {
    const ruleIds = lint('/*no space here*/\nexport const x = 1;\n');
    expect(ruleIds).toContain('@stylistic/spaced-comment');
  });
});

// A real --fix run, not just the config shape asserted above: the second block's own file scoping only matters through which file multiline-comment-style's own fixer actually reaches, which the config-shape test above cannot observe.
describe('multiline-comment-style (consecutive triple-slash directives in a .d.ts file)', () => {
  const linter = new LinterClass();
  // The exact shape TypeScript itself generates for a Next.js project's own next-env.d.ts: two consecutive `/// <reference ... />` lines with no blank line between them, and nothing else above the statement they sit over.
  const tripleSlashCode = '/// <reference types="node" />\n/// <reference lib="es2022" />\nexport const z = 1;\n';

  function fixedOutput(code: string, filename: string): string {
    const config: Linter.Config[] = [{ files: ['**'], languageOptions: { sourceType: 'module', ecmaVersion: 2022 } }, ...stylisticCommentsConfig] as Linter.Config[];

    return linter.verifyAndFix(code, config, filename).output;
  }

  it('leaves both directives as their own standalone lines, untouched, in a .d.ts file', () => {
    expect(fixedOutput(tripleSlashCode, 'next-env.d.ts')).toBe(tripleSlashCode);
  });

  it('still merges the identical two lines into one broken block comment in an ordinary .ts file, proving the .d.ts override is scoped rather than a blanket disable', () => {
    const output = fixedOutput(tripleSlashCode, 'ordinary.ts');
    expect(output).not.toBe(tripleSlashCode);
    expect(output.startsWith('/* / <reference')).toBe(true);
  });
});
