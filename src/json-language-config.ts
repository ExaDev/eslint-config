import type { Linter } from 'eslint';
import type { ConfigArrayValue } from './config-types';
import { resolveJsonPlugin } from './json-plugin';
import { tryRequire, type RequireFn } from './optional-plugin';
import plugin from './plugin';

/**
 * The two `@eslint/json` languages a rule of this package can be wired under. `json/json` rejects comments; `json/jsonc` accepts them. `json/json5` is deliberately absent: no file this package lints is JSON5.
 */
export type JsonLanguage = 'json/json' | 'json/jsonc';

/**
 * The files that legitimately carry comments (TypeScript and Turborepo both read them as JSONC, and `.jsonc` says so in its own extension), so a rule targeting them must run under `json/jsonc`. Shared by json-canonical.ts, which needs the identical split to keep the plain `json/json` config off them, and by every block built with `buildJsonLanguageBlock` that targets them.
 */
export const JSONC_FILE_GLOBS: readonly string[] = ['**/*.jsonc', '**/tsconfig*.json', '**/turbo.json'];

// Typed against ESLint's own Linter.Config rather than the typescript-eslint FlatConfig type the config arrays use: only the former knows a language plugin's own language options (allowTrailingCommas) exist, and spreading it in stays assignable because its languageOptions carries an index signature.
const JSONC_LANGUAGE_OPTIONS: NonNullable<Linter.Config['languageOptions']> = { allowTrailingCommas: true };

/**
 * Resolves `@eslint/json`'s own plugin object through the optional peer, or `undefined` when it cannot be resolved (not installed, or a Node too old to `require()` an ES module synchronously). Callers decide whether that is silence or an error; see `requireJsonPlugin` for the error case.
 */
export function tryResolveJsonPlugin(requireFn?: RequireFn): Record<string, unknown> | undefined {
  return resolveJsonPlugin(tryRequire('@eslint/json', requireFn));
}

/**
 * Resolves `@eslint/json`'s plugin object or throws, naming `feature` (the thing that cannot work without it) and the install command. The command is inlined rather than held in a module constant so every call re-evaluates the literal, which keeps mutation testing honest about it.
 */
export function requireJsonPlugin(feature: string, requireFn?: RequireFn): Record<string, unknown> {
  const jsonPlugin = tryResolveJsonPlugin(requireFn);
  if (jsonPlugin === undefined) {
    throw new Error(`@exadev/eslint-config: ${feature} needs '@eslint/json' but it could not be resolved. Install it with: pnpm add -D @eslint/json`);
  }

  return jsonPlugin;
}

export interface JsonLanguageBlockOptions {
  readonly jsonPlugin: Record<string, unknown>;
  readonly language: JsonLanguage;
  readonly files: readonly string[];
  readonly ignores?: readonly string[];
  // Rule entries keyed by full rule name (`exadev/...`), passed straight through to the block.
  readonly rules: NonNullable<ConfigArrayValue[number]['rules']>;
}

/**
 * The one config block shape every JSON-language rule of this package is wired through: this package's own plugin as `exadev` and `@eslint/json` as `json`, on `files` under `language`, with trailing commas admitted under `json/jsonc`. Centralised so a rule family targeting `package.json`, `turbo.json` or a tsconfig never hand-assembles the plugin registration or the language id.
 */
export function buildJsonLanguageBlock(options: JsonLanguageBlockOptions): ConfigArrayValue[number] {
  return {
    files: [...options.files],
    ...(options.ignores !== undefined && { ignores: [...options.ignores] }),
    language: options.language,
    // Only valid under json/jsonc (json/json rejects the option); trailing commas are admitted for the same reason comments are, since tsconfig and the tools reading these files accept them, and json-canonical.ts's JSONC config sets the identical option.
    ...(options.language === 'json/jsonc' && { languageOptions: JSONC_LANGUAGE_OPTIONS }),
    plugins: { exadev: plugin, json: options.jsonPlugin },
    rules: options.rules,
  };
}
