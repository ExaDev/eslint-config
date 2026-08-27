import { createRequire } from 'node:module';
import type { TSESLint } from '@typescript-eslint/utils';

// A specifier resolved this way is never a string literal at the call site -- always a runtime-computed argument -- so no bundler's static import graph can see or attempt to resolve it. This is what lets eslint-plugin-react/eslint-plugin-react-hooks/eslint-plugin-jsx-a11y/@next/eslint-plugin-next stay genuinely optional: unlike typescript-eslint (required unconditionally the moment anything is imported from this package's root module, see recommended-type-checked.ts's own comment on that cost), these four are the first genuinely optional dependency this package has ever had. createRequire, not a dynamic import(), is what makes "attempt to load, tolerate absence" possible while keeping every existing export a plain, synchronously-available array -- import() always returns a Promise, which would force every consumer into top-level await just to spread this package's default export, a real ergonomics regression for zero benefit.
const nodeRequire = createRequire(import.meta.url);

export type RequireFn = (specifier: string) => unknown;

// Never generic (no tryRequire<T>()): returning unknown unconditionally forces every call site to narrow via a real type guard before use, rather than letting a caller silently assert away the uncertainty this function exists to represent. Node's own NodeRequire call signature returns `any`; assigning that into a return position explicitly typed `unknown` needs no assertion, since `any` flows into `unknown` implicitly under this repo's own strict settings.
export function tryRequire(specifier: string, requireFn: RequireFn = nodeRequire): unknown {
  try {
    return requireFn(specifier);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// TSESLint.FlatConfig.Config's own fields are all optional -- an empty object {} is itself a valid config -- so "is a non-null object" is a sound, if permissive, check for it; there is no further structural distinction a runtime guard could usefully make without re-validating a well-known library's own already-correct export field by field, which this codebase's own no-defensive-over-engineering convention rules out. Matches barrel-helpers.ts's own isBarrelMode precedent: a real check, then a predicate claims the narrower type -- never an assertion.
function isFlatConfig(value: unknown): value is TSESLint.FlatConfig.Config {
  return isRecord(value);
}

// A plugin's own exported "recommended" config can still carry a top-level `parserOptions` key -- a legacy eslintrc-format field flat config's schema actively REJECTS with a hard ConfigError, not silently ignores, confirmed directly: eslint-plugin-jsx-a11y's real configs.recommended export has exactly this shape (`{ parserOptions: { ecmaFeatures: { jsx: true } }, plugins, rules }`), and spreading it as-is into a real Linter.verify() call throws "This appears to be in eslintrc format rather than flat config format." Relocated into languageOptions.parserOptions rather than dropped, since it carries real settings (enabling JSX parsing, here) a caller still needs. Operates on a plain Record so every access/spread is genuinely type-safe with no assertion -- narrowing to TSESLint.FlatConfig.Config happens only after this normalization, in readFlatConfig below.
function normalizeLegacyParserOptions(record: Record<string, unknown>): Record<string, unknown> {
  if (!('parserOptions' in record)) return record;
  const { parserOptions, languageOptions, ...rest } = record;
  const existingLanguageOptions = isRecord(languageOptions) ? languageOptions : {};
  return { ...rest, languageOptions: { ...existingLanguageOptions, parserOptions } };
}

// Walks `path` through `module` one property at a time, using isRecord at each intermediate hop, so a missing or non-object-shaped step anywhere along the way (a renamed export, an unexpected major-version restructure upstream) fails closed -- undefined, not a thrown TypeError reaching a consumer's own lint run.
export function readFlatConfig(module: unknown, path: readonly string[]): TSESLint.FlatConfig.Config | undefined {
  let current: unknown = module;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  if (!isRecord(current)) return undefined;
  const normalized = normalizeLegacyParserOptions(current);
  return isFlatConfig(normalized) ? normalized : undefined;
}
