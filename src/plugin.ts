import type { TSESLint } from '@typescript-eslint/utils';
import type { ConfigValue, PublicPlugin } from './config-types';
import { version } from '../package.json';
import { buildNextjsConfig } from './nextjs';
import { buildReactConfig } from './react';
import { toPublicPlugin } from './to-public-plugin';
import barrelDirectSiblingsOnly from './rules/barrel-direct-siblings-only';
import barrelPolicy from './rules/barrel-policy';
import devDependencyOnly from './rules/dev-dependency-only';
import filenamePattern from './rules/filename-pattern';
import importPolicy from './rules/import-policy';
import injectedTestHygiene from './rules/injected-test-hygiene';
import markdownRequiredHeading from './rules/markdown-required-heading';
import noArrayIsarrayMutation from './rules/no-array-isarray-mutation';
import noBoundariesIgnore from './rules/no-boundaries-ignore';
import noControlFlow from './rules/no-control-flow';
import noDependencyCycle from './rules/no-dependency-cycle';
import noEnumNumberWidening from './rules/no-enum-number-widening';
import noEnumReverseLookupWidening from './rules/no-enum-reverse-lookup-widening';
import noExternalMemberJsxTag from './rules/no-external-member-jsx-tag';
import noFixInCachedTaskScript from './rules/no-fix-in-cached-task-script';
import noIndexFiles from './rules/no-index-files';
import noMapInstanceofMutation from './rules/no-map-instanceof-mutation';
import noMultilineTemplateLiteral from './rules/no-multiline-template-literal';
import noMutableUnionArrayParam from './rules/no-mutable-union-array-param';
import noNonBarrelIndex from './rules/no-non-barrel-index';
import noNonBarrelReexport from './rules/no-non-barrel-reexport';
import noNonSerialisableServerProp from './rules/no-non-serialisable-server-prop';
import noObjectAssign from './rules/no-object-assign';
import nonVacuousGuard from './rules/non-vacuous-guard';
import noPointlessReassignment from './rules/no-pointless-reassignment';
import noSetInstanceofMutation from './rules/no-set-instanceof-mutation';
import noSideEffectsInIndex from './rules/no-side-effects-in-index';
import noUphillDependency from './rules/no-uphill-dependency';
import packageHasFiles from './rules/package-has-files';
import packageJsonKeyOrder from './rules/package-json-key-order';
import packageNameMirrorsPath from './rules/package-name-mirrors-path';
import preferNumericSortCompare from './rules/prefer-numeric-sort-compare';
import preferDocComment from './rules/prefer-doc-comment';
import preferOptionsObjectParam from './rules/prefer-options-object-param';
import preferReadonlyArrayParam from './rules/prefer-readonly-array-param';
import preferReadonlyObjectParam from './rules/prefer-readonly-object-param';
import pureModule from './rules/pure-module';
import requiredExports from './rules/required-exports';
import requiredImports from './rules/required-imports';
import requiredScripts from './rules/required-scripts';
import scopedFirstParameter from './rules/scoped-first-parameter';
import testFileKind from './rules/test-file-kind';
import timeoutAbortsRequest from './rules/timeout-aborts-request';
import turboBoundariesConfig from './rules/turbo-boundaries-config';
import turboBoundariesScript from './rules/turbo-boundaries-script';
import turboJsonHygiene from './rules/turbo-json-hygiene';
import turboPackageTags from './rules/turbo-package-tags';
import turboScriptConvention from './rules/turbo-script-convention';
import turboScriptHasTask from './rules/turbo-script-has-task';
import turboTaskConfigInputs from './rules/turbo-task-config-inputs';
import turboTaskGraph from './rules/turbo-task-graph';
import turboTaskHasScript from './rules/turbo-task-has-script';
import turboTaskOutputs from './rules/turbo-task-outputs';

