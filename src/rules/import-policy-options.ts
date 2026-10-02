import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
import { assertOnlyKeys, readEntryRecords, readRequiredString, readRequiredStrings } from './file-entry';
import { createFileScope, readFileGlobs, relativeToCwd } from './file-scope';
import { createSpecifierMatcher } from './specifier-match';

const OPTION_NAME = 'importPolicies';

/**
 * Specifiers that the files of a policy may not import.
 */
export interface ImportDeny {
  // Specifier patterns. Each also selects everything beneath it, and `node:` is ignored, so `fs` selects `node:fs` and `fs/promises`.
  readonly specifiers: readonly string[];
  // Restricts the ban to these imported names (`default` for a default import). A namespace import, a dynamic import, a `require` call and `export *` take every name, so they are still reported.
  readonly importNames?: readonly string[];
  // Leaves `import type`, `export type ... from`, all-inline-`type` specifier lists and `import("x")` type queries alone.
  readonly allowTypeImports?: boolean;
  // Names the requirement, not the rule: why the import is forbidden and what to do instead.
  readonly message: string;
}

/**
 * Specifiers that the files of a policy may import only in the files `onlyIn` selects.
 */
export interface ImportConfine {
  readonly specifiers: readonly string[];
  // File globs relative to ESLint's working directory, in the dialect of every file glob in this package.
  readonly onlyIn: readonly string[];
  readonly allowTypeImports?: boolean;
  // Defaults to a message listing `onlyIn`.
  readonly message?: string;
}

/**
 * One exact permitted crossing of the policy: `file` (relative to ESLint's working directory, forward slashes) may import `specifier` exactly as written there, although the policy otherwise forbids it. No wildcard is accepted, so the exception cannot widen.
 */
export interface ImportExceptEdge {
  readonly file: string;
  readonly specifier: string;
  readonly reason: string;
}

/**
 * What a policy does with a dynamic `import()` or a `require()` whose specifier is not a static string (a variable, a concatenation, or a template with a substitution), which no restriction can match: `ignore` it (the default), or `report` it, so the files the policy selects can only pull modules in by a specifier it can check.
 */
export type ComputedSpecifierHandling = 'ignore' | 'report';

/**
 * Import restrictions for the files `files` selects and `ignores` does not. At least one of `deny` and `confine` is required.
 */
export interface ImportPolicy {
  readonly files: readonly string[];
  readonly ignores?: readonly string[];
  readonly deny?: readonly ImportDeny[];
  readonly confine?: readonly ImportConfine[];
  readonly exceptEdges?: readonly ImportExceptEdge[];
  readonly computedSpecifiers?: ComputedSpecifierHandling;
}

const COMPUTED_SPECIFIER_HANDLINGS: readonly ComputedSpecifierHandling[] = ['ignore', 'report'];

const GLOB_CHARACTERS = /[*?[\]{}]/u;

const stringList: JSONSchema4 = { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, uniqueItems: true };

/**
 * The rule's option schema: a list of policies. `readImportPolicies` adds the checks a schema cannot express.
 */
export const importPoliciesSchema: JSONSchema4 = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      files: stringList,
      ignores: stringList,
      deny: {
        type: 'array',
        items: {
          type: 'object',
          properties: { specifiers: stringList, importNames: stringList, allowTypeImports: { type: 'boolean' }, message: { type: 'string', minLength: 1 } },
          required: ['specifiers', 'message'],
          additionalProperties: false,
        },
      },
      confine: {
        type: 'array',
        items: {
          type: 'object',
          properties: { specifiers: stringList, onlyIn: stringList, allowTypeImports: { type: 'boolean' }, message: { type: 'string', minLength: 1 } },
          required: ['specifiers', 'onlyIn'],
          additionalProperties: false,
        },
      },
      exceptEdges: {
        type: 'array',
        items: {
          type: 'object',
          properties: { file: { type: 'string', minLength: 1 }, specifier: { type: 'string', minLength: 1 }, reason: { type: 'string', minLength: 1 } },
          required: ['file', 'specifier', 'reason'],
          additionalProperties: false,
        },
      },
      computedSpecifiers: { type: 'string', enum: [...COMPUTED_SPECIFIER_HANDLINGS] },
    },
    required: ['files'],
    additionalProperties: false,
  },
};

function readOptionalList<T>(entry: Readonly<Record<string, unknown>>, field: string, name: string, readItem: (item: Readonly<Record<string, unknown>>, name: string) => T): readonly T[] | undefined {
  const value = entry[field];
  if (value === undefined) return undefined;

  return readEntryRecords(value, `${name}.${field}`).map((item) => readItem(item, `${name}.${field}`));
}

function readBoolean(entry: Readonly<Record<string, unknown>>, field: string, name: string): boolean | undefined {
  const value = entry[field];
  if (value !== undefined && typeof value !== 'boolean') throw new Error(`@exadev/eslint-config: "${name}" needs "${field}" to be a boolean.`);

  return value;
}

function isComputedSpecifierHandling(value: unknown): value is ComputedSpecifierHandling {
  return COMPUTED_SPECIFIER_HANDLINGS.some((handling) => handling === value);
}

function readComputedSpecifiers(entry: Readonly<Record<string, unknown>>, name: string): ComputedSpecifierHandling | undefined {
  const value = entry['computedSpecifiers'];
  if (value === undefined || isComputedSpecifierHandling(value)) return value;

  throw new Error(`@exadev/eslint-config: "${name}" needs "computedSpecifiers" to be one of ${COMPUTED_SPECIFIER_HANDLINGS.map((handling) => `"${handling}"`).join(', ')}.`);
}

