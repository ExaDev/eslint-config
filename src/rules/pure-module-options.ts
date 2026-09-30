import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
import { isRecord } from '../is-record';
import { assertOnlyKeys } from './file-entry';
import { createPathMatcher, readFileGlobs } from './file-scope';

const GLOB_CHARACTERS = /[*?[\]{}]/u;

/**
 * Options of `exadev/pure-module`, and the `allowImports` half of the `pureModules` option of `exadevConfig`.
 */
export interface PureModuleOptions {
  // Specifier patterns, in the dialect of `import-policy` (each also selects everything beneath it, and `node:` is ignored), exempting a module the rule bans by default. Every entry must select at least one banned module, so an entry that could never apply fails instead of lingering.
  readonly allowImports?: readonly string[];
}

/**
 * Node builtin modules that perform I/O or read ambient process state (`sqlite` opens database files). A specifier is banned when one of these selects it, so `fs` covers `node:fs` and `fs/promises`. Kept to modules a functional core has no legitimate reason to load: `path`, `url`, `util` and `crypto` are absent because they hold pure functions, and `buffer` is a data type. The non-deterministic parts of `crypto` are reported separately: as reads of the Web Crypto global (`BANNED_MEMBERS`) and, for the Node module, as named imports and member reads of `NODE_CRYPTO_NONDETERMINISTIC`.
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
  'sqlite',
  'stream',
  'timers',
  'tls',
  'tty',
  'worker_threads',
];

/**
 * Globals that perform I/O (`console` writes to the process's output), schedule work or read ambient state. Reported at every read of an unshadowed binding, and as a property of `globalThis`.
 */
export const BANNED_GLOBALS: readonly string[] = [
  'EventSource',
  'SharedWorker',
  'WebSocket',
  'Worker',
  'XMLHttpRequest',
  'cancelAnimationFrame',
  'clearImmediate',
  'clearInterval',
  'clearTimeout',
  'console',
  'document',
  'fetch',
  'indexedDB',
  'localStorage',
  'location',
  'navigator',
  'process',
  'queueMicrotask',
  'requestAnimationFrame',
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
 * The exports of Node's `crypto` module whose results differ between calls: sources of randomness and key generation. `crypto` is not a banned module, since hashing and the like are pure, so these are reported as named imports from it and as members of a default or namespace import of it. `webcrypto` is the Web Crypto object, whose `getRandomValues` is the same source under another path.
 */
export const NODE_CRYPTO_NONDETERMINISTIC: readonly string[] = [
  'generateKey',
  'generateKeyPair',
  'generateKeyPairSync',
  'generateKeySync',
  'generatePrime',
  'generatePrimeSync',
  'getRandomValues',
  'randomBytes',
  'randomFill',
  'randomFillSync',
  'randomInt',
  'randomUUID',
  'webcrypto',
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
 * Validates the `allowImports` option of the rule or block named `optionName` (`pureModules` for the config option, `pure-module` for the rule), which errors quote so they name the option the reader wrote. Adds what the schema cannot express: at least one include and balanced braces (`readFileGlobs`), no `!` exclude (the list only ever exempts), and that every entry selects a banned module. Throws naming the offending entry; returns the options unchanged otherwise.
 */
export function readPureModuleOptions(value: unknown, optionName: string): PureModuleOptions {
  if (!isRecord(value)) throw new Error(`@exadev/eslint-config: "${optionName}" must be an object.`);
  assertOnlyKeys(value, ['allowImports'], optionName);
  const { allowImports } = value;
  if (allowImports === undefined) return {};
  const entries = readFileGlobs(allowImports, `${optionName}.allowImports`);
  for (const entry of entries) {
    if (entry.startsWith('!')) throw new Error(`@exadev/eslint-config: "${optionName}.allowImports" entry "${entry}" is an exclude. The list only exempts modules, so name the modules to allow.`);
    const specifier = entry.replace(/^node:/u, '');
    const slash = specifier.indexOf('/');
    const root = slash === -1 ? specifier : specifier.slice(0, slash);
    const matchesRoot = createPathMatcher([root]);
    const selectsBanned = BANNED_MODULES.includes(root) || (GLOB_CHARACTERS.test(root) && BANNED_MODULES.some((module) => matchesRoot(module)));
    if (!selectsBanned) {
      throw new Error(`@exadev/eslint-config: "${optionName}.allowImports" entry "${entry}" selects no banned module, so it could never apply. Banned modules: ${BANNED_MODULES.join(', ')}.`);
    }
  }

  return { allowImports: entries };
}
