import type { TSESLint } from '@typescript-eslint/utils';
import tseslint from 'typescript-eslint';
import plugin from './plugin';

// This package's own default export (re-exported by src/index.ts): typescript-eslint is a required peer dependency of @exadev/eslint-config as a whole, not an optional one behind a separate subpath -- a plain-JS consumer wanting only the base four rules imports the named `plugin` export instead (see src/index.ts), which never itself imports typescript-eslint, but importing ANYTHING from this package's root module now unconditionally resolves typescript-eslint, since ESM/CJS module evaluation runs a module's entire top-level import graph regardless of which specific export the caller reads. An earlier version of this package tried to avoid that cost for every consumer via a genuinely separate npm subpath (@exadev/eslint-config/recommended-type-checked) -- correct in isolation, but it meant two module specifiers for one package, which this package's own consumers found more awkward than the (small, TypeScript-only-consumer) cost of requiring typescript-eslint unconditionally.
//
// recommendedTypeChecked already subsumes plain `recommended` outright: every rule in tseslint.configs.recommended is also present in recommendedTypeChecked, confirmed by inspecting the actual rule maps, not assumed from the docs alone. This is a real bundling, not a rule reference that assumes the consumer already has typescript-eslint registered: recommendedTypeChecked's own base config registers the `@typescript-eslint` plugin and sets languageOptions.parser itself. That is exactly why a consumer adopting this config must remove its own `...tseslint.configs.recommended/recommendedTypeChecked/stylisticTypeChecked` spreads rather than keep them alongside this -- ESLint flat config rejects two different plugin object instances registered under the same namespace. What a consumer still supplies itself is languageOptions.parserOptions.project/projectService pointing at its own tsconfig(s); recommendedTypeChecked's base config never sets that, since it's genuinely project-specific.
//
// Exported as a plain array value, consumed via `...exadev` inside `tseslint.config(...)` (a spread, not a single extends-array reference) -- this is the whole reason its type must specifically be an array type rather than the wider union below.
//
// Typed explicitly rather than left inferred: tsdown's declaration-file generation cannot otherwise name the inferred type without an explicit annotation, since it transitively references a type with no portable name at this call site. `NonNullable<TSESLint.FlatConfig.Plugin['configs']>[string]` (a single named config's value type) is `Config | ConfigArray` -- a union that is NOT guaranteed to be an array, because a plugin's own `configs` map can also hand back a single flat config object. This package's actual value is unconditionally an array, so annotating it with the full union directly was a real, confirmed bug: `...recommendedTypeChecked` failed to typecheck with TS2488 ("must have a Symbol.iterator method") wherever a consumer spread it, since TypeScript can't prove a value typed as that union is iterable. `Extract<ConfigValue, unknown[]>` narrows to the array-only member of the same union. Derived from @typescript-eslint/utils's own FlatConfig.Plugin type, matching src/plugin.ts's own `plugin` value type -- this file's own trailing config object embeds that same `plugin` under `plugins: { exadev: plugin }`, so the two types must agree; eslint's own ESLint.Plugin type cannot hold `plugin`'s ESLintUtils.RuleCreator-built rules (see src/plugin.ts's own comment on why), so it is not an option here either.
type ConfigValue = NonNullable<TSESLint.FlatConfig.Plugin['configs']>[string];
type ConfigArrayValue = Extract<ConfigValue, unknown[]>;

// A single brace-expansion glob rather than a flat array of near-duplicate strings -- confirmed against ESLint's own flat-config file matcher (minimatch) that brace expansion resolves correctly (src/recommended-type-checked.test.ts exercises this directly), so `{test,spec}` and the extension list each expand independently rather than needing every combination spelled out.
const TEST_FILE_PATTERNS = '**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';

const recommendedTypeChecked: ConfigArrayValue = [
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    plugins: { exadev: plugin },
    linterOptions: { noInlineConfig: true },
    rules: {
      // The recommended barrel policy is 'banned' (no index files at all). A published package whose src/index.ts is its package entry point overrides this to `{ mode: 'single' }` in its own eslint.config.ts -- one line, since flat-config later blocks override earlier rule settings.
      'exadev/barrel-policy': ['error', { mode: 'banned' }],
      'exadev/no-enum-number-widening': 'error',
      'exadev/no-mutable-union-array-param': 'error',
      'exadev/no-object-assign': 'error',
      'exadev/no-pointless-reassignment': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      // recommendedTypeChecked's own default already bans @ts-ignore/@ts-nocheck outright and allows @ts-expect-error with a description; this raises @ts-expect-error to the same outright ban, since noInlineConfig above already removes eslint-disable as an escape hatch -- a partial options object here, so the untouched keys (ts-ignore/ts-nocheck/ts-check) keep the rule's own built-in defaults rather than needing to be restated (confirmed empirically: passing only `{ 'ts-expect-error': true }` still reports the existing @ts-ignore violation unchanged).
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': true }],
      // Method-shorthand signatures (`foo(x: string): void`) are checked BIVARIANTLY under strictFunctionTypes -- unsound: an implementation accepting only a narrower parameter type is still accepted where the interface promises to accept the wider type. Property-style function types (`foo: (x: string) => void`) are checked contravariantly (sound). 'property' is this rule's own default; stated explicitly so a future default change can't silently loosen this. Autofix is typescript-eslint's own (this rule ships fixable: 'code').
      '@typescript-eslint/method-signature-style': ['error', 'property'],
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
