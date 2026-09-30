import type { TSESLint } from '@typescript-eslint/utils';
import type { ConfigArrayValue } from './config-types';
import { buildOptionalPluginConfig, type OptionalPluginOptions } from './optional-plugin';
import { JSX_FILE_PATTERNS } from './react';

/**
 * What `buildNextjsConfig` takes: the tri-state options every single-plugin preset takes, and this package's own plugin, which the preset's rule block registers. It is passed in rather than imported because `plugin.ts` builds `plugin.configs.nextjs` from this module, and importing it back would make the two modules import each other.
 */
export interface NextjsConfigOptions extends OptionalPluginOptions {
  readonly plugin: TSESLint.FlatConfig.Plugin;
}

/**
 * The upstream `@next/eslint-plugin-next` config, then this package's own rules for the server component boundary, in files that can contain JSX. Both appear together or not at all: the second block is added only when the first resolves, so a project without Next.js sees neither.
 *
 * The upstream block carries no files glob override, unlike react.ts's JSX_FILE_PATTERNS: `@next/eslint-plugin-next`'s own presence is already an unambiguous signal on its own: nobody has this specific package resolvable for any reason other than a real Next.js project (unlike `react` itself, a hugely common transitive dependency of unrelated tooling), so there is no equivalent false-positive-activation risk to close with a glob. The rule block is scoped to JSX files because only they can hold the constructs the rules read. Both rules skip a file with a top-level `"use client"` directive themselves.
 */
export function buildNextjsConfig(options: NextjsConfigOptions): ConfigArrayValue {
  const upstream = buildOptionalPluginConfig({ packageName: '@next/eslint-plugin-next', configPath: ['configs', 'core-web-vitals'], feature: 'Next.js support' }, options);
  if (upstream.length === 0) return upstream;

  return [
    ...upstream,
    {
      files: [...JSX_FILE_PATTERNS],
      plugins: { exadev: options.plugin },
      rules: { 'exadev/no-non-serialisable-server-prop': 'error', 'exadev/no-external-member-jsx-tag': 'error' },
    },
  ];
}
