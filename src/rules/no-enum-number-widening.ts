import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';

// A numeric enum accepts any bare `number`, not just its own members -- confirmed directly: `enum Direction { Up, Down } declare const n: number; const d: Direction = n;` type-checks cleanly under `tsc --strict`, with no cast needed. TypeScript DOES reject an invalid numeric LITERAL assigned the same way (`const d: Direction = 999;` is a real error) -- the hole is specifically for a non-literal `number` value, where the compiler has no literal to range-check against.
//
// Verified via the TypeScript compiler API directly (not assumed): at a position whose contextual type is EnumLike, a genuine enum member access (`Direction.Up`) has EnumLike set on its OWN actual type, and a valid literal (`0`) reports `isLiteral() === true` -- both distinguishable from the unsafe case, a plain `number`-flagged, non-literal actual type with no EnumLike flag of its own. This needs real type information (`getContextualType`/`getTypeAtLocation`), so this rule requires type-aware linting.
//
// No autofix is offered: the only way to make a live `number` value provably safe is a genuine runtime check against the enum's actual members, which is a real behavioural change a mechanical fix cannot responsibly synthesise (mirrors no-pointless-reassignment's own precedent of reporting without fixing once a transform can't be proven both safe and meaning-preserving).

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`,
);

const noEnumNumberWidening = createRule({
  name: 'no-enum-number-widening',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow assigning a bare (non-literal) number where a numeric enum type is expected -- TypeScript accepts any number for a numeric enum slot, not just its own members, once the value is not a literal the compiler can range-check.',
    },
    schema: [],
    messages: {
      widening:
        "A plain 'number' value is being used where the numeric enum '{{ enumName }}' is expected. TypeScript does not verify the value is actually one of the enum's members here -- narrow it to a known member first (e.g. a lookup/guard against the enum's own values), or accept a plain 'number' parameter instead of widening it implicitly.",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    function checkNode(expression: TSESTree.Expression) {
      // esTreeNodeToTSNodeMap's return type for the general `TSESTree.Expression` union structurally includes a couple of bare meta-property keyword tokens (e.g. the `import`/`new` in `import.meta`/`new.target`) that TypeScript's own `ts.Expression` type excludes, so the map's result is only known to be a `ts.Node` here -- `ts.isExpression` (a real, public type guard exported by the `typescript` package, not an assertion) narrows it before any Expression-only checker call. None of this rule's visitor call sites ever hand it one of those keyword tokens.
      const tsNode: ts.Node = services.esTreeNodeToTSNodeMap.get(expression);
      if (!ts.isExpression(tsNode)) return;

      const contextualType = checker.getContextualType(tsNode);
      if (!contextualType || !(contextualType.flags & ts.TypeFlags.EnumLike)) return;

      const actualType = checker.getTypeAtLocation(tsNode);
      if (actualType.flags & ts.TypeFlags.EnumLike) return; // already the enum's own type -- safe pass-through
      if (actualType.isLiteral()) return; // a literal that compiled is already range-checked by tsc itself
      if (!(actualType.flags & ts.TypeFlags.NumberLike)) return; // not a number at all -- out of scope

      context.report({
        node: expression,
        messageId: 'widening',
        data: { enumName: checker.typeToString(contextualType) },
      });
    }

    return {
      VariableDeclarator(node) {
        if (node.init) checkNode(node.init);
      },
      AssignmentExpression(node) {
        checkNode(node.right);
      },
      ReturnStatement(node) {
        if (node.argument) checkNode(node.argument);
      },
      CallExpression(node) {
        for (const argument of node.arguments) {
          if (argument.type !== AST_NODE_TYPES.SpreadElement) checkNode(argument);
        }
      },
    };
  },
});

export default noEnumNumberWidening;
