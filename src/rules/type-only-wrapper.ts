import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

/**
 * A wrapper that only affects the type of its operand and stands for that operand at runtime: `value as T`, `value satisfies T` and `<T>value`. A non-null assertion (`value!`) is not included: it is type-only too, but the rules that treat it as transparent say so themselves.
 */
export type TypeOnlyWrapper = TSESTree.TSAsExpression | TSESTree.TSSatisfiesExpression | TSESTree.TSTypeAssertion;

export function isTypeOnlyWrapper(node: TSESTree.Node): node is TypeOnlyWrapper {
  return node.type === AST_NODE_TYPES.TSAsExpression || node.type === AST_NODE_TYPES.TSSatisfiesExpression || node.type === AST_NODE_TYPES.TSTypeAssertion;
}

/**
 * The expression that `node` stands for at runtime once every enclosing type-only wrapper is removed.
 */
export function unwrapTypeOnly(node: TSESTree.Node): TSESTree.Node {
  return isTypeOnlyWrapper(node) ? unwrapTypeOnly(node.expression) : node;
}
