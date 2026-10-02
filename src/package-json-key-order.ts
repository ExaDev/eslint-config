import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigArrayValue } from './config-types';
import { buildJsonLanguageBlock, requireJsonPlugin, tryResolveJsonPlugin } from './json-language-config';
import type { RequireFn } from './optional-plugin';
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

export function buildPackageJsonKeyOrderConfig(options: PackageJsonKeyOrderConfigOptions = {}): ConfigArrayValue {
  const cwd = options.cwd ?? process.cwd();
  if (options.enabled === false) return [];
  if (options.enabled === undefined && hasSyncpackConfig(cwd)) return [];

  // @eslint/json is ESM-only, so this resolves synchronously only where Node's own require() can load an ESM module synchronously, which Node enables by default from 20.19 and 22.12, the releases this package's own engines range (`^20.19.0 || ^22.13.0 || >=24`) starts from. On a Node outside that range, resolution fails closed here exactly like a genuinely-absent package would, silently under auto-detect or with a clear thrown error under `enabled: true`, matching every other optional peer in this file's own family (see react.ts/nextjs.ts).
  const jsonPlugin = options.enabled === true ? requireJsonPlugin('package.json key ordering', options.requireFn) : tryResolveJsonPlugin(options.requireFn);
  if (jsonPlugin === undefined) return [];

  const ruleOptions: PackageJsonKeyOrderOptions = {
    ...(options.sortFirst !== undefined && { sortFirst: options.sortFirst }),
    ...(options.sortAz !== undefined && { sortAz: options.sortAz }),
  };

  return [
    buildJsonLanguageBlock({
      jsonPlugin,
      language: 'json/json',
      files: ['**/package.json'],
      rules: { 'exadev/package-json-key-order': ['error', ruleOptions] },
    }),
  ];
}
