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

  it('the first block scopes the hand-picked comment/class-member/statement rules to every JS/TS file, with their exact options, enabling multiline-comment-style only through the exadev wrapper', () => {
    // No `@stylistic/multiline-comment-style` key at all: the wrapper `exadev/multiline-comment-style` replaces it (see stylistic-comments.ts's own header comment), and enabling both would report every run twice with the upstream fixer still folding task markers.
    expect(stylisticCommentsConfig[0]).toEqual({
      files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
      plugins: { '@stylistic': stylistic, exadev: plugin },
      rules: {
        '@stylistic/spaced-comment': ['error', 'always', { block: { markers: ['!'] }, line: { markers: ['#', '#region', '#endregion'] } }],
        '@stylistic/lines-between-class-members': 'error',
        '@stylistic/line-comment-position': ['error', { position: 'above', ignorePattern: '^\\s*cspell:disable-line\\b' }],
        '@stylistic/padding-line-between-statements': [
          'error',
          { blankLine: 'always', prev: 'directive', next: '*' },
          { blankLine: 'always', prev: ['cjs-import', 'import'], next: '*' },
          { blankLine: 'any', prev: 'directive', next: 'directive' },
          { blankLine: 'any', prev: ['cjs-import', 'import'], next: ['cjs-import', 'import'] },
          { blankLine: 'always', prev: '*', next: 'return' },
        ],
        'exadev/multiline-comment-style': ['error', 'bare-block'],
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

// A real --fix run of the bundled config, which enables `exadev/multiline-comment-style` at 'bare-block': ordinary runs are converted, every directive the upstream rule or `exadev/prefer-doc-comment` recognises survives as its own `//` line, and the doc-comment upgrade on an exported declaration is never lost to a merged block.
describe('exadev/multiline-comment-style in the bundled config', () => {
  const linter = new LinterClass();

  function fixedOutput(code: string, filename: string): string {
    return linter.verifyAndFix(code, REAL_LINTER_CONFIG, filename).output;
  }

  it('converts an ordinary run of `//` lines into one bare block', () => {
    expect(fixedOutput('// first line\n// second line\nconst x = 1;\n', 'plain.ts')).toBe('/* first line\n   second line */\nconst x = 1;\n');
  });

  it.each(['prettier-ignore', 'c8 ignore next', 'v8 ignore next', 'istanbul ignore next', '@ts-expect-error the next line is wrong on purpose', '@ts-ignore', '@ts-nocheck', '@ts-check'])('keeps the upstream directive `// %s` as its own line inside a prose run, converting only the prose after it', (directive) => {
    const code = `// Prose before the directive.\n// ${directive}\n// Prose line one.\n// Prose line two.\nconst x = 1;\n`;
    expect(fixedOutput(code, 'directive.ts')).toBe(`// Prose before the directive.\n// ${directive}\n/* Prose line one.\n   Prose line two. */\nconst x = 1;\n`);
  });

  it.each(['TODO: revisit this', 'FIXME later', 'todo: lower-case marker', 'fixme(scope): message', 'cspell:disable-next-line', 'biome-ignore lint/style: reason', '#region helpers'])('keeps `// %s` as its own line between two prose runs, converting each run on its own', (marker) => {
    const code = `// Before one.\n// Before two.\n// ${marker}\n// After one.\n// After two.\nconst x = 1;\n`;
    expect(fixedOutput(code, 'marker.ts')).toBe(`/* Before one.\n   Before two. */\n// ${marker}\n/* After one.\n   After two. */\nconst x = 1;\n`);
  });

  it.each(['next-env.d.ts', 'vite.config.ts'])('leaves two consecutive triple-slash reference directives untouched in %s, the case upstream issue 1285 reports', (filename) => {
    const code = '/// <reference types="node" />\n/// <reference lib="es2022" />\nexport const z = 1;\n';
    expect(fixedOutput(code, filename)).toBe(code);
  });

  it('leaves a triple-slash AMD directive and a reference directive untouched together', () => {
    const code = '/// <amd-module name="x" />\n/// <reference path="a.d.ts" />\nexport const z = 1;\n';
    expect(fixedOutput(code, 'amd.ts')).toBe(code);
  });

  it('leaves a prose comment directly above a prettier-ignore directive as two standalone `//` lines on a non-exported statement', () => {
    const code = '// A lookup table laid out by hand.\n// prettier-ignore\nconst grid = [\n  [1, 0, 0],\n];\n';
    expect(fixedOutput(code, 'table.ts')).toBe(code);
  });

  it('still gives an exported declaration its doc comment when a TODO sits in its leading run: the prose below the marker becomes the doc comment and the prose above it a bare block', () => {
    const code = '// Explanation line one.\n// Explanation line two.\n// TODO: revisit\n// Detail line one.\n// Detail line two.\nexport function f() {}\n';
    expect(fixedOutput(code, 'todo.ts')).toBe('/* Explanation line one.\n   Explanation line two. */\n// TODO: revisit\n/**\n * Detail line one.\n * Detail line two.\n */\nexport function f() {}\n');
  });

  it('converts an exported declaration\'s plain leading run straight to a doc comment, the bare block the stylistic fixer may produce first being upgraded by prefer-doc-comment', () => {
    const code = '// Detail line one.\n// Detail line two.\nexport function f() {}\n';
    expect(fixedOutput(code, 'doc.ts')).toBe('/**\n * Detail line one.\n * Detail line two.\n */\nexport function f() {}\n');
  });

  it('writes a bare `\\n` inside the merged block in a CRLF file, the upstream fixer\'s own behaviour, which the wrapper passes through unchanged', () => {
    expect(fixedOutput('// first line\r\n// second line\r\nconst x = 1;\r\n', 'crlf.ts')).toBe('/* first line\n   second line */\r\nconst x = 1;\r\n');
  });

  it('splits a CRLF run at a TODO exactly as an LF one, the merged block carrying the same bare `\\n`', () => {
    expect(fixedOutput('// a\r\n// TODO x\r\n// b\r\n// c\r\nconst x = 1;\r\n', 'crlf-todo.ts')).toBe('// a\r\n// TODO x\r\n/* b\n   c */\r\nconst x = 1;\r\n');
  });
});

// The upstream rule alone, against the shapes the wrapper exists for. Each case passing means upstream still folds that line into the merged block, so the wrapper is still needed for it. When a case fails, upstream now treats that line as a directive and it can be dropped from the reasons the wrapper exists; when every case fails, `exadev/multiline-comment-style` can be deleted and `@stylistic/multiline-comment-style` enabled at 'bare-block' in its place.
describe('upstream @stylistic/multiline-comment-style alone (the wrapper is still needed while these pass)', () => {
  const linter = new LinterClass();
  const UPSTREAM_ONLY_CONFIG: Linter.Config[] = [{ files: ['**'], plugins: { '@stylistic': stylistic }, rules: { '@stylistic/multiline-comment-style': ['error', 'bare-block'] } }];

  function upstreamFixedOutput(marker: string): string {
    return linter.verifyAndFix(`// Prose line one.\n// ${marker}\n// Prose line two.\nconst x = 1;\n`, UPSTREAM_ONLY_CONFIG, 'upstream.ts').output;
  }

  it.each(['TODO: revisit this', 'FIXME later'])('still folds `// %s` into the merged block; if this fails, upstream now treats TODO and FIXME as directives (eslint-stylistic issue 1287) and the wrapper can be deleted once the other shapes below fail too', (marker) => {
    expect(upstreamFixedOutput(marker)).toBe(`/* Prose line one.\n   ${marker}\n   Prose line two. */\nconst x = 1;\n`);
  });

  it.each(['todo: lower-case marker', 'cspell:disable-next-line', 'biome-ignore lint/style: reason', '#region helpers'])('still folds `// %s` into the merged block; if this fails, upstream now treats it as a directive and it no longer needs the wrapper', (marker) => {
    expect(upstreamFixedOutput(marker)).toBe(`/* Prose line one.\n   ${marker}\n   Prose line two. */\nconst x = 1;\n`);
  });
});

// A real Linter run pinning the ignorePattern's own reason for existing: `cspell:disable-line` suppresses spell-checking for the very line it sits on, so it only ever works as a trailing comment, and the rule has no autofix, so without the exemption its report demands a hand-move that silently retargets the suppression at the previous line. The companion cases prove the exemption is scoped to the directive line alone, never a general off switch for the rule.
describe('line-comment-position (the cspell:disable-line ignorePattern)', () => {
  const linter = new LinterClass();

  function lint(code: string): (string | null)[] {
    return linter.verify(code, REAL_LINTER_CONFIG, 'cspell.ts').map((message) => message.ruleId);
  }

  it('does not report a trailing // cspell:disable-line, the one directive that only works in trailing position', () => {
    const ruleIds = lint("const word = 'qwxzzyv'; // cspell:disable-line\nexport function f() {}\n");
    expect(ruleIds).not.toContain('@stylistic/line-comment-position');
  });

  it('still reports an ordinary trailing // comment, proving the ignorePattern exempts the directive alone and does not disable the rule generally', () => {
    const ruleIds = lint("const word = 'ordinary'; // trailing note\nexport function f() {}\n");
    expect(ruleIds).toContain('@stylistic/line-comment-position');
  });

  it('still reports a trailing comment merely opening with cspell:disable-line-shaped prose (no word boundary after it), proving the pattern is bounded rather than a bare prefix match', () => {
    const ruleIds = lint("const word = 'ordinary'; // cspell:disable-liner is not a directive\nexport function f() {}\n");
    expect(ruleIds).toContain('@stylistic/line-comment-position');
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

// A real --fix run pinning spaced-comment's triple-slash exemption in both spellings TypeScript accepts: the spaced `/// <reference ... />` form and the no-space `///<reference ... />` form, which @stylistic/eslint-plugin before 6.0.0 rewrote into a broken `// /<reference ... />` comment (ExaDev/eslint-config#47). A regression in either is a visibly failing test, not a silently broken directive.
describe('spaced-comment (triple-slash reference directive)', () => {
  const linter = new LinterClass();

  function fixedOutput(code: string): string {
    return linter.verifyAndFix(code, REAL_LINTER_CONFIG, 'reference.ts').output;
  }

  it('leaves a spaced triple-slash reference directive untouched, the shape TypeScript itself always emits', () => {
    const code = '/// <reference types="node" />\nexport const z = 1;\n';
    expect(fixedOutput(code)).toBe(code);
  });

  it('leaves a no-space triple-slash reference directive untouched too, never rewritten into a broken `// /<reference` comment', () => {
    const code = '///<reference types="node" />\nexport const z = 1;\n';
    expect(fixedOutput(code)).toBe(code);
  });

  it('leaves a no-space triple-slash AMD directive untouched, the other directive family the exemption covers', () => {
    const code = '///<amd-module name="x" />\nexport const z = 1;\n';
    expect(fixedOutput(code)).toBe(code);
  });

  it('still rewrites an ordinary no-space `///` comment that is not a reference/AMD directive, proving the exemption is scoped to directives and does not disable the rule for triple-slash comments generally', () => {
    expect(fixedOutput('///not a directive\nexport const z = 1;\n')).toBe('// /not a directive\nexport const z = 1;\n');
  });
});
