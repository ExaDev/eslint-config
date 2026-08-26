import { AST_NODE_TYPES, ESLintUtils, TSESLint, type TSESTree } from '@typescript-eslint/utils';

// TypeScript checks array element types covariantly: a `number[]` is assignable wherever a `(string | number)[]` is expected, because a read of the wider array's elements is still safe. But a WRITE is not -- confirmed directly: `function pushString(arr: (string | number)[]): void { arr.push('x'); } const nums: number[] = [1, 2, 3]; pushString(nums);` type-checks cleanly under `tsc --strict`, and `nums` now genuinely holds a string at runtime despite its `number[]` type. No existing typescript-eslint rule flags this -- it is a structural consequence of covariant array typing, not a bug the type checker itself can close without breaking ordinary covariant reads.
//
// This rule flags exactly the shape that creates the risk: a function parameter typed as an array (`T[]` or `Array<T>`) whose element type is a union of two or more members, where the function body calls a mutating-insertion method (push/unshift/splice/fill/copyWithin) on that parameter -- any of these can insert a value the CALLER's own, possibly narrower, array was never declared to hold. Read-only or removal-only methods (pop/shift/slice/filter/map/...) never introduce a new element, so they carry no equivalent risk and are not flagged.
//
// Autofix: mark the parameter's array type `readonly` (`readonly T[]`/`ReadonlyArray<T>`). This does not silence the finding -- readonly arrays have no push/unshift/splice/fill/copyWithin methods at all, so the existing mutating call becomes a real compile error the developer must resolve deliberately (accept a narrower parameter type, copy into a new array first, or genuinely needs a mutable reference and removes the readonly modifier with a comment explaining why the union is safe here).

const MUTATING_INSERT_METHODS = new Set(['push', 'unshift', 'splice', 'fill', 'copyWithin']);

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`,
);

function isUnionArrayType(typeAnnotation: TSESTree.TypeNode): TSESTree.TSUnionType | undefined {
  if (typeAnnotation.type === AST_NODE_TYPES.TSArrayType && typeAnnotation.elementType.type === AST_NODE_TYPES.TSUnionType) {
    return typeAnnotation.elementType;
  }
  if (
    typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
    typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
    typeAnnotation.typeName.name === 'Array' &&
    typeAnnotation.typeArguments?.params.length === 1
  ) {
    const firstParam = typeAnnotation.typeArguments.params[0];
    if (firstParam?.type === AST_NODE_TYPES.TSUnionType) return firstParam;
  }
  return undefined;
}

const noMutableUnionArrayParam = createRule({
  name: 'no-mutable-union-array-param',
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'Disallow mutating-insertion calls on a union-element array parameter, which lets a caller pass a narrower array whose declared element type the call can silently violate.',
    },
    schema: [],
    messages: {
      unsound:
        "'{{ method }}' inserts into a parameter typed as an array of a union -- a caller may have passed a narrower array (e.g. number[] where (string | number)[] is declared), and TypeScript's covariant array typing does not catch the resulting mismatch. Mark the parameter readonly to turn this into a real compile error, or narrow the parameter type.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.computed ||
          callee.object.type !== AST_NODE_TYPES.Identifier ||
          callee.property.type !== AST_NODE_TYPES.Identifier ||
          !MUTATING_INSERT_METHODS.has(callee.property.name)
        ) {
          return;
        }

        const scope = context.sourceCode.getScope(node);
        const variable = scope.references.find((reference) => reference.identifier === callee.object)?.resolved;
        const parameterDefinition = variable?.defs.find((definition) => definition.type === TSESLint.Scope.DefinitionType.Parameter);
        if (!parameterDefinition) return;

        const parameterNode = parameterDefinition.name;
        if (parameterNode.type !== AST_NODE_TYPES.Identifier || !parameterNode.typeAnnotation) return;
        const unionType = isUnionArrayType(parameterNode.typeAnnotation.typeAnnotation);
        if (!unionType) return;

        context.report({
          node,
          messageId: 'unsound',
          data: { method: callee.property.name },
          fix(fixer) {
            const typeAnnotation = parameterNode.typeAnnotation;
            if (!typeAnnotation) return null;
            const annotated = typeAnnotation.typeAnnotation;
            if (annotated.type === AST_NODE_TYPES.TSArrayType) {
              return fixer.insertTextBefore(annotated, 'readonly ');
            }
            // `Array<T>` form -- rewrite the type-reference name to `ReadonlyArray` in place.
            if (annotated.type === AST_NODE_TYPES.TSTypeReference && annotated.typeName.type === AST_NODE_TYPES.Identifier) {
              return fixer.replaceText(annotated.typeName, 'ReadonlyArray');
            }
            return null;
          },
        });
      },
    };
  },
});

export default noMutableUnionArrayParam;
