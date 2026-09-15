import json from '@eslint/json';
import { Linter, RuleTester } from 'eslint';
import { describe, expect, test } from 'vitest';
import { at, compareSyncpackKey, computeOrderPermutation, getMemberKeyName, isValidSortAzOrder, isValidTopLevelOrder, objectParentOrThrow, rangeOf } from './package-json-key-order';
import rule from './package-json-key-order';

describe('at', () => {
  test('returns the element at a genuinely in-bounds index', () => {
    expect(at(['a', 'b', 'c'], 1)).toBe('b');
  });

  test('throws for an out-of-bounds index — the shape every real call site in this file is provably immune to, checked directly here since none of them can trigger it themselves', () => {
    const outOfBoundsIndex = 5;
    expect(() => at(['a'], outOfBoundsIndex)).toThrow(/Unreachable/);
    expect(() => at([], 0)).toThrow(/Unreachable/);
  });
});

describe('getMemberKeyName', () => {
  test('throws for an Identifier-named member — a shape only reachable via JSON5, which this rule never parses', () => {
    const fakeMember = { name: { type: 'Identifier', name: 'foo' } };
    expect(() => getMemberKeyName(fakeMember)).toThrow(/Unreachable/);
  });
});

describe('rangeOf', () => {
  test('throws for a node with no range — a shape no real @eslint/json parse (which always requests range tracking) produces', () => {
    expect(() => rangeOf({})).toThrow(/Unreachable/);
  });
});

describe('objectParentOrThrow', () => {
  // The "returns unchanged" path is already exercised end-to-end by every real JSON fixture below (each Object node's parent is genuinely 'Document' or 'Member'); only the throw path needs a dedicated direct test, since no real fixture can reach it.
  test('throws for an undefined parent — the Object visitor is never invoked for the traversal root, which is always the Document node', () => {
    expect(() => objectParentOrThrow(undefined)).toThrow(/Unreachable/);
  });
});

