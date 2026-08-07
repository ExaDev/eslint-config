import type { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
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
  // The typed-linting baseline every current consumer already wires itself (recommendedTypeChecked + stylisticTypeChecked -- recommendedTypeChecked already subsumes plain `recommended` outright: every one of its 46 rules is a strict subset of recommendedTypeChecked's 73, confirmed by inspecting the actual rule maps, not assumed from the docs alone), plus this plugin's own four rules and two general code-quality settings on top: no eslint-disable comments anywhere (an exception belongs in the config, scoped to where it applies, never hidden inline in the source it's disabling a rule for), and no type assertions (narrow with a guard or parse with Zod instead).
  //
  // This is a real bundling, not a reference that assumes the consumer already has typescript-eslint registered: recommendedTypeChecked's own base config registers the `@typescript-eslint` plugin and sets languageOptions.parser itself. That is exactly why a consumer adopting this config must remove its own `...tseslint.configs.recommended/recommendedTypeChecked/stylisticTypeChecked` spreads rather than keep them alongside this -- ESLint flat config rejects two different plugin object instances registered under the same namespace. What a consumer still supplies itself is languageOptions.parserOptions.project/projectService pointing at its own tsconfig(s) -- recommendedTypeChecked's base config never sets that, since it's genuinely project-specific.
  recommended: [
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
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
  ],
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
