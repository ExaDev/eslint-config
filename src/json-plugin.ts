// Shared @eslint/json resolution: extracted out of package-json-key-order.ts once workspace-architecture.ts needed the identical "resolve @eslint/json's own plugin object through an optional peer, tolerating its real ESM-namespace require() shape" logic for its own `**/package.json` config block. Both consumers wire the plugin's own JSON language onto the config they build; only the throw message differs (each names its own feature).

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// A real check (the candidate's own `languages.json` entry exists) rather than an assertion: enough evidence this is genuinely @eslint/json's plugin object, not a hand-typed re-implementation of its full public surface.
function isJsonLanguagePlugin(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const languages = value['languages'];
  return isRecord(languages) && 'json' in languages;
}

// Node's synchronous require() of a genuine ES module (which @eslint/json is) returns the module's own namespace object: every named export at the top level, plus the default export nested under `.default`, not the default export directly the way requiring a CJS/dual-published package would. Confirmed directly: `require('@eslint/json')` here returns `{ JSONLanguage, JSONSourceCode, __esModule: true, default: <the real plugin> }`. Checking `.default` first is what actually matches this package's own real shape; falling back to the value itself keeps this working unchanged for any other language plugin that IS its own default export directly (a CJS-native or dual-published one).
export function resolveJsonPlugin(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value) && isJsonLanguagePlugin(value['default'])) return value['default'];
  return isJsonLanguagePlugin(value) ? value : undefined;
}
