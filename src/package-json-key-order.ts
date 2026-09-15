import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigArrayValue } from './config-types';
import { tryRequire, type RequireFn } from './optional-plugin';
import plugin from './plugin';
import type { PackageJsonKeyOrderOptions } from './rules/package-json-key-order';

export interface PackageJsonKeyOrderConfigOptions extends PackageJsonKeyOrderOptions {
  // true: force on regardless of syncpack, throwing if @eslint/json isn't resolvable. false: force off, skipping resolution entirely. undefined (the default): auto-detect — enabled unless the consumer's own project already has syncpack configured (syncpack already produces this exact order for free) or @eslint/json isn't resolvable.
  readonly enabled?: boolean | undefined;
  // Where to look for a syncpack config when auto-detecting. Defaults to process.cwd() — exposed mainly as a test seam.
  readonly cwd?: string;
  // Test seam only — defaults to the real resolver. Never exposed through exadevConfig()'s own public options.
  readonly requireFn?: RequireFn;
}

const SYNCPACK_CONFIG_FILENAMES: readonly string[] = [
  '.syncpackrc',
  '.syncpackrc.json',
  '.syncpackrc.yaml',
  '.syncpackrc.yml',
  '.syncpackrc.js',
  '.syncpackrc.cjs',
  '.syncpackrc.mjs',
  'syncpack.config.js',
  'syncpack.config.cjs',
  'syncpack.config.mjs',
  'syncpack.config.ts',
];

function packageJsonHasSyncpackKey(cwd: string): boolean {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    return typeof raw === 'object' && raw !== null && 'syncpack' in raw;
  } catch {
    return false;
  }
}

/** Auto-detection signal for the `enabled: undefined` case: does this project already have syncpack configured? Mirrors the role `tryRequire`'s peer-package resolution plays for `react.ts`/`nextjs.ts`, but for a tool detected by config presence rather than by an installed package, since syncpack's own output is what this rule is emulating, not a peer this rule depends on. */
export function hasSyncpackConfig(cwd: string): boolean {
  return SYNCPACK_CONFIG_FILENAMES.some((filename) => existsSync(join(cwd, filename))) || packageJsonHasSyncpackKey(cwd);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// A real check (the candidate's own `languages.json` entry exists) rather than an assertion — matches optional-plugin.ts's own isFlatConfig precedent. Deliberately doesn't validate the whole shape (rules/configs/etc): enough evidence this is genuinely @eslint/json's plugin object, not a hand-typed re-implementation of its full public surface.
function isJsonLanguagePlugin(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const languages = value['languages'];
  return isRecord(languages) && 'json' in languages;
}

// Node's synchronous require() of a genuine ES module (which @eslint/json is) returns the module's own namespace object — every named export at the top level, PLUS the default export nested under `.default` — not the default export directly the way requiring a CJS/dual-published package would. Confirmed directly: `require('@eslint/json')` here returns `{ JSONLanguage, JSONSourceCode, __esModule: true, default: <the real plugin> }`. Checking `.default` first is what actually matches this package's own real shape; falling back to the value itself keeps this working unchanged for any other language plugin that IS its own default export directly (a CJS-native or dual-published one).
function resolveJsonPlugin(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value) && isJsonLanguagePlugin(value['default'])) return value['default'];
  return isJsonLanguagePlugin(value) ? value : undefined;
}

export function buildPackageJsonKeyOrderConfig(options: PackageJsonKeyOrderConfigOptions = {}): ConfigArrayValue {
  const cwd = options.cwd ?? process.cwd();
  if (options.enabled === false) return [];
  if (options.enabled === undefined && hasSyncpackConfig(cwd)) return [];

  // @eslint/json is ESM-only, so this resolves synchronously only where Node's own require() can load an ESM module synchronously (stable since Node 22.12) — on an older supported Node (this package's own engines floor is >=20), resolution fails closed here exactly like a genuinely-absent package would, silently under auto-detect or with a clear thrown error under `enabled: true`, matching every other optional peer in this file's own family (see react.ts/nextjs.ts).
  const jsonPlugin = resolveJsonPlugin(tryRequire('@eslint/json', options.requireFn));
  if (jsonPlugin === undefined) {
    if (options.enabled === true) {
      // The install command is inlined here rather than hoisted to a module-level constant: a top-level const is evaluated exactly once, at module load, so a test calling this function under a later, distinct mutation-testing run would only ever observe whatever value was frozen in at that first, unmutated load — inlining it means this exact literal is re-evaluated fresh on every call.
      throw new Error(
        `@exadev/eslint-config: package.json key ordering was explicitly requested but '@eslint/json' could not be resolved. Install it with: pnpm add -D @eslint/json`,
      );
    }
    return [];
  }

  const ruleOptions: PackageJsonKeyOrderOptions = {
    ...(options.sortFirst !== undefined && { sortFirst: options.sortFirst }),
    ...(options.sortAz !== undefined && { sortAz: options.sortAz }),
  };

  return [
    {
      files: ['**/package.json'],
      language: 'json/json',
      plugins: { exadev: plugin, json: jsonPlugin },
      rules: {
        'exadev/package-json-key-order': ['error', ruleOptions],
      },
    },
  ];
}
