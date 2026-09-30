import { createRequire } from 'node:module';
import type { TSESLint } from '@typescript-eslint/utils';
import type { ConfigArrayValue } from './config-types';
import { isRecord } from './is-record';

// A specifier resolved this way is never a string literal at the call site — always a runtime-computed argument — so no bundler's static import graph can see or attempt to resolve it. This is what lets eslint-plugin-react/eslint-plugin-react-hooks/eslint-plugin-jsx-a11y/@next/eslint-plugin-next stay genuinely optional: unlike typescript-eslint (required unconditionally the moment anything is imported from this package's root module, see recommended-type-checked.ts's own comment on that cost), these four are the first genuinely optional dependency this package has ever had. createRequire, not a dynamic import(), is what makes "attempt to load, tolerate absence" possible while keeping every existing export a plain, synchronously-available array — import() always returns a Promise, which would force every consumer into top-level await just to spread this package's default export, a real ergonomics regression for zero benefit.
const nodeRequire = createRequire(import.meta.url);

export type RequireFn = (specifier: string) => unknown;

/**
 * Never generic (no tryRequire<T>()): returning unknown unconditionally forces every call site to narrow via a real type guard before use, rather than letting a caller silently assert away the uncertainty this function exists to represent. Node's own NodeRequire call signature returns `any`; assigning that into a return position explicitly typed `unknown` needs no assertion, since `any` flows into `unknown` implicitly under this repo's own strict settings.
 */
export function tryRequire(specifier: string, requireFn: RequireFn = nodeRequire): unknown {
  try {
    return requireFn(specifier);
  } catch {
    return undefined;
  }
}

// A plugin's own exported "recommended" config can still carry a top-level `parserOptions` key — a legacy eslintrc-format field flat config's schema actively REJECTS with a hard ConfigError, not silently ignores, confirmed directly: eslint-plugin-jsx-a11y's real configs.recommended export has exactly this shape (`{ parserOptions: { ecmaFeatures: { jsx: true } }, plugins, rules }`), and spreading it as-is into a real Linter.verify() call throws "This appears to be in eslintrc format rather than flat config format." Relocated into languageOptions.parserOptions rather than dropped, since it carries real settings (enabling JSX parsing, here) a caller still needs. Operates on a plain Record so every access/spread is genuinely type-safe with no assertion — narrowing to TSESLint.FlatConfig.Config happens only after this normalization, in readFlatConfig below.
function normalizeLegacyParserOptions(record: Record<string, unknown>): Record<string, unknown> {
  if (!('parserOptions' in record)) return record;
  const { parserOptions, languageOptions, ...rest } = record;
  const existingLanguageOptions = isRecord(languageOptions) ? languageOptions : {};

  return { ...rest, languageOptions: { ...existingLanguageOptions, parserOptions } };
}

/**
 * Walks `path` through `module` one property at a time, using isRecord at each intermediate hop, so a missing or non-object-shaped step anywhere along the way (a renamed export, an unexpected major-version restructure upstream) fails closed — undefined, not a thrown TypeError reaching a consumer's own lint run.
 */
export function readFlatConfig(module: unknown, path: readonly string[]): TSESLint.FlatConfig.Config | undefined {
  let current: unknown = module;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  if (!isRecord(current)) return undefined;

  // TSESLint.FlatConfig.Config's own fields are all optional, so a plain Record<string, unknown> — everything normalizeLegacyParserOptions can return — is already directly assignable to it: no further narrowing, guard, or assertion needed.
  return normalizeLegacyParserOptions(current);
}

/**
 * The options every single-plugin preset (`buildNextjsConfig`, `buildTurboEnvConfig`) takes.
 */
export interface OptionalPluginOptions {
  // true: force on, throwing if the plugin isn't resolvable. false: force off. undefined (the default, whether omitted or passed explicitly, since exactOptionalPropertyTypes distinguishes the two and both are named here): auto-detect, silently returning [] if unresolvable.
  readonly enabled?: boolean | undefined;
  // Test seam only: defaults to the real resolver. Never exposed through exadevConfig()'s own public options.
  readonly requireFn?: RequireFn;
}

/**
 * What identifies a single-plugin preset: which package to load, which flat config to read from it, how to name the feature in the error thrown when it is forced on and missing, and optionally the files to scope the config to.
 */
export interface OptionalPluginPreset {
  readonly packageName: string;
  // Property path from the package's module to the flat config, for `readFlatConfig`.
  readonly configPath: readonly string[];
  // Reads as the subject of "<feature> was explicitly requested but '<packageName>' could not be resolved".
  readonly feature: string;
  // Replaces the upstream config's own `files`. Omit it when the package's presence alone is an unambiguous signal and the upstream config already scopes itself.
  readonly files?: readonly string[];
}

/**
 * The one shape shared by the presets that fold a single optional plugin's flat config into `exadevConfig()`: `enabled: false` yields nothing, `enabled: true` throws with the install command when the package or its config cannot be resolved, and otherwise the config is used when it resolves and skipped silently when it does not.
 */
export function buildOptionalPluginConfig(preset: OptionalPluginPreset, options: OptionalPluginOptions = {}): ConfigArrayValue {
  if (options.enabled === false) return [];

  const config = readFlatConfig(tryRequire(preset.packageName, options.requireFn), preset.configPath);

  if (options.enabled === true && config === undefined) {
    throw new Error(
      `@exadev/eslint-config: ${preset.feature} was explicitly requested but '${preset.packageName}' could not be resolved. Install it with: pnpm add -D ${preset.packageName}`,
    );
  }

  if (config === undefined) return [];

  return [preset.files === undefined ? config : { ...config, files: [...preset.files] }];
}
