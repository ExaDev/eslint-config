import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';

// A numeric enum's reverse mapping -- indexing the enum object itself with a number, e.g. `Direction[n]` -- is typed as plain `string` for ANY number, including one outside the enum's actual member range, where it genuinely returns `undefined` at runtime. Confirmed directly via the TypeScript compiler API: `enum Direction { Up, Down } declare const n: number; const label: string = Direction[n]; label.toUpperCase();` type-checks cleanly under `tsc --strict` with zero errors, then throws at runtime for any `n` outside `0`/`1` because `Direction[999]` is `undefined`, not a `string`.
//
// Unlike a forward assignment into an enum-typed slot (see no-enum-number-widening.ts), TypeScript does NOT range-check even a numeric LITERAL index here -- confirmed directly: `Direction[999]` type-checks with zero errors too, and the resulting type of the whole element-access expression is identically `string` for every index we tried (`Direction[0]`, `Direction[999]`, `Direction[n]`, `Direction[Direction.Up]` all resolve to plain, non-literal `string`), so the element-access expression's own type gives no signal to distinguish safe from unsafe. This rule therefore inspects the INDEX expression's own actual type instead, mirroring no-enum-number-widening.ts's EnumLike/isLiteral/NumberLike checks applied to the source of an assignment. A literal index is still excluded from this rule's scope even though tsc does not verify it either: a literal is a concrete value visible and checkable by a reviewer at the call site, whereas a bare `number` variable's value depends on runtime data flow no reviewer can inspect by reading the line.
//
// A numeric enum's reverse mapping only exists because the compiler adds a real `[key: number]: string` index signature to the enum's own object type (confirmed via `checker.getIndexInfoOfType` on `typeof Direction` returning a `string`-typed index info) -- a string enum's object type has no such index signature at all (confirmed: `enum Colour { Red = 'red' } declare const n: number; Colour[n];` is a real compile error, "no index signature with a parameter of type 'number' was found"), so string enums are naturally out of scope and never reach this rule's report.
//
// No safe full autofix exists, for the same reason as no-enum-number-widening.ts: the real fix is a runtime membership check, a behavioural decision only a human can make. One genuine suggestion is offered instead: when the enum-indexed expression is the init of a variable declared with an explicit `: string` annotation, rewriting that annotation to `: string | undefined` does not hide the unsoundness -- it forces the real gap to surface as new compile errors everywhere the variable is later used as a bare `string`, which the developer must then resolve for real. Other syntactic positions (return statements, call arguments, bare assignments) have no equivalent annotation to rewrite, so they get a plain report only, mirroring no-object-assign.ts's own tiered "safe case gets more, everything else gets a plain report" pattern.

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`,
);

const noEnumReverseLookupWidening = createRule({
  name: 'no-enum-reverse-lookup-widening',
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: {
      description:
        "Disallow indexing a numeric enum's reverse mapping with a bare (non-literal) number -- TypeScript types the result as plain 'string' for any number, including one outside the enum's actual member range, where it genuinely returns 'undefined' at runtime.",
    },
    schema: [],
    messages: {
      widening:
        "Indexing the numeric enum '{{ enumName }}' with a plain 'number' relies on its reverse mapping, which TypeScript types as 'string' for any number -- including one outside the enum's actual members, where this genuinely returns 'undefined' at runtime. Narrow the index to a known member first (a runtime membership check against the enum's own values), or accept that the result may be 'undefined' and handle it.",
      suggestWidenAnnotation:
        "Widen this variable's annotation to 'string | undefined' so later uses of it as a bare 'string' surface as real compile errors you can resolve.",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    return {
      MemberExpression(node: TSESTree.MemberExpression) {
        if (!node.computed) return;

        // esTreeNodeToTSNodeMap's return type for the general `TSESTree.Expression` union structurally includes a couple of bare meta-property keyword tokens (e.g. the `import`/`new` in `import.meta`/`new.target`) that TypeScript's own `ts.Expression` type excludes, so the map's result is only known to be a `ts.Node` here -- `ts.isExpression` (a real, public type guard exported by the `typescript` package, not an assertion) narrows it before any Expression-only checker call. Neither the object nor the property of a computed MemberExpression is ever one of those keyword tokens.
        const objectTsNode: ts.Node = services.esTreeNodeToTSNodeMap.get(node.object);
        if (!ts.isExpression(objectTsNode)) return;

        const objectType = checker.getTypeAtLocation(objectTsNode);
        // `Type.symbol` is declared non-optional in typescript's own .d.ts even though a type without an associated symbol genuinely has none at runtime -- `Type.getSymbol()` is the honest, correctly `Symbol | undefined`-typed accessor for the same value, so it is used here instead of trusting the lying field type.
        const objectSymbol = objectType.getSymbol();
        if (!objectSymbol || !(objectSymbol.flags & ts.SymbolFlags.Enum)) return; // not an enum object at all -- out of scope

        // Only a numeric enum's object type carries a real `[key: number]: string` reverse-mapping index signature -- a string enum's object type has none, so this also naturally excludes string enums without needing a separate check.
        if (!checker.getIndexInfoOfType(objectType, ts.IndexKind.Number)) return;

        const propertyTsNode: ts.Node = services.esTreeNodeToTSNodeMap.get(node.property);
        if (!ts.isExpression(propertyTsNode)) return;

        const rawPropertyType = checker.getTypeAtLocation(propertyTsNode);
        // getBaseConstraintOfType only returns a defined type for a type PARAMETER (e.g. a generic `T extends number`) -- confirmed directly: it returns undefined for every concrete type tried (a plain number, a numeric literal, an enum member type). Without this, a generic numeric parameter's own flags (TypeParameter) carry neither NumberLike nor EnumLike nor Literal, so `function g<T extends number>(n: T): string { return Direction[n]; }` was silently missed -- confirmed via this exact repro compiling clean under tsc --strict while genuinely returning undefined at runtime for an out-of-range T.
        const propertyType = checker.getBaseConstraintOfType(rawPropertyType) ?? rawPropertyType;

        if (propertyType.flags & ts.TypeFlags.EnumLike) {
          // EnumLike alone isn't enough -- confirmed directly that indexing with a DIFFERENT enum's member (e.g. `enum Other { A = 999 } Direction[Other.A]`) is also EnumLike and also isLiteral(), so without this assignability check it fell through the same "safe pass-through" branch as Direction's own members, even though Other.A is no more a valid Direction index than the bare literal 999 is. isTypeAssignableTo(propertyType, the enum's own declared type) is true only for that enum's own members (Direction.Up assignable to Direction) and false for a different enum's member (Other.A not assignable to Direction) -- confirmed empirically for both cases.
          if (checker.isTypeAssignableTo(propertyType, checker.getDeclaredTypeOfSymbol(objectSymbol))) return; // the enum's own member (e.g. Direction[Direction.Up]) -- safe pass-through
          // else: a different enum's member -- falls through to the report below, same as a bare number.
        } else {
          if (propertyType.isLiteral()) return; // a literal index is a concrete, reviewable value at the call site -- out of this rule's scope
          if (!(propertyType.flags & ts.TypeFlags.NumberLike)) return; // not a number at all -- out of scope
        }

        // objectType (the value expression's type) is 'typeof Direction'; getDeclaredTypeOfSymbol resolves the enum's own type ('Direction') for a cleaner message, matching no-enum-number-widening.ts's naming.
        const enumName = checker.typeToString(checker.getDeclaredTypeOfSymbol(objectSymbol));

        const parent = node.parent;
        if (
          parent.type === AST_NODE_TYPES.VariableDeclarator &&
          parent.init === node &&
          parent.id.type === AST_NODE_TYPES.Identifier &&
          parent.id.typeAnnotation?.typeAnnotation.type === AST_NODE_TYPES.TSStringKeyword
        ) {
          const stringKeyword = parent.id.typeAnnotation.typeAnnotation;
          context.report({
            node,
            messageId: 'widening',
            data: { enumName },
            suggest: [
              {
                messageId: 'suggestWidenAnnotation',
                fix(fixer) {
                  return fixer.replaceText(stringKeyword, 'string | undefined');
                },
              },
            ],
          });
          return;
        }

        context.report({ node, messageId: 'widening', data: { enumName } });
      },
    };
  },
});

export default noEnumReverseLookupWidening;
