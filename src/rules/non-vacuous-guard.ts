import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

type MessageIds = 'missingLowerBound' | 'missingMustCatch' | 'missingMustNotCatch';

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

/**
 * What an assertion establishes for a guard: `lowerBound` says a count of discovered things is not zero, `catches` that some input the guard's pattern must flag is flagged, and `passes` that some input it must leave alone is left alone.
 */
export type GuardEvidence = 'lowerBound' | 'catches' | 'passes';

const ARRAY_FROM: ReadonlySet<string> = new Set(['from']);
const NEGATING_MODIFIERS: ReadonlySet<string> = new Set(['not']);
const PASSTHROUGH_MODIFIERS: ReadonlySet<string> = new Set(['resolves', 'rejects']);
const EXPECT_VARIANTS: ReadonlySet<string> = new Set(['soft', 'poll']);

// Callbacks of these array methods run once per element, so an assertion inside one never runs when the array is empty, which is the failure a guard exists to notice. `Array.from(items, callback)` maps in the same way and is handled beside them.
const ITERATION_METHODS: ReadonlySet<string> = new Set(['every', 'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'flatMap', 'forEach', 'map', 'reduce', 'reduceRight', 'some']);

// `it.each(table)(name, callback)` and its `describe`, `for` and tagged-template forms run the callback once per table row.
const TABLE_METHODS: ReadonlySet<string> = new Set(['each', 'for']);

// Matchers that state the outcome of evaluating something. They say nothing about a pattern when the subject is a plain value, so each needs a subject that is a call (`re.test(line)`, `findViolations(line)`); `toMatch` states the outcome of a pattern by its own name and needs no such subject.
const CATCH_MATCHERS: ReadonlySet<string> = new Set(['toBeDefined', 'toBeTruthy', 'toContain', 'toContainEqual']);
const PASS_MATCHERS: ReadonlySet<string> = new Set(['toBeFalsy', 'toBeNull', 'toBeUndefined']);
const EQUALITY_MATCHERS: ReadonlySet<string> = new Set(['toBe', 'toEqual', 'toStrictEqual']);

/**
 * One `expect(subject).<modifiers>.matcher(arguments)` chain, with `.not` folded into `negated`.
 */
export interface Assertion {
  readonly subject: TSESTree.CallExpressionArgument | undefined;
  readonly matcher: string;
  readonly negated: boolean;
  readonly matcherArguments: readonly TSESTree.CallExpressionArgument[];
}

function isExpectCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) return callee.name === 'expect';

  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'expect' &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    EXPECT_VARIANTS.has(callee.property.name)
  );
}

/**
 * Reads a matcher call as an assertion, or returns `undefined` when the call is not one: the matcher must hang off `expect(...)` through only `.not`, `.resolves` and `.rejects`. Exported for direct testing of the recogniser.
 */
export function readAssertion(call: TSESTree.CallExpression): Assertion | undefined {
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed || callee.property.type !== AST_NODE_TYPES.Identifier) return undefined;
  let negated = false;
  let target: TSESTree.Node = callee.object;
  while (target.type === AST_NODE_TYPES.MemberExpression && !target.computed && target.property.type === AST_NODE_TYPES.Identifier) {
    const modifier = target.property.name;
    if (NEGATING_MODIFIERS.has(modifier)) negated = !negated;
    else if (!PASSTHROUGH_MODIFIERS.has(modifier)) return undefined;
    target = target.object;
  }
  if (!isExpectCall(target)) return undefined;

  return { subject: target.arguments[0], matcher: callee.property.name, negated, matcherArguments: call.arguments };
}

function numberLiteral(node: TSESTree.CallExpressionArgument | undefined): number | undefined {
  if (node?.type === AST_NODE_TYPES.UnaryExpression && node.operator === '-') {
    const magnitude = numberLiteral(node.argument);

    return magnitude === undefined ? undefined : -magnitude;
  }

  return node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'number' ? node.value : undefined;
}

function isEmptyArray(node: TSESTree.CallExpressionArgument | undefined): boolean {
  return node?.type === AST_NODE_TYPES.ArrayExpression && node.elements.length === 0;
}

function booleanLiteral(node: TSESTree.CallExpressionArgument | undefined): boolean | undefined {
  return node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'boolean' ? node.value : undefined;
}

function isNothingLiteral(node: TSESTree.CallExpressionArgument | undefined): boolean {
  return (
    isEmptyArray(node) ||
    (node?.type === AST_NODE_TYPES.Literal && node.value === null) ||
    (node?.type === AST_NODE_TYPES.Identifier && node.name === 'undefined') ||
    booleanLiteral(node) === false
  );
}

