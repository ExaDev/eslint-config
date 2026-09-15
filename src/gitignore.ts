import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { includeIgnoreFile } from '@eslint/config-helpers';
import type { ConfigArrayValue } from './config-types';

export interface GitignoreConfigOptions {
  // true: force on, throwing if no .gitignore exists at cwd. false: force off, skipping resolution entirely. undefined (the default, whether omitted or passed explicitly -- exactOptionalPropertyTypes distinguishes the two, so both are named here): auto-detect, silently returning [] if there's no .gitignore to read.
  readonly enabled?: boolean | undefined;
  // Where to look for .gitignore when auto-detecting. Defaults to process.cwd() -- exposed mainly as a test seam, matching hasSyncpackConfig's own cwd option.
  readonly cwd?: string;
}

/**
 * A generated directory that's `.gitignore`d but not in this array's own `ignores` block was, until this feature existed, a real, confirmed gap: harmless while nothing linted broadly enough to reach it, then a real problem the moment a wide-reaching rule (this package's own bundled RFC 8785 JSON canonicalization, say) started matching every file its own glob covers, including a leftover build/report artifact nobody meant to lint at all. Deriving `ignores` from `.gitignore` itself, rather than a hand-maintained list every consumer would otherwise have to keep in sync by hand, means a project's own existing single source of truth for "what isn't source" is the one ESLint uses too.
 */
export function buildGitignoreConfig(options: GitignoreConfigOptions = {}): ConfigArrayValue {
  const cwd = options.cwd ?? process.cwd();
  if (options.enabled === false) return [];

  const gitignorePath = join(cwd, '.gitignore');
  if (!existsSync(gitignorePath)) {
    if (options.enabled === true) {
      throw new Error(`@exadev/eslint-config: gitignore-based ignores were explicitly requested but no .gitignore was found at ${gitignorePath}`);
    }
    return [];
  }

  return [includeIgnoreFile(gitignorePath)];
}
