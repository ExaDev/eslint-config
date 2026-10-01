// The opt-in constraint options of the shared workspace-architecture options object: per-edge exceptions (allow), group-level edge exemptions (exemptTargetGroups), and the three per-package requirement lists (requiredFiles, devOnly, requiredScripts). Each is validated here, at the option boundary, so a malformed entry fails loudly and names the option rather than surfacing later as a confusing crash or a silently ignored requirement. The README's "Workspace architecture" section carries the option-by-option reasoning.

import { assertIsError, regExpConstructorContext } from './workspace-errors';
import { tokenizeCommand } from './command-tokens';
import { hasOnlyKeys } from './option-keys';
import { isRecord } from '../is-record';

/**
 * Selects workspace packages by their owning group, by a regular expression tested against the declared name (the same dialect `nameRanks` uses), or by both together (both must hold). A bare string is shorthand for `{ namePattern }`.
 */
export interface PackageSelectorFields {
  readonly group?: string;
  readonly namePattern?: string;
}

export type PackageSelector = string | PackageSelectorFields;

/**
 * One documented exception to the direction and isolation checks: `from` may depend on `to` (both declared package names) for the stated `reason`, which must be non-empty so an exception always says why it exists.
 */
export interface AllowedEdge {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

/**
 * Edges into a package of `group` are exempt from the direction and isolation checks when every occurrence of the dependency sits under one of `fields`. Every field must also be one of the workspace's `dependencyFields`, since an edge declared elsewhere is never read at all.
 */
export interface ExemptTargetGroup {
  readonly group: string;
  readonly fields: readonly string[];
}

export interface RequiredFiles {
  readonly packages: PackageSelector;
  // Paths relative to the package directory. A pattern with glob syntax matches when at least one existing path matches it; a literal path must exist.
  readonly files: readonly string[];
}

/**
 * A script that must exist, optionally constrained in content. `equals` demands the exact command; `includes` and `excludes` demand or forbid a run of whitespace-separated tokens (so `--max-warnings 0` is found however the command is chained, `--flag=value` and `--flag value` are equivalent, and `--passWithNoTests` never matches `--passWithNoTestsFoo`).
 */
export interface ScriptContent {
  readonly name: string;
  readonly equals?: string;
  readonly includes?: readonly string[];
  readonly excludes?: readonly string[];
}

export type ScriptRequirement = string | ScriptContent;

export interface RequiredScripts {
  readonly match: PackageSelector;
  readonly scripts: readonly ScriptRequirement[];
}

const selectorSchema = {
  oneOf: [
    { type: 'string', minLength: 1 },
    {
      type: 'object',
      properties: { group: { type: 'string' }, namePattern: { type: 'string', minLength: 1 } },
      minProperties: 1,
      additionalProperties: false,
    },
  ],
} as const;

const nonEmptyStringArray = { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 } as const;

/**
 * The option schema of one script requirement: a bare script name, or an object that also constrains the command.
 */
export const scriptRequirementSchema = {
  oneOf: [
    { type: 'string', minLength: 1 },
    {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        equals: { type: 'string' },
        includes: nonEmptyStringArray,
        excludes: nonEmptyStringArray,
      },
      required: ['name'],
      additionalProperties: false,
    },
  ],
} as const;

export const workspaceConstraintOptionsSchema = {
  allow: {
    type: 'array',
    items: {
      type: 'object',
      properties: { from: { type: 'string', minLength: 1 }, to: { type: 'string', minLength: 1 }, reason: { type: 'string', minLength: 1 } },
      required: ['from', 'to', 'reason'],
      additionalProperties: false,
    },
  },
  exemptTargetGroups: {
    type: 'array',
    items: {
      type: 'object',
      properties: { group: { type: 'string' }, fields: nonEmptyStringArray },
      required: ['group', 'fields'],
      additionalProperties: false,
    },
  },
  requiredFiles: {
    type: 'array',
    items: {
      type: 'object',
      properties: { packages: selectorSchema, files: nonEmptyStringArray },
      required: ['packages', 'files'],
      additionalProperties: false,
    },
  },
  devOnly: { type: 'array', items: selectorSchema, minItems: 1 },
  requiredScripts: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        match: selectorSchema,
        scripts: {
          type: 'array',
          minItems: 1,
          items: scriptRequirementSchema,
        },
      },
      required: ['match', 'scripts'],
      additionalProperties: false,
    },
  },
} as const;

