import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
import { isRecord } from '../is-record';
import { assertOnlyKeys } from './file-entry';
import { createPathMatcher, readFileGlobs } from './file-scope';

const OPTION_NAME = 'pureModules';

const GLOB_CHARACTERS = /[*?[\]{}]/u;

/**
 * Options of `exadev/pure-module`, and the `allowImports` half of the `pureModules` option of `exadevConfig`.
 */
export interface PureModuleOptions {
  // Specifier patterns, in the dialect of `import-policy` (each also selects everything beneath it, and `node:` is ignored), exempting a module the rule bans by default. Every entry must select at least one banned module, so an entry that could never apply fails instead of lingering.
  readonly allowImports?: readonly string[];
}

/**
 * Node builtin modules that perform I/O or read ambient process state. A specifier is banned when one of these selects it, so `fs` covers `node:fs` and `fs/promises`. Kept to modules a functional core has no legitimate reason to load: `path`, `url`, `util` and `crypto` are absent because they hold pure functions (the non-deterministic parts of `crypto` are caught as member reads instead), and `buffer` is a data type.
 */
export const BANNED_MODULES: readonly string[] = [
  'child_process',
  'cluster',
  'dgram',
  'dns',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'net',
  'os',
  'perf_hooks',
  'process',
  'readline',
  'repl',
  'stream',
  'timers',
  'tls',
  'tty',
  'worker_threads',
];

/**
 * Globals that perform I/O, schedule work or read ambient state. Reported at every read of an unshadowed binding, and as a property of `globalThis`.
 */
export const BANNED_GLOBALS: readonly string[] = [
  'EventSource',
  'WebSocket',
  'XMLHttpRequest',
  'clearImmediate',
  'clearInterval',
  'clearTimeout',
  'document',
  'fetch',
  'indexedDB',
  'localStorage',
  'location',
  'navigator',
  'process',
  'queueMicrotask',
  'sessionStorage',
  'setImmediate',
  'setInterval',
  'setTimeout',
  'window',
];

/**
 * A `global.property` read that is non-deterministic or reads the clock. `Date` is handled separately, since `new Date(value)` is pure and only the argument-less form reads the clock.
 */
export interface BannedMember {
  readonly object: string;
  readonly property: string;
}

export const BANNED_MEMBERS: readonly BannedMember[] = [
  { object: 'Date', property: 'now' },
  { object: 'Math', property: 'random' },
  { object: 'crypto', property: 'getRandomValues' },
  { object: 'crypto', property: 'randomUUID' },
  { object: 'performance', property: 'now' },
  { object: 'performance', property: 'timeOrigin' },
];

/**
 * The rule's option schema.
 */
export const pureModuleSchema: JSONSchema4 = {
  type: 'object',
  properties: { allowImports: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, uniqueItems: true } },
  additionalProperties: false,
};

/**
 * Validates the `allowImports` option, adding what the schema cannot express: at least one include and balanced braces (`readFileGlobs`), no `!` exclude (the list only ever exempts), and that every entry selects a banned module. Throws naming the offending entry; returns the options unchanged otherwise.
 */
export function readPureModuleOptions(value: unknown): PureModuleOptions {
  if (!isRecord(value)) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" must be an object.`);
  assertOnlyKeys(value, ['allowImports'], OPTION_NAME);
  const { allowImports } = value;
  if (allowImports === undefined) return {};
  const entries = readFileGlobs(allowImports, `${OPTION_NAME}.allowImports`);
  for (const entry of entries) {
    if (entry.startsWith('!')) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}.allowImports" entry "${entry}" is an exclude. The list only exempts modules, so name the modules to allow.`);
    const root = entry.replace(/^node:/u, '').split('/')[0] ?? entry;
    const matchesRoot = createPathMatcher([root]);
    const selectsBanned = BANNED_MODULES.includes(root) || (GLOB_CHARACTERS.test(root) && BANNED_MODULES.some((module) => matchesRoot(module)));
    if (!selectsBanned) {
      throw new Error(`@exadev/eslint-config: "${OPTION_NAME}.allowImports" entry "${entry}" selects no banned module, so it could never apply. Banned modules: ${BANNED_MODULES.join(', ')}.`);
    }
  }

  return { allowImports: entries };
}
