import stylistic from '@stylistic/eslint-plugin';
import type { Linter } from 'eslint';
import { Linter as LinterClass } from 'eslint';
import { describe, expect, it } from 'vitest';
import plugin from './plugin';
import { JSX_FILE_PATTERNS } from './react';
import stylisticCommentsConfig from './stylistic-comments';

// The two blocks this file's own shape assertions below each check in turn: the hand-picked JS/TS rules, and the JSX-specific rules. Named here since a bare `2` would itself trip @typescript-eslint/no-magic-numbers with nothing explaining what it denotes.
const EXPECTED_CONFIG_BLOCK_COUNT = 2;

// Deep-equality (toEqual) against each block's full expected shape, not toMatchObject: a mutant that empties any nested object literal (`plugins: {}`, `rules: {}`) or the whole block (`{}`) is only caught by an assertion that would fail on a MISSING expected key too, not just a changed value on a key that happens to already be present.
describe('stylisticCommentsConfig', () => {
  it('has exactly two config blocks', () => {
    expect(stylisticCommentsConfig).toHaveLength(EXPECTED_CONFIG_BLOCK_COUNT);
  });

  it('the first block scopes the hand-picked comment/class-member/statement rules to every JS/TS file, with their exact options, and does not enable multiline-comment-style', () => {
    // No `@stylistic/multiline-comment-style` key at all: see this file's own header comment on why it is deliberately withheld rather than merely turned `'off'` somewhere, which a mutant swapping an omission for an explicit `'off'` entry could otherwise slip past an object-shape check that only asserts the keys it expects are present.
    expect(stylisticCommentsConfig[0]).toEqual({
      files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
      plugins: { '@stylistic': stylistic, exadev: plugin },
      rules: {
        '@stylistic/spaced-comment': ['error', 'always', { block: { markers: ['!'] }, line: { markers: ['#', '#region', '#endregion'] } }],
        '@stylistic/lines-between-class-members': 'error',
        '@stylistic/line-comment-position': ['error', 'above'],
        '@stylistic/padding-line-between-statements': [
          'error',
          { blankLine: 'always', prev: 'directive', next: '*' },
          { blankLine: 'always', prev: ['cjs-import', 'import'], next: '*' },
          { blankLine: 'any', prev: 'directive', next: 'directive' },
          { blankLine: 'any', prev: ['cjs-import', 'import'], next: ['cjs-import', 'import'] },
          { blankLine: 'always', prev: '*', next: 'return' },
        ],
        'exadev/prefer-doc-comment': 'error',
      },
    });
  });

  it("the second block scopes exactly the three JSX-specific rules, at their bare defaults, to react.ts's own JSX_FILE_PATTERNS", () => {
    expect(stylisticCommentsConfig[1]).toEqual({
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

// Shared by every real-Linter `describe` block below, each of which exercises stylisticCommentsConfig's own actual pass/fail/fix decisions rather than just its shape: built once, at file scope, so the single `as Linter.Config[]` cast (the same cast jsdoc.unit.test.ts's own `lint` helper uses once) appears here only, not once per test block.
const REAL_LINTER_CONFIG: Linter.Config[] = [{ files: ['**'], languageOptions: { sourceType: 'module', ecmaVersion: 2022 } }, ...stylisticCommentsConfig] as Linter.Config[];

// A real Linter run, not just the config shape asserted above: `block.markers: ['!']` only matters through spaced-comment's own actual pass/fail decision, which the config-shape test above cannot observe (a mutant swapping `'!'` for any other single character would still produce an object of the identical shape).
describe('spaced-comment (the /*! license/banner marker)', () => {
  const linter = new LinterClass();

  function lint(code: string): (string | null)[] {
    return linter.verify(code, REAL_LINTER_CONFIG, 'banner.js').map((message) => message.ruleId);
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

// A real --fix run, not just the config shape asserted above: `line.markers: ['#', '#region', '#endregion']` only matters through spaced-comment's own actual fix decision, which the config-shape test above cannot observe. Each shape is pinned against the exact confirmed regression: without any `line.markers` at all, the bare default breaks a source-map comment; with only the bare `'#'` marker, it instead breaks an unspaced `//#region`/`//#endregion` fold marker (see this file's own header comment on stylisticCommentsConfig for both confirmed probes).
describe('spaced-comment (the # source-map and #region/#endregion line markers)', () => {
  const linter = new LinterClass();

  function fixedOutput(code: string): string {
    return linter.verifyAndFix(code, REAL_LINTER_CONFIG, 'markers.js').output;
  }

  it('leaves a //# sourceMappingURL=... comment untouched, never rewritten to // # sourceMappingURL=...', () => {
    const code = 'export const x = 1;\n//# sourceMappingURL=a.js.map\n';
    expect(fixedOutput(code)).toBe(code);
  });

  it('leaves a //# sourceURL=... comment untouched, never rewritten to // # sourceURL=...', () => {
    const code = 'export const x = 1;\n//# sourceURL=a.js\n';
    expect(fixedOutput(code)).toBe(code);
  });

  it('leaves an unspaced //#region/#endregion pair untouched, never rewritten to //# region/#endregion', () => {
    const code = '//#region helpers\nexport const x = 1;\n//#endregion\n';
    expect(fixedOutput(code)).toBe(code);
  });

  it('leaves an already-spaced // #region/#endregion pair untouched too, the shape prefer-doc-comment.ts already recognises', () => {
    const code = '// #region helpers\nexport const x = 1;\n// #endregion\n';
    expect(fixedOutput(code)).toBe(code);
  });

  it('still reports and fixes an ordinary // line comment missing its own leading space, proving the added markers are scoped to `#` and do not disable the rule generally', () => {
    expect(fixedOutput('//no space here\nexport const x = 1;\n')).toBe('// no space here\nexport const x = 1;\n');
  });
});

// A real --fix run, not just the config shape asserted above: proves multiline-comment-style is genuinely not enabled at all (see this file's own header comment on why), not merely scoped away from some files, by running the config against the exact shapes that would break under the installed release's own directive-comment gap if the rule were on.
describe('multiline-comment-style (deliberately not enabled, in any file)', () => {
  const linter = new LinterClass();
  // The exact shape TypeScript itself generates for a Next.js project's own next-env.d.ts: two consecutive `/// <reference ... />` lines with no blank line between them, and nothing else above the statement they sit over.
  const tripleSlashCode = '/// <reference types="node" />\n/// <reference lib="es2022" />\nexport const z = 1;\n';
  // The real-world prettier-ignore repro this package's own review found: a prose comment immediately above a directive the installed rule's own filter does not recognise, on a NON-exported statement (so exadev/prefer-doc-comment, scoped to exported declarations only, never reports or fixes it either).
  const prettierIgnoreCode = '// A lookup table laid out by hand.\n// prettier-ignore\nconst grid = [\n  [1, 0, 0],\n];\n';

  function fixedOutput(code: string, filename: string): string {
    return linter.verifyAndFix(code, REAL_LINTER_CONFIG, filename).output;
  }

  it('leaves two consecutive triple-slash reference directives untouched in a .d.ts file', () => {
    expect(fixedOutput(tripleSlashCode, 'next-env.d.ts')).toBe(tripleSlashCode);
  });

  it('leaves the identical two triple-slash directives untouched in an ordinary .ts file too, the shape a vite.config.ts following Vitest\'s own documented convention uses', () => {
    expect(fixedOutput(tripleSlashCode, 'vite.config.ts')).toBe(tripleSlashCode);
  });

  it('leaves a prose comment directly above a prettier-ignore directive as two standalone `//` lines, never merged into one block that would swallow the directive', () => {
    expect(fixedOutput(prettierIgnoreCode, 'table.ts')).toBe(prettierIgnoreCode);
  });

  it('leaves an ordinary run of `//` lines with no directive at all as standalone lines too, proving the rule is off rather than merely blind to directive-shaped input', () => {
    const code = '// first line\n// second line\nconst x = 1;\n';
    expect(fixedOutput(code, 'plain.ts')).toBe(code);
  });
});

// A real --fix run: `blankLine: 'always'` matched against `next: '*'` would, on its own, insert a blank line after EVERY directive and EVERY import, not only after the last one in a run, since `'*'` matches a following directive/import too. The two `blankLine: 'any'` entries added alongside them must be observed through the fixer's own actual output, not the config-shape test above, to prove they close that gap rather than merely producing an object of the right shape.
describe('padding-line-between-statements (consecutive directives and imports stay together)', () => {
  const linter = new LinterClass();

  function fixedOutput(code: string): string {
    return linter.verifyAndFix(code, REAL_LINTER_CONFIG, 'padding.ts').output;
  }

  it('does not insert a blank line between two consecutive directives, and treats a trailing CommonJS require alongside two ES imports as one unbroken import-like run, but still requires one after the directive prologue before the run starts', () => {
    const code = "'use strict';\n'use client';\nimport { a } from './x';\nimport { b } from './y';\nconst c = require('z');\n";
    expect(fixedOutput(code)).toBe("'use strict';\n'use client';\n\nimport { a } from './x';\nimport { b } from './y';\nconst c = require('z');\n");
  });

  it('still requires a blank line between the last directive and the first import', () => {
    const code = "'use strict';\nimport { a } from './x';\n";
    expect(fixedOutput(code)).toBe("'use strict';\n\nimport { a } from './x';\n");
  });

  it('still requires a blank line after the last import before an ordinary statement that is not itself import-like', () => {
    const code = "import { a } from './x';\nimport { b } from './y';\nconst c = 1;\n";
    expect(fixedOutput(code)).toBe("import { a } from './x';\nimport { b } from './y';\n\nconst c = 1;\n");
  });
});

// A real --fix run pinning the confirmed, documented gap this file's own header comment describes: spaced-comment's own hard-coded exemption only recognises the SPACED triple-slash form (`/// <reference ... />`), never the no-space one, which is still valid TypeScript syntax. Both cases are pinned here, not only the broken one, so a future upstream fix (which would flip the second assertion) is caught by a real, visibly failing test rather than silently going unnoticed.
describe('spaced-comment (triple-slash reference directive)', () => {
  const linter = new LinterClass();

  function fixedOutput(code: string): string {
    return linter.verifyAndFix(code, REAL_LINTER_CONFIG, 'reference.ts').output;
  }

  it('leaves a spaced triple-slash reference directive untouched, the shape TypeScript itself always emits', () => {
    const code = '/// <reference types="node" />\nexport const z = 1;\n';
    expect(fixedOutput(code)).toBe(code);
  });

  it('rewrites a no-space triple-slash reference directive, breaking it: the confirmed upstream gap tracked at ExaDev/eslint-config#47', () => {
    const code = '///<reference types="node" />\nexport const z = 1;\n';
    expect(fixedOutput(code)).toBe('// /<reference types="node" />\nexport const z = 1;\n');
  });
});