function containsCall(node: TSESTree.Node | undefined): boolean {
  if (node === undefined) return false;
  if (node.type === AST_NODE_TYPES.CallExpression || node.type === AST_NODE_TYPES.NewExpression) return true;
  if (node.type === AST_NODE_TYPES.MemberExpression) return containsCall(node.object);
  if (node.type === AST_NODE_TYPES.ChainExpression || node.type === AST_NODE_TYPES.TSNonNullExpression || node.type === AST_NODE_TYPES.AwaitExpression) {
    return containsCall('expression' in node ? node.expression : node.argument);
  }

  return false;
}

/**
 * Whether the assertion states that a count of discovered things is not zero. A bound written as a name or expression rather than a number is accepted, since its value cannot be read from the syntax; a number that leaves zero possible (`toBeGreaterThanOrEqual(0)`) is not. Exported for direct testing.
 */
export function isLowerBound({ matcher, negated, matcherArguments }: Assertion): boolean {
  const [argument] = matcherArguments;
  const value = numberLiteral(argument);
  switch (matcher) {
    case 'toBeGreaterThan':
      return !negated && (value === undefined || value >= 0);
    case 'toBeGreaterThanOrEqual':
      return !negated && (value === undefined || value >= 1);
    case 'toHaveLength':
      return negated ? value === 0 : value === undefined || value >= 1;
    case 'toBe':
    case 'toEqual':
    case 'toStrictEqual':
      return negated && (value === 0 || isEmptyArray(argument));
    case 'toBeEmpty':
      return negated;
    default:
      return false;
  }
}

/**
 * The outcome an assertion states before `.not` is applied.
 */
function statedOutcome(subject: TSESTree.CallExpressionArgument | undefined, matcher: string, argument: TSESTree.CallExpressionArgument | undefined): 'catches' | 'passes' | undefined {
  if (matcher === 'toMatch') return 'catches';
  if (!containsCall(subject)) return undefined;
  if (CATCH_MATCHERS.has(matcher)) return 'catches';
  if (PASS_MATCHERS.has(matcher)) return 'passes';
  if (!EQUALITY_MATCHERS.has(matcher)) return undefined;
  if (isNothingLiteral(argument)) return 'passes';

  return booleanLiteral(argument) === true || argument?.type === AST_NODE_TYPES.ArrayExpression ? 'catches' : undefined;
}

/**
 * Whether the assertion states the outcome of evaluating a pattern (or a function built on one) against an input: that it found something (`catches`) or found nothing (`passes`). Recognised: `toMatch`, and, on a call subject, `toBe(true)`, `toBe(false)`, `toBeTruthy`, `toBeFalsy`, `toBeNull`, `toBeUndefined`, `toBeDefined`, `toContain`, `toEqual([])` and their `.not` forms. A bare `expect(files.length).toBe(0)` is not read as a check of the pattern. Exported for direct testing.
 */
export function patternOutcome({ subject, matcher, negated, matcherArguments }: Assertion): 'catches' | 'passes' | undefined {
  const outcome = statedOutcome(subject, matcher, matcherArguments[0]);
  if (outcome === undefined || !negated) return outcome;

  return outcome === 'catches' ? 'passes' : 'catches';
}

function isMemberNamed(node: TSESTree.Node, names: ReadonlySet<string>): boolean {
  return node.type === AST_NODE_TYPES.MemberExpression && !node.computed && node.property.type === AST_NODE_TYPES.Identifier && names.has(node.property.name);
}

function isIterationCallback(parent: TSESTree.CallExpression, child: TSESTree.Node): boolean {
  const { callee } = parent;
  const [, mapper] = parent.arguments;
  const isArrayFrom = callee.type === AST_NODE_TYPES.MemberExpression && callee.object.type === AST_NODE_TYPES.Identifier && callee.object.name === 'Array' && isMemberNamed(callee, ARRAY_FROM);

  return (isMemberNamed(callee, ITERATION_METHODS) && parent.arguments.some((argument) => argument === child)) || (isArrayFrom && mapper === child);
}

/**
 * Whether a table literal certainly has a row: an array literal with an element and no spread, so a table built from what was discovered (`it.each(files)`, `it.each(files.map(...))`) is not one.
 */
function isNonEmptyTable(table: TSESTree.CallExpressionArgument | undefined): boolean {
  return table?.type === AST_NODE_TYPES.ArrayExpression && table.elements.length > 0 && !table.elements.some((element) => element?.type === AST_NODE_TYPES.SpreadElement);
}

/**
 * Whether `child` is the callback of `it.each(table)(name, callback)`, `describe.for(table)(...)` or the tagged-template form, and the table may have no rows: then the callback, and every test it declares, never runs.
 */
