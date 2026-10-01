import { isRecord } from '../is-record';
import { assertOnlyKeys, createEntryScope, entryFilesSchema, readEntryFiles } from './file-entry';
import { createFileScope, type FileScope } from './file-scope';

/**
 * The option schema fragment shared by every tool-config rule: the `files` globs that replace the rule's built-in filename scope.
 */
export const toolConfigFilesSchema = { files: entryFilesSchema } as const;

/**
 * Reads a tool-config rule's option object: it must be an object whose keys are all in `allowed`. Throws naming `optionName` otherwise, so a misspelt option fails instead of being ignored.
 */
export function readToolConfigRecord(options: unknown, optionName: string, allowed: readonly string[]): Readonly<Record<string, unknown>> {
  if (!isRecord(options)) throw new Error(`@exadev/eslint-config: "${optionName}" options must be an object.`);
  assertOnlyKeys(options, allowed, optionName);

  return options;
}

/**
 * The scope of a tool-config rule: the `files` option when given (a glob without a `/` names a file at any depth, as for the per-file rules), otherwise `defaultGlobs`. Evaluated against the file ESLint is linting, so the rule stays silent in every other file it is wired onto.
 */
export function readToolConfigScope(record: Readonly<Record<string, unknown>>, optionName: string, defaultGlobs: readonly string[]): FileScope {
  const { files } = record;

  return files === undefined ? createFileScope(defaultGlobs) : createEntryScope(readEntryFiles(files, `${optionName} files`));
}

/**
 * Reads an optional boolean option, `false` when omitted. Throws naming `optionName` and `key` for any other type.
 */
export function readToolConfigFlag(record: Readonly<Record<string, unknown>>, key: string, optionName: string): boolean {
  const value = record[key];
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new Error(`@exadev/eslint-config: "${optionName}" needs "${key}" to be a boolean.`);

  return value;
}