describe('compareSyncpackKey', () => {
  // Every case here is copied verbatim from a REAL `syncpack@15.3.2 format` run against a scratch package.json (not derived from syncpack's own docs, which don't specify the collation this precisely) — see this rule's own header comment for the reverse-engineering method. If syncpack's own algorithm ever changes, these are the cases to re-verify against a real run before touching the comparator.
  test('symbols sort before digits, which sort before letters, case-insensitively within letters', () => {
    const keys = ['1a', 'aa', '@a', '_a', '~a', '-a', '.a', '!a'];
    const sorted = [...keys].sort(compareSyncpackKey);
    expect(sorted).toStrictEqual(['!a', '-a', '.a', '@a', '_a', '~a', '1a', 'aa']);
  });

  test('digits compare lexically, not numerically — "10-pkg" sorts before "2-pkg"', () => {
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

  test('"0" is genuinely categorized as a digit, not a symbol — it sorts after a real symbol with a higher code point', () => {
    expect(compareSyncpackKey('0a', '@a')).toBeGreaterThan(0);
  });

  test('"9" is genuinely categorized as a digit, not a symbol — it sorts after a real symbol with a higher code point', () => {
    expect(compareSyncpackKey('9a', '@a')).toBeGreaterThan(0);
  });

  test('a strict prefix returns exactly the two keys own length difference, not merely a same-signed value', () => {
    expect(compareSyncpackKey('ab', 'abc')).toBe(-1);
    expect(compareSyncpackKey('abc', 'ab')).toBe(1);
  });

  test('a non-letter character is never case-folded, even one with a real multi-character toLowerCase() mapping', () => {
    // "İ" (LATIN CAPITAL LETTER I WITH DOT ABOVE) fails the categorize() letter regex outright, yet its own toLowerCase() produces a genuinely different, lower-code-point string ("i" + a combining dot) — proving the comparator leaves it untouched rather than folding it like a real letter.
    expect(compareSyncpackKey('İ', '©')).toBeGreaterThan(0);
    expect(compareSyncpackKey('©', 'İ')).toBeLessThan(0);
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

  test('a pinned key never precedes itself', () => {
    expect(isValidTopLevelOrder('name', 'name', sortFirst)).toBe(false);
  });

  test('two unpinned keys that compare equal under compareSyncpackKey are valid in either order', () => {
    expect(isValidTopLevelOrder('Axios', 'axios', sortFirst)).toBe(true);
    expect(isValidTopLevelOrder('axios', 'Axios', sortFirst)).toBe(true);
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
  test('no pinning — plain compareSyncpackKey', () => {
    expect(isValidSortAzOrder('alpha', 'Build')).toBe(true);
    expect(isValidSortAzOrder('zeta', 'alpha')).toBe(false);
  });

  test('two keys that compare equal under compareSyncpackKey are valid in either order', () => {
    expect(isValidSortAzOrder('Axios', 'axios')).toBe(true);
    expect(isValidSortAzOrder('axios', 'Axios')).toBe(true);
  });
});

describe('packageJsonKeyOrder rule meta', () => {
  test('carries the exact docs/schema/message content the rule is documented to have', () => {
    // packageJsonKeyOrder's own object literal always defines `meta` and `meta.messages` directly; the JSONRuleDefinition type only widens them to optional for rule shapes in general.
    const { meta } = rule;
    if (meta === undefined) {
      throw new Error('Unreachable: packageJsonKeyOrder always defines its own meta object literal.');
    }
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Require package.json keys to be ordered the same way `syncpack format` would order them.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/package-json-key-order.ts');
    expect(meta.schema).toStrictEqual([
      {
        type: 'object',
        properties: {
          sortFirst: { type: 'array', items: { type: 'string' } },
          sortAz: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ]);
    if (meta.messages === undefined) {
      throw new Error('Unreachable: packageJsonKeyOrder always defines its own meta.messages object literal.');
    }
    expect(meta.messages.outOfOrder).toBe(
      'This key order does not match the order "syncpack format" would produce: "{{curr}}" should come before "{{prev}}" here.',
    );
  });
});

RuleTester.describe = describe;
RuleTester.it = test;
RuleTester.itOnly = test.only;

const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

// This rule's fixer swaps one out-of-order adjacent pair per report, the same technique @eslint/json's own sort-keys rule uses (see that rule's source, quoted in full in this rule's own PR description) — ESLint applies every non-overlapping fix from a single lint pass at once, so a single RuleTester case only ever fully converges when at most one swap is needed per position. A file needing several bubble passes to fully sort (the realistic case) is proven separately below via Linter#verifyAndFix, which is what `eslint --fix` actually calls and genuinely re-passes until stable.
ruleTester.run('package-json-key-order', rule, {
  valid: [
    {
      code: JSON.stringify({ name: 'x', version: '1.0.0', dependencies: { a: '1', b: '2' } }, null, 2),
    },
    // A sortAz-listed array containing a non-string element is left entirely unchecked — this rule only ever reorders a pure list of string elements (matching real package.json shapes like "keywords"), never a mixed array.
    {
      code: JSON.stringify({ keywords: ['b', 1, 'a'] }, null, 2),
    },
    // An object nested under a NON-sortAz key is never checked at all (config's own member order is out of scope); an object nested inside an array (list's own element) has an Element parent, neither Document nor Member, so it is equally out of scope; a nested array inside another array (matrix's own element) has that same Element-parent shape; and the outer "matrix" array itself sits under a non-sortAz key, so it is left unchecked too.
    {
      code: JSON.stringify({ name: 'x', config: { b: 1, a: 2 }, list: [{ b: 1, a: 2 }], matrix: [[2, 1]] }, null, 2),
    },
    // A genuinely scrambled string array under a key that ISN'T in the default sortAz list must still be left entirely unchecked — unlike "matrix" above, these elements really are strings, so a rule that ignored sortAz membership entirely would report a violation here.
    {
      code: JSON.stringify({ name: 'x', notSortAz: ['zeta', 'alpha'] }, null, 2),
    },
    // A non-string element anywhere in the array — even one with no "value" property at all, like a JSON null — aborts the whole check with no report, matching the mixed-array case above.
    {
      code: JSON.stringify({ keywords: ['zeta', null, 'alpha'] }, null, 2),
    },
    // DEFAULT_SORT_FIRST's own literal contents, exercised with no options override: "author" is genuinely pinned fourth, so it sorts before an unpinned key even though "apple" would otherwise sort first alphabetically.
    {
      code: JSON.stringify({ name: 'x', version: '1.0.0', author: 'someone', apple: 1 }, null, 2),
    },
  ],
  invalid: [
    {
      code: JSON.stringify({ version: '1.0.0', name: 'x' }, null, 2),
      output: JSON.stringify({ name: 'x', version: '1.0.0' }, null, 2),
      errors: [{ messageId: 'outOfOrder' }],
    },
    {
      // A custom sortFirst overriding the default — only "name" is pinned, so "author"/"version" fall back to plain alphabetical against each other ("author" < "version"), and this needs exactly one swap to fully converge.
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
    // The violating pair is NOT the first one: "name" (pinned) correctly precedes "config", so the violation-finding loop must pass over that valid first pair before finding the real one ("config" sorting after "apple"). Asserting `data` here (not just the messageId) pins down that the loop genuinely walks forward to index 2 rather than stopping at — or wrongly reporting — the first pair.
    {
      code: JSON.stringify({ name: 'x', config: 1, apple: 2 }, null, 2),
      output: JSON.stringify({ name: 'x', apple: 2, config: 1 }, null, 2),
      options: [{ sortFirst: ['name'] }],
      errors: [{ messageId: 'outOfOrder', data: { curr: 'apple', prev: 'config' } }],
    },
    // Each of these exercises one specific literal entry of DEFAULT_SORT_AZ directly (no options override), since a Set built from a differently-spelled default array would silently stop checking that one field.
    {
      code: JSON.stringify({ bin: { zeta: './zeta.js', alpha: './alpha.js' } }, null, 2),
      output: JSON.stringify({ bin: { alpha: './alpha.js', zeta: './zeta.js' } }, null, 2),
      errors: [{ messageId: 'outOfOrder' }],
    },
    {
      code: JSON.stringify({ contributors: ['zeta', 'alpha'] }, null, 2),
      output: JSON.stringify({ contributors: ['alpha', 'zeta'] }, null, 2),
      errors: [{ messageId: 'outOfOrder' }],
    },
    {
      code: JSON.stringify({ peerDependencies: { zod: '^1', axios: '^1' } }, null, 2),
      output: JSON.stringify({ peerDependencies: { axios: '^1', zod: '^1' } }, null, 2),
      errors: [{ messageId: 'outOfOrder' }],
    },
    {
      code: JSON.stringify({ resolutions: { zod: '^1', axios: '^1' } }, null, 2),
      output: JSON.stringify({ resolutions: { axios: '^1', zod: '^1' } }, null, 2),
      errors: [{ messageId: 'outOfOrder' }],
    },
  ],
});

describe('package-json-key-order (comment-adjacent members are reported but never auto-fixed)', () => {
  const jsoncConfig = {
    language: 'json/jsonc',
    plugins: { json, exadev: { rules: { 'package-json-key-order': rule } } },
    rules: { 'exadev/package-json-key-order': 'error' },
  } satisfies Linter.Config;

  test('a line comment directly above an out-of-order member blocks the fix, but the violation is still reported', () => {
    const linter = new Linter();
    const input = '{\n  // pin this comment\n  "version": "1.0.0",\n  "name": "x"\n}';
    const result = linter.verifyAndFix(input, jsoncConfig);
    expect(result.fixed).toBe(false);
    expect(result.output).toBe(input);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.messageId).toBe('outOfOrder');
  });

  test('a block comment directly above an out-of-order member blocks the fix too, not just a line comment', () => {
    const linter = new Linter();
    const input = '{\n  /* pin this comment */\n  "version": "1.0.0",\n  "name": "x"\n}';
    const result = linter.verifyAndFix(input, jsoncConfig);
    expect(result.fixed).toBe(false);
    expect(result.output).toBe(input);
  });

  test('a comment sitting between a member\'s own value and its trailing comma blocks the fix — detected before the comma is ever reached, not after it', () => {
    const linter = new Linter();
    const input = '{\n  "version": "1.0.0" // pin\n  ,\n  "name": "x"\n}';
    const result = linter.verifyAndFix(input, jsoncConfig);
    expect(result.fixed).toBe(false);
    expect(result.output).toBe(input);
  });

  test('a comment sitting after a member\'s own trailing comma blocks the fix too — caught via the following member\'s own preceding-token check, since the comment is the nearest token before it either way', () => {
    const linter = new Linter();
    const input = '{\n  "version": "1.0.0",\n  // pin\n  "name": "x"\n}';
    const result = linter.verifyAndFix(input, jsoncConfig);
    expect(result.fixed).toBe(false);
    expect(result.output).toBe(input);
  });
});

describe('package-json-key-order (full convergence via eslint --fix, multi-pass)', () => {
  test('matches real `syncpack@15.3.2 format` output exactly, for the identical input', () => {
    // Both this input and the expected output are copied verbatim from a real local `syncpack format` run (see this rule's own header comment) — not hand-constructed. Genuinely needs several bubble passes to fully converge (top-level members move many positions), which is exactly why this test drives it through Linter#verifyAndFix (what `eslint --fix` really calls) instead of RuleTester's own single-pass `output` assertion.
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

    // The regression this guards: an earlier adjacent-swap fixer (matching `@eslint/json`'s own `sort-keys`, one out-of-order pair swapped per report) needed 11 real internal fix passes to fully converge this exact fixture — one more than `Linter#verifyAndFix`'s own hardcoded `MAX_AUTOFIX_PASSES` (10, not configurable), confirmed directly by instrumenting ESLint's own fix loop. A real `eslint --fix` run stopped one pass short, leaving a single stray violation in the file. The whole-container rewrite in this rule's own `create()` fixes any number of misplaced keys in one shot per container instead, so a single default `verifyAndFix` call is provably enough regardless of how scrambled the input is.
    const result = linter.verifyAndFix(input, config);
    expect(result.fixed).toBe(true);
    expect(result.messages).toStrictEqual([]);
    expect(result.output).toBe(expected);
  });
});
