import type { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import plugin from './plugin';

// A genuinely separate entry point (@exadev/eslint-config/recommended-type-checked), not a property on the base plugin's own configs -- deliberately. typescript-eslint is only needed by a consumer who wants this bundle; a plain-JS or non-typescript-eslint consumer using plugin.rules or configs.barrel from the main entry point should never have Node even attempt to resolve typescript-eslint. Bundling this into src/plugin.ts's own top-level imports (an earlier version of this file did exactly that) meant importing '@exadev/eslint-config' at all -- even just to read `rules` -- threw immediately in any project without typescript-eslint installed, since ESM/CJS module evaluation runs a module's top-level imports unconditionally regardless of which export the caller actually uses. A lazy getter (or a createRequire-based lazy load) would dodge that immediate throw but still needs typescript-eslint resolvable the moment a consumer's config touches `extends: ['exadev/recommended']` -- and ESLint's own extends resolution is synchronous, so a dynamic `import()` doesn't help either, it just hides the same requirement behind an unawaited promise. Splitting into its own module sidesteps the problem at the right layer: Node's own module resolution already only loads a module when something imports it, so this file simply never runs at all for a consumer who never imports this specific subpath.
//
// recommendedTypeChecked already subsumes plain `recommended` outright: every one of its 46 rules is a strict subset of recommendedTypeChecked's 73, confirmed by inspecting the actual rule maps, not assumed from the docs alone. This is a real bundling, not a rule reference that assumes the consumer already has typescript-eslint registered: recommendedTypeChecked's own base config registers the `@typescript-eslint` plugin and sets languageOptions.parser itself. That is exactly why a consumer adopting this config must remove its own `...tseslint.configs.recommended/recommendedTypeChecked/stylisticTypeChecked` spreads rather than keep them alongside this -- ESLint flat config rejects two different plugin object instances registered under the same namespace. What a consumer still supplies itself is languageOptions.parserOptions.project/projectService pointing at its own tsconfig(s); recommendedTypeChecked's base config never sets that, since it's genuinely project-specific.
//
// Exported as a plain array value, consumed via `extends: [exadevRecommendedTypeChecked]` (a direct config-object reference, not the string form `extends: ['exadev/recommended']`) -- ESLint's own docs describe both as equally valid ways to use a shareable config from a plugin.
//
// Typed explicitly rather than left inferred: tsdown's declaration-file generation cannot otherwise name the inferred type without an explicit annotation, since it transitively references a type from @eslint/core with no portable name at this call site. Derived from ESLint's own Plugin type (the same derivation plugin.ts uses for its own config values) rather than typescript-eslint's own narrower internal element type (CompatibleConfig) -- that type has no `plugins` field at all, since typescript-eslint's own preset arrays never need to self-register a foreign plugin the way the trailing object below does.
type ConfigValue = NonNullable<ESLint.Plugin['configs']>[string];

// A single brace-expansion glob rather than a flat array of near-duplicate strings -- confirmed against ESLint's own flat-config file matcher (minimatch) that brace expansion resolves correctly (src/recommended-type-checked.test.ts exercises this directly), so `{test,spec}` and the extension list each expand independently rather than needing every combination spelled out.
const TEST_FILE_PATTERNS = '**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';

const recommendedTypeChecked: ConfigValue = [
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
      // recommendedTypeChecked's own default already bans @ts-ignore/@ts-nocheck outright and allows @ts-expect-error with a description; this raises @ts-expect-error to the same outright ban, since noInlineConfig above already removes eslint-disable as an escape hatch -- a partial options object here, so the untouched keys (ts-ignore/ts-nocheck/ts-check) keep the rule's own built-in defaults rather than needing to be restated (confirmed empirically: passing only `{ 'ts-expect-error': true }` still reports the existing @ts-ignore violation unchanged).
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': true }],
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
