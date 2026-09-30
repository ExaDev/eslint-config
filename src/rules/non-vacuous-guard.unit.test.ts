import { RuleTester } from '@typescript-eslint/rule-tester';
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule, { isLowerBound, patternOutcome, readAssertion, runsUnconditionally, type Assertion } from './non-vacuous-guard';

function isProgram(node: unknown): node is TSESTree.Program {
  return typeof node === 'object' && node !== null && 'type' in node && node.type === AST_NODE_TYPES.Program;
}

function parseProgram(code: string): TSESTree.Program {
  const { ast } = tseslint.parser.parseForESLint(code);
  if (!isProgram(ast)) throw new Error('Unreachable: the TypeScript parser always returns a Program.');

  return ast;
}

function parseExpressionStatement(code: string): TSESTree.CallExpression {
  const [statement] = parseProgram(code).body;
  if (statement?.type !== AST_NODE_TYPES.ExpressionStatement || statement.expression.type !== AST_NODE_TYPES.CallExpression) {
    throw new Error('Unreachable: every snippet is one call expression statement.');
  }

  return statement.expression;
}

function assertionOf(code: string): Assertion {
  const assertion = readAssertion(parseExpressionStatement(code));
  if (assertion === undefined) throw new Error(`Unreachable: ${code} is an assertion.`);

  return assertion;
}

describe('non-vacuous-guard metadata', () => {
  it('names its docs page after the rule file', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/non-vacuous-guard.ts');
  });
});

describe('readAssertion', () => {
  it('reads the subject, matcher and arguments of an expect chain', () => {
    const assertion = assertionOf('expect(files.length).toBeGreaterThan(0);');
    expect(assertion.matcher).toBe('toBeGreaterThan');
    expect(assertion.negated).toBe(false);
    expect(assertion.subject?.type).toBe(AST_NODE_TYPES.MemberExpression);
    expect(assertion.matcherArguments).toHaveLength(1);
  });

  it('folds .not into the negation, and passes through .resolves and .rejects', () => {
    expect(assertionOf('expect(x).not.toBe(1);').negated).toBe(true);
    expect(assertionOf('expect(x).resolves.not.toBe(1);').negated).toBe(true);
    expect(assertionOf('expect(x).not.resolves.not.toBe(1);').negated).toBe(false);
    expect(assertionOf('expect(x).rejects.toBe(1);').negated).toBe(false);
  });

  it('reads expect.soft and expect.poll', () => {
    expect(assertionOf('expect.soft(x).toBe(1);').matcher).toBe('toBe');
    expect(assertionOf('expect.poll(x).toBe(1);').matcher).toBe('toBe');
  });

  it('reads nothing that is not a matcher called on expect(...)', () => {
    for (const code of ['foo(x);', 'foo.bar(x);', 'expect(x);', 'other(x).toBe(1);', 'expect.other(x).toBe(1);', 'expect(x).unknown.toBe(1);', 'expect(x)["toBe"](1);', 'a.b.c();', 'expect(x).not[0]();']) {
      expect(readAssertion(parseExpressionStatement(code)), code).toBeUndefined();
    }
  });

  it('reads an expect() with no subject', () => {
    expect(assertionOf('expect().toBeUndefined();').subject).toBeUndefined();
  });
});

