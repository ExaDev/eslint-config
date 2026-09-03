import type { TSESLint } from '@typescript-eslint/utils';
import type { ConfigArrayValue } from './config-types';
import { readFlatConfig, tryRequire, type RequireFn } from './optional-plugin';

// A .jsx/.tsx file existing is itself unambiguous evidence a project writes JSX -- unlike eslint-plugin-react merely being resolvable, which can happen via unrelated hoisting in a monorepo without a single JSX file anywhere in the linted project. Scoping every React-family rule block to this glob is what makes package-presence-based auto-detection safe: even if the plugin resolves for an unrelated reason, its rules are never matched against a file that isn't JSX in the first place, since ESLint's own flat-config `files` matching happens per linted file, at lint time, not at config-build time.
export const JSX_FILE_PATTERNS: readonly string[] = ['**/*.jsx', '**/*.tsx'];

export interface ReactConfigOptions {
  // true: force on, throwing if eslint-plugin-react (the anchor) isn't resolvable. false: force off, skipping resolution entirely. undefined (the default, whether omitted or passed explicitly -- exactOptionalPropertyTypes distinguishes the two, so both are named here): auto-detect, silently returning [] if unresolvable.
  readonly enabled?: boolean | undefined;
  // Test seam only -- defaults to the real resolver. Never exposed through exadevConfig()'s own public options.
  readonly requireFn?: RequireFn;
}

const INSTALL_COMMAND = 'pnpm add -D eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y';

function isFlatConfig(value: TSESLint.FlatConfig.Config | undefined): value is TSESLint.FlatConfig.Config {
  return value !== undefined;
}

// eslint-plugin-react is the anchor: its presence (or explicit absence via enabled: false) gates the whole block. eslint-plugin-react-hooks and eslint-plugin-jsx-a11y are genuine companions, not sub-requirements -- a consumer who has only installed eslint-plugin-react gets react's own rules with no error, since a partial React-tooling setup is a legitimate, common starting point, not a misconfiguration.
export function buildReactConfig(options: ReactConfigOptions = {}): ConfigArrayValue {
  if (options.enabled === false) return [];

  const reactModule = tryRequire('eslint-plugin-react', options.requireFn);
  const reactConfig = readFlatConfig(reactModule, ['configs', 'flat', 'recommended']);

  if (options.enabled === true && reactConfig === undefined) {
    throw new Error(
      `@exadev/eslint-config: React support was explicitly requested but 'eslint-plugin-react' could not be resolved. Install it with: ${INSTALL_COMMAND}`,
    );
  }
  if (reactConfig === undefined) return [];

  // `flat/recommended` alone assumes the classic runtime, requiring `import React` in scope in every JSX file -- wrong for every React 17+ project using the automatic JSX runtime (the default since React 17, and the only option Next.js's own compiler supports). `flat/jsx-runtime` is eslint-plugin-react's own documented pairing for exactly this: it turns `react/react-in-jsx-scope` and `react/jsx-uses-react` back off. Spread after `reactConfig` so its `off` wins the per-rule merge.
  const jsxRuntimeConfig = readFlatConfig(reactModule, ['configs', 'flat', 'jsx-runtime']);

  const hooksModule = tryRequire('eslint-plugin-react-hooks', options.requireFn);
  const hooksConfig =
    readFlatConfig(hooksModule, ['configs', 'flat', 'recommended-latest']) ?? readFlatConfig(hooksModule, ['configs', 'recommended-latest']);

  // eslint-plugin-jsx-a11y's genuinely flat-shaped export lives at the top-level `flatConfigs.recommended`, a separate property from `configs.recommended` -- confirmed directly: `configs.recommended` is the legacy eslintrc-format config (plugins as an array of name strings, a top-level parserOptions field), kept for old-style .eslintrc consumers, and spreading it into a real flat config throws a hard ConfigError. `flatConfigs.recommended` has a proper `plugins` object and correctly nests `languageOptions.parserOptions`.
  const a11yModule = tryRequire('eslint-plugin-jsx-a11y', options.requireFn);
  const a11yConfig = readFlatConfig(a11yModule, ['flatConfigs', 'recommended']);

  return [reactConfig, jsxRuntimeConfig, hooksConfig, a11yConfig]
    .filter(isFlatConfig)
    .map((config) => ({ ...config, files: [...JSX_FILE_PATTERNS] }));
}
