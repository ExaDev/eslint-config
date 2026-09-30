import type { ConfigArrayValue } from './config-types';
import { buildOptionalPluginConfig, type OptionalPluginOptions } from './optional-plugin';

/**
 * No files glob override, unlike react.ts's JSX_FILE_PATTERNS: `@next/eslint-plugin-next`'s own presence is already an unambiguous signal on its own: nobody has this specific package resolvable for any reason other than a real Next.js project (unlike `react` itself, a hugely common transitive dependency of unrelated tooling), so there is no equivalent false-positive-activation risk to close with a glob.
 */
export function buildNextjsConfig(options: OptionalPluginOptions = {}): ConfigArrayValue {
  return buildOptionalPluginConfig({ packageName: '@next/eslint-plugin-next', configPath: ['configs', 'core-web-vitals'], feature: 'Next.js support' }, options);
}
