import type { TSESLint } from '@typescript-eslint/utils';
import tseslint from 'typescript-eslint';
import plugin from './plugin';

// This package's own default export (re-exported by src/index.ts): typescript-eslint is a required peer dependency of @exadev/eslint-config as a whole, not an optional one behind a separate subpath -- a plain-JS consumer wanting only the base four rules imports the named `plugin` export instead (see src/index.ts), which never itself imports typescript-eslint, but importing ANYTHING from this package's root module now unconditionally resolves typescript-eslint, since ESM/CJS module evaluation runs a module's entire top-level import graph regardless of which specific export the caller reads. An earlier version of this package tried to avoid that cost for every consumer via a genuinely separate npm subpath (@exadev/eslint-config/recommended-type-checked) -- correct in isolation, but it meant two module specifiers for one package, which this package's own consumers found more awkward than the (small, TypeScript-only-consumer) cost of requiring typescript-eslint unconditionally.
//
// strictTypeChecked already subsumes both plain `recommended` and `recommendedTypeChecked` outright: every rule in each is also present in strictTypeChecked, confirmed by inspecting the actual rule maps, not assumed from the docs alone. This is a real bundling, not a rule reference that assumes the consumer already has typescript-eslint registered: strictTypeChecked's own base config registers the `@typescript-eslint` plugin and sets languageOptions.parser itself. That is exactly why a consumer adopting this config must remove its own `...tseslint.configs.recommended/recommendedTypeChecked/strictTypeChecked/stylisticTypeChecked` spreads rather than keep them alongside this -- ESLint flat config rejects two different plugin object instances registered under the same namespace. What a consumer still supplies itself is languageOptions.parserOptions.project/projectService pointing at its own tsconfig(s); strictTypeChecked's base config never sets that, since it's genuinely project-specific.
//
// strictTypeChecked over recommendedTypeChecked specifically: confirmed directly (by diffing the two rule maps, not from the docs) that strict adds 18 rules recommended does not -- 5 were previously re-added by hand below (no-deprecated, no-misused-spread, no-mixed-enums, no-unnecessary-condition, use-unknown-in-catch-callback-variable, now removed here as duplicates), and 13 more are gained for free: no-confusing-void-expression, no-meaningless-void-operator, no-unnecessary-boolean-literal-compare, no-unnecessary-template-expression, no-unnecessary-type-arguments, no-unnecessary-type-conversion, no-unnecessary-type-parameters, no-useless-default-assignment, prefer-reduce-type-parameter, prefer-return-this-type, related-getter-setter-pairs, return-await (as 'error-handling-correctness-only', strict's own choice -- catches a genuinely lost rejection while still allowing the deliberate `return promise;` tail-call form), and turning off the core `no-return-await` that @typescript-eslint/return-await supersedes. Every one of these is the same "the type system already knows something the code doesn't act on" category this file already documents for no-unnecessary-condition below.
//
// Exported as a plain array value, consumed via `...exadev` inside `tseslint.config(...)` (a spread, not a single extends-array reference) -- this is the whole reason its type must specifically be an array type rather than the wider union below.
//
// Typed explicitly rather than left inferred: tsdown's declaration-file generation cannot otherwise name the inferred type without an explicit annotation, since it transitively references a type with no portable name at this call site. `NonNullable<TSESLint.FlatConfig.Plugin['configs']>[string]` (a single named config's value type) is `Config | ConfigArray` -- a union that is NOT guaranteed to be an array, because a plugin's own `configs` map can also hand back a single flat config object. This package's actual value is unconditionally an array, so annotating it with the full union directly was a real, confirmed bug: `...recommendedTypeChecked` failed to typecheck with TS2488 ("must have a Symbol.iterator method") wherever a consumer spread it, since TypeScript can't prove a value typed as that union is iterable. `Extract<ConfigValue, unknown[]>` narrows to the array-only member of the same union. Derived from @typescript-eslint/utils's own FlatConfig.Plugin type, matching src/plugin.ts's own `plugin` value type -- this file's own trailing config object embeds that same `plugin` under `plugins: { exadev: plugin }`, so the two types must agree; eslint's own ESLint.Plugin type cannot hold `plugin`'s ESLintUtils.RuleCreator-built rules (see src/plugin.ts's own comment on why), so it is not an option here either.
type ConfigValue = NonNullable<TSESLint.FlatConfig.Plugin['configs']>[string];
type ConfigArrayValue = Extract<ConfigValue, unknown[]>;