/** The context every reader needs to cross-check an entry against the rest of the options object. */
export interface ConstraintContext {
  readonly groupNames: ReadonlySet<string>;
  readonly dependencyFields: readonly string[];
}

function fail(optionName: string, detail: string): never {
  throw new Error(`@exadev/eslint-config: "${optionName}" ${detail}`);
}

function readArray(value: unknown, optionName: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(optionName, 'must be an array.');

  return value;
}

function readEntry(value: unknown, optionName: string, allowedKeys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value) || !hasOnlyKeys(value, allowedKeys)) fail(optionName, `entries must be objects with only the keys ${allowedKeys.map((key) => `"${key}"`).join(', ')}.`);

  return value;
}

function readNonEmptyString(value: unknown, optionName: string, what: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(optionName, `${what} must be a non-empty string.`);

  return value;
}

function readNonEmptyStrings(value: unknown, optionName: string, what: string): readonly string[] {
  const items = readArray(value, optionName);
  if (items.length === 0) fail(optionName, `${what} must not be empty.`);

  return items.map((item) => readNonEmptyString(item, optionName, what));
}

/**
 * Throws naming `optionName` when `pattern` is not a valid regular expression in the dialect the selectors and `nameRanks` share.
 */
export function compilePattern(pattern: string, optionName: string): void {
  try {
    // The compiled RegExp is discarded: this call exists for the SyntaxError an invalid pattern throws, so it surfaces here naming the option instead of later, unattributed, at match time.
    void new RegExp(pattern, 'u');
  } catch (error) {
    assertIsError(error, regExpConstructorContext(pattern));
    throw new Error(`@exadev/eslint-config: "${optionName}" pattern "${pattern}" is not a valid regular expression: ${error.message}`, { cause: error });
  }
}

const SELECTOR_KEYS = ['group', 'namePattern'] as const;

function readSelector(value: unknown, optionName: string, context: ConstraintContext): PackageSelector {
  if (typeof value === 'string') {
    compilePattern(readNonEmptyString(value, optionName, 'a selector'), optionName);

    return value;
  }
  const fields = readEntry(value, optionName, SELECTOR_KEYS);
  const { group, namePattern } = fields;
  if (group === undefined && namePattern === undefined) fail(optionName, 'selectors must name a "group", a "namePattern", or both.');
  if (group !== undefined && (typeof group !== 'string' || !context.groupNames.has(group))) {
    fail(optionName, `selector names a group not declared in "groups" (${JSON.stringify(group)}).`);
  }
  if (namePattern !== undefined) compilePattern(readNonEmptyString(namePattern, optionName, '"namePattern"'), optionName);

  return {
    ...(typeof group === 'string' && { group }),
    ...(typeof namePattern === 'string' && { namePattern }),
  };
}

const ALLOW_KEYS = ['from', 'to', 'reason'] as const;

export function readAllow(value: unknown): readonly AllowedEdge[] {
  const seen = new Set<string>();

  return readArray(value, 'allow').map((entry) => {
    const fields = readEntry(entry, 'allow', ALLOW_KEYS);
    const from = readNonEmptyString(fields['from'], 'allow', '"from"');
    const to = readNonEmptyString(fields['to'], 'allow', '"to"');
    const reason = readNonEmptyString(fields['reason'], 'allow', '"reason" (an exception must say why it exists)');
    const key = JSON.stringify([from, to]);
    if (seen.has(key)) fail('allow', `lists the edge from "${from}" to "${to}" more than once.`);
    seen.add(key);

    return { from, to, reason };
  });
}

const EXEMPT_KEYS = ['group', 'fields'] as const;

