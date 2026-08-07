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
    // Dogfooding this package's own rules on itself, imported directly by relative path rather than as a dependency on itself. All four now apply: src/plugin.ts holds the actual plugin construction (rules registry, configs assembly), leaving src/index.ts as a genuine one-line re-export barrel -- the split that makes no-side-effects-in-index and no-non-barrel-reexport (both built around src/index.ts being a PURE re-export point) fit this repo's own architecture rather than misfire against it.
    plugins: { exadev },
    rules: { 'exadev/no-non-barrel-index': 'error', 'exadev/no-pointless-reassignment': 'error' },
  },
  {
    files: ['src/index.ts'],
    plugins: { exadev },
    rules: { 'exadev/no-side-effects-in-index': 'error' },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/index.ts'],
    plugins: { exadev },
    rules: { 'exadev/no-non-barrel-reexport': 'error' },
  },
);
