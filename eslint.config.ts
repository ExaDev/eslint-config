import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import { exadevConfig } from './src/index';

// defineConfig() over a plain array or the now-@deprecated tseslint.config(): exadevConfig()'s return type is PublicConfigArray (see src/config-types.ts), typed against @eslint/core's own ConfigObject specifically so it satisfies defineConfig()'s parameter type directly -- this file is the first real proof of that, dogfooding the fix on the same repo that ships it.
export default defineConfig(
  {
    ignores: ['dist', 'coverage', 'node_modules', '.turbo'],
  },
  {
    languageOptions: {
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
  },
  js.configs.recommended,
  // Dogfooding this package's own factory export on itself, imported directly by relative path rather than as a dependency on itself -- the live proof that `exadevConfig(...)` (spread) typechecks and behaves correctly. `react: false, nextjs: false` forced explicitly: eslint-plugin-react/@next/eslint-plugin-next are real devDependencies of THIS repo (needed to test src/react.ts/src/nextjs.ts's own "package is resolvable" branch), so plain auto-detection would activate them here too -- and @next/eslint-plugin-next's own no-html-link-for-pages rule warns to the console about a missing pages/ directory on every lint run, since this repo obviously isn't a Next.js app despite the package being resolvable. This is exactly the scenario the factory's explicit tri-state exists for. The default export ships barrel-policy at mode 'banned', but this repo (like every published package in its consumer family) keeps src/index.ts as its package entry point, so it overrides to 'single' in the next block.
  ...exadevConfig({ react: false, nextjs: false }),
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // This package's own src/index.ts is its public entry point (package.json exports), so it keeps one barrel: override the default 'banned' policy to 'single'.
      'exadev/barrel-policy': ['error', { mode: 'single' }],
    },
  },
  {
    // src/to-public-config-array.ts's one line is the sole, verified-necessary use of a type assertion in this codebase (see PublicConfigArray's own comment in src/config-types.ts) -- noInlineConfig rules out an inline disable, so this scoped override is the only mechanism available, and isolating the cast into its own single-purpose file keeps the override's blast radius to exactly that one line rather than a whole file that does other things too.
    files: ['src/to-public-config-array.ts'],
    rules: { '@typescript-eslint/consistent-type-assertions': 'off' },
  },
  {
    // src/consumer-compatibility.ts deliberately exercises tseslint.config() (now @deprecated) to prove this package's exported array still satisfies it, so existing consumers who haven't migrated to defineConfig() keep working -- see that file's own comment.
    files: ['src/consumer-compatibility.ts'],
    rules: { '@typescript-eslint/no-deprecated': 'off' },
  },
);
