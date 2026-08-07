import type { ESLint } from 'eslint';
import { version } from '../package.json';
import barrelDirectSiblingsOnly from './rules/barrel-direct-siblings-only';
import barrelPolicy from './rules/barrel-policy';
import noIndexFiles from './rules/no-index-files';
import noNonBarrelIndex from './rules/no-non-barrel-index';
import noNonBarrelReexport from './rules/no-non-barrel-reexport';
import noPointlessReassignment from './rules/no-pointless-reassignment';
import noSideEffectsInIndex from './rules/no-side-effects-in-index';

// Derived from ESLint's own Plugin type rather than hand-written: a getter's return expression is only contextually typed against its own explicit return-type annotation, not against the outer object literal's type the way a plain property initializer would be -- without this, each rule's 'error' literal below would widen to plain `string`, which the real ConfigObject['rules'] shape (Partial<RulesConfig>, not Record<string, string>) rejects.
type ConfigValue = NonNullable<ESLint.Plugin['configs']>[string];

// ESLint's own ESLint.Plugin type (re-exported from @eslint/core) is used directly rather than a hand-written interface -- see the "don't hand-type external libraries" convention this plugin's own rules were built under. meta.namespace is what a consumer's `plugins: { exadev }` registration turns into the rule-reference prefix ('exadev/no-non-barrel-reexport'); it is not inferred from the package name automatically, so it is stated explicitly here to match. meta.version is imported from package.json rather than hardcoded, since semantic-release rewrites that file's own version on every release and a duplicated literal here would silently drift out of sync with it.
//
// `export default plugin` is ESLint's own documented shape for a plugin's entry point (see the ESLint plugin-authoring guide) -- deliberately kept even though `attw --pack` flags a legacy-only mismatch for it: tsdown/rolldown's CJS output for a sole default export doesn't emit the `export =` form arethetypeswrong.github.io's FalseExportDefault check wants, so `node10`-mode resolution shows a false "incorrect default export". `node16 (from CJS)`, `node16 (from ESM)`, and `bundler` -- the resolution modes an ESLint flat config actually uses -- are all clean; only the legacy, essentially unused `node10` mode is affected. Switching away from `export default` to chase that one row would mean deviating from ESLint's own prescribed plugin shape for a resolution mode nothing in this ecosystem still targets, which is the worse trade.
//
// This construction lives here, not in src/index.ts, specifically so index.ts can be a genuine pure re-export barrel: no-side-effects-in-index and no-non-barrel-reexport both assume src/index.ts contains nothing but re-export statements, and a module that builds and mutates a plugin object is not that.
//
// Each config below needs to reference the fully-built `plugin` object itself (`plugins: { exadev: plugin }`), which a plain object literal can't do for its own binding while still being constructed -- `plugin` is in its temporal dead zone until the whole `const plugin = {...}` statement completes. A getter closes over the `plugin` binding rather than its value, so it resolves correctly the moment a consumer actually reads `configs.recommended`/`configs.barrel`, by which point construction has long finished; there is no post-construction mutation step (no Object.assign, no null-checked destructure) to reach for at all.
const plugin: ESLint.Plugin = {
  meta: {
    name: '@exadev/eslint-config',
    version,
    namespace: 'exadev',
  },
  rules: {
    'barrel-direct-siblings-only': barrelDirectSiblingsOnly,
    'barrel-policy': barrelPolicy,
    'no-index-files': noIndexFiles,
    'no-non-barrel-index': noNonBarrelIndex,
    'no-non-barrel-reexport': noNonBarrelReexport,
    'no-pointless-reassignment': noPointlessReassignment,
    'no-side-effects-in-index': noSideEffectsInIndex,
  },
  configs: {
    // The recommended barrel policy is 'banned' (no index files at all), expressed through the barrel-policy umbrella rule, plus no-pointless-reassignment and noInlineConfig. This is the LIGHTER of this package's two bundles -- no typescript-eslint type-checked ruleset -- for a consumer who wants just this plugin's own rules without the full typed-linting baseline (the default export, src/index.ts, is the heavier bundle that adds that baseline on top of the same 'banned' policy). A project that legitimately needs a barrel (e.g. a published package whose src/index.ts is its package entry point) overrides to `{ mode: 'single' }` in its own config, or uses `configs.barrel` below.
    get recommended(): ConfigValue {
      return {
        plugins: { exadev: plugin },
        linterOptions: { noInlineConfig: true },
        rules: {
          'exadev/barrel-policy': ['error', { mode: 'banned' }],
          'exadev/no-pointless-reassignment': 'error',
        },
      };
    },
    // The barrel-policy umbrella at 'single' -- exactly src/index.ts may be a barrel -- for a consumer that keeps one barrel (the convention this package itself used to recommend before 'banned' became the default).
    get barrel(): ConfigValue {
      return {
        plugins: { exadev: plugin },
        rules: {
          'exadev/barrel-policy': ['error', { mode: 'single' }],
        },
      };
    },
  },
};

export default plugin;
