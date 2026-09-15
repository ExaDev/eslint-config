import { AST_NODE_TYPES, ESLintUtils, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { asIdentifierName } from './scope-guards';

// TypeScript checks array element types covariantly: a `number[]` is assignable wherever a `(string | number)[]` is expected, because a read of the wider array's elements is still safe. But a WRITE is not — confirmed directly: `function pushString(arr: (string | number)[]): void { arr.push('x'); } const nums: number[] = [1, 2, 3]; pushString(nums);` type-checks cleanly under `tsc --strict`, and `nums` now genuinely holds a string at runtime despite its `number[]` type. No existing typescript-eslint rule flags this — it is a structural consequence of covariant array typing, not a bug the type checker itself can close without breaking ordinary covariant reads.
//
// This rule flags exactly the shape that creates the risk: a function parameter typed as an array (`T[]` or `Array<T>`) whose element type is a union of two or more members, where the function body calls a mutating-insertion method (push/unshift/splice/fill/copyWithin) on that parameter — any of these can insert a value the CALLER's own, possibly narrower, array was never declared to hold. Read-only or removal-only methods (pop/shift/slice/filter/map/...) never introduce a new element, so they carry no equivalent risk and are not flagged.
//
// Autofix: mark the parameter's array type `readonly` (`readonly T[]`/`ReadonlyArray<T>`). This does not silence the finding — readonly arrays have no push/unshift/splice/fill/copyWithin methods at all, so the existing mutating call becomes a real compile error the developer must resolve deliberately (accept a narrower parameter type, copy into a new array first, or genuinely needs a mutable reference and removes the readonly modifier with a comment explaining why the union is safe here).

const MUTATING_INSERT_METHODS = new Set(['push', 'unshift', 'splice', 'fill', 'copyWithin']);

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`,
);

// isUnionArrayType only ever returns truthy for exactly two shapes — a TSArrayType or a TSTypeReference named 'Array' with a single union type argument — so the only caller of this function always hands it one of those two. Exported so that guarantee is checked directly against a deliberately different shape, rather than assumed away with a cast.
export function buildReadonlyArrayFix(annotated: TSESTree.TypeNode, fixer: TSESLint.RuleFixer): TSESLint.RuleFix {
  if (annotated.type === AST_NODE_TYPES.TSArrayType) {
    return fixer.insertTextBefore(annotated, 'readonly ');
  }
  if (annotated.type !== AST_NODE_TYPES.TSTypeReference) {
    throw new Error(`Unreachable: expected a TSArrayType or TSTypeReference, got ${annotated.type} instead.`);
  }
  return fixer.replaceText(annotated.typeName, 'ReadonlyArray');
}

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
        "'{{ method }}' inserts into a parameter typed as an array of a union — a caller may have passed a narrower array (e.g. number[] where (string | number)[] is declared), and TypeScript's covariant array typing does not catch the resulting mismatch. Mark the parameter readonly to turn this into a real compile error, or narrow the parameter type.",
    },
    defaultOptions: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.computed ||
          callee.property.type !== AST_NODE_TYPES.Identifier ||
          !MUTATING_INSERT_METHODS.has(callee.property.name)
        ) {
          return;
        }

        // No separate `callee.object.type !== Identifier` guard is needed here: every `reference.identifier` eslint-scope ever records is itself a genuine Identifier node, so a non-Identifier `callee.object` (e.g. a nested MemberExpression) can never reference-equal one, and the `.find` below already resolves to `undefined` for it on its own.
        const scope = context.sourceCode.getScope(node);
        const variable = scope.references.find((reference) => reference.identifier === callee.object)?.resolved;
        const parameterDefinition = variable?.defs.find((definition) => definition.type === TSESLint.Scope.DefinitionType.Parameter);
        if (!parameterDefinition) return;

        const parameterNode = asIdentifierName(parameterDefinition.name);
        if (!parameterNode.typeAnnotation) return;
        const annotated = parameterNode.typeAnnotation.typeAnnotation;
        const unionType = isUnionArrayType(annotated);
        if (!unionType) return;

        context.report({
          node,
          messageId: 'unsound',
          data: { method: callee.property.name },
          fix: (fixer) => buildReadonlyArrayFix(annotated, fixer),
        });
      },
    };
  },
});

export default noMutableUnionArrayParam;
