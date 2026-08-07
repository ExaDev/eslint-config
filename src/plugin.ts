import type { ESLint } from 'eslint';
import { version } from '../package.json';
import noNonBarrelIndex from './rules/no-non-barrel-index';
import noNonBarrelReexport from './rules/no-non-barrel-reexport';
import noPointlessReassignment from './rules/no-pointless-reassignment';
import noSideEffectsInIndex from './rules/no-side-effects-in-index';

// ESLint's own ESLint.Plugin type (re-exported from @eslint/core) is used directly rather than a hand-written interface -- see the "don't hand-type external libraries" convention this plugin's own rules were built under. meta.namespace is what a consumer's `plugins: { exadev }` registration turns into the rule-reference prefix ('exadev/no-non-barrel-reexport'); it is not inferred from the package name automatically, so it is stated explicitly here to match. meta.version is imported from package.json rather than hardcoded, since semantic-release rewrites that file's own version on every release and a duplicated literal here would silently drift out of sync with it.
//
// `export default plugin` is ESLint's own documented shape for a plugin's entry point (see the ESLint plugin-authoring guide) -- deliberately kept even though `attw --pack` flags a legacy-only mismatch for it: tsdown/rolldown's CJS output for a sole default export doesn't emit the `export =` form arethetypeswrong.github.io's FalseExportDefault check wants, so `node10`-mode resolution shows a false "incorrect default export". `node16 (from CJS)`, `node16 (from ESM)`, and `bundler` -- the resolution modes an ESLint flat config actually uses -- are all clean; only the legacy, essentially unused `node10` mode is affected. Switching away from `export default` to chase that one row would mean deviating from ESLint's own prescribed plugin shape for a resolution mode nothing in this ecosystem still targets, which is the worse trade.
//
// This construction lives here, not in src/index.ts, specifically so index.ts can be a genuine pure re-export barrel: no-side-effects-in-index and no-non-barrel-reexport both assume src/index.ts contains nothing but re-export statements, and a module that builds and mutates a plugin object (the Object.assign below) is not that.
const plugin: ESLint.Plugin = {
  meta: {
    name: '@exadev/eslint-config',
    version,
    namespace: 'exadev',
  },
  rules: {
    'no-non-barrel-index': noNonBarrelIndex,
    'no-non-barrel-reexport': noNonBarrelReexport,
    'no-pointless-reassignment': noPointlessReassignment,
    'no-side-effects-in-index': noSideEffectsInIndex,
  },
  configs: {},
};

// Assigned after construction, not inline, so each config's own `plugins: { exadev: plugin }` can reference the already-built plugin object -- the same pattern ESLint's own plugin-authoring guide uses for exactly this self-reference. ESLint's own Plugin interface declares `configs` optional (a plugin need not define any), so accessing it back off `plugin` after the object literal above narrows to `Record<...> | undefined` again regardless of the `{}` it was just initialized with -- destructuring it once and checking for undefined here is the proper narrowing rather than a non-null assertion.
const { configs } = plugin;
if (configs === undefined) {
  throw new Error('Unreachable: configs was just initialized to {} in the object literal above.');
}
Object.assign(configs, {
  // Every rule this plugin defines, at 'error', plus two general code-quality settings every current consumer already wires independently: no eslint-disable comments anywhere (an exception belongs in the config, scoped to where it applies, never hidden inline in the source it's disabling a rule for), and no type assertions (narrow with a guard or parse with Zod instead). consistent-type-assertions is @typescript-eslint's own rule, not one this plugin defines -- referencing it here assumes the consumer has typescript-eslint registered under the `@typescript-eslint` namespace already, true for every consumer this plugin currently has. A consumer with no typescript-eslint at all should use a narrower extends or wire the four exadev/* rules directly instead of taking configs.recommended wholesale.
  recommended: {
    plugins: { exadev: plugin },
    linterOptions: { noInlineConfig: true },
    rules: {
      'exadev/no-non-barrel-index': 'error',
      'exadev/no-non-barrel-reexport': 'error',
      'exadev/no-pointless-reassignment': 'error',
      'exadev/no-side-effects-in-index': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
    },
  },
  // Only the three rules that police the src/index.ts barrel convention (index-file naming, re-export placement, and the barrel's own purity) -- for a consumer that wants that discipline without also taking no-pointless-reassignment.
  barrel: {
    plugins: { exadev: plugin },
    rules: {
      'exadev/no-non-barrel-index': 'error',
      'exadev/no-non-barrel-reexport': 'error',
      'exadev/no-side-effects-in-index': 'error',
    },
  },
});

export default plugin;
