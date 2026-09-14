import jsdoc from 'eslint-plugin-jsdoc';
import tsdoc from 'eslint-plugin-tsdoc';
import type { ConfigArrayValue } from './config-types';

// Neither jsdoc.configs['flat/recommended-tsdoc-error'] nor eslint-plugin-tsdoc's own rules carry a `files` key (confirmed directly against both packages) -- a doc-comment rule only makes sense against JS/TS source, but left unscoped it still gets matched against every other language a consumer lints in the same array (JSON, Markdown), which is at best a silent no-op and at worst a parser mismatch. Matches the identical fix and reasoning in recommended-type-checked.ts.
const JS_TS_FILE_PATTERNS = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';

// eslint-plugin-jsdoc's own `flat/recommended-tsdoc-error` (not the plain `flat/recommended-typescript-error`) is the right base for this package: it is the variant tuned to not fight a TSDoc-flavoured comment style (the `{@link Foo}` inline tag and `@remarks`/`@example` block tags this package's own global comment convention already asks for), where the plain typescript variant instead expects classic JSDoc phrasing. The `-error` suffix (over the bare `flat/recommended-tsdoc`) matches this file's own all-`error` severities elsewhere in the package -- nothing here is a `warn`, so a jsdoc violation should not be the one exception. `flat/recommended-tsdoc-error` is itself a single flat config object, not an array (confirmed directly), hence the object-literal merge below rather than a spread.
const jsdocConfig = jsdoc.configs['flat/recommended-tsdoc-error'];

// `flat/recommended-tsdoc-error` bundles four rule tiers at once: logical (an existing doc block's own internal consistency, e.g. a documented @param that doesn't exist), contents (validating the substance of an existing tag, e.g. an unresolvable @throws type), stylistic (formatting/alignment of an existing block), and requirements (whether a doc block exists AT ALL, and whether each of its tags is present). Every requirements-tier rule is turned off below: this package's own doc-comment convention already distinguishes a symbol with a real public contract (which gets a doc comment) from one that doesn't (a plain `//`, or nothing) -- see the exported-symbol guidance this package's consumers already follow. Forcing every function everywhere, including private helpers and test files, to carry a JSDoc block is a different, much larger policy this package isn't making by adding these two plugins, and eslint-plugin-jsdoc's own `--fix` for a missing block inserts an empty, contentless `/** */` stub (confirmed directly) -- exactly the kind of comment-for-its-own-sake this package's consumers are supposed to avoid. What stays on is validation of a doc comment that's already there: correct tag names, resolvable types, internally consistent @param/@returns, and (via eslint-plugin-tsdoc below) valid TSDoc syntax.
const REQUIREMENTS_TIER_RULES = [
  'jsdoc/require-example',
  'jsdoc/require-jsdoc',
  'jsdoc/require-next-type',
  'jsdoc/require-param',
  'jsdoc/require-param-description',
  'jsdoc/require-param-name',
  'jsdoc/require-param-type',
  'jsdoc/require-property',
  'jsdoc/require-property-description',
  'jsdoc/require-property-name',
  'jsdoc/require-property-type',
  'jsdoc/require-returns',
  'jsdoc/require-returns-description',
  'jsdoc/require-returns-type',
  'jsdoc/require-template',
  'jsdoc/require-throws-type',
  'jsdoc/require-yields',
  'jsdoc/require-yields-type',
] as const;

const jsdocAndTsdoc: ConfigArrayValue = [
  {
    files: [JS_TS_FILE_PATTERNS],
    ...jsdocConfig,
    rules: {
      ...jsdocConfig.rules,
      ...Object.fromEntries(REQUIREMENTS_TIER_RULES.map((rule) => [rule, 'off'])),
    },
  },
  {
    // eslint-plugin-tsdoc ships no `configs` export at all (confirmed: its only export is `{ rules: { syntax } }`), so the plugin registration and the rule's severity are both set by hand here rather than spread from a preset. `tsdoc/syntax` validates that a doc comment's tags and inline references actually parse as valid TSDoc -- a check eslint-plugin-jsdoc itself does not perform, since it validates JSDoc's own (looser) grammar, not the TSDoc spec a `{@link}`/`@remarks`-style comment is written against.
    files: [JS_TS_FILE_PATTERNS],
    plugins: { tsdoc },
    rules: {
      'tsdoc/syntax': 'error',
    },
  },
];

export default jsdocAndTsdoc;