// @typescript-eslint/utils's own FlatConfig.Plugin type is used here rather than eslint's own ESLint.Plugin (which an earlier version of this file used) or a hand-written interface — see the "don't hand-type external libraries" convention this plugin's own rules were built under. eslint's Rule.RuleModule declares a concrete, non-generic `create(context: RuleContext): RuleListener` that only structurally matches rules built directly against the plain `eslint` package's own types; a rule built with ESLintUtils.RuleCreator (needed for typed TSESTree node access and, for type-aware rules, type-checker access) is not assignable to it, even though both shapes are the exact same runtime `{ meta, create }` contract ESLint actually calls. FlatConfig.Plugin's `rules` field is typed as `Record<string, LooseRuleDefinition>` specifically to hold both authoring styles in one plugin, which this package now does. meta.namespace is what a consumer's `plugins: { exadev }` registration turns into the rule-reference prefix ('exadev/no-non-barrel-reexport'); it is not inferred from the package name automatically, so it is stated explicitly here to match. meta.version is imported from package.json rather than hardcoded, since semantic-release rewrites that file's own version on every release and a duplicated literal here would silently drift out of sync with it.
//
// `export default plugin` is ESLint's own documented shape for a plugin's entry point (see the ESLint plugin-authoring guide) — deliberately kept even though `attw --pack` flags a legacy-only mismatch for it: tsdown/rolldown's CJS output for a sole default export doesn't emit the `export =` form arethetypeswrong.github.io's FalseExportDefault check wants, so `node10`-mode resolution shows a false "incorrect default export". `node16 (from CJS)`, `node16 (from ESM)`, and `bundler` — the resolution modes an ESLint flat config actually uses — are all clean; only the legacy, essentially unused `node10` mode is affected. Switching away from `export default` to chase that one row would mean deviating from ESLint's own prescribed plugin shape for a resolution mode nothing in this ecosystem still targets, which is the worse trade.
//
// This construction lives here, not in src/index.ts, specifically so index.ts can be a genuine pure re-export barrel: no-side-effects-in-index and no-non-barrel-reexport both assume src/index.ts contains nothing but re-export statements, and a module that builds and mutates a plugin object is not that.
//
// Each config below needs to reference the fully-built `plugin` object itself (`plugins: { exadev: plugin }`), which a plain object literal can't do for its own binding while still being constructed — `plugin` is in its temporal dead zone until the whole `const plugin = {...}` statement completes. A getter closes over the `plugin` binding rather than its value, so it resolves correctly the moment a consumer actually reads `configs.recommended`/`configs.barrel`, by which point construction has long finished; there is no post-construction mutation step (no Object.assign, no null-checked destructure) to reach for at all.
const plugin: TSESLint.FlatConfig.Plugin = {
  meta: {
    name: '@exadev/eslint-config',
    version,
    namespace: 'exadev',
  },
  rules: {
    'barrel-direct-siblings-only': barrelDirectSiblingsOnly,
    'barrel-policy': barrelPolicy,
    'dev-dependency-only': devDependencyOnly,
    'filename-pattern': filenamePattern,
    'import-policy': importPolicy,
    'injected-test-hygiene': injectedTestHygiene,
    'markdown-required-heading': markdownRequiredHeading,
    'no-array-isarray-mutation': noArrayIsarrayMutation,
    'no-boundaries-ignore': noBoundariesIgnore,
    'no-control-flow': noControlFlow,
    'no-dependency-cycle': noDependencyCycle,
    'no-enum-number-widening': noEnumNumberWidening,
    'no-enum-reverse-lookup-widening': noEnumReverseLookupWidening,
    'no-external-member-jsx-tag': noExternalMemberJsxTag,
    'no-fix-in-cached-task-script': noFixInCachedTaskScript,
    'no-index-files': noIndexFiles,
    'no-map-instanceof-mutation': noMapInstanceofMutation,
    'no-multiline-template-literal': noMultilineTemplateLiteral,
    'no-mutable-union-array-param': noMutableUnionArrayParam,
    'no-non-barrel-index': noNonBarrelIndex,
    'no-non-barrel-reexport': noNonBarrelReexport,
    'no-non-serialisable-server-prop': noNonSerialisableServerProp,
    'no-object-assign': noObjectAssign,
    'no-pointless-reassignment': noPointlessReassignment,
    'no-set-instanceof-mutation': noSetInstanceofMutation,
    'no-side-effects-in-index': noSideEffectsInIndex,
    'no-uphill-dependency': noUphillDependency,
    'non-vacuous-guard': nonVacuousGuard,
    'package-has-files': packageHasFiles,
    'package-json-key-order': packageJsonKeyOrder,
    'package-name-mirrors-path': packageNameMirrorsPath,
    'prefer-doc-comment': preferDocComment,
    'prefer-numeric-sort-compare': preferNumericSortCompare,
    'prefer-options-object-param': preferOptionsObjectParam,
    'prefer-readonly-array-param': preferReadonlyArrayParam,
    'prefer-readonly-object-param': preferReadonlyObjectParam,
    'pure-module': pureModule,
    'required-exports': requiredExports,
    'required-imports': requiredImports,
    'required-scripts': requiredScripts,
    'scoped-first-parameter': scopedFirstParameter,
    'test-file-kind': testFileKind,
    'timeout-aborts-request': timeoutAbortsRequest,
    'turbo-boundaries-config': turboBoundariesConfig,
    'turbo-boundaries-script': turboBoundariesScript,
    'turbo-json-hygiene': turboJsonHygiene,
    'turbo-package-tags': turboPackageTags,
    'turbo-script-convention': turboScriptConvention,
    'turbo-script-has-task': turboScriptHasTask,
    'turbo-task-config-inputs': turboTaskConfigInputs,
    'turbo-task-graph': turboTaskGraph,
    'turbo-task-has-script': turboTaskHasScript,
    'turbo-task-outputs': turboTaskOutputs,
  },
  configs: {
    // The recommended barrel policy is 'banned' (no index files at all), expressed through the barrel-policy umbrella rule, plus no-pointless-reassignment and noInlineConfig. This is the LIGHTER of this package's two bundles — no typescript-eslint type-checked ruleset — for a consumer who wants just this plugin's own rules without the full typed-linting baseline (the default export, src/index.ts, is the heavier bundle that adds that baseline on top of the same 'banned' policy). A project that legitimately needs a barrel (e.g. a published package whose src/index.ts is its package entry point) overrides to `{ mode: 'single' }` in its own config, or uses `configs.barrel` below. no-enum-number-widening, no-enum-reverse-lookup-widening, no-array-isarray-mutation, no-map-instanceof-mutation, no-set-instanceof-mutation, prefer-readonly-object-param, and prefer-numeric-sort-compare are all deliberately excluded here — each reads real type information (no-array-isarray-mutation needs it specifically to see through a type alias and to catch a bare, non-union readonly array parameter, both invisible from TSESTree syntax alone; no-map-instanceof-mutation and no-set-instanceof-mutation need it to see a parameter's real ReadonlyMap/ReadonlySet constituent through the same kind of alias/union; prefer-readonly-object-param needs the checker to resolve a parameter's own property types to confirm every one is flat; prefer-numeric-sort-compare needs the checker to confirm an array's element type is definitively 'number'), which this lighter bundle has no typescript-eslint parser wired up to provide; they are only ever registered in the type-checked bundle (src/recommended-type-checked.ts). no-mutable-union-array-param, prefer-options-object-param, prefer-readonly-array-param, and test-file-kind all need no type information (each matches on TSESTree node shapes or the filename alone, a no-op under a plain JS parser), so all four are included in both bundles like no-object-assign — prefer-options-object-param has no checker dependency of its own (see its own file header) and is deliberately NOT held out of this lighter bundle merely to sit alongside its type-dependent prefer-readonly-object-param/prefer-numeric-sort-compare siblings above, since doing so would withhold a real, zero-cost protection from exactly the consumer this lighter bundle exists for. max-params needs no type information either and is included in both bundles for the same reason — it is deliberately the LOOSER of the two backstops against an unwieldy parameter list: prefer-options-object-param already offers a real fix for the specific 2+-trailing-optional-parameters shape; max-params (at a threshold one above its own tool default, so it stays a backstop rather than a near-duplicate of the custom rule) catches the different, genuinely-excessive-REQUIRED-parameters case the custom rule is deliberately blind to.
    get recommended(): ConfigValue {
      return {
        plugins: { exadev: plugin },
        linterOptions: { noInlineConfig: true },
        rules: {
          'exadev/barrel-policy': ['error', { mode: 'banned' }],
          'exadev/no-mutable-union-array-param': 'error',
          'exadev/no-object-assign': 'error',
          'exadev/no-pointless-reassignment': 'error',
          'exadev/prefer-options-object-param': 'error',
          'exadev/prefer-readonly-array-param': 'error',
          'exadev/test-file-kind': 'error',
          'max-params': ['error', { max: 4 }],
        },
      };
    },
    // The barrel-policy umbrella at 'single' — exactly src/index.ts may be a barrel — for a consumer that keeps one barrel (the convention this package itself used to recommend before 'banned' became the default).
    get barrel(): ConfigValue {
      return {
        plugins: { exadev: plugin },
        rules: {
          'exadev/barrel-policy': ['error', { mode: 'single' }],
        },
      };
    },
    // Explicitly selecting this config is itself an explicit request for React support — unlike recommended/barrel above, which only ever reference this package's own always-present rules and can never fail, `enabled: true` here means a missing eslint-plugin-react throws a clear, actionable error rather than silently returning nothing (see src/react.ts). A consumer who wants silent auto-detection instead uses the exadevConfig() factory (src/create-config.ts), which threads the same tri-state through without ever forcing the choice.
    get react(): ConfigValue {
      return buildReactConfig({ enabled: true });
    },
    // Mirrors `react` above — explicit selection, throws if @next/eslint-plugin-next isn't installed (see src/nextjs.ts).
    get nextjs(): ConfigValue {
      return buildNextjsConfig({ enabled: true, plugin });
    },
  },
};

export default plugin;

/**
 * The named export src/index.ts re-exports as `plugin`: retyped at the same public boundary PublicConfigArray/toPublicConfigArray use, since a consumer wiring `plugins: { exadev: plugin }` straight into `defineConfig()` (README's "lighter option" section) needs `@eslint/core`'s own Plugin shape, not this module's internal TSESLint.FlatConfig.Plugin (see PublicPlugin's own comment in config-types.ts). Every other consumer of `plugin` in this codebase (package-json-key-order.ts, workspace-architecture.ts, recommended-type-checked.ts) imports the internal-typed default export above directly, since each spreads it into a ConfigArrayValue it is still assembling, which needs the TSESLint-typed shape for typescript-eslint's own rule-option checking.
 */
export const publicPlugin: PublicPlugin = toPublicPlugin(plugin);
