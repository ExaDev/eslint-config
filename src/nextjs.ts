import type { ConfigArrayValue } from './config-types';
import { readFlatConfig, tryRequire, type RequireFn } from './optional-plugin';

export interface NextjsConfigOptions {
  // true: force on, throwing if @next/eslint-plugin-next isn't resolvable. false: force off. undefined (the default, whether omitted or passed explicitly -- exactOptionalPropertyTypes distinguishes the two, so both are named here): auto-detect, silently returning [] if unresolvable.
  readonly enabled?: boolean | undefined;
  // Test seam only -- defaults to the real resolver. Never exposed through exadevConfig()'s own public options.
  readonly requireFn?: RequireFn;
}

const INSTALL_COMMAND = 'pnpm add -D @next/eslint-plugin-next';

// No files glob override, unlike react.ts's JSX_FILE_PATTERNS -- @next/eslint-plugin-next's own presence is already an unambiguous signal on its own: nobody has this specific package resolvable for any reason other than a real Next.js project (unlike `react` itself, a hugely common transitive dependency of unrelated tooling), so there is no equivalent false-positive-activation risk to close with a glob.
export function buildNextjsConfig(options: NextjsConfigOptions = {}): ConfigArrayValue {
  if (options.enabled === false) return [];

  const nextModule = tryRequire('@next/eslint-plugin-next', options.requireFn);
  const nextConfig = readFlatConfig(nextModule, ['configs', 'core-web-vitals']);

  if (options.enabled === true && nextConfig === undefined) {
    throw new Error(
      `@exadev/eslint-config: Next.js support was explicitly requested but '@next/eslint-plugin-next' could not be resolved. Install it with: ${INSTALL_COMMAND}`,
    );
  }
  return nextConfig === undefined ? [] : [nextConfig];
}
