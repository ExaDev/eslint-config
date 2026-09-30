import type { TSESLint } from '@typescript-eslint/utils';

/**
 * Core ESLint robustness rules that need neither type information nor the typescript-eslint plugin, so both `plugin.configs.recommended` and the default export enable them with identical settings. `no-implicit-coercion` is deliberately absent: its best setting depends on whether `@typescript-eslint/strict-boolean-expressions` is also on, which only the default export can say.
 *
 * - `eqeqeq` is `always` with no `null` carve-out: `== null` hides which of `null` and `undefined` the code means.
 * - `no-param-reassign` with `props: true` covers assignment to a parameter's properties as well as the parameter itself; a parameter is the caller's value, not a local to rewrite.
 * - `no-await-in-loop` assumes iterations are independent. A loop that is sequential by design is exempted by a `files`-scoped override in the consumer's config (`noInlineConfig` rules out a disable comment), never by weakening the rule globally.
 * - `require-atomic-updates` catches a read-modify-write that spans an `await`, where another task can change the value in between.
 * - `default-case-last` keeps `default` from hiding the cases written after it.
 * - `no-return-assign` is `always`, so even a parenthesised assignment cannot be the returned value.
 * - `max-depth` is stated at the rule's own default of four nested blocks so a future change to that default cannot loosen it.
 */
export const UNTYPED_ROBUSTNESS_RULES: TSESLint.FlatConfig.Rules = {
  'default-case-last': 'error',
  eqeqeq: ['error', 'always'],
  'max-depth': ['error', { max: 4 }],
  'no-await-in-loop': 'error',
  'no-param-reassign': ['error', { props: true }],
  'no-return-assign': ['error', 'always'],
  'require-atomic-updates': 'error',
};
