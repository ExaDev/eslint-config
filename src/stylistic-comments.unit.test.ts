import stylistic from '@stylistic/eslint-plugin';

import { describe, expect, it } from 'vitest';

import plugin from './plugin';

import { JSX_FILE_PATTERNS } from './react';

import stylisticCommentsConfig from './stylistic-comments';

// Deep-equality (toEqual) against each block's full expected shape, not toMatchObject: a mutant that empties any nested object literal (`plugins: {}`, `rules: {}`) or the whole block (`{}`) is only caught by an assertion that would fail on a MISSING expected key too, not just a changed value on a key that happens to already be present.
describe('stylisticCommentsConfig', () => {
  it('has exactly two config blocks', () => {
    expect(stylisticCommentsConfig).toHaveLength(2);
  });

  it('the first block scopes the hand-picked comment/class-member/statement rules to every JS/TS file, with their exact options', () => {
    expect(stylisticCommentsConfig[0]).toEqual({
      files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
      plugins: { '@stylistic': stylistic, exadev: plugin },
      rules: {
        '@stylistic/multiline-comment-style': ['error', 'bare-block'],
        '@stylistic/spaced-comment': 'error',
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
