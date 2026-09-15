import json from '@eslint/json';
import { Linter, RuleTester } from 'eslint';
import { describe, expect, test } from 'vitest';
import { compareSyncpackKey, computeOrderPermutation, isValidSortAzOrder, isValidTopLevelOrder } from './package-json-key-order';
import rule from './package-json-key-order';

describe('compareSyncpackKey', () => {
  // Every case here is copied verbatim from a REAL `syncpack@15.3.2 format` run against a scratch package.json (not derived from syncpack's own docs, which don't specify the collation this precisely) -- see this rule's own header comment for the reverse-engineering method. If syncpack's own algorithm ever changes, these are the cases to re-verify against a real run before touching the comparator.
  test('symbols sort before digits, which sort before letters, case-insensitively within letters', () => {
    const keys = ['1a', 'aa', '@a', '_a', '~a', '-a', '.a', '!a'];
    const sorted = [...keys].sort(compareSyncpackKey);
    expect(sorted).toStrictEqual(['!a', '-a', '.a', '@a', '_a', '~a', '1a', 'aa']);
  });

  test('digits compare lexically, not numerically -- "10-pkg" sorts before "2-pkg"', () => {
    expect(compareSyncpackKey('10-pkg', '2-pkg')).toBeLessThan(0);
  });

  test('a scoped package name sorts by its literal leading "@", before an unscoped name starting with a letter', () => {
    const keys = ['zod', 'Axios', 'axios', '@scope/pkg'];
    const sorted = [...keys].sort(compareSyncpackKey);
    expect(sorted).toStrictEqual(['@scope/pkg', 'Axios', 'axios', 'zod']);
  });

  test('letters compare case-insensitively', () => {
    const keys = ['zeta', 'alpha', 'Build'];
    const sorted = [...keys].sort(compareSyncpackKey);
    expect(sorted).toStrictEqual(['alpha', 'Build', 'zeta']);
  });
});

describe('isValidTopLevelOrder', () => {
  const sortFirst = ['name', 'description', 'version', 'author'];

  test('pinned keys must appear in exactly sortFirst order', () => {
    expect(isValidTopLevelOrder('name', 'description', sortFirst)).toBe(true);
    expect(isValidTopLevelOrder('version', 'author', sortFirst)).toBe(true);
    expect(isValidTopLevelOrder('description', 'name', sortFirst)).toBe(false);
  });

  test('any pinned key precedes any unpinned key', () => {
    expect(isValidTopLevelOrder('author', 'dependencies', sortFirst)).toBe(true);
    expect(isValidTopLevelOrder('dependencies', 'author', sortFirst)).toBe(false);
  });

  test('unpinned keys fall back to compareSyncpackKey', () => {
    expect(isValidTopLevelOrder('dependencies', 'devDependencies', sortFirst)).toBe(true);
    expect(isValidTopLevelOrder('main', 'extraField', sortFirst)).toBe(false);
  });
});

describe('computeOrderPermutation', () => {
  test('returns the identity permutation for an already-sorted list', () => {
    expect(computeOrderPermutation(['alpha', 'Build', 'zeta'], isValidSortAzOrder)).toStrictEqual([0, 1, 2]);
  });

  test('resolves a fully scrambled list to its target permutation in one computation', () => {
    // The regression this guards: an adjacent-swap-based fixer needs one bubble pass per out-of-place position to converge, which was confirmed directly to exceed `eslint --fix`'s own 10-pass cap for a realistically scrambled package.json. A real permutation, computed once, is what lets the whole container be rewritten in a single fix.
    const keys = ['zeta', 'alpha', 'Build'];
    const permutation = computeOrderPermutation(keys, isValidSortAzOrder);
    expect(permutation.map((index) => keys[index])).toStrictEqual(['alpha', 'Build', 'zeta']);
  });

  test('is stable: keys that compare equal keep their original relative order', () => {
    const keys = ['Axios', 'axios'];
    const permutation = computeOrderPermutation(keys, isValidSortAzOrder);
    expect(permutation).toStrictEqual([0, 1]);
  });
});

describe('isValidSortAzOrder', () => {
  test('no pinning -- plain compareSyncpackKey', () => {
    expect(isValidSortAzOrder('alpha', 'Build')).toBe(true);
    expect(isValidSortAzOrder('zeta', 'alpha')).toBe(false);
  });
});

RuleTester.describe = describe;
RuleTester.it = test;
RuleTester.itOnly = test.only;

const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

