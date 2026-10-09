import { readFileGlobs } from './rules/file-scope';
import { isExcludePattern } from './rules/workspace-glob';

/**
 * The `files` and `ignores` of a flat-config block that selects what a glob list selects. A flat-config `files` pattern cannot exclude, so a leading `!` glob becomes an `ignores` entry with the `!` removed. `ignores` is omitted when the list excludes nothing, since an empty one is not the same as none under `exactOptionalPropertyTypes`.
 */
export interface GlobScope {
  readonly files: string[];
  readonly ignores?: string[];
}

/**
 * Splits a glob list that `readFileGlobs` has already validated into a block scope.
 */
export function scopeOfValidated(validated: readonly string[]): GlobScope {
  const ignores = validated.filter(isExcludePattern).map((glob) => glob.slice(1));

  return { files: validated.filter((glob) => !isExcludePattern(glob)), ...(ignores.length > 0 && { ignores }) };
}

/**
 * Validates a glob list as `readFileGlobs` does, naming `optionName` in the error, and splits it into a block scope.
 */
export function scopeBlock(globs: unknown, optionName: string): GlobScope {
  return scopeOfValidated(readFileGlobs(globs, optionName));
}
