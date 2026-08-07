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
  // Dogfooding this package's own default export on itself, imported directly by relative path rather than as a dependency on itself -- the live proof that `...exadevRecommendedTypeChecked` (a spread) typechecks and behaves correctly. The default ships barrel-policy at mode 'banned', but this repo (like every published package in its consumer family) keeps src/index.ts as its package entry point, so it overrides to 'single' in the next block.
  ...exadevRecommendedTypeChecked,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // This package's own src/index.ts is its public entry point (package.json exports), so it keeps one barrel: override the default 'banned' policy to 'single'.
      'exadev/barrel-policy': ['error', { mode: 'single' }],
    },
  },
);
