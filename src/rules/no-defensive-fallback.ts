import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { isRecord } from '../is-record';
import { assertOnlyKeys, readEntryFiles, readEntryRecords, readRequiredString } from './file-entry';
import { createFileScope, type FileScope } from './file-scope';

type MessageIds = 'emptyFallback' | 'swallowedError';

const OPTION_NAME = 'exadev/no-defensive-fallback';
const OPTION_KEYS = ['allow'] as const;
const ALLOW_KEYS = ['files', 'reason'] as const;

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

/**
 * Reads the `allow` option into one `FileScope` per entry. Each entry needs `files` (globs, relative to ESLint's working directory) and a `reason`, which is not used at lint time: it is required so every exemption explains itself where it is configured, as `noInlineConfig` leaves no comment to do so.
 */
export function readAllowedScopes(options: unknown): readonly FileScope[] {
  if (!isRecord(options)) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" options must be an object.`);
  assertOnlyKeys(options, OPTION_KEYS, OPTION_NAME);
  const { allow } = options;
  if (allow === undefined) return [];

  return readEntryRecords(allow, `${OPTION_NAME} allow`).map((entry) => {
    assertOnlyKeys(entry, ALLOW_KEYS, `${OPTION_NAME} allow entry`);
    readRequiredString(entry, 'reason', `${OPTION_NAME} allow entry`);

    return createFileScope(readEntryFiles(entry['files'], `${OPTION_NAME} allow files`));
  });
}

/**
 * The expression a type-only wrapper (`as`, `satisfies`, `<T>value`) stands for at runtime.
 */
function unwrapTypeOnly(node: TSESTree.Node): TSESTree.Node {
  if (node.type === AST_NODE_TYPES.TSAsExpression || node.type === AST_NODE_TYPES.TSSatisfiesExpression || node.type === AST_NODE_TYPES.TSTypeAssertion) {
    return unwrapTypeOnly(node.expression);
  }

  return node;
}

/**
 * Whether `node` is a literal for "nothing here": an empty array, empty object, empty string (quoted or an untagged template with no content), `0`, `false` or `null`.
 */
function isEmptyLiteral(node: TSESTree.Node): boolean {
  const target = unwrapTypeOnly(node);
  if (target.type === AST_NODE_TYPES.ArrayExpression) return target.elements.length === 0;
  if (target.type === AST_NODE_TYPES.ObjectExpression) return target.properties.length === 0;
  if (target.type === AST_NODE_TYPES.TemplateLiteral) return target.expressions.length === 0 && target.quasis.every((quasi) => quasi.value.cooked === '');

  return target.type === AST_NODE_TYPES.Literal && (target.raw === 'null' || target.value === '' || target.value === 0 || target.value === false);
}

/**
 * Whether `node` is a fixed value known from the source alone, with no identifier but `undefined` and no call, so a function returning it cannot be reporting anything about the error it caught.
 */
function isConstantValue(node: TSESTree.Node): boolean {
  const target = unwrapTypeOnly(node);
  if (target.type === AST_NODE_TYPES.Literal) return true;
  if (target.type === AST_NODE_TYPES.Identifier) return target.name === 'undefined';
  if (target.type === AST_NODE_TYPES.TemplateLiteral) return target.expressions.length === 0;
  if (target.type === AST_NODE_TYPES.UnaryExpression) return (target.operator === '-' || target.operator === '+' || target.operator === '!') && isConstantValue(target.argument);
  if (target.type === AST_NODE_TYPES.ArrayExpression) {
    return target.elements.every((element) => element !== null && element.type !== AST_NODE_TYPES.SpreadElement && isConstantValue(element));
  }
  if (target.type === AST_NODE_TYPES.ObjectExpression) {
    return target.properties.every(
      (property) => property.type === AST_NODE_TYPES.Property && !property.computed && !property.method && property.kind === 'init' && isConstantValue(property.value),
    );
  }

  return false;
}

/**
 * How a block that stands in for error handling ends without handling anything, or `undefined` when it does something else. A block is swallowing when it is empty (a comment-only block included) or holds exactly one `return` that gives back nothing or a constant value.
 */
function swallowOutcome(body: readonly TSESTree.Statement[]): string | undefined {
  const [only, ...rest] = body;
  if (only === undefined) return 'does nothing';
  if (rest.length > 0 || only.type !== AST_NODE_TYPES.ReturnStatement) return undefined;
  if (only.argument === null) return 'returns nothing';

  return isConstantValue(only.argument) ? 'returns a fixed value' : undefined;
}

function isHandlerFunction(node: TSESTree.Node): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression {
  return node.type === AST_NODE_TYPES.ArrowFunctionExpression || node.type === AST_NODE_TYPES.FunctionExpression;
}

/**
 * How a function passed to `.catch(...)` swallows the rejection, or `undefined` when it does not. An arrow with an expression body swallows when that expression is a constant value.
 */
function rejectionHandlerOutcome(handler: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): string | undefined {
  if (handler.body.type === AST_NODE_TYPES.BlockStatement) return swallowOutcome(handler.body.body);

  return isConstantValue(handler.body) ? 'returns a fixed value' : undefined;
}

function isPromiseCatchCall(node: TSESTree.CallExpression): boolean {
  const { callee } = node;

  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed && callee.property.type === AST_NODE_TYPES.Identifier && callee.property.name === 'catch';
}

const noDefensiveFallback = createRule<[unknown], MessageIds>({
  name: 'no-defensive-fallback',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow an empty-literal fallback after ?? or ||, and a catch that discards the error and returns nothing or a fixed value.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                files: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, uniqueItems: true }] },
                reason: { type: 'string', minLength: 1 },
              },
              required: ['files', 'reason'],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      emptyFallback:
        'A fallback of `{{ fallback }}` after `{{ operator }}` turns a missing value into a plausible one, so the absence never reaches the code that could handle it. Model the value as `T | undefined` and handle the absence where it is meaningful, or list this file under "allow" with a reason.',
      swallowedError:
        'This {{ construct }} discards the error and {{ outcome }}, so a failure becomes indistinguishable from success. Rethrow it, handle it, or let the caller see it, or list this file under "allow" with a reason.',
    },
    defaultOptions: [{}],
  },
  create(context, [options]) {
    if (readAllowedScopes(options).some((inScope) => inScope(context.filename, context.cwd))) return {};

    function reportFallback(operator: string, right: TSESTree.Node): void {
      if (isEmptyLiteral(right)) context.report({ node: right, messageId: 'emptyFallback', data: { operator, fallback: context.sourceCode.getText(right) } });
    }

    return {
      LogicalExpression(node) {
        if (node.operator === '||' || node.operator === '??') reportFallback(node.operator, node.right);
      },
      AssignmentExpression(node) {
        if (node.operator === '||=' || node.operator === '??=') reportFallback(node.operator, node.right);
      },
      CatchClause(node) {
        const outcome = swallowOutcome(node.body.body);
        if (outcome !== undefined) context.report({ node, messageId: 'swallowedError', data: { construct: 'catch clause', outcome } });
      },
      CallExpression(node) {
        const [handler, ...others] = node.arguments;
        if (!isPromiseCatchCall(node) || handler === undefined || others.length > 0 || !isHandlerFunction(handler)) return;
        const outcome = rejectionHandlerOutcome(handler);
        if (outcome !== undefined) context.report({ node: handler, messageId: 'swallowedError', data: { construct: '.catch() handler', outcome } });
      },
    };
  },
});

export default noDefensiveFallback;
