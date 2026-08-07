import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import exadevRecommendedTypeChecked from './src/index';

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
  // Dogfooding this package's own default export on itself, imported directly by relative path rather than as a dependency on itself -- the live proof that `...exadevRecommendedTypeChecked` (a spread) typechecks and behaves correctly, including its own four exadev/* rules self-scoping against this repo's own src/index.ts barrel and src/plugin.ts non-barrel module.
  ...exadevRecommendedTypeChecked,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
);
