import type { ConfigArrayValue } from './config-types';
import { readFlatConfig, tryRequire, type RequireFn } from './optional-plugin';
import { SOURCE_FILE_GLOBS } from './turbo-config';

export interface TurboEnvConfigOptions {
  // true: force on, throwing if eslint-plugin-turbo isn't resolvable. false: force off. undefined (the default, whether omitted or passed explicitly, since exactOptionalPropertyTypes distinguishes the two and both are named here): auto-detect, silently returning [] if unresolvable.
  readonly enabled?: boolean | undefined;
  // Test seam only: defaults to the real resolver. Never exposed through exadevConfig()'s own public options.
  readonly requireFn?: RequireFn;
}

const INSTALL_COMMAND = 'pnpm add -D eslint-plugin-turbo';

/**
 * `eslint-plugin-turbo`'s `flat/recommended` config, which reports environment variables read in source (`no-undeclared-env-vars`) that no `turbo.json` in the repository declares in `env` or `globalEnv`. Turbo's strict env mode strips undeclared variables from a task's environment, so an undeclared read fails at runtime or is missing from the cache key. Scoped to JavaScript and TypeScript sources: the upstream block has no `files`, and would otherwise be matched against files linted under another language (JSON, Markdown) in the same array. Like `@next/eslint-plugin-next`, the package's presence is already an unambiguous signal (nothing installs it except a turbo repository), so auto-detection needs no further glob.
 */
export function buildTurboEnvConfig(options: TurboEnvConfigOptions = {}): ConfigArrayValue {
  if (options.enabled === false) return [];

  const turboConfig = readFlatConfig(tryRequire('eslint-plugin-turbo', options.requireFn), ['configs', 'flat/recommended']);

  if (options.enabled === true && turboConfig === undefined) {
    throw new Error(`@exadev/eslint-config: Turbo environment variable checking was explicitly requested but 'eslint-plugin-turbo' could not be resolved. Install it with: ${INSTALL_COMMAND}`);
  }

  return turboConfig === undefined ? [] : [{ ...turboConfig, files: [...SOURCE_FILE_GLOBS] }];
}
