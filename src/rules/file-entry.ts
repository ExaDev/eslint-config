import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
import { isRecord } from '../is-record';
import { assertSupportedGlob, createFileScope, readFileGlobs, type FileScope } from './file-scope';
import { isExcludePattern } from './workspace-glob';

/**
 * The option schema for the `files` field of a per-file rule entry: one glob, or a list of globs in the `fileGlobsSchema` dialect.
 */
export const entryFilesSchema: JSONSchema4 = {
  anyOf: [{ type: 'string', minLength: 1 }, { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, uniqueItems: true }],
};

/**
 * Validates the `files` field of a per-file rule entry: a single glob string or a glob list that `readFileGlobs` accepts. Returns the list form; throws naming `optionName` otherwise.
 */
export function readEntryFiles(value: unknown, optionName: string): readonly string[] {
  return readFileGlobs(typeof value === 'string' ? [value] : value, optionName);
}

/**
 * Validates that `value` is an array whose items are all records, returning them; throws naming `optionName` otherwise. Each rule then reads the fields of its own entries.
 */
export function readEntryRecords(value: unknown, optionName: string): readonly Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(`@exadev/eslint-config: "${optionName}" must be an array of objects.`);
  }

  return value;
}

/**
 * Reads a required non-empty string field of an entry; throws naming `optionName` and `field` otherwise.
 */
export function readRequiredString(entry: Readonly<Record<string, unknown>>, field: string, optionName: string): string {
  const value = entry[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`@exadev/eslint-config: "${optionName}" needs a non-empty string "${field}".`);
  }

  return value;
}

/**
 * Reads a required non-empty list of non-empty, distinct strings; throws naming `optionName` and `field` otherwise.
 */
export function readRequiredStrings(entry: Readonly<Record<string, unknown>>, field: string, optionName: string): readonly string[] {
  const value = entry[field];
  if (!Array.isArray(value) || value.length === 0 || !value.every((item): item is string => typeof item === 'string' && item.length > 0) || new Set(value).size !== value.length) {
    throw new Error(`@exadev/eslint-config: "${optionName}" needs "${field}" to be a non-empty array of distinct non-empty strings.`);
  }

  return value;
}

/**
 * Reads a specifier pattern list as `readRequiredStrings` does and rejects extglob in every entry, since specifier patterns are in the same glob dialect as file globs: ESLint-style `@(fs|path)` would be accepted and then never match, leaving a policy with a silent hole. Throws naming `optionName`, `field` and the pattern.
 */
export function readSpecifierPatterns(entry: Readonly<Record<string, unknown>>, field: string, optionName: string): readonly string[] {
  const patterns = readRequiredStrings(entry, field, optionName);
  for (const pattern of patterns) assertSupportedGlob(pattern, `${optionName}.${field}`, 'specifier');

  return patterns;
}

/**
 * Throws when `entry` has a key outside `allowed`, so a misspelt option fails instead of being ignored.
 */
export function assertOnlyKeys(entry: Readonly<Record<string, unknown>>, allowed: readonly string[], optionName: string): void {
  const unknownKey = Object.keys(entry).find((key) => !allowed.includes(key));
  if (unknownKey !== undefined) {
    throw new Error(`@exadev/eslint-config: "${optionName}" has an unknown key "${unknownKey}". Allowed keys: ${allowed.join(', ')}.`);
  }
}

/**
 * Makes a glob without a `/` mean "a file with this name at any depth" (`fake.ts` is `**\/fake.ts`), the filename-pattern reading the per-file rules document. A `!` exclude is expanded the same way.
 */
function anywhereIfBareName(glob: string): string {
  const exclude = isExcludePattern(glob);
  const body = exclude ? glob.slice(1) : glob;
  const expanded = body.includes('/') ? body : `**/${body}`;

  return exclude ? `!${expanded}` : expanded;
}

/**
 * The scope of a per-file rule entry: `createFileScope` over the entry's globs after a bare filename pattern is widened to any depth. Path globs match relative to ESLint's working directory, as for every file glob in this package.
 */
export function createEntryScope(globs: readonly string[]): FileScope {
  return createFileScope(globs.map(anywhereIfBareName));
}
