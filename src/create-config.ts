import type { TSESLint } from '@typescript-eslint/utils';
import type { ConfigArrayValue } from './config-types';
import { buildNextjsConfig } from './nextjs';
import { buildReactConfig } from './react';
import recommendedTypeChecked from './recommended-type-checked';

export interface ExadevConfigOptions {
  readonly react?: boolean;
  readonly nextjs?: boolean;
}

// The tri-state per feature threads straight into each builder's own `enabled` option -- true forces on (throwing if the underlying peer isn't resolvable), false forces off (skipping resolution entirely), undefined auto-detects (silently empty if unresolvable). One resolution pass per feature; no separate pre-check gate that would resolve twice.
export function exadevConfig(options: ExadevConfigOptions = {}, ...userConfigs: readonly TSESLint.FlatConfig.Config[]): ConfigArrayValue {
  return [...recommendedTypeChecked, ...buildReactConfig({ enabled: options.react }), ...buildNextjsConfig({ enabled: options.nextjs }), ...userConfigs];
}

// Evaluated once, eagerly, at module load -- exactly matching how recommendedTypeChecked itself is already eagerly built today. This is what lets src/index.ts re-export a plain, already-computed array under the name `default`: every existing consumer's `...exadev` spread sees the identical shape and timing as before this file existed, whether or not React/Next.js support resolves in their own project.
export const defaultConfig: ConfigArrayValue = exadevConfig();