describe('isLowerBound', () => {
  const bound = (code: string) => isLowerBound(assertionOf(code));

  it('accepts a count that cannot be zero', () => {
    expect(bound('expect(n).toBeGreaterThan(0);')).toBe(true);
    expect(bound('expect(n).toBeGreaterThan(3);')).toBe(true);
    expect(bound('expect(n).toBeGreaterThanOrEqual(1);')).toBe(true);
    expect(bound('expect(list).toHaveLength(2);')).toBe(true);
    expect(bound('expect(list).not.toHaveLength(0);')).toBe(true);
    expect(bound('expect(n).not.toBe(0);')).toBe(true);
    expect(bound('expect(list).not.toEqual([]);')).toBe(true);
    expect(bound('expect(list).not.toStrictEqual([]);')).toBe(true);
    expect(bound('expect(list).not.toBeEmpty();')).toBe(true);
  });

  it('accepts a bound written as a name, since its value cannot be read', () => {
    expect(bound('expect(n).toBeGreaterThan(MINIMUM);')).toBe(true);
    expect(bound('expect(n).toBeGreaterThanOrEqual(MINIMUM);')).toBe(true);
    expect(bound('expect(list).toHaveLength(EXPECTED);')).toBe(true);
  });

  it('rejects a bound that leaves zero possible', () => {
    expect(bound('expect(n).toBeGreaterThanOrEqual(0);')).toBe(false);
    expect(bound('expect(n).toBeGreaterThan(-1);')).toBe(false);
    expect(bound('expect(list).toHaveLength(0);')).toBe(false);
    expect(bound('expect(n).toBe(0);')).toBe(false);
    expect(bound('expect(list).toEqual([]);')).toBe(false);
    expect(bound('expect(list).not.toHaveLength(3);')).toBe(false);
    expect(bound('expect(n).not.toBeGreaterThan(0);')).toBe(false);
    expect(bound('expect(n).not.toBeGreaterThanOrEqual(1);')).toBe(false);
    expect(bound('expect(n).not.toBe(1);')).toBe(false);
    expect(bound('expect(list).toBeEmpty();')).toBe(false);
    expect(bound('expect(x).toBeTruthy();')).toBe(false);
  });
});

describe('patternOutcome', () => {
  const outcome = (code: string) => patternOutcome(assertionOf(code));

  it('reads toMatch as the pattern finding something, and its negation as finding nothing', () => {
    expect(outcome("expect('console.log(1)').toMatch(pattern);")).toBe('catches');
    expect(outcome("expect('logger.info(1)').not.toMatch(pattern);")).toBe('passes');
    expect(outcome('expect(text).toMatch(pattern);')).toBe('catches');
  });

  it('reads a boolean or emptiness result of a call', () => {
    expect(outcome("expect(pattern.test('x')).toBe(true);")).toBe('catches');
    expect(outcome("expect(pattern.test('x')).toBe(false);")).toBe('passes');
    expect(outcome("expect(pattern.test('x')).toStrictEqual(false);")).toBe('passes');
    expect(outcome("expect(scan('x')).toEqual([]);")).toBe('passes');
    expect(outcome("expect(scan('x')).toEqual(['a']);")).toBe('catches');
    expect(outcome("expect(scan('x')).toBe(null);")).toBe('passes');
    expect(outcome("expect(scan('x')).toBe(undefined);")).toBe('passes');
    expect(outcome("expect(scan('x')).toBeTruthy();")).toBe('catches');
    expect(outcome("expect(scan('x')).toBeFalsy();")).toBe('passes');
    expect(outcome("expect(scan('x')).toBeDefined();")).toBe('catches');
    expect(outcome("expect(scan('x')).toBeUndefined();")).toBe('passes');
    expect(outcome("expect(scan('x')).toBeNull();")).toBe('passes');
    expect(outcome("expect(scan('x')).toContain('a');")).toBe('catches');
    expect(outcome("expect(scan('x')).toContainEqual('a');")).toBe('catches');
  });

  it('inverts the outcome under .not', () => {
    expect(outcome("expect(pattern.test('x')).not.toBe(true);")).toBe('passes');
    expect(outcome("expect(pattern.test('x')).not.toBe(false);")).toBe('catches');
    expect(outcome("expect(scan('x')).not.toBeNull();")).toBe('catches');
    expect(outcome("expect(scan('x')).not.toEqual([]);")).toBe('catches');
  });

  it('looks through a member access, an optional chain, a non-null assertion and await to the call', () => {
    expect(outcome("expect(scan('x').length).toBeTruthy();")).toBe('catches');
    expect(outcome("expect(scan?.('x')).toBeTruthy();")).toBe('catches');
    expect(outcome("expect(scan('x')!).toBeTruthy();")).toBe('catches');
    expect(outcome("expect(await scan('x')).toBeTruthy();")).toBe('catches');
    expect(outcome("expect(new RegExp('a').exec('x')).toBeTruthy();")).toBe('catches');
  });

  it('reads nothing from a plain value, which no pattern produced', () => {
    expect(outcome('expect(files.length).toBe(0);')).toBeUndefined();
    expect(outcome('expect(found).toBe(true);')).toBeUndefined();
    expect(outcome('expect(found).toBeTruthy();')).toBeUndefined();
    expect(outcome('expect(found).toBeNull();')).toBeUndefined();
    expect(outcome('expect(found).toEqual([]);')).toBeUndefined();
    expect(outcome('expect(await found).toBeTruthy();')).toBeUndefined();
    expect(outcome('expect().toBeTruthy();')).toBeUndefined();
  });

  it('reads nothing from an outcome it cannot classify', () => {
    expect(outcome("expect(scan('x')).toBe(other);")).toBeUndefined();
    expect(outcome("expect(scan('x')).toBe(3);")).toBeUndefined();
    expect(outcome("expect(scan('x')).toHaveLength(1);")).toBeUndefined();
    expect(outcome("expect(scan('x')).toBeGreaterThan(0);")).toBeUndefined();
  });
});

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === 'object' && value !== null && 'type' in value;
}

