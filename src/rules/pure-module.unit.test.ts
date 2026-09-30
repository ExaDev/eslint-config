import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule from './pure-module';
import { BANNED_GLOBALS, BANNED_MEMBERS, BANNED_MODULES, NODE_CRYPTO_NONDETERMINISTIC, readPureModuleOptions } from './pure-module-options';

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

const importedModule = (specifier: string) => ({ messageId: 'importedModule' as const, data: { specifier } });
const ambientGlobal = (name: string) => ({ messageId: 'ambientGlobal' as const, data: { name } });
const nondeterministicMember = (name: string) => ({ messageId: 'nondeterministicMember' as const, data: { name } });

describe('pure-module metadata', () => {
  it('names its docs page after the rule file', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/pure-module.ts');
  });
});

describe('readPureModuleOptions', () => {
  it('accepts no allowImports and returns an empty options object', () => {
    expect(readPureModuleOptions({})).toStrictEqual({});
  });

  it('returns the allowed specifiers unchanged', () => {
    expect(readPureModuleOptions({ allowImports: ['node:fs/promises', 'stream'] })).toStrictEqual({ allowImports: ['node:fs/promises', 'stream'] });
  });

  it('rejects options that are not an object', () => {
    expect(() => readPureModuleOptions(['fs'])).toThrow('"pureModules" must be an object.');
    expect(() => readPureModuleOptions(null)).toThrow('"pureModules" must be an object.');
  });

  it('rejects an unknown key, so a misspelt option fails instead of being ignored', () => {
    expect(() => readPureModuleOptions({ allowImport: ['fs'] })).toThrow('has an unknown key "allowImport"');
  });

  it('rejects an allowed specifier that selects no banned module, since it could never apply', () => {
    expect(() => readPureModuleOptions({ allowImports: ['path'] })).toThrow('entry "path" selects no banned module');
    expect(() => readPureModuleOptions({ allowImports: ['./fs'] })).toThrow('selects no banned module');
  });

  it('rejects an exclude, since the list only ever exempts', () => {
    expect(() => readPureModuleOptions({ allowImports: ['fs', '!fs/promises'] })).toThrow('entry "!fs/promises" is an exclude');
  });

  it('accepts a subpath and a node: form of a banned module', () => {
    expect(() => readPureModuleOptions({ allowImports: ['node:fs/promises'] })).not.toThrow();
  });

  it('rejects a relative specifier, which is never a builtin', () => {
    expect(() => readPureModuleOptions({ allowImports: ['./fs'] })).toThrow('selects no banned module');
  });

  it('accepts a glob that selects a banned module', () => {
    expect(() => readPureModuleOptions({ allowImports: ['child_*'] })).not.toThrow();
  });
});

// Every entry of each ban list is exercised, so a list entry cannot be dropped or misspelt without a case failing.
const everyBannedModule = BANNED_MODULES.flatMap((module) => [`import x from '${module}';`, `import x from 'node:${module}';`].map((code) => ({ code, errors: [{ messageId: 'importedModule' as const }] })));
const everyBannedGlobal = BANNED_GLOBALS.flatMap((name) => [`export const x = ${name};`, `export const y = globalThis.${name};`].map((code) => ({ code, errors: [ambientGlobal(name)] })));
const everyBannedMember = BANNED_MEMBERS.map(({ object, property }) => ({ code: `export const x = ${object}.${property};`, errors: [nondeterministicMember(`${object}.${property}`)] }));

