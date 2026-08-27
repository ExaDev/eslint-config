import type { TSESLint } from '@typescript-eslint/utils';
import { describe, expect, it } from 'vitest';
import { exadevConfig } from './create-config';
import recommendedTypeChecked from './recommended-type-checked';

describe('exadevConfig', () => {
  it('with both features forced off, returns exactly the base recommendedTypeChecked length, regardless of what is installed', () => {
    expect(exadevConfig({ react: false, nextjs: false })).toHaveLength(recommendedTypeChecked.length);
  });

  it('with no args, auto-detects against this repo\'s own real devDependencies (react + hooks + a11y + nextjs all installed for testing)', () => {
    // This repo's package.json installs eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-jsx-a11y, and @next/eslint-plugin-next as real devDependencies specifically so this integration check runs against genuinely resolvable packages, not a simulated environment.
    const REACT_FAMILY_BLOCK_COUNT = 3; // react, react-hooks, jsx-a11y
    const NEXTJS_BLOCK_COUNT = 1;
    const result = exadevConfig();
    expect(result).toHaveLength(recommendedTypeChecked.length + REACT_FAMILY_BLOCK_COUNT + NEXTJS_BLOCK_COUNT);
  });

  it('appends trailing user configs, in order, after everything else', () => {
    const extraA: TSESLint.FlatConfig.Config = { rules: { 'no-console': 'warn' } };
    const extraB: TSESLint.FlatConfig.Config = { files: ['**/*.spec.ts'] };
    const result = exadevConfig({}, extraA, extraB);
    const SECOND_TO_LAST = -2;
    const LAST = -1;
    expect(result.at(SECOND_TO_LAST)).toBe(extraA);
    expect(result.at(LAST)).toBe(extraB);
  });
});
