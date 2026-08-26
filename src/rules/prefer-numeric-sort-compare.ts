import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';
import { isTypeReference } from 'ts-api-utils';
import * as ts from 'typescript';

// @typescript-eslint/require-array-sort-compare already flags any '.sort()'/'.toSorted()' call with no compare function, except on a plain string array -- and ships with no fix or suggestion at all, correctly, since the right compare function in general depends on intent (ascending/descending/locale-aware/by-key) that can't be derived from the code. This rule is a deliberately narrow addition alongside it, not a replacement: both rules fire on the same call for a number array, and that overlap is intentional.
//
// The one case singled out here is the one where a specific fix is actually defensible as a suggestion: when the array's element type is definitively 'number' (every element type is NumberLike, not a union with any other type, and not 'any'/'unknown'), a bare '.sort()'/'.toSorted()' is essentially always a bug. The default comparator is lexicographic string comparison -- confirmed directly: `[1, 2, 3, 10, 20, 30].sort()` produces `[1, 10, 2, 20, 3, 30]`, not ascending numeric order -- and ascending numeric order is the overwhelmingly common intent for a bare numeric sort.
//
// This is a SUGGESTION, not a full autofix (no 'fixable: code', no top-level 'fix' on the report): auto-applying ascending order on every matching call could still be wrong for code that genuinely wants descending order, which is a real, if less common, alternative. A suggestion the developer explicitly reviews and accepts is appropriate; silently rewriting behaviour on every save is not.

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`,
);

const SORT_METHOD_NAMES = new Set(['sort', 'toSorted']);

// A type is "definitively number" when it is NumberLike itself, or a union where every constituent recursively is -- so a union of number literals (e.g. `1 | 2 | 3`) counts, matching the array literally holding nothing but numbers, while a union with any non-number constituent (e.g. `string | number`) does not. Confirmed empirically via the TypeScript compiler API that a union type's own `.flags` do NOT carry the NumberLike bit even when every member is NumberLike (e.g. for `(1 | 2 | 3)[]`, the element type's flags show `isUnion() === true` and `NumberLike === false` on the union itself), so checking `.flags` on a union directly would silently misclassify a pure-number-literal union as out of scope -- this recursive check is required to actually implement "every element type is NumberLike", not just "the top-level type is NumberLike". The NumberLike flag itself already excludes 'any' and 'unknown' (confirmed empirically: 'any[]' and 'unknown[]' each report NumberLike === false, with Any/Unknown set instead), so no separate any/unknown check is needed.
function isDefinitelyNumberType(type: ts.Type): boolean {
  if (type.isUnion()) {
    return type.types.every((constituent) => isDefinitelyNumberType(constituent));
  }
  return (type.flags & ts.TypeFlags.NumberLike) !== 0;
}

const preferNumericSortCompare = createRule({
  name: 'prefer-numeric-sort-compare',
  meta: {
    type: 'suggestion',
    hasSuggestions: true,
    docs: {
      description:
        "Suggest an ascending numeric compare function for a bare '.sort()'/'.toSorted()' call on an array whose element type is definitively 'number' -- the default comparator sorts lexicographically, so a bare numeric sort is essentially always a bug.",
    },
    schema: [],
    messages: {
      preferNumericCompare:
        "'.{{ method }}()' on a number array with no compare function sorts lexicographically (e.g. [1, 2, 10].sort() becomes [1, 10, 2]), not in ascending numeric order. Provide a compare function.",
      addAscendingCompare: "Add an ascending numeric compare function: '(a, b) => a - b'.",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (node.arguments.length > 0) return; // a compare function is already provided -- nothing to suggest

        const { callee } = node;
        if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) return;
        if (callee.property.type !== AST_NODE_TYPES.Identifier || !SORT_METHOD_NAMES.has(callee.property.name)) return;

        // esTreeNodeToTSNodeMap's return type for the general `TSESTree.Expression` union structurally includes a couple of bare meta-property keyword tokens (e.g. the `import`/`new` in `import.meta`/`new.target`) that TypeScript's own `ts.Expression` type excludes, so the map's result is only known to be a `ts.Node` here -- `ts.isExpression` (a real, public type guard exported by the `typescript` package, not an assertion) narrows it before any Expression-only checker call. The object of a non-computed MemberExpression is never one of those keyword tokens.
        const receiverTsNode: ts.Node = services.esTreeNodeToTSNodeMap.get(callee.object);
        if (!ts.isExpression(receiverTsNode)) return;

        const receiverType = checker.getTypeAtLocation(receiverTsNode);
        if (!checker.isArrayType(receiverType)) return;

        // 'Array<T>'/'ReadonlyArray<T>' are always generic type references once checker.isArrayType confirms the receiver is one of them, so getTypeArguments (which requires a TypeReference) is safe to call here -- ts-api-utils's isTypeReference is a real type guard (not an assertion) that narrows ts.Type down to ts.TypeReference by checking the ObjectFlags.Reference bit, the same check the TypeScript compiler's own internals use.
        if (!isTypeReference(receiverType)) return;
        const [elementType] = checker.getTypeArguments(receiverType);
        if (!elementType || !isDefinitelyNumberType(elementType)) return;

        context.report({
          node,
          messageId: 'preferNumericCompare',
          data: { method: callee.property.name },
          suggest: [
            {
              messageId: 'addAscendingCompare',
              fix(fixer) {
                const closingParen = context.sourceCode.getLastToken(node);
                if (!closingParen) return null;
                return fixer.insertTextBefore(closingParen, '(a, b) => a - b');
              },
            },
          ],
        });
      },
    };
  },
});

export default preferNumericSortCompare;
