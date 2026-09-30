import { AST_NODE_TYPES, ESLintUtils, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
import { isRecord } from '../is-record';
import { assertOnlyKeys } from './file-entry';

const OPTION_NAME = 'injected-test-hygiene';

/**
 * The options of `exadev/injected-test-hygiene`.
 */
export interface InjectedTestHygieneOptions {
  // Callee names that count as an assertion inside a test body, matched against the callee as written (`expect`, `assert.equal`). `*` matches any run of characters (`check*`). Defaults to `expect` and `assert`.
  readonly assertFunctionNames?: readonly string[];
  // Whether a skipped test or suite (`.skip`) is reported. On unless false.
  readonly reportDisabled?: boolean;
}

/**
 * The rule's option schema.
 */
export const injectedTestHygieneSchema: JSONSchema4 = {
  type: 'object',
  properties: {
    assertFunctionNames: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, uniqueItems: true },
    reportDisabled: { type: 'boolean' },
  },
  additionalProperties: false,
};

/**
 * The callee names counted as assertions when `assertFunctionNames` is not given.
 */
export const DEFAULT_ASSERT_NAMES: readonly string[] = ['expect', 'assert'];

interface CompiledOptions {
  readonly names: readonly string[];
  readonly assertions: readonly RegExp[];
  readonly reportDisabled: boolean;
}

/**
 * A pattern matches a callee that equals it, or is a member of it (`assert` matches `assert.equal`); `*` matches any run of characters.
 */
function wildcardToRegExp(pattern: string): RegExp {
  const body = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, '\\$&')).join('.*');

  return new RegExp(`^(?:${body})(?:\\..*)?$`, 'u');
}

/**
 * Validates the options and compiles the assertion names. Throws naming the rule for anything the schema lets through: options that are not an object, an unknown key, or an `assertFunctionNames` or `reportDisabled` of the wrong type.
 */
export function readInjectedTestHygieneOptions(value: unknown): CompiledOptions {
  const prefix = `@exadev/eslint-config: "${OPTION_NAME}"`;
  if (!isRecord(value)) throw new Error(`${prefix} must be an object.`);
  assertOnlyKeys(value, ['assertFunctionNames', 'reportDisabled'], OPTION_NAME);
  const { assertFunctionNames, reportDisabled } = value;
  if (reportDisabled !== undefined && typeof reportDisabled !== 'boolean') throw new Error(`${prefix} needs "reportDisabled" to be a boolean when given.`);
  if (assertFunctionNames !== undefined && (!Array.isArray(assertFunctionNames) || assertFunctionNames.length === 0 || !assertFunctionNames.every((name): name is string => typeof name === 'string' && name.length > 0))) {
    throw new Error(`${prefix} needs "assertFunctionNames" to be a non-empty array of non-empty strings when given.`);
  }
  const names = assertFunctionNames ?? DEFAULT_ASSERT_NAMES;

  return { names, assertions: names.map(wildcardToRegExp), reportDisabled: reportDisabled ?? true };
}

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

type MessageIds = 'focused' | 'disabled' | 'noAssertion';

type FunctionNode = TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration | TSESTree.FunctionExpression;

/**
 * Whether an injected function declares a test (`it`) or a suite (`describe`).
 */
type Api = 'describe' | 'it';

// The names a kit receives its test API under.
const API_KINDS: ReadonlyMap<string, Api> = new Map([
  ['describe', 'describe'],
  ['suite', 'describe'],
  ['it', 'it'],
  ['test', 'it'],
]);

interface Chain {
  readonly root: TSESTree.Identifier;
  readonly members: readonly string[];
}

/**
 * The identifier a callee starts from and the property names it goes through: `it.skip` is `it` and `['skip']`, `it.each(table)` is `it` and `['each']`, `kit.it.only` is `kit` and `['it', 'only']`. `undefined` for a callee that starts from anything else, or reads a computed property.
 */
function chainOf(callee: TSESTree.Node): Chain | undefined {
  const members: string[] = [];
  let current: TSESTree.Node = callee;
  for (;;) {
    if (current.type === AST_NODE_TYPES.CallExpression) current = current.callee;
    else if (current.type === AST_NODE_TYPES.TaggedTemplateExpression) current = current.tag;
    else if (current.type === AST_NODE_TYPES.MemberExpression && !current.computed && current.property.type === AST_NODE_TYPES.Identifier) {
      members.unshift(current.property.name);
      current = current.object;
    } else break;
  }

  return current.type === AST_NODE_TYPES.Identifier ? { root: current, members } : undefined;
}

/**
 * The name a callee is written under, for matching against the assertion names: an identifier (`expect`) or a chain of identifiers (`assert.equal`). `undefined` for any other callee.
 */
function calleeName(callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) return callee.name;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed || callee.property.type !== AST_NODE_TYPES.Identifier) return undefined;
  const object = calleeName(callee.object);

  return object === undefined ? undefined : `${object}.${callee.property.name}`;
}

function isFunction(node: TSESTree.Node): node is FunctionNode {
  return node.type === AST_NODE_TYPES.ArrowFunctionExpression || node.type === AST_NODE_TYPES.FunctionDeclaration || node.type === AST_NODE_TYPES.FunctionExpression;
}

/**
 * The first argument of the call that is a function: the body of a test.
 */
function functionArgument(call: TSESTree.CallExpression): FunctionNode | undefined {
  for (const argument of call.arguments) {
    if (isFunction(argument)) return argument;
  }

  return undefined;
}

