import type { ConfigArrayValue } from './config-types';
import { buildOptionalPluginConfig, type OptionalPluginOptions } from './optional-plugin';
import { SOURCE_FILE_GLOBS } from './turbo-config';

/**
 * `eslint-plugin-turbo`'s `flat/recommended` config, which reports environment variables read in source (`no-undeclared-env-vars`) that no `turbo.json` in the repository declares in `env` or `globalEnv`. Turbo's strict env mode strips undeclared variables from a task's environment, so an undeclared read fails at runtime or is missing from the cache key. Scoped to JavaScript and TypeScript sources: the upstream block has no `files`, and would otherwise be matched against files linted under another language (JSON, Markdown) in the same array. Like `@next/eslint-plugin-next`, the package's presence is already an unambiguous signal (nothing installs it except a turbo repository), so auto-detection needs no further glob.
 */
export function buildTurboEnvConfig(options: OptionalPluginOptions = {}): ConfigArrayValue {
  return buildOptionalPluginConfig(
    { packageName: 'eslint-plugin-turbo', configPath: ['configs', 'flat/recommended'], feature: 'Turbo environment variable checking', files: SOURCE_FILE_GLOBS },
    options,
  );
}
