import jsonCanonical from 'eslint-plugin-json-canonical';
import type { Linter } from 'eslint';
import type { ConfigArrayValue } from './config-types';

// `ESLint.Plugin['configs']`'s value type is a union spanning both flat and legacy-eslintrc config shapes -- `'language' in value` is the field only the flat shape carries, so checking for it (rather than trusting the plugin's own advertised type) narrows to the real flat-config object eslint-plugin-json-canonical's own configs.recommended getter actually returns.
function isSingleFlatConfig(value: unknown): value is Linter.Config {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'language' in value;
}

const recommended: unknown = jsonCanonical.configs?.['recommended'];
if (!isSingleFlatConfig(recommended)) {
  throw new Error('eslint-plugin-json-canonical: expected configs.recommended to be a single flat config object, got an array or undefined');
}

// Bundled unconditionally, the same way jsdocAndTsdoc is: eslint-plugin-json-canonical is a plain dependency of this package (see package.json), so every consumer already has it the moment they depend on this package at all -- no peer to resolve, no tri-state option. Scoped to plain JSON, excluding the same JSONC-shaped families documents.js's own eslint.shared.ts already established by grep (tsconfig*.json and turbo.json genuinely carry comments TypeScript and turbo both accept -- @eslint/json's json/json language, which eslint-plugin-json-canonical's own recommended config hard-codes, has no notion of a comment and fails to parse either family). package.json is also excluded: its key order is a distinct, separately-optional concern (syncpack-style field priority pinning name/version/description to the top) this plugin's own `json/sort-keys` (plain alphabetical) would otherwise fight over the same file.
const jsonCanonicalConfig: ConfigArrayValue = [
  {
    files: ['**/*.json'],
    ignores: ['**/tsconfig*.json', '**/turbo.json', '**/package.json'],
    ...recommended,
  },
];

export default jsonCanonicalConfig;