/**
 * The key a function's destructured parameter binds `local` from: `{ it }` and `{ it: run }` both read the parameter's `it`. `undefined` when `local` is not bound by a destructured parameter.
 */
function destructuredKey(fn: FunctionNode, local: string): string | undefined {
  for (const parameter of fn.params) {
    const pattern = parameter.type === AST_NODE_TYPES.AssignmentPattern ? parameter.left : parameter;
    if (pattern.type !== AST_NODE_TYPES.ObjectPattern) continue;
    for (const property of pattern.properties) {
      if (property.type !== AST_NODE_TYPES.Property || property.computed || property.key.type !== AST_NODE_TYPES.Identifier) continue;
      const value = property.value.type === AST_NODE_TYPES.AssignmentPattern ? property.value.left : property.value;
      if (value.type === AST_NODE_TYPES.Identifier && value.name === local) return property.key.name;
    }
  }

  return undefined;
}

/**
 * Whether the call is itself the callee of another call or a tagged template (`it.each(table)` in `it.each(table)('name', body)`), which the outer call already covers.
 */
function isCalleeOfCall(node: TSESTree.CallExpression): boolean {
  const { parent } = node;

  return (parent.type === AST_NODE_TYPES.CallExpression && parent.callee === node) || (parent.type === AST_NODE_TYPES.TaggedTemplateExpression && parent.tag === node);
}

/**
 * Requires the test functions a conformance kit receives as parameters (`runConformance({ describe, it })`, or `run(t)` calling `t.it(...)`) to meet the hygiene `@vitest/eslint-plugin` asks of imported ones: no `.only`, no `.skip`, and an assertion in every test body. That plugin resolves a parameter named like a test function as a local binding and skips it, so its `expect-expect`, `no-disabled-tests` and `no-focused-tests` never fire inside such a kit. A test function is recognised as a parameter of the enclosing function named `describe`, `suite`, `it` or `test` (directly, or destructured under its own or a renamed local name), or as the `describe`, `suite`, `it` or `test` property of any parameter. The check is syntactic: a helper called from a test body counts as an assertion only when its name is listed in `assertFunctionNames`.
 */
const injectedTestHygiene = createRule<[InjectedTestHygieneOptions], MessageIds>({
  name: OPTION_NAME,
  meta: {
    type: 'problem',
    docs: {
      description: 'Require the test functions a kit receives as parameters to be free of .only and .skip and to assert, since @vitest/eslint-plugin cannot see them.',
    },
    schema: [injectedTestHygieneSchema],
    messages: {
      focused: '".only" on "{{ name }}" runs only this part of the kit and skips the rest of the file.',
      disabled: '".skip" on "{{ name }}" leaves part of the kit unrun. Use ".skipIf" for a condition, or remove it.',
      noAssertion: 'This test has no assertion. Call one of {{ names }} in its body, or list the helper that asserts in "assertFunctionNames".',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const { names, assertions, reportDisabled } = readInjectedTestHygieneOptions(options);
    const { sourceCode } = context;
    const assertionCalls: TSESTree.CallExpression[] = [];
    const tests: { readonly node: TSESTree.CallExpression; readonly body: FunctionNode }[] = [];

    const parameterFunction = (identifier: TSESTree.Identifier): FunctionNode | undefined => {
      for (let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
        const variable = scope.set.get(identifier.name);
        if (variable === undefined) continue;
        const definition = variable.defs.find((candidate) => candidate.type === TSESLint.Scope.DefinitionType.Parameter);

        return definition !== undefined && isFunction(definition.node) ? definition.node : undefined;
      }

      return undefined;
    };

    /**
     * The test API a call goes through and the modifiers after it (`skip`, `only`, `each`), or `undefined` when the call does not start from an injected test function.
     */
    const resolveApi = ({ root, members }: Chain): { readonly api: Api; readonly members: readonly string[] } | undefined => {
      const owner = parameterFunction(root);
      if (owner === undefined) return undefined;
      const direct = API_KINDS.get(destructuredKey(owner, root.name) ?? root.name);
      if (direct !== undefined) return { api: direct, members };
      const [property, ...rest] = members;
      const nested = property === undefined ? undefined : API_KINDS.get(property);

      return nested === undefined ? undefined : { api: nested, members: rest };
    };

    return {
      CallExpression(node) {
        const name = calleeName(node.callee);
        if (name !== undefined && assertions.some((pattern) => pattern.test(name))) assertionCalls.push(node);
        if (isCalleeOfCall(node)) return;
        const chain = chainOf(node.callee);
        const resolved = chain === undefined ? undefined : resolveApi(chain);
        if (resolved === undefined) return;
        const label = sourceCode.getText(node.callee);
        if (resolved.members.includes('only')) context.report({ node, messageId: 'focused', data: { name: label } });
        const skipped = resolved.members.includes('skip');
        if (skipped && reportDisabled) context.report({ node, messageId: 'disabled', data: { name: label } });
        const body = functionArgument(node);
        if (resolved.api === 'it' && !skipped && body !== undefined) tests.push({ node, body });
      },
      'Program:exit'() {
        for (const { node, body } of tests) {
          if (!assertionCalls.some((call) => call.range[0] >= body.range[0] && call.range[1] <= body.range[1])) {
            context.report({ node, messageId: 'noAssertion', data: { names: names.join(', ') } });
          }
        }
      },
    };
  },
});

export default injectedTestHygiene;
