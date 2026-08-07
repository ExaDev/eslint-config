import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import exadev from './src/index';

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules', '.turbo'],
  },
  {
    languageOptions: {
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    linterOptions: { noInlineConfig: true },
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    // Dogfooding this package's own rules on itself, imported directly by relative path rather than as a dependency on itself. Only no-non-barrel-index and no-pointless-reassignment apply here: no-side-effects-in-index and no-non-barrel-reexport are both built around the documents.js family's convention that src/index.ts is a PURE re-export barrel -- this package's own src/index.ts is not one, since it genuinely constructs and mutates the plugin object (Object.assign for the self-referencing configs), so those two rules would misfire against this repo's own real architecture.
    plugins: { exadev },
    rules: { 'exadev/no-non-barrel-index': 'error', 'exadev/no-pointless-reassignment': 'error' },
  },
);