ruleTester.run('pure-module', rule, {
  valid: [
    // Ordinary pure code.
    'export const add = (a: number, b: number): number => a + b;',
    "import { join } from 'node:path';",
    "import { createHash } from 'node:crypto';",
    "import { thing } from './fs';",
    "import { z } from 'zod';",
    // A type-only import of a banned module is erased before the module runs.
    "import type { Readable } from 'node:stream';",
    "import { type Readable } from 'stream';",
    "export type { Stats } from 'node:fs';",
    "type Stats = import('node:fs').Stats;",
    // new Date(value) converts what the caller supplied; only the argument-less form reads the clock.
    'export const parse = (value: string): Date => new Date(value);',
    'export const epoch = new Date(0);',
    'export const parsed = Date.parse("2020-01-01");',
    // Math without random, and a member of an unrelated object with the same property name.
    'export const big = Math.max(1, 2);',
    'export const now = clock.now();',
    'const random = () => 4; export const value = random();',
    // A local binding shadows the global of the same name.
    'export const run = (fetch: () => number) => fetch();',
    'const process = (x: number) => x; export const value = process(1);',
    'export const at = (Math: { random: () => number }) => Math.random();',
    'export const stamp = (Date: { now: () => number }) => Date.now();',
    "const require = (name: string) => name; export const value = require('fs');",
    // Only a synchronous function and an ordinary for-of.
    'export function total(values: readonly number[]): number { let sum = 0; for (const value of values) sum += value; return sum; }',
    // A property named like a banned global.
    'export const x = { fetch: 1 }.fetch;',
    'export const y = other.setTimeout;',
    // A type query is erased and reads nothing.
    'declare const handler: typeof fetch; export type Handler = typeof handler;',
    'export type Env = typeof process.env;',
    // Hashing through Node's crypto is deterministic.
    "import crypto from 'node:crypto'; export const digest = crypto.createHash('sha256');",
    "import * as nodeCrypto from 'crypto'; export const digest = nodeCrypto.createHash('sha256');",
    // A type-only import binds nothing at runtime.
    "import type { randomUUID } from 'node:crypto';",
    "import { type randomBytes } from 'node:crypto';",
    // A local binding that shadows the imported one is not the module.
    "import crypto from 'node:crypto'; export const f = (crypto: { randomUUID: () => string }) => crypto.randomUUID();",
    // A namespace import from a module that is not Node's crypto.
    "import * as crypto from './crypto'; export const id = crypto.randomUUID();",
    // Every I/O module is allowed where it is listed.
    { code: "import { readFile } from 'node:fs/promises';", options: [{ allowImports: ['fs'] }] },
    { code: "import { readFile } from 'fs/promises';", options: [{ allowImports: ['node:fs'] }] },
    { code: "const fs = require('fs');", options: [{ allowImports: ['fs'] }] },
  ],
  invalid: [
    ...everyBannedModule,
    ...everyBannedGlobal,
    ...everyBannedMember,
    { code: "import { readFile } from 'node:fs';", errors: [importedModule('node:fs')] },
    { code: "import { readFile } from 'fs/promises';", errors: [importedModule('fs/promises')] },
    { code: "import * as http from 'http';", errors: [importedModule('http')] },
    { code: "import 'node:process';", errors: [importedModule('node:process')] },
    { code: "export { readFile } from 'fs';", errors: [importedModule('fs')] },
    { code: "export * from 'child_process';", errors: [importedModule('child_process')] },
    { code: "import fs = require('fs');", errors: [importedModule('fs')] },
    { code: "const fs = require('node:fs');", errors: [importedModule('node:fs')] },
    { code: "const load = () => import('worker_threads');", errors: [importedModule('worker_threads')] },
    { code: "import { Readable } from 'node:stream';", errors: [importedModule('node:stream')] },
    { code: "import { readFile } from 'fs/promises'; import { hostname } from 'os';", errors: [importedModule('fs/promises'), importedModule('os')] },
    // Allowing one module leaves the others banned.
    { code: "import { readFile } from 'fs'; import net from 'net';", options: [{ allowImports: ['fs'] }], errors: [importedModule('net')] },
    // A mixed specifier list is not type-only, so it is reported.
    { code: "import { type Readable, pipeline } from 'stream';", errors: [importedModule('stream')] },

    { code: 'export const load = (url: string) => fetch(url);', errors: [ambientGlobal('fetch')] },
    { code: 'export const home = process.env.HOME;', errors: [ambientGlobal('process')] },
    { code: 'export const wait = () => setTimeout(() => undefined, 1);', errors: [ambientGlobal('setTimeout')] },
    { code: 'export const socket = new WebSocket("wss://example.com");', errors: [ambientGlobal('WebSocket')] },
    { code: 'export const stored = localStorage.getItem("a");', errors: [ambientGlobal('localStorage')] },
    { code: 'export const hooked = { fetch };', errors: [ambientGlobal('fetch')] },
    { code: 'export const env = process.env; export type Env = typeof process.env;', errors: [ambientGlobal('process')] },
    { code: 'export const load = (url: string) => globalThis.fetch(url);', errors: [ambientGlobal('fetch')] },
    { code: 'export const load = fetch(a) && fetch(b);', errors: [ambientGlobal('fetch'), ambientGlobal('fetch')] },
    // A global the environment declares is reported through its own variable.
    { code: 'export const load = (url: string) => fetch(url);', languageOptions: { globals: { fetch: 'readonly' } }, errors: [ambientGlobal('fetch')] },
    // A shadowed name in one function does not excuse a read in another.
    { code: 'const a = (fetch: number) => fetch; export const b = () => fetch("x");', errors: [ambientGlobal('fetch')] },

    { code: 'export const t = Date.now();', errors: [nondeterministicMember('Date.now')] },
    { code: 'export const r = Math.random();', errors: [nondeterministicMember('Math.random')] },
    { code: "export const r = Math['random']();", errors: [nondeterministicMember('Math.random')] },
    { code: 'export const id = crypto.randomUUID();', errors: [nondeterministicMember('crypto.randomUUID')] },
    { code: 'export const bytes = crypto.getRandomValues(new Uint8Array(4));', errors: [nondeterministicMember('crypto.getRandomValues')] },
    // Node's crypto module: named imports, and members of a default or namespace import.
    { code: "import { randomUUID } from 'node:crypto'; export const id = randomUUID();", errors: [nondeterministicMember('crypto.randomUUID')] },
    { code: "import { randomBytes as bytes, createHash } from 'crypto';", errors: [nondeterministicMember('crypto.randomBytes')] },
    { code: "import crypto from 'node:crypto'; export const id = crypto.randomUUID();", errors: [nondeterministicMember('crypto.randomUUID')] },
    { code: "import * as nodeCrypto from 'crypto'; export const n = nodeCrypto.randomInt(10);", errors: [nondeterministicMember('crypto.randomInt')] },
    { code: "import crypto from 'node:crypto'; export const n = crypto['randomBytes'](8);", errors: [nondeterministicMember('crypto.randomBytes')] },
    ...NODE_CRYPTO_NONDETERMINISTIC.map((name) => ({ code: `import { ${name} } from 'node:crypto';`, errors: [nondeterministicMember(`crypto.${name}`)] })),
    { code: 'export const t = performance.now();', errors: [nondeterministicMember('performance.now')] },

    { code: 'export const t = new Date();', errors: [{ messageId: 'clockRead' }] },
    { code: 'export const t = Date();', errors: [{ messageId: 'clockRead' }] },

    { code: 'export async function load(): Promise<number> { return 1; }', errors: [{ messageId: 'asyncFunction' }] },
    { code: 'export const load = async (): Promise<number> => 1;', errors: [{ messageId: 'asyncFunction' }] },
    { code: 'export const load = { run: async function (): Promise<number> { return 1; } };', errors: [{ messageId: 'asyncFunction' }] },
    { code: 'class A { async run(): Promise<number> { return 1; } }', errors: [{ messageId: 'asyncFunction' }] },
    { code: 'export const value = await load();', errors: [{ messageId: 'awaitExpression' }] },
    { code: 'export async function f() { return await g(); }', errors: [{ messageId: 'asyncFunction' }, { messageId: 'awaitExpression' }] },
    { code: 'export async function f(items: AsyncIterable<number>) { for await (const item of items) g(item); }', errors: [{ messageId: 'asyncFunction' }, { messageId: 'forAwait' }] },
  ],
});