export function readExemptTargetGroups(value: unknown, context: ConstraintContext): readonly ExemptTargetGroup[] {
  const seen = new Set<string>();

  return readArray(value, 'exemptTargetGroups').map((entry) => {
    const fields = readEntry(entry, 'exemptTargetGroups', EXEMPT_KEYS);
    const group = readNonEmptyString(fields['group'], 'exemptTargetGroups', '"group"');
    if (!context.groupNames.has(group)) fail('exemptTargetGroups', `names a group not declared in "groups" ("${group}").`);
    if (seen.has(group)) fail('exemptTargetGroups', `lists group "${group}" more than once.`);
    seen.add(group);
    const exemptFields = readNonEmptyStrings(fields['fields'], 'exemptTargetGroups', '"fields"');
    const unread = exemptFields.find((field) => !context.dependencyFields.includes(field));
    if (unread !== undefined) {
      fail('exemptTargetGroups', `exempts field "${unread}" for group "${group}", which is not among the "dependencyFields" being read (${context.dependencyFields.join(', ')}), so the exemption could never apply.`);
    }

    return { group, fields: exemptFields };
  });
}

const REQUIRED_FILES_KEYS = ['packages', 'files'] as const;

// A required path is resolved against the package directory, so it may not climb out of it or be absolute.
function readRequiredPath(value: unknown): string {
  const path = readNonEmptyString(value, 'requiredFiles', '"files" entries');
  if (path.startsWith('/') || path.split('/').includes('..')) {
    fail('requiredFiles', `path "${path}" must be relative to the package directory and stay inside it.`);
  }

  return path;
}

export function readRequiredFiles(value: unknown, context: ConstraintContext): readonly RequiredFiles[] {
  return readArray(value, 'requiredFiles').map((entry) => {
    const fields = readEntry(entry, 'requiredFiles', REQUIRED_FILES_KEYS);
    const files = readArray(fields['files'], 'requiredFiles');
    if (files.length === 0) fail('requiredFiles', '"files" must not be empty.');

    return { packages: readSelector(fields['packages'], 'requiredFiles', context), files: files.map(readRequiredPath) };
  });
}

export function readDevOnly(value: unknown, context: ConstraintContext): readonly PackageSelector[] {
  const selectors = readArray(value, 'devOnly');
  if (selectors.length === 0) fail('devOnly', 'must not be empty.');

  return selectors.map((selector) => readSelector(selector, 'devOnly', context));
}

const REQUIRED_SCRIPTS_KEYS = ['match', 'scripts'] as const;
const SCRIPT_CONTENT_KEYS = ['name', 'equals', 'includes', 'excludes'] as const;

// A flag that tokenises to nothing (whitespace only) would make `includes` pass and `excludes` fail for every script, so it is rejected up front.
function readFlags(value: unknown, optionName: string, what: string): readonly string[] {
  const flags = readNonEmptyStrings(value, optionName, what);
  const blank = flags.find((flag) => tokenizeCommand(flag).length === 0);
  if (blank !== undefined) fail(optionName, `${what} entry ${JSON.stringify(blank)} contains no tokens.`);

  return flags;
}

/**
 * Reads one script requirement, a bare name or a name with content constraints. Throws naming `optionName` for anything malformed.
 */
export function readScriptRequirement(value: unknown, optionName: string): ScriptRequirement {
  if (typeof value === 'string') return readNonEmptyString(value, optionName, 'a script name');
  const fields = readEntry(value, optionName, SCRIPT_CONTENT_KEYS);
  const { equals, includes, excludes } = fields;
  if (equals !== undefined && typeof equals !== 'string') fail(optionName, '"equals" must be a string.');

  return {
    name: readNonEmptyString(fields['name'], optionName, '"name"'),
    ...(equals !== undefined && { equals }),
    ...(includes !== undefined && { includes: readFlags(includes, optionName, '"includes"') }),
    ...(excludes !== undefined && { excludes: readFlags(excludes, optionName, '"excludes"') }),
  };
}

export function readRequiredScripts(value: unknown, context: ConstraintContext): readonly RequiredScripts[] {
  return readArray(value, 'requiredScripts').map((entry) => {
    const fields = readEntry(entry, 'requiredScripts', REQUIRED_SCRIPTS_KEYS);
    const scripts = readArray(fields['scripts'], 'requiredScripts');
    if (scripts.length === 0) fail('requiredScripts', '"scripts" must not be empty.');

    return { match: readSelector(fields['match'], 'requiredScripts', context), scripts: scripts.map((script) => readScriptRequirement(script, 'requiredScripts')) };
  });
}