function isTableCallback(parent: TSESTree.CallExpression, child: TSESTree.Node): boolean {
  const { callee } = parent;
  if (!parent.arguments.some((argument) => argument === child)) return false;
  if (callee.type === AST_NODE_TYPES.CallExpression) return isMemberNamed(callee.callee, TABLE_METHODS) && !isNonEmptyTable(callee.arguments[0]);

  return callee.type === AST_NODE_TYPES.TaggedTemplateExpression && isMemberNamed(callee.tag, TABLE_METHODS) && callee.quasi.expressions.length === 0;
}

/**
 * Whether `child`, a direct child of `parent`, may not run on an execution that reaches `parent`: a loop body, the branch of a condition, the right side of a short-circuit, a `switch` case, a `catch`, a callback the array methods and `Array.from` run once per element, or the callback of a `.each` table that may have no rows.
 */
function mayBeSkipped(parent: TSESTree.Node, child: TSESTree.Node): boolean {
  if (
    parent.type === AST_NODE_TYPES.ForStatement ||
    parent.type === AST_NODE_TYPES.ForInStatement ||
    parent.type === AST_NODE_TYPES.ForOfStatement ||
    parent.type === AST_NODE_TYPES.WhileStatement ||
    parent.type === AST_NODE_TYPES.DoWhileStatement
  ) {
    return child === parent.body;
  }
  if (parent.type === AST_NODE_TYPES.IfStatement || parent.type === AST_NODE_TYPES.ConditionalExpression) return child !== parent.test;
  if (parent.type === AST_NODE_TYPES.LogicalExpression) return child === parent.right;
  if (parent.type === AST_NODE_TYPES.SwitchCase || parent.type === AST_NODE_TYPES.CatchClause) return true;

  return parent.type === AST_NODE_TYPES.CallExpression && (isIterationCallback(parent, child) || isTableCallback(parent, child));
}

/**
 * Whether the node runs on every execution of the test that contains it. An assertion inside a loop, an iteration callback, a branch or a `catch` never runs when what it iterates or tests is empty, so it cannot show a guard discovered anything. A helper function is treated as running, since whether it is called is not visible here. Exported for direct testing.
 */
export function runsUnconditionally(node: TSESTree.Node): boolean {
  for (let current: TSESTree.Node = node; current.type !== AST_NODE_TYPES.Program; current = current.parent) {
    if (mayBeSkipped(current.parent, current)) return false;
  }

  return true;
}

/**
 * Requires a source-scanning guard test file to show that it can fail: an unconditional lower bound on what it discovered, an assertion that its pattern flags an input it must, and one that it leaves alone an input it must not. Without them a scan that finds no files, or a pattern that matches nothing, passes every assertion while checking nothing, and no skip, focus or assertion-count rule notices. The recognition is syntactic and deliberately narrow, so a guard states each of the three in a form the README lists; it does not prove the checked pattern is the one the scan uses. Unscoped by design: which files are guards is a per-repository decision, wired through the `testHygiene` option of `exadevConfig`.
 */
const nonVacuousGuard = createRule<[], MessageIds>({
  name: 'non-vacuous-guard',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a guard test to assert a non-zero lower bound on what it discovered, and to check its pattern against an input it must catch and one it must not.',
    },
    schema: [],
    messages: {
      missingLowerBound:
        'This guard never asserts a lower bound on what it discovered, so a scan that finds nothing passes. Assert a count greater than zero (`expect(files.length).toBeGreaterThan(0)`), outside any loop or callback over the results.',
      missingMustCatch:
        'This guard never checks that its pattern flags an input it must, so a pattern that matches nothing passes. Assert that a known violation is reported (`expect(pattern.test(violation)).toBe(true)`), outside any loop or callback.',
      missingMustNotCatch:
        'This guard never checks that its pattern leaves alone an input it must not flag, so a pattern that matches everything passes. Assert that a known clean input is not reported (`expect(pattern.test(clean)).toBe(false)`), outside any loop or callback.',
    },
  },
  defaultOptions: [],
  create(context) {
    const evidence = new Set<GuardEvidence>();

    return {
      CallExpression(node) {
        const assertion = readAssertion(node);
        if (assertion === undefined || !runsUnconditionally(node)) return;
        if (isLowerBound(assertion)) evidence.add('lowerBound');
        const outcome = patternOutcome(assertion);
        if (outcome !== undefined) evidence.add(outcome);
      },
      'Program:exit'(node) {
        if (!evidence.has('lowerBound')) context.report({ node, messageId: 'missingLowerBound' });
        if (!evidence.has('catches')) context.report({ node, messageId: 'missingMustCatch' });
        if (!evidence.has('passes')) context.report({ node, messageId: 'missingMustNotCatch' });
      },
    };
  },
});

export default nonVacuousGuard;
