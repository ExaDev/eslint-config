import jsonCanonical from 'eslint-plugin-json-canonical';
import type { Linter } from 'eslint';
import type { ConfigArrayValue } from './config-types';

// `ESLint.Plugin['configs']`'s value type is a union spanning both flat and legacy-eslintrc config shapes -- `'language' in value` is the field only the flat shape carries, so checking for it (rather than trusting the plugin's own advertised type) narrows to the real flat-config object eslint-plugin-json-canonical's own configs getters actually return.
function isSingleFlatConfig(value: unknown): value is Linter.Config {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'language' in value;
}

function requireConfig(name: 'recommended' | 'contentOnlyJsonc'): Linter.Config {
  const config: unknown = jsonCanonical.configs?.[name];
  if (!isSingleFlatConfig(config)) {
    throw new Error(`eslint-plugin-json-canonical: expected configs.${name} to be a single flat config object, got an array or undefined`);
  }
  return config;
}

const recommended = requireConfig('recommended');
const contentOnlyJsonc = requireConfig('contentOnlyJsonc');

// Bundled unconditionally, the same way jsdocAndTsdoc is: eslint-plugin-json-canonical is a plain dependency of this package (see package.json), so every consumer already has it the moment they depend on this package at all -- no peer to resolve, no tri-state option. `configs.recommended` (content canonicalization plus pretty-printing, as of eslint-plugin-json-canonical v2) applies to every JSON file except the JSONC-shaped families below and package.json's own key order (see the second block).
//
// tsconfig*.json/turbo.json/*.jsonc genuinely carry comments (TypeScript and turbo both accept them; *.jsonc says so in its own extension) -- @eslint/json's plain json/json language, which configs.recommended hard-codes, has no concept of a comment and fails to parse any of them. configs.contentOnlyJsonc is the matching json/jsonc variant: content canonicalization only, since neither pretty-format nor no-insignificant-whitespace has a JSONC counterpart (both rewrite a document's whitespace wholesale, with no well-defined answer for a comment's own attachment to a specific member once that happens).
const jsonCanonicalConfig: ConfigArrayValue = [
  {
    files: ['**/*.json'],
    ignores: ['**/*.jsonc', '**/tsconfig*.json', '**/turbo.json'],
    ...recommended,
  },
  {
    files: ['**/*.jsonc', '**/tsconfig*.json', '**/turbo.json'],
    ...contentOnlyJsonc,
  },
  // package.json's own member order is a distinct, separately-optional concern (syncpack-style field-priority pinning, not RFC 8785's plain alphabetical order) that exadevConfig({ packageJsonKeyOrder }) handles instead -- see buildPackageJsonKeyOrderConfig. Everything else configs.recommended gives every other JSON file (canonical numbers/strings, pretty-printed layout) still applies to package.json too; only its own key order is turned back off here.
  {
    files: ['**/package.json'],
    rules: { 'json/sort-keys': 'off' },
  },
];

export default jsonCanonicalConfig;