// This rule's fixer swaps one out-of-order adjacent pair per report, the same technique @eslint/json's own sort-keys rule uses (see that rule's source, quoted in full in this rule's own PR description) -- ESLint applies every non-overlapping fix from a single lint pass at once, so a single RuleTester case only ever fully converges when at most one swap is needed per position. A file needing several bubble passes to fully sort (the realistic case) is proven separately below via Linter#verifyAndFix, which is what `eslint --fix` actually calls and genuinely re-passes until stable.
ruleTester.run('package-json-key-order', rule, {
  valid: [
    {
      code: JSON.stringify({ name: 'x', version: '1.0.0', dependencies: { a: '1', b: '2' } }, null, 2),
    },
  ],
  invalid: [
    {
      code: JSON.stringify({ version: '1.0.0', name: 'x' }, null, 2),
      output: JSON.stringify({ name: 'x', version: '1.0.0' }, null, 2),
      errors: [{ messageId: 'outOfOrder' }],
    },
    {
      // A custom sortFirst overriding the default -- only "name" is pinned, so "author"/"version" fall back to plain alphabetical against each other ("author" < "version"), and this needs exactly one swap to fully converge.
      code: JSON.stringify({ author: 'someone', name: 'x', version: '1.0.0' }, null, 2),
      output: JSON.stringify({ name: 'x', author: 'someone', version: '1.0.0' }, null, 2),
      options: [{ sortFirst: ['name'] }],
      errors: [{ messageId: 'outOfOrder' }],
    },
    {
      code: JSON.stringify({ dependencies: { zod: '^1', axios: '^1' } }, null, 2),
      output: JSON.stringify({ dependencies: { axios: '^1', zod: '^1' } }, null, 2),
      errors: [{ messageId: 'outOfOrder' }],
    },
    {
      code: JSON.stringify({ keywords: ['zeta', 'alpha'] }, null, 2),
      output: JSON.stringify({ keywords: ['alpha', 'zeta'] }, null, 2),
      errors: [{ messageId: 'outOfOrder' }],
    },
  ],
});

describe('package-json-key-order (full convergence via eslint --fix, multi-pass)', () => {
  test('matches real `syncpack@15.3.2 format` output exactly, for the identical input', () => {
    // Both this input and the expected output are copied verbatim from a real local `syncpack format` run (see this rule's own header comment) -- not hand-constructed. Genuinely needs several bubble passes to fully converge (top-level members move many positions), which is exactly why this test drives it through Linter#verifyAndFix (what `eslint --fix` really calls) instead of RuleTester's own single-pass `output` assertion.
    const input = JSON.stringify(
      {
        scripts: { zeta: 'echo z', alpha: 'echo a', Build: 'echo B' },
        version: '1.0.0',
        devDependencies: { zod: '^3.0.0', Axios: '^1.0.0', axios: '^1.0.0', '@scope/pkg': '^1.0.0' },
        keywords: ['zeta', 'alpha'],
        name: 'probe',
        author: 'someone',
        dependencies: { lodash: '^4.0.0', express: '^4.0.0' },
        description: 'a probe package',
        extraField: 'keep me wherever I am',
        main: 'index.js',
      },
      null,
      2,
    );
    const expected = JSON.stringify(
      {
        name: 'probe',
        description: 'a probe package',
        version: '1.0.0',
        author: 'someone',
        dependencies: { express: '^4.0.0', lodash: '^4.0.0' },
        devDependencies: { '@scope/pkg': '^1.0.0', Axios: '^1.0.0', axios: '^1.0.0', zod: '^3.0.0' },
        extraField: 'keep me wherever I am',
        keywords: ['alpha', 'zeta'],
        main: 'index.js',
        scripts: { alpha: 'echo a', Build: 'echo B', zeta: 'echo z' },
      },
      null,
      2,
    );

    const linter = new Linter();
    const config = {
      language: 'json/json',
      plugins: { json, exadev: { rules: { 'package-json-key-order': rule } } },
      rules: { 'exadev/package-json-key-order': 'error' },
    } satisfies Linter.Config;

    const initialViolationCount = linter.verify(input, config).length;
    expect(initialViolationCount).toBeGreaterThan(0);

    // The regression this guards: an earlier adjacent-swap fixer (matching `@eslint/json`'s own `sort-keys`, one out-of-order pair swapped per report) needed 11 real internal fix passes to fully converge this exact fixture -- one more than `Linter#verifyAndFix`'s own hardcoded `MAX_AUTOFIX_PASSES` (10, not configurable), confirmed directly by instrumenting ESLint's own fix loop. A real `eslint --fix` run stopped one pass short, leaving a single stray violation in the file. The whole-container rewrite in this rule's own `create()` fixes any number of misplaced keys in one shot per container instead, so a single default `verifyAndFix` call is provably enough regardless of how scrambled the input is.
    const result = linter.verifyAndFix(input, config);
    expect(result.fixed).toBe(true);
    expect(result.messages).toStrictEqual([]);
    expect(result.output).toBe(expected);
  });
});