function readDeny(entry: Readonly<Record<string, unknown>>, name: string): ImportDeny {
  assertOnlyKeys(entry, ['specifiers', 'importNames', 'allowTypeImports', 'message'], name);
  const importNames = entry['importNames'] === undefined ? undefined : readRequiredStrings(entry, 'importNames', name);
  const allowTypeImports = readBoolean(entry, 'allowTypeImports', name);

  return {
    specifiers: readRequiredStrings(entry, 'specifiers', name),
    ...(importNames !== undefined && { importNames }),
    ...(allowTypeImports !== undefined && { allowTypeImports }),
    message: readRequiredString(entry, 'message', name),
  };
}

function readConfine(entry: Readonly<Record<string, unknown>>, name: string): ImportConfine {
  assertOnlyKeys(entry, ['specifiers', 'onlyIn', 'allowTypeImports', 'message'], name);
  const allowTypeImports = readBoolean(entry, 'allowTypeImports', name);
  const message = entry['message'] === undefined ? undefined : readRequiredString(entry, 'message', name);

  return {
    specifiers: readRequiredStrings(entry, 'specifiers', name),
    onlyIn: readFileGlobs(entry['onlyIn'], `${name}.onlyIn`),
    ...(allowTypeImports !== undefined && { allowTypeImports }),
    ...(message !== undefined && { message }),
  };
}

function readExceptEdge(entry: Readonly<Record<string, unknown>>, name: string): ImportExceptEdge {
  assertOnlyKeys(entry, ['file', 'specifier', 'reason'], name);
  const file = readRequiredString(entry, 'file', name);
  const specifier = readRequiredString(entry, 'specifier', name);
  for (const [field, text] of [['file', file], ['specifier', specifier]] as const) {
    if (GLOB_CHARACTERS.test(text)) throw new Error(`@exadev/eslint-config: "${name}" needs "${field}" to be exact, but "${text}" contains a glob character. An exception names one file and one specifier.`);
  }

  // The rule compares this string with the linted file's path relative to the working directory, so the spelling is normalised once here (`./src/a.ts` and `src/../src/a.ts` become `src/a.ts`).
  return { file: relativeToCwd(`/${file}`, '/'), specifier, reason: readRequiredString(entry, 'reason', name) };
}

// A stale exception is a defect the reader can see without a filesystem: an edge naming a file outside the policy's scope, or a specifier no restriction forbids in that file, can never suppress anything.
function assertEdgeIsLive(edge: ImportExceptEdge, policy: Pick<ImportPolicy, 'files' | 'ignores' | 'deny' | 'confine'>): void {
  const root = '/';
  const inScope = createFileScope([...policy.files, ...(policy.ignores ?? []).map((glob) => `!${glob}`)]);
  if (!inScope(`${root}${edge.file}`, root)) {
    throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" exception for "${edge.file}" names a file the policy's files do not select, so it can never apply.`);
  }
  const file = `${root}${edge.file}`;
  const forbidden =
    (policy.deny ?? []).some((deny) => createSpecifierMatcher(deny.specifiers)(edge.specifier, file, root)) ||
    (policy.confine ?? []).some((confine) => createSpecifierMatcher(confine.specifiers)(edge.specifier, file, root) && !createFileScope(confine.onlyIn)(file, root));
  if (!forbidden) {
    throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" exception "${edge.specifier}" in "${edge.file}" is not forbidden there by any deny entry or by any confine entry whose onlyIn excludes the file, so it can never apply.`);
  }
}

/**
 * Validates and normalises an import-policy option value at runtime, for the rule and for `importPolicyConfig` alike. Beyond the schema it requires: `computedSpecifiers`, when given, to be `ignore` or `report`; at least one include glob in `files`; at least one of `deny` and `confine` per policy; no unknown key; and that every exception edge names a file the policy selects and a specifier one of its restrictions forbids in that file (a confine entry forbids nothing in the files of its `onlyIn`). The edge's `file` is stored in its normalised, forward-slash form. Throws naming the offending field.
 */
export function readImportPolicies(value: unknown): readonly ImportPolicy[] {
  return readEntryRecords(value, OPTION_NAME).map((entry) => {
    assertOnlyKeys(entry, ['files', 'ignores', 'deny', 'confine', 'exceptEdges', 'computedSpecifiers'], OPTION_NAME);
    const files = readFileGlobs(entry['files'], `${OPTION_NAME}.files`);
    const ignores = entry['ignores'] === undefined ? undefined : readFileGlobs(entry['ignores'], `${OPTION_NAME}.ignores`);
    const deny = readOptionalList(entry, 'deny', OPTION_NAME, readDeny);
    const confine = readOptionalList(entry, 'confine', OPTION_NAME, readConfine);
    const exceptEdges = readOptionalList(entry, 'exceptEdges', OPTION_NAME, readExceptEdge);
    const computedSpecifiers = readComputedSpecifiers(entry, OPTION_NAME);
    if ((deny === undefined || deny.length === 0) && (confine === undefined || confine.length === 0)) {
      throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" needs every policy to have at least one "deny" or "confine" entry.`);
    }
    const policy = { files, ...(ignores !== undefined && { ignores }), ...(deny !== undefined && { deny }), ...(confine !== undefined && { confine }) };
    for (const edge of exceptEdges ?? []) assertEdgeIsLive(edge, policy);

    return { ...policy, ...(exceptEdges !== undefined && { exceptEdges }), ...(computedSpecifiers !== undefined && { computedSpecifiers }) };
  });
}