describe('runsUnconditionally', () => {
  function firstAssertion(code: string): TSESTree.CallExpression {
    const ast = parseProgram(code);
    const found: TSESTree.CallExpression[] = [];
    // The parser does not set parent pointers; ESLint does while it traverses. This walk sets them the same way, so runsUnconditionally sees what it sees in a real run.
    const visit = (node: TSESTree.Node): void => {
      if (node.type === AST_NODE_TYPES.CallExpression && readAssertion(node) !== undefined) found.push(node);
      for (const [key, value] of Object.entries(node)) {
        if (key === 'parent') continue;
        for (const child of Array.isArray(value) ? value : [value]) {
          if (isNode(child)) {
            child.parent = node;
            visit(child);
          }
        }
      }
    };
    visit(ast);
    const [first] = found;
    if (first === undefined) throw new Error('Unreachable: every snippet holds an assertion.');

    return first;
  }

  const runs = (code: string) => runsUnconditionally(firstAssertion(code));

  it('is true for a straight-line assertion, in a test body or a helper', () => {
    expect(runs("it('a', () => { expect(n).toBe(1); });")).toBe(true);
    expect(runs("it('a', () => { const check = (x) => { expect(x).toBe(1); }; check(1); });")).toBe(true);
    expect(runs("it.each([1])('a', (n) => { expect(n).toBe(1); });")).toBe(true);
    expect(runs("it('a', () => { for (const x of [expect(n).toBe(1)]) {} });")).toBe(true);
  });

  it('is false inside a loop or an iteration callback', () => {
    expect(runs("it('a', () => { for (const f of files) { expect(f).toBe(1); } });")).toBe(false);
    expect(runs("it('a', () => { for (const k in files) { expect(k).toBe(1); } });")).toBe(false);
    expect(runs("it('a', () => { for (let i = 0; i < n; i++) { expect(i).toBe(1); } });")).toBe(false);
    expect(runs("it('a', () => { while (more()) { expect(1).toBe(1); } });")).toBe(false);
    expect(runs("it('a', () => { do { expect(1).toBe(1); } while (more()); });")).toBe(false);
    expect(runs("it('a', () => { files.forEach((f) => { expect(f).toBe(1); }); });")).toBe(false);
    expect(runs("it('a', () => { files.map((f) => expect(f).toBe(1)); });")).toBe(false);
    expect(runs("it('a', () => { files.filter((f) => expect(f).toBe(1)); });")).toBe(false);
    expect(runs("it('a', () => { files.reduce((a, f) => expect(f).toBe(1), 0); });")).toBe(false);
  });

  it('is false inside a branch, a short-circuit right side, a switch case or a catch', () => {
    expect(runs("it('a', () => { if (c) { expect(1).toBe(1); } });")).toBe(false);
    expect(runs("it('a', () => { if (c) {} else { expect(1).toBe(1); } });")).toBe(false);
    expect(runs("it('a', () => { const x = c ? expect(1).toBe(1) : 0; });")).toBe(false);
    expect(runs("it('a', () => { c && expect(1).toBe(1); });")).toBe(false);
    expect(runs("it('a', () => { switch (c) { case 1: expect(1).toBe(1); } });")).toBe(false);
    expect(runs("it('a', () => { try { run(); } catch { expect(1).toBe(1); } });")).toBe(false);
  });

  it('is true for the test of a branch or the left side of a short-circuit, which always evaluate', () => {
    expect(runs("it('a', () => { if (expect(1).toBe(1)) {} });")).toBe(true);
    expect(runs("it('a', () => { const x = expect(1).toBe(1) ? 1 : 0; });")).toBe(true);
    expect(runs("it('a', () => { expect(1).toBe(1) && c; });")).toBe(true);
  });

  it('is true inside a try block, and inside a callback of a method that is not an iteration', () => {
    expect(runs("it('a', () => { try { expect(1).toBe(1); } catch {} });")).toBe(true);
    expect(runs("it('a', () => { run(() => { expect(1).toBe(1); }); });")).toBe(true);
  });
});