// A single brace-expansion glob rather than a flat array of near-duplicate strings -- confirmed against ESLint's own flat-config file matcher (minimatch) that brace expansion resolves correctly (src/recommended-type-checked.test.ts exercises this directly), so `{test,spec}` and the extension list each expand independently rather than needing every combination spelled out.
const TEST_FILE_PATTERNS = '**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';

const recommendedTypeChecked: ConfigArrayValue = [
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    plugins: { exadev: plugin },
    linterOptions: { noInlineConfig: true },
    rules: {
      // The recommended barrel policy is 'banned' (no index files at all). A published package whose src/index.ts is its package entry point overrides this to `{ mode: 'single' }` in its own eslint.config.ts -- one line, since flat-config later blocks override earlier rule settings.
      'exadev/barrel-policy': ['error', { mode: 'banned' }],
      'exadev/no-array-isarray-mutation': 'error',
      'exadev/no-enum-number-widening': 'error',
      'exadev/no-enum-reverse-lookup-widening': 'error',
      'exadev/no-map-instanceof-mutation': 'error',
      'exadev/no-mutable-union-array-param': 'error',
      'exadev/no-object-assign': 'error',
      'exadev/no-pointless-reassignment': 'error',
      'exadev/no-set-instanceof-mutation': 'error',
      'exadev/prefer-numeric-sort-compare': 'error',
      'exadev/prefer-readonly-array-param': 'error',
      'exadev/prefer-readonly-object-param': 'error',
      // strictTypeChecked's own default already bans @ts-ignore/@ts-nocheck outright and allows @ts-expect-error with a description; this raises @ts-expect-error to the same outright ban, since noInlineConfig above already removes eslint-disable as an escape hatch -- a partial options object here, so the untouched keys (ts-ignore/ts-nocheck/ts-check) keep the rule's own built-in defaults rather than needing to be restated (confirmed empirically: passing only `{ 'ts-expect-error': true }` still reports the existing @ts-ignore violation unchanged).
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': true }],
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      // The export-side mirror of consistent-type-imports below -- a type-only export written as a plain value export. Has a real autofix (meta.fixable: 'code').
      '@typescript-eslint/consistent-type-exports': 'error',
      // A type-only import written as a plain value import. This repo's own source already follows this convention by hand everywhere (e.g. `import type { TSESTree }`) -- this makes the existing habit mechanical. Has a real autofix (meta.fixable: 'code').
      '@typescript-eslint/consistent-type-imports': 'error',
      // Method-shorthand signatures (`foo(x: string): void`) are checked BIVARIANTLY under strictFunctionTypes -- unsound: an implementation accepting only a narrower parameter type is still accepted where the interface promises to accept the wider type. Property-style function types (`foo: (x: string) => void`) are checked contravariantly (sound). 'property' is this rule's own default; stated explicitly so a future default change can't silently loosen this. Autofix is typescript-eslint's own (this rule ships fixable: 'code').
      '@typescript-eslint/method-signature-style': ['error', 'property'],
      // `ignore: [-1, 0, 1, 2]` covers the handful of universally-idiomatic bare numbers (loop bounds, array-length-minus-one, binary toggles) a named constant wouldn't clarify; `ignoreArrayIndexes: true` since `array[0]`/`array[2]` isn't a "magic number" smell; `ignoreEnums: true` since an enum member's own numeric value isn't magic at its declaration; `ignoreReadonlyClassProperties: true` since a readonly class property IS already a named constant, matching this config's own named-constant carve-out; `ignoreDefaultValues: true` since a default parameter value is self-documenting at the call site. `detectObjects` is left at the rule's own default (`false`): numeric object-property VALUES in plain data/config objects are deliberately not flagged -- exhaustively naming every literal in a data structure would be absurd, so this is a deliberate choice, not a gap.
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1, 2],
          ignoreArrayIndexes: true,
          ignoreEnums: true,
          ignoreReadonlyClassProperties: true,
          ignoreDefaultValues: true,
        },
      ],
      // The `!` postfix operator is the exact same escape hatch consistent-type-assertions above already bans for `as` -- a manual override of the checker's own null/undefined analysis, with no way for a reader or a later refactor to tell "verified safe" from "assumed safe." Narrow explicitly instead (an `if`/early-return guard, a nullish-coalescing default, or a real assertion function).
      '@typescript-eslint/no-non-null-assertion': 'error',
      // A class field only ever assigned in the constructor that isn't marked readonly -- has a real automatic fixer (`meta.fixable: 'code'`), one of only a handful of rules in this batch that do (alongside method-signature-style above and the type-import/export/promise-async rules below).
      '@typescript-eslint/prefer-readonly': 'error',
      // A function that returns a Promise without being declared async hurts async stack traces and error-handling consistency. Has a real autofix (meta.fixable: 'code').
      '@typescript-eslint/promise-function-async': 'error',
      // `.sort()` with no compare function sorts lexicographically even on numbers -- `[10, 2, 1].sort()` silently becomes `[1, 10, 2]` -- a classic, easy-to-miss runtime bug.
      '@typescript-eslint/require-array-sort-compare': 'error',
      // Left at the rule's own bare defaults -- no options object -- deliberately, not left unconfigured: allowNullableObject/allowNumber/allowString stay true, so an unambiguous non-nullable truthy check (`if (someNonNullableString)`) stays allowed, while allowNullableString/Number/Boolean/Enum and allowAny stay false, so an ambiguous nullable check (`if (someNullableCount)` -- ambiguous between 0 and absent) gets banned. That nullable-vs-unambiguous distinction is exactly this config's existing "no implicit fallback, model absence explicitly" stance (see `no-non-null-assertion` above: narrow explicitly instead of assuming).
      '@typescript-eslint/strict-boolean-expressions': 'error',
      // Passing a value-returning function where a void-returning one is expected typechecks under TS's own void-return contravariance leniency (e.g. `arr.forEach(x => otherArray.push(x))` compiles even though `push` returns a number) -- verified directly against this rule (not assumed): tested on this very codebase (one hit, a legitimate false positive -- see vitest.setup.ts below) and against a synthetic `arr.forEach(x => otherArray.push(x))`, which it correctly flagged. Not yet part of any typescript-eslint preset (confirmed by inspecting the compiled config files, not the docs), but this config already hand-picks individual rules ahead of preset adoption elsewhere in this block, so "not yet in a preset" isn't this repo's bar for anything else and isn't here either.
      '@typescript-eslint/strict-void-return': 'error',
      // A switch over a union or enum missing a member, with no default to fall back on, silently does nothing for the missing case instead of erroring.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    // Test files get two narrow, test-specific relaxations of this package's OWN additions above -- never of anything inherited from recommendedTypeChecked/stylisticTypeChecked itself, which stay exactly as strict in tests as everywhere else. A compile-time-only `@ts-expect-error` proving a construct genuinely fails to type-check is a well-established, legitimate test pattern (TypeScript's own "unused '@ts-expect-error' directive" diagnostic already catches one that stops being needed, independent of this rule), so this reverts to the rule's own pre-ban default -- allowed with a description -- rather than turning the check off outright. @ts-ignore/@ts-nocheck have no equivalent legitimate test use (@ts-expect-error is strictly better for both), so those stay banned here too. A test fixture or mock commonly needs a type assertion to construct a partial/stub value the real type wouldn't accept; relaxed to the modern `as` form only -- the legacy `<Type>value` angle-bracket syntax (ambiguous with JSX, effectively unused in this ecosystem) stays banned even in tests.
    files: [TEST_FILE_PATTERNS],
    rules: {
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description' }],
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'as' }],
    },
  },
];

export default recommendedTypeChecked;
