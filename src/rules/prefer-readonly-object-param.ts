import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { isPropertyReadonlyInType } from 'ts-api-utils';
import * as ts from 'typescript';

// @typescript-eslint/prefer-readonly-parameter-types flags ANY non-readonly object/array/tuple parameter by type shape alone, and ships with no autofix, because its general case also covers arbitrarily nested object types, which need genuine deep-readonly type synthesis to fix correctly -- wrapping in a single `Readonly<T>` only shallow-readonlies one level, insufficient once a property is itself mutable (see prefer-readonly-array-param.ts's own header for the array/tuple half of this story, and this fact confirmed directly against the real rule). This rule is the OTHER safely-fixable subset the array/tuple sibling doesn't cover: a "flat" object type, where every property (and every index-signature value, if present) is itself immune to what a shallow wrapper misses -- a primitive, a literal/union of primitives, or a callback. For a type like this, `Readonly<T>` (TypeScript's own shallow utility type) IS fully sufficient, because there is no nested mutable state one level down for a shallow wrapper to fail to protect.
//
// Confirmed empirically against the REAL @typescript-eslint/prefer-readonly-parameter-types rule (see verify-native.test.ts, 12/12 passing): `Readonly<{ a: string; b: number }>` and `Readonly<Foo>` (a named interface of the same flat shape) both satisfy the native rule's own deep-readonly check with zero errors, while the same shapes with no `Readonly` wrapper at all are flagged. A property that is itself a nested plain object, an array, a `Map`, or a `Set` breaks this: `Readonly<{ a: { nested: string } }>`, `Readonly<{ a: string[] }>`, `Readonly<{ a: Map<string, number> }>`, and `Readonly<{ a: Set<string> }>` are ALL still flagged by the native rule even wrapped, because the shallow wrapper only freezes the outer property assignment, not the nested container's own mutating methods/properties. A callback property is the interesting boundary case, and was verified rather than assumed: `Readonly<{ a: string; cb: () => void }>` satisfies the native rule -- a function value has no settable properties of its own that a shallow wrapper would need to protect, so a callback presents no nested mutable state. The same file also confirms a pure primitive-valued index signature (`Readonly<{ [key: string]: number }>`) is sufficient, while one with an array-typed value (`Readonly<{ [key: string]: string[] }>`) is not -- so index signatures need the identical flatness check as named properties, not a free pass just because `checker.getPropertiesOfType` reports zero named properties for them.
//
// Detection therefore needs real type information, not syntax alone (`ESLintUtils.getParserServices` + `checker.getTypeAtLocation` on the parameter's own declaration node, matching this package's other type-aware rules such as no-map-instanceof-mutation.ts). A candidate parameter is syntactically a `TSTypeLiteral` (an inline `{ ... }` shape) or a `TSTypeReference` to a plain identifier that isn't already named `Readonly` (a qualified name like `Foo.Bar` is conservatively skipped, since the referenced shape can't be reasoned about the same way). The resolved `ts.Type` is then rejected outright -- treated as out of scope for THIS rule, not reported at all -- when: it's an array or tuple (`checker.isArrayType`/`checker.isTupleType` -- prefer-readonly-array-param's own domain); it's callable as a whole (`checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0` -- a function value as the entire parameter, not a property, is a different shape); its symbol is a `Map`/`ReadonlyMap`/`Set`/`ReadonlySet` (matched by name the same way no-map-instanceof-mutation.ts and no-set-instanceof-mutation.ts already do, so an alias to one of these resolves the same as the bare name); its symbol carries `ts.SymbolFlags.Class` (a class instance -- e.g. `Date` -- can mutate its own state through methods in ways a property-by-property flatness check can't see, so it's conservatively excluded even though nothing in the required scope names it explicitly); or it's a union, intersection, or unconstrained type parameter (each can have a shifting or absent property set that `checker.getPropertiesOfType` would report on unsafely -- e.g. a union's "properties" are only the ones common to every constituent, which can vacuously read as empty and therefore falsely "flat").
//
// What survives that filter is checked property-by-property (`checker.getPropertiesOfType`) AND index-signature-by-index-signature (`checker.getIndexInfosOfType`, since a pure index-signature type reports zero named properties): each property/value type must be `StringLike | NumberLike | BooleanLike | BigIntLike | ESSymbolLike | Null | Undefined` (recursing into unions, so a union of primitive literals like `"x" | "y"` still counts), or callable (a function/callback type, confirmed safe above). Any other shape -- most importantly a nested object, array, tuple, Map, or Set -- fails the check and the parameter is left unreported, matching the native rule's own reason for shipping no fixer in the general case: a shallow fix would be genuinely incomplete there. When in doubt (an intersection, a union, an unconstrained generic, a class instance), the check treats the shape as NOT flat rather than guessing it's safe.
//
// Traversal machinery (parameter positions and function-like shapes) is ported verbatim from prefer-readonly-array-param.ts's own already-hardened version, deliberately NOT re-derived, since an earlier version of that sibling rule was caught by adversarial review silently skipping most non-trivial positions (rest/default/parameter-property, and every declaration-only function shape) before being fixed. See that file's own comments for the position-by-position rationale.
//
// The fix wraps the USE SITE, not the referenced type's own declaration: `Readonly<` before, `>` after, for both a `TSTypeLiteral` and a `TSTypeReference` alike. Rewriting a named interface/type alias's own declaration would make it readonly everywhere it's used, even at call sites with different mutability needs -- the same principle prefer-readonly-array-param.ts already applies for the generic `Array<T>` form.

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`,
);

// Ported verbatim from prefer-readonly-array-param.ts's own already-hardened version: resolves a parameter down to whichever node actually owns its `.typeAnnotation` -- a RestElement carries its own annotation directly (never its inner `.argument`), while TSParameterProperty and AssignmentPattern carry none of their own and the annotation lives on their inner identifier instead. ArrayPattern/ObjectPattern (destructuring) are out of scope -- there is no single object-shaped parameter to mark readonly for a destructured binding.
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

// Ported verbatim from prefer-readonly-array-param.ts: every function-like shape that can carry a parameter annotation -- the three with a real body, plus the declaration-only shapes (an ambient/overload `declare function`, an interface method signature, a standalone function type alias, and a call/construct signature) and abstract/ambient class methods (TSEmptyBodyFunctionExpression).
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

type CandidateTypeNode = TSESTree.TSTypeLiteral | TSESTree.TSTypeReference;

// A parameter's own type annotation is a candidate for this rule only when it is an inline object-literal shape, or a reference to a plain (unqualified) named type that isn't already `Readonly<...>` -- everything else (arrays, tuples, primitives, unions, a qualified name like `Foo.Bar`) is left to other rules or is out of scope entirely.
function getCandidateTypeNode(typeNode: TSESTree.TypeNode): CandidateTypeNode | undefined {
  if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) return typeNode;
  if (typeNode.type !== AST_NODE_TYPES.TSTypeReference) return undefined;
  if (typeNode.typeName.type !== AST_NODE_TYPES.Identifier) return undefined;
  if (typeNode.typeName.name === 'Readonly') return undefined;
  return typeNode;
}

// Every property/index-signature-value shape confirmed safe for a shallow `Readonly<T>` wrapper (see the file header for the empirical verification): a plain primitive, or a literal/union of such. Enum members fall under NumberLike/StringLike here the same as any other TypeScript primitive-like flag grouping.
const PRIMITIVE_LIKE_FLAGS =
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.ESSymbolLike |
  ts.TypeFlags.Null |
  ts.TypeFlags.Undefined;

// A single property (or index-signature value) type is "flat" when it is a primitive/literal (recursing into unions, so `"x" | "y"` still counts), or a PURE callback -- a bare function value (`() => void`) has no settable properties of its own, so it presents no nested mutable state a shallow wrapper would fail to protect against, confirmed against the real native rule in verify-native.test.ts. A callable type that ALSO carries its own properties or index signature (a hybrid call-signature-plus-data shape, e.g. `{ (): void; prop: string[] }`) is NOT safe merely for being callable -- confirmed directly: wrapping `{ cb: { (): void; prop: string[] } }` in `Readonly<...>` still leaves `x.cb.prop.push(...)` compiling, and the real native rule still flags the wrapped form too -- so callable-ness only counts as flat when the callable has zero own properties and zero index signatures of its own. Anything else (a nested object, array, tuple, Map, Set, or any other reference type with its own mutable surface) is conservatively treated as NOT flat.
function isFlatPropertyType(checker: ts.TypeChecker, type: ts.Type): boolean {
  if (type.isUnion()) return type.types.every((constituent) => isFlatPropertyType(checker, constituent));
  if ((type.flags & PRIMITIVE_LIKE_FLAGS) !== 0) return true;
  const isPureCallable =
    checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0 &&
    checker.getPropertiesOfType(type).length === 0 &&
    checker.getIndexInfosOfType(type).length === 0;
  return isPureCallable;
}

// The whole resolved object type is "flat" only when it is a plain object/interface/type-alias shape (not an array/tuple, not callable or constructable as a whole, not a Map/Set, not a class instance, not a union/intersection/unconstrained type parameter -- see the file header for why each of these is excluded rather than risked) AND every one of its own properties and index-signature values is individually flat.
function isFlatObjectType(checker: ts.TypeChecker, type: ts.Type, location: ts.Node): boolean {
  // Checked via `.flags` rather than the `isUnion()`/`isIntersection()`/`isTypeParameter()` predicate methods: `TypeParameter extends InstantiableType extends Type {}` adds no members of its own in typescript's own .d.ts, so `Type` is structurally assignable to `TypeParameter` and negating `type.isTypeParameter()` narrows `type` to `never` (confirmed directly with a minimal tsc repro) -- a genuine quirk of that predicate's declared shape, not something specific to this file.
  if (type.flags & (ts.TypeFlags.Union | ts.TypeFlags.Intersection | ts.TypeFlags.TypeParameter)) return false;
  if (checker.isArrayType(type) || checker.isTupleType(type)) return false;
  if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0) return false;
  // A construct-signature-only type (e.g. `{ new (): Date }`) has zero named properties, so the property loop below vacuously "passes" it -- confirmed directly: `Readonly<{ new (): Date }>` is a real compile error at the call site (`new x()`), since `Readonly<T>`'s mapped type drops construct signatures the same way it drops call signatures. Rejected here for the same reason the call-signature check above exists.
  if (checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length > 0) return false;
  if ((type.getSymbol()?.flags ?? 0) & ts.SymbolFlags.Class) return false;

  const symbolName = type.getSymbol()?.name;
  if (symbolName === 'Map' || symbolName === 'ReadonlyMap' || symbolName === 'Set' || symbolName === 'ReadonlySet') return false;

  for (const property of checker.getPropertiesOfType(type)) {
    if (!isFlatPropertyType(checker, checker.getTypeOfSymbolAtLocation(property, location))) return false;
  }
  for (const indexInfo of checker.getIndexInfosOfType(type)) {
    if (!isFlatPropertyType(checker, indexInfo.type)) return false;
  }
  return true;
}

// True when every named property AND every index signature is ALREADY readonly -- there is nothing left for a `Readonly<...>` wrapper to add. This covers two real cases in one check: an interface/literal whose properties are already all written `readonly` by hand, and a named alias to an already-`Readonly<...>`-wrapped type (`type ROFoo = Readonly<Foo>`) -- confirmed directly that the native @typescript-eslint/prefer-readonly-parameter-types rule accepts both unwrapped, and that wrapping either again compiles but is pure churn (or, for the alias case, a redundant double wrap). `ts-api-utils`'s `isPropertyReadonlyInType` is used rather than hand-rolling this check, since it already correctly accounts for how a mapped type's own readonly-ness is represented on its resulting properties.
function isAlreadyFullyReadonly(checker: ts.TypeChecker, type: ts.Type): boolean {
  const properties = checker.getPropertiesOfType(type);
  const indexInfos = checker.getIndexInfosOfType(type);
  if (properties.length === 0 && indexInfos.length === 0) return false; // an empty shape has nothing to be "already readonly" about -- fall through to the normal flat/fixable path rather than special-casing it here.
  return (
    properties.every((property) => isPropertyReadonlyInType(type, property.getEscapedName(), checker)) &&
    indexInfos.every((indexInfo) => indexInfo.isReadonly)
  );
}

const preferReadonlyObjectParam = createRule({
  name: 'prefer-readonly-object-param',
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        "Require a 'flat' object parameter (every property is a primitive or a callback, so a shallow wrapper is provably sufficient) to be typed 'Readonly<T>' -- a narrower, safely-autofixable sibling of @typescript-eslint/prefer-readonly-parameter-types and of this package's own prefer-readonly-array-param, scoped to the object shapes where a shallow fix is genuinely complete.",
    },
    schema: [],
    messages: {
      preferReadonlyObject:
        "This object parameter is 'flat' -- every property (and index-signature value, if any) is a primitive or a callback, so there is no nested mutable state a shallow wrapper could miss. Wrap it in 'Readonly<...>' so a caller can pass a readonly or shared object with confidence, and so any attempt to mutate it inside the function becomes a deliberate, visible compile error instead of a silent side effect on the caller's data.",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    function checkParam(param: TSESTree.Parameter) {
      const annotatedNode = getAnnotatedParamNode(param);
      if (!annotatedNode?.typeAnnotation) return;

      const candidateTypeNode = getCandidateTypeNode(annotatedNode.typeAnnotation.typeAnnotation);
      if (!candidateTypeNode) return;

      const tsNode = services.esTreeNodeToTSNodeMap.get(annotatedNode);
      const type = checker.getTypeAtLocation(tsNode);
      if (!isFlatObjectType(checker, type, tsNode)) return;
      if (isAlreadyFullyReadonly(checker, type)) return;

      context.report({
        node: param,
        messageId: 'preferReadonlyObject',
        fix(fixer) {
          return [fixer.insertTextBefore(candidateTypeNode, 'Readonly<'), fixer.insertTextAfter(candidateTypeNode, '>')];
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

export default preferReadonlyObjectParam;
