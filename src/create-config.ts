import type { TSESLint } from '@typescript-eslint/utils';
import type { ConfigArrayValue, PublicConfigArray } from './config-types';
import jsdocAndTsdoc from './jsdoc';
import jsonCanonicalConfig from './json-canonical';
import { buildNextjsConfig } from './nextjs';
import { buildReactConfig } from './react';
import recommendedTypeChecked from './recommended-type-checked';
import { toPublicConfigArray } from './to-public-config-array';

export interface ExadevConfigOptions {
  readonly react?: boolean;
  readonly nextjs?: boolean;
}

// jsdocAndTsdoc and jsonCanonicalConfig are bundled unconditionally, the same way recommendedTypeChecked itself is -- unlike react/nextjs below, neither is a consumer framework choice with its own optional peer dependency to resolve; eslint-plugin-jsdoc, eslint-plugin-tsdoc, and eslint-plugin-json-canonical are all plain dependencies of this package (see package.json), so every consumer already has them the moment they depend on this package at all.
//
// The tri-state per feature threads straight into each builder's own `enabled` option -- true forces on (throwing if the underlying peer isn't resolvable), false forces off (skipping resolution entirely), undefined auto-detects (silently empty if unresolvable). One resolution pass per feature; no separate pre-check gate that would resolve twice.
export function exadevConfig(options: ExadevConfigOptions = {}, ...userConfigs: readonly TSESLint.FlatConfig.Config[]): PublicConfigArray {
  const built: ConfigArrayValue = [...recommendedTypeChecked, ...jsdocAndTsdoc, ...jsonCanonicalConfig, ...buildReactConfig({ enabled: options.react }), ...buildNextjsConfig({ enabled: options.nextjs }), ...userConfigs];
  return toPublicConfigArray(built);
}

// Evaluated once, eagerly, at module load -- exactly matching how recommendedTypeChecked itself is already eagerly built today. This is what lets src/index.ts re-export a plain, already-computed array under the name `default`: every existing consumer's `...exadev` spread sees the identical shape and timing as before this file existed, whether or not React/Next.js support resolves in their own project.
export const defaultConfig: PublicConfigArray = exadevConfig();
