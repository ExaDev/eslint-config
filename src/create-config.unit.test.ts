import type { TSESLint } from '@typescript-eslint/utils';
import { describe, expect, it } from 'vitest';
import { exadevConfig } from './create-config';
import jsdocAndTsdoc from './jsdoc';
import jsonCanonicalConfig from './json-canonical';
import recommendedTypeChecked from './recommended-type-checked';
import stylisticCommentsConfig from './stylistic-comments';

describe('exadevConfig', () => {
  it('with every optional feature forced off, returns exactly the base recommendedTypeChecked plus jsdocAndTsdoc plus jsonCanonicalConfig plus stylisticCommentsConfig length, regardless of what is installed', () => {
    expect(exadevConfig({ react: false, nextjs: false, turboEnv: false, packageJsonKeyOrder: false, gitignore: false })).toHaveLength(
      recommendedTypeChecked.length + jsdocAndTsdoc.length + jsonCanonicalConfig.length + stylisticCommentsConfig.length,
    );
  });

  it('with no args, auto-detects against this repo\'s own real devDependencies and its own real .gitignore (react + hooks + a11y + nextjs all installed for testing, no syncpack config present)', () => {
    // This repo's package.json installs eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-jsx-a11y, and @next/eslint-plugin-next as real devDependencies specifically so this integration check runs against genuinely resolvable packages, not a simulated environment. It also has no syncpack config of its own, so packageJsonKeyOrder's own auto-detect activates for real too, resolving @eslint/json (also a real devDependency here). It does have a real .gitignore (this very repo's own), so gitignore's own auto-detect activates for real too.
    // react, jsx-runtime, react-hooks, jsx-a11y
    const REACT_FAMILY_BLOCK_COUNT = 4;
    const NEXTJS_BLOCK_COUNT = 1;
    const PACKAGE_JSON_KEY_ORDER_BLOCK_COUNT = 1;
    const GITIGNORE_BLOCK_COUNT = 1;
    const TURBO_ENV_BLOCK_COUNT = 1;
    const result = exadevConfig();
    expect(result).toHaveLength(
      recommendedTypeChecked.length +
        jsdocAndTsdoc.length +
        jsonCanonicalConfig.length +
        stylisticCommentsConfig.length +
        REACT_FAMILY_BLOCK_COUNT +
        NEXTJS_BLOCK_COUNT +
        PACKAGE_JSON_KEY_ORDER_BLOCK_COUNT +
        GITIGNORE_BLOCK_COUNT +
        TURBO_ENV_BLOCK_COUNT,
    );
  });

  it('workspaceArchitecture, when given, wires in workspaceArchitectureConfig\'s own single block', () => {
    const WORKSPACE_ARCHITECTURE_BLOCK_COUNT = 1;
    const result = exadevConfig({
      react: false,
      nextjs: false,
      turboEnv: false,
      packageJsonKeyOrder: false,
      gitignore: false,
      workspaceArchitecture: { groups: [{ name: 'core', rank: 0 }] },
    });
    expect(result).toHaveLength(
      recommendedTypeChecked.length + jsdocAndTsdoc.length + jsonCanonicalConfig.length + stylisticCommentsConfig.length + WORKSPACE_ARCHITECTURE_BLOCK_COUNT,
    );
  });

  it('turboEnv wires in the eslint-plugin-turbo block when true or auto-detected, and not when false', () => {
    const base = { react: false, nextjs: false, packageJsonKeyOrder: false, gitignore: false } as const;
    const hasEnvRule = (blocks: ReturnType<typeof exadevConfig>) => blocks.some((block) => block.rules !== undefined && 'turbo/no-undeclared-env-vars' in block.rules);
    expect(hasEnvRule(exadevConfig({ ...base, turboEnv: true }))).toBe(true);
    expect(hasEnvRule(exadevConfig(base))).toBe(true);
    expect(hasEnvRule(exadevConfig({ ...base, turboEnv: false }))).toBe(false);
  });

  it('turbo, when given, wires in turboConfig\'s blocks, before any trailing user configs', () => {
    const TURBO_BLOCK_COUNT = 2;
    const extra: TSESLint.FlatConfig.Config = { rules: { 'no-console': 'warn' } };
    const base = { react: false, nextjs: false, packageJsonKeyOrder: false, gitignore: false } as const;
    const withoutTurbo = exadevConfig(base, extra);
    const withTurbo = exadevConfig({ ...base, turbo: {} }, extra);
    expect(withTurbo).toHaveLength(withoutTurbo.length + TURBO_BLOCK_COUNT);
    expect(withTurbo.at(-1)).toBe(extra);
    const hasTurboRule = (blocks: typeof withTurbo) => blocks.some((block) => block.rules !== undefined && 'exadev/turbo-task-outputs' in block.rules);
    expect(hasTurboRule(withTurbo)).toBe(true);
    expect(hasTurboRule(withoutTurbo)).toBe(false);
  });

  describe('turbo boundaries groups with workspaceArchitecture', () => {
    const base = { react: false, nextjs: false, packageJsonKeyOrder: false, gitignore: false } as const;
    const workspaceArchitecture = { groups: [{ name: 'core', rank: 0 }, { name: 'targets', path: 'apps', rank: 1 }] };
    const tagRuleOptions = (blocks: ReturnType<typeof exadevConfig>): unknown => blocks.map((block) => block.rules?.['exadev/turbo-package-tags']).find((rule) => rule !== undefined);

    it('takes the boundary groups from the workspace groups, keeping each path', () => {
      const result = exadevConfig({ ...base, workspaceArchitecture, turbo: { boundaries: { aggregateScript: 'check' } } });
      expect(tagRuleOptions(result)).toEqual(['error', expect.objectContaining({ boundaries: { aggregateScript: 'check', groups: [{ name: 'core' }, { name: 'targets', path: 'apps' }] } })]);
    });

    it('leaves the boundary groups unset without workspaceArchitecture', () => {
      const result = exadevConfig({ ...base, turbo: { boundaries: {} } });
      expect(tagRuleOptions(result)).toEqual(['error', expect.objectContaining({ boundaries: {} })]);
    });

    it('does not enable the boundaries rules when turbo has no boundaries option', () => {
      const result = exadevConfig({ ...base, workspaceArchitecture, turbo: {} });
      expect(tagRuleOptions(result)).toBeUndefined();
    });

    it('throws when boundaries.groups repeats the workspace groups', () => {
      expect(() => exadevConfig({ ...base, workspaceArchitecture, turbo: { boundaries: { groups: [{ name: 'core' }] } } })).toThrow('"turbo.boundaries.groups" duplicates "workspaceArchitecture.groups"');
    });

    it('accepts boundaries.groups when there is no workspaceArchitecture to duplicate', () => {
      const result = exadevConfig({ ...base, turbo: { boundaries: { groups: [{ name: 'core' }] } } });
      expect(tagRuleOptions(result)).toEqual(['error', expect.objectContaining({ boundaries: { groups: [{ name: 'core' }] } })]);
    });
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