// The rule reads syntax only, so the plain parser is enough.
const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

const lowerBound = 'expect(files.length).toBeGreaterThan(0);';
const catches = "expect(PATTERN.test('console.log(1)')).toBe(true);";
const passes = "expect(PATTERN.test('logger.info(1)')).toBe(false);";

ruleTester.run('non-vacuous-guard', rule, {
  valid: [
    // A guard that shows all three.
    `import { expect, it } from 'vitest';\nit('scans', () => { const files = find(); ${lowerBound} for (const f of files) expect(read(f)).not.toMatch(PATTERN); });\nit('pattern', () => { ${catches} ${passes} });`,
    // The three may sit in one test.
    `it('scans', () => { ${lowerBound} ${catches} ${passes} });`,
    // Through toMatch on a fixed input.
    `it('a', () => { ${lowerBound} expect('console.log(1)').toMatch(PATTERN); expect('logger.info(1)').not.toMatch(PATTERN); });`,
    // An exact count is a lower bound too.
    `it('a', () => { expect(find()).toHaveLength(4); ${catches} ${passes} });`,
    // A named minimum is accepted.
    `it('a', () => { expect(files.length).toBeGreaterThanOrEqual(MINIMUM_FILES); ${catches} ${passes} });`,
    // A shared helper holds the assertions.
    `const check = (line, expected) => { expect(PATTERN.test(line)).toBe(expected); expect(find()).not.toHaveLength(0); };\nit('a', () => { check('x', true); expect(PATTERN.test('y')).toBe(true); expect(PATTERN.test('z')).toBe(false); });`,
  ],
  invalid: [
    { code: 'export const x = 1;', errors: [{ messageId: 'missingLowerBound' }, { messageId: 'missingMustCatch' }, { messageId: 'missingMustNotCatch' }] },
    { code: `it('a', () => { ${catches} ${passes} });`, errors: [{ messageId: 'missingLowerBound' }] },
    { code: `it('a', () => { ${lowerBound} ${passes} });`, errors: [{ messageId: 'missingMustCatch' }] },
    { code: `it('a', () => { ${lowerBound} ${catches} });`, errors: [{ messageId: 'missingMustNotCatch' }] },
    // A bound inside a loop over the results never runs when there are none.
    { code: `it('a', () => { for (const f of find()) { expect(f.length).toBeGreaterThan(0); } ${catches} ${passes} });`, errors: [{ messageId: 'missingLowerBound' }] },
    // A negative scan per file is not a check of the pattern on a fixed input.
    { code: `it('a', () => { ${lowerBound} ${catches} for (const f of find()) expect(read(f)).not.toMatch(PATTERN); });`, errors: [{ messageId: 'missingMustNotCatch' }] },
    { code: `it('a', () => { ${lowerBound} find().forEach((f) => { ${catches} ${passes} }); });`, errors: [{ messageId: 'missingMustCatch' }, { messageId: 'missingMustNotCatch' }] },
    // A bound that leaves zero possible does not count.
    { code: `it('a', () => { expect(files.length).toBeGreaterThanOrEqual(0); ${catches} ${passes} });`, errors: [{ messageId: 'missingLowerBound' }] },
    // Checking a plain value is not checking the pattern.
    { code: `it('a', () => { ${lowerBound} expect(found).toBe(true); expect(missed).toBe(false); });`, errors: [{ messageId: 'missingMustCatch' }, { messageId: 'missingMustNotCatch' }] },
  ],
});
