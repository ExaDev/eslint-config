import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

// typescript-eslint's own @typescript-eslint/prefer-readonly-parameter-types flags ANY non-readonly array/tuple/object parameter by type shape alone, regardless of whether the function body ever mutates it -- confirmed directly by running it against both a function that mutates its array parameter and one that never touches it: both are flagged identically. That rule ships with NO autofix at all, because its general case also covers arbitrary object/interface types, which would need genuine deep-readonly type synthesis to fix correctly (wrapping in a single `Readonly<T>` only shallow-readonlies one level, which does not satisfy the rule's own deep check for a nested object) -- too risky to auto-apply broadly, which is almost certainly why typescript-eslint has never shipped a fixer for it.
//
// This rule is a deliberately narrower sibling: scoped to ONLY array and tuple parameter types (never objects/interfaces), which unlocks a genuinely safe, shallow, mechanical fix -- prepending `readonly ` (or renaming `Array` to `ReadonlyArray`) is all that is needed to satisfy an array or tuple's own readonly-ness, unlike an object type. It fires unconditionally on every array/tuple parameter matching this shape, exactly like the native sibling rule's own unconditional behaviour, and mirrors this package's own no-mutable-union-array-param and no-object-assign precedent of "mark it readonly and let any resulting mutation become a real, deliberately- surfaced compile error" rather than trying to detect mutation first. Detection is purely syntactic on the parameter's own type annotation, so no type-checker access is needed.
//
// Covers every parameter POSITION a plain array/tuple annotation can appear in, not just a bare identifier in a concrete function body: a rest parameter (`...xs: number[]`, whose type annotation lives on the RestElement itself, not on its inner `.argument` identifier -- confirmed directly by parsing both forms), a default-valued parameter (`xs: number[] = []`, whose annotation lives on the AssignmentPattern's `.left` identifier, not the AssignmentPattern itself), a constructor parameter property (`constructor(private xs: number[])`, whose annotation lives on the TSParameterProperty's `.parameter`), and every declaration-only function-like shape that carries no body of its own (an ambient/overload `declare function`, an interface method signature, a standalone function type alias, and a call/construct signature) alongside concrete function declarations/expressions/arrow functions and abstract/ambient class methods. A union type containing an array/tuple member (`number[] | string`) is fixed on that member alone, leaving the rest of the union untouched.

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`,
);

type FixableType = TSESTree.TSArrayType | TSESTree.TSTupleType | TSESTree.TSTypeReference;

// A single type node's fixable array/tuple shape, or undefined when it is not an array/tuple at all, or is already readonly (TSTypeOperator-wrapped, or already named `ReadonlyArray`).
function getFixableArrayOrTupleType(typeNode: TSESTree.TypeNode): FixableType | undefined {
  if (typeNode.type === AST_NODE_TYPES.TSTypeOperator && typeNode.operator === 'readonly') return undefined;
  if (typeNode.type === AST_NODE_TYPES.TSArrayType) return typeNode;
  if (typeNode.type === AST_NODE_TYPES.TSTupleType) return typeNode;
  if (
    typeNode.type === AST_NODE_TYPES.TSTypeReference &&
    typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
    typeNode.typeName.name === 'Array'
  ) {
    return typeNode;
  }
  return undefined;
}

// Recurses into a union's own members (`number[] | string` fixes only the array member) so the same check and fixer apply uniformly whether the annotation is a bare array/tuple or a union containing one.
function getFixableTypesForAnnotation(typeNode: TSESTree.TypeNode): FixableType[] {
  if (typeNode.type === AST_NODE_TYPES.TSUnionType) return typeNode.types.flatMap(getFixableTypesForAnnotation);
  const fixable = getFixableArrayOrTupleType(typeNode);
  return fixable ? [fixable] : [];
}

// Resolves a parameter down to whichever node actually owns its `.typeAnnotation` -- confirmed empirically via the real parser that this differs by wrapper: a RestElement carries its own annotation directly (never its inner `.argument`), while TSParameterProperty and AssignmentPattern carry none of their own and the annotation lives on their inner identifier instead. ArrayPattern/ObjectPattern (destructuring) are out of scope -- there is no single array/tuple-shaped parameter to mark readonly for a destructured binding.
function getAnnotatedParamNode(param: TSESTree.Parameter): TSESTree.Identifier | TSESTree.RestElement | undefined {
  if (param.type === AST_NODE_TYPES.TSParameterProperty) return getAnnotatedParamNode(param.parameter);
  if (param.type === AST_NODE_TYPES.AssignmentPattern) {
    return param.left.type === AST_NODE_TYPES.Identifier ? param.left : undefined;
  }
  if (param.type === AST_NODE_TYPES.RestElement || param.type === AST_NODE_TYPES.Identifier) return param;
  return undefined;
}

type FunctionLikeWithParams =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.TSCallSignatureDeclaration
  | TSESTree.TSConstructSignatureDeclaration
  | TSESTree.TSDeclareFunction
  | TSESTree.TSEmptyBodyFunctionExpression
  | TSESTree.TSFunctionType
  | TSESTree.TSMethodSignature;

// Every function-like shape that can carry a plain array/tuple parameter annotation: the three with a real body, plus the declaration-only shapes (an ambient/overload `declare function`, an interface method signature, a standalone function type alias, and a call/construct signature) and abstract/ambient class methods (TSEmptyBodyFunctionExpression).
const FUNCTION_LIKE_SELECTOR = [
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
  'TSCallSignatureDeclaration',
  'TSConstructSignatureDeclaration',
  'TSDeclareFunction',
  'TSEmptyBodyFunctionExpression',
  'TSFunctionType',
  'TSMethodSignature',
].join(', ');

const preferReadonlyArrayParam = createRule({
  name: 'prefer-readonly-array-param',
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'Require array and tuple parameters to be typed readonly, regardless of whether the function body mutates them -- a narrower, safely-autofixable sibling of @typescript-eslint/prefer-readonly-parameter-types scoped to array/tuple shapes only.',
    },
    schema: [],
    messages: {
      preferReadonly:
        'Array and tuple parameters should be typed readonly ({{ suggestion }}) so a caller can pass a readonly or shared array with confidence, and so any mutation inside the function becomes a deliberate, visible compile error instead of a silent side effect on the caller\'s data.',
    },
  },
  defaultOptions: [],
  create(context) {
    function checkParam(param: TSESTree.Parameter) {
      const annotatedNode = getAnnotatedParamNode(param);
      if (!annotatedNode?.typeAnnotation) return;

      const fixableTypes = getFixableTypesForAnnotation(annotatedNode.typeAnnotation.typeAnnotation);
      if (fixableTypes.length === 0) return;

      const suggestion = fixableTypes
        .map((fixableType) =>
          fixableType.type === AST_NODE_TYPES.TSTypeReference
            ? 'ReadonlyArray<T>'
            : `readonly ${fixableType.type === AST_NODE_TYPES.TSTupleType ? '[T, U]' : 'T[]'}`,
        )
        .join(' / ');

      context.report({
        node: param,
        messageId: 'preferReadonly',
        data: { suggestion },
        fix(fixer) {
          return fixableTypes.map((fixableType) =>
            fixableType.type === AST_NODE_TYPES.TSTypeReference
              ? fixer.replaceText(fixableType.typeName, 'ReadonlyArray')
              : fixer.insertTextBefore(fixableType, 'readonly '),
          );
        },
      });
    }

    return {
      [FUNCTION_LIKE_SELECTOR](node: FunctionLikeWithParams) {
        for (const param of node.params) checkParam(param);
      },
    };
  },
});

export default preferReadonlyArrayParam;
