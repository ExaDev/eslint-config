import type { TSESLint } from '@typescript-eslint/utils';
import { describe, expect, it } from 'vitest';
import { exadevConfig } from './create-config';
import jsdocAndTsdoc from './jsdoc';
import jsonCanonicalConfig from './json-canonical';
import recommendedTypeChecked from './recommended-type-checked';

describe('exadevConfig', () => {
  it('with every optional feature forced off, returns exactly the base recommendedTypeChecked plus jsdocAndTsdoc plus jsonCanonicalConfig length, regardless of what is installed', () => {
    expect(exadevConfig({ react: false, nextjs: false, packageJsonKeyOrder: false, gitignore: false })).toHaveLength(
      recommendedTypeChecked.length + jsdocAndTsdoc.length + jsonCanonicalConfig.length,
    );
  });

  it('with no args, auto-detects against this repo\'s own real devDependencies and its own real .gitignore (react + hooks + a11y + nextjs all installed for testing, no syncpack config present)', () => {
    // This repo's package.json installs eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-jsx-a11y, and @next/eslint-plugin-next as real devDependencies specifically so this integration check runs against genuinely resolvable packages, not a simulated environment. It also has no syncpack config of its own, so packageJsonKeyOrder's own auto-detect activates for real too, resolving @eslint/json (also a real devDependency here). It does have a real .gitignore (this very repo's own), so gitignore's own auto-detect activates for real too.
    const REACT_FAMILY_BLOCK_COUNT = 4; // react, jsx-runtime, react-hooks, jsx-a11y
    const NEXTJS_BLOCK_COUNT = 1;
    const PACKAGE_JSON_KEY_ORDER_BLOCK_COUNT = 1;
    const GITIGNORE_BLOCK_COUNT = 1;
    const result = exadevConfig();
    expect(result).toHaveLength(
      recommendedTypeChecked.length +
        jsdocAndTsdoc.length +
        jsonCanonicalConfig.length +
        REACT_FAMILY_BLOCK_COUNT +
        NEXTJS_BLOCK_COUNT +
        PACKAGE_JSON_KEY_ORDER_BLOCK_COUNT +
        GITIGNORE_BLOCK_COUNT,
    );
  });

  it('workspaceArchitecture, when given, wires in workspaceArchitectureConfig\'s own single block', () => {
    const WORKSPACE_ARCHITECTURE_BLOCK_COUNT = 1;
    const result = exadevConfig({
      react: false,
      nextjs: false,
      packageJsonKeyOrder: false,
      gitignore: false,
      workspaceArchitecture: { groups: [{ name: 'core', rank: 0 }] },
    });
    expect(result).toHaveLength(recommendedTypeChecked.length + jsdocAndTsdoc.length + jsonCanonicalConfig.length + WORKSPACE_ARCHITECTURE_BLOCK_COUNT);
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
