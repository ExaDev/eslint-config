import { isRecord } from '../is-record';
import { assertOnlyKeys, readEntryRecords } from './file-entry';
import { expandBraces } from './workspace-glob';
import { compilePattern, readScriptRequirement, scriptRequirementSchema, type ScriptRequirement } from './workspace-constraint-options';

const OPTION_NAME = 'exadev/package-requirements';

/**
 * The facts about the linted `package.json` that decide whether a requirement applies to it. Every field given must hold.
 */
export interface PackageCondition {
  // `true`: the manifest sets `"private": true`. `false`: it does not, so the package can be published.
  readonly private?: boolean;
  // `true`: the manifest sits in the directory ESLint runs from (the repository root). `false`: it sits anywhere else.
  readonly root?: boolean;
  // A regular expression the declared `name` must match. A manifest with no `name` never matches.
  readonly namePattern?: string;
  // Dependency names; the manifest must declare at least one of them under `dependencies`, `devDependencies`, `peerDependencies` or `optionalDependencies`.
  readonly declares?: readonly string[];
}

/**
 * A file requirement satisfied by a path alone (a literal path or a glob) or, for a tool whose configuration may also live in `package.json`, by that manifest field being set instead.
 */
export type FileRequirement = string | { readonly glob: string; readonly orField: string };

/**
 * One group of requirements and the packages it applies to. `when` is absent for every package.
 */
export interface PackageRequirement {
  readonly when?: PackageCondition;
  // Scripts that must exist in the manifest, optionally constrained in content, exactly as for `requiredScripts`.
  readonly scripts?: readonly ScriptRequirement[];
  // Paths or globs relative to the package directory; each must exist (a glob must match at least one existing path).
  readonly files?: readonly FileRequirement[];
  // Top-level manifest fields that must be set: present and not null, an empty string, an empty object or an empty array.
  readonly fields?: readonly string[];
}

export interface PackageRequirementsOptions {
  readonly requirements: readonly PackageRequirement[];
}

const nonEmptyStringArray = { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 } as const;

const fileRequirementSchema = {
  oneOf: [
    { type: 'string', minLength: 1 },
    {
      type: 'object',
      properties: { glob: { type: 'string', minLength: 1 }, orField: { type: 'string', minLength: 1 } },
      required: ['glob', 'orField'],
      additionalProperties: false,
    },
  ],
} as const;

export const packageRequirementsOptionsSchema = {
  type: 'object',
  properties: {
    requirements: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          when: {
            type: 'object',
            properties: {
              private: { type: 'boolean' },
              root: { type: 'boolean' },
              namePattern: { type: 'string', minLength: 1 },
              declares: nonEmptyStringArray,
            },
            minProperties: 1,
            additionalProperties: false,
          },
          scripts: { type: 'array', minItems: 1, items: scriptRequirementSchema },
          files: { type: 'array', minItems: 1, items: fileRequirementSchema },
          fields: nonEmptyStringArray,
        },
        minProperties: 1,
        additionalProperties: false,
      },
    },
  },
  required: ['requirements'],
  additionalProperties: false,
} as const;

function fail(detail: string): never {
  throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" ${detail}`);
}

function readStrings(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((item): item is string => typeof item === 'string' && item.length > 0)) {
    fail(`needs ${what} to be a non-empty array of non-empty strings.`);
  }

  return value;
}

function readBoolean(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') fail(`needs ${what} to be a boolean.`);

  return value;
}

function readNamePattern(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) fail('needs "when.namePattern" to be a non-empty string.');
  compilePattern(value, `${OPTION_NAME} when.namePattern`);

  return value;
}

const CONDITION_KEYS = ['private', 'root', 'namePattern', 'declares'] as const;

function readCondition(value: unknown): PackageCondition {
  if (!isRecord(value)) fail('needs "when" to be an object.');
  assertOnlyKeys(value, CONDITION_KEYS, `${OPTION_NAME} when`);
  const { private: isPrivate, root, namePattern, declares } = value;
  const condition: PackageCondition = {
    ...(isPrivate !== undefined && { private: readBoolean(isPrivate, '"when.private"') }),
    ...(root !== undefined && { root: readBoolean(root, '"when.root"') }),
    ...(namePattern !== undefined && { namePattern: readNamePattern(namePattern) }),
    ...(declares !== undefined && { declares: readStrings(declares, '"when.declares"') }),
  };
  if (Object.keys(condition).length === 0) fail('needs "when" to state at least one condition.');

  return condition;
}

// A required path is resolved against the package directory, so it may not climb out of it or be absolute. Brace expansion throws on an unbalanced pattern.
function readPath(path: string): string {
  if (path.startsWith('/') || path.split('/').includes('..')) fail(`path "${path}" must be relative to the package directory and stay inside it.`);
  void expandBraces(path);

  return path;
}

const FILE_KEYS = ['glob', 'orField'] as const;

function readFileRequirement(value: unknown): FileRequirement {
  if (typeof value === 'string') return readPath(value);
  if (!isRecord(value)) fail('needs each "files" entry to be a path or an object with "glob" and "orField".');
  assertOnlyKeys(value, FILE_KEYS, `${OPTION_NAME} files`);
  const { glob, orField } = value;
  if (typeof glob !== 'string' || glob.length === 0 || typeof orField !== 'string' || orField.length === 0) {
    fail('needs a "files" object entry to have a non-empty string "glob" and "orField".');
  }

  return { glob: readPath(glob), orField };
}

function readList<Item>(value: unknown, what: string, read: (item: unknown) => Item): readonly Item[] {
  if (!Array.isArray(value) || value.length === 0) fail(`needs ${what} to be a non-empty array.`);

  return value.map(read);
}

const REQUIREMENT_KEYS = ['when', 'scripts', 'files', 'fields'] as const;

function readRequirement(entry: Readonly<Record<string, unknown>>): PackageRequirement {
  assertOnlyKeys(entry, REQUIREMENT_KEYS, `${OPTION_NAME} requirements`);
  const { when, scripts, files, fields } = entry;
  const requirement: PackageRequirement = {
    ...(when !== undefined && { when: readCondition(when) }),
    ...(scripts !== undefined && { scripts: readList(scripts, '"scripts"', (script) => readScriptRequirement(script, OPTION_NAME)) }),
    ...(files !== undefined && { files: readList(files, '"files"', readFileRequirement) }),
    ...(fields !== undefined && { fields: readStrings(fields, '"fields"') }),
  };
  if (scripts === undefined && files === undefined && fields === undefined) fail('needs every requirement to list "scripts", "files" or "fields".');

  return requirement;
}

/**
 * Reads the rule options: a non-empty `requirements` list whose entries each pair an optional `when` condition with `scripts`, `files` and `fields` to require. Throws naming the option for anything malformed, so a misspelt key or an invalid pattern fails when the rule is created instead of being ignored.
 */
export function readPackageRequirementsOptions(options: unknown): PackageRequirementsOptions {
  if (!isRecord(options)) fail('options must be an object.');
  assertOnlyKeys(options, ['requirements'], OPTION_NAME);
  const { requirements } = options;
  if (!Array.isArray(requirements) || requirements.length === 0) fail('needs "requirements" to be a non-empty array.');

  return { requirements: readEntryRecords(requirements, `${OPTION_NAME} requirements`).map(readRequirement) };
}
