import { AST_NODE_TYPES, ESLintUtils, TSESLint, type TSESTree } from '@typescript-eslint/utils';

// TypeScript's lib.es2015.collection.d.ts declares `Map<K, V> extends ReadonlyMap<K, V>` and `instanceof` narrowing has no way to express "this branch is still ReadonlyMap, just confirmed to actually be backed by a Map at runtime" -- narrowing a parameter or local variable whose real type includes a ReadonlyMap through `instanceof Map` silently produces the full mutable `Map<K, V>` inside the guarded branch. Confirmed directly: `function mutate(input: ReadonlyMap<string, number> | number): void { if (input instanceof Map) { input.set('x', 1); } }` compiles cleanly under `tsc --strict` with zero errors, even though `input`'s ReadonlyMap constituent has no `.set` method at all -- a caller's genuinely read-only view onto a shared Map gets mutated despite the declared type saying it cannot be. The identical hole reproduces for a plain local: `const frozen: ReadonlyMap<string, number> = getShared(); if (frozen instanceof Map) { frozen.set('x', 1); }` also compiles clean under `tsc --strict`, since `instanceof Map`'s own narrowing behaviour is a property of the guard, not of whether the narrowed binding happens to be a parameter or a `const`/`let` declared in the function body.
//
// This is Array.isArray's own hole (see no-array-isarray-mutation.ts) recurring for Map: confirmed directly that `instanceof Array` does NOT share this problem -- `function mutateArr(input: readonly number[] | number): void { if (input instanceof Array) { input.push(1); } }` correctly fails to compile (`Property 'push' does not exist on type 'readonly number[]'`), because `ReadonlyArray<T>` is not a supertype `Array<T>` extends in the same declared-inheritance sense; the checker narrows an `instanceof Array` test to the array's own already-known element type rather than to a separately-declared wider `Array` interface. `ReadonlyMap`/`Map` are different: `Map` is declared as extending `ReadonlyMap` and adding the mutating members, so `instanceof Map` narrows to that wider, unrelated-by-structure interface instead. This makes the Map case an `instanceof`-specific gap for classes/interfaces declared exactly this way (a readonly base interface + a subtype adding mutators), not a general `instanceof` gap -- `instanceof Array` is unaffected precisely because arrays are not modelled with that inheritance shape.
//
// This rule reads real type information rather than matching the declaration's TSESTree type-annotation shape syntactically, specifically so it sees through a type alias (`type RO = ReadonlyMap<string, number>; function f(input: RO | number)`) and catches a BARE `ReadonlyMap<K, V>` declaration with no union at all (`function f(input: ReadonlyMap<string, number>)` -- `instanceof Map` discards the readonly guarantee here too, with no union involved) -- confirmed empirically via the TS compiler API that `getSymbol()?.name === 'ReadonlyMap'` distinguishes a `ReadonlyMap` constituent (bare, unioned, or reached through a resolved alias) from a plain mutable `Map` constituent (`getSymbol()?.name === 'Map'`), the same way `no-array-isarray-mutation.ts`'s own `t.getSymbol()?.name === 'ReadonlyArray'` check does for arrays. There is no `checker.isArrayType` equivalent for maps, so the symbol-name check alone is the detection: `checker.isArrayType` itself only ever answers questions about array/tuple types.
//
// The type is read at the declaration's own name node -- the parameter's own identifier, or a `VariableDeclarator`'s own `id` -- never at the reference inside the guard, for the same reason as the array sibling: by the time execution reaches `x instanceof Map`, control-flow narrowing has already discarded the readonly-ness at that location. Checking the declaration's own name node also makes a destructured local binding (`const { frozen } = getShared();`) fall out for free: destructuring only changes how the initializer is computed, not the definition kind eslint-scope records for the bound identifier, so it is picked up as an ordinary `DefinitionType.Variable` the same as a plain `const`.
//
// No autofix is shipped, for the same reason as the array sibling: rewriting the mutating call into a copy-first pattern (`input.set(k, v)` -> constructing a fresh Map and reassigning) is not safely mechanical, because an alias taken before the mutating call -- `const other = input; input.set('x', 1); return other;` -- observes the in-place mutation through `other` today, and would silently stop observing it if the call were rewritten to assign a fresh Map to `input` instead of mutating the shared object. Report-only, matching no-array-isarray-mutation.ts's own precedent of shipping zero fix when nothing is provably safe.

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`,
);

// ReadonlyMap's own missing members -- everything Map adds on top of ReadonlyMap in lib.es2015.collection.d.ts.
const MUTATING_MAP_METHODS = new Set(['set', 'delete', 'clear']);

function isInstanceofMapExpression(node: TSESTree.Node): node is TSESTree.BinaryExpression {
  return (
    node.type === AST_NODE_TYPES.BinaryExpression &&
    node.operator === 'instanceof' &&
    node.right.type === AST_NODE_TYPES.Identifier &&
    node.right.name === 'Map'
  );
}

// A statement that unconditionally leaves the enclosing function/loop -- enough to recognise the common early-return guard idiom (`if (!(x instanceof Map)) return; x.set('a', 1);`) without a full control-flow analysis. Deliberately narrow: a return/throw/continue/break directly, or a block whose LAST statement is one of those -- an if/else inside the block that itself always exits either way is not recognised (a real gap, but one that would need genuine CFA to close, and this rule already documents what it does and does not catch).
function definitelyExits(statement: TSESTree.Statement): boolean {
  if (
    statement.type === AST_NODE_TYPES.ReturnStatement ||
    statement.type === AST_NODE_TYPES.ThrowStatement ||
    statement.type === AST_NODE_TYPES.ContinueStatement ||
    statement.type === AST_NODE_TYPES.BreakStatement
  ) {
    return true;
  }
  if (statement.type === AST_NODE_TYPES.BlockStatement) {
    const last = statement.body.at(-1);
    return last !== undefined && definitelyExits(last);
  }
  return false;
}

const noMapInstanceofMutation = createRule({
  name: 'no-map-instanceof-mutation',
  meta: {
    type: 'problem',
    schema: [],
    docs: {
      description:
        "Disallow mutating calls on a parameter or local variable whose real type includes a ReadonlyMap, narrowed via `instanceof Map`, which silently discards the declared readonly guarantee.",
    },
    messages: {
      unsound:
        "'{{ method }}' mutates a parameter or local variable narrowed by 'instanceof Map' -- Map is declared as extending ReadonlyMap, so 'instanceof Map' narrows straight past the readonly guarantee to the full mutable interface, and a value whose real type includes ReadonlyMap (a caller's map, for a parameter; the value's own declared type, for a local variable) can be mutated here despite that readonly guarantee. Copy the map before mutating (e.g. `new Map(input)`), or narrow with a check that preserves readonly instead of 'instanceof Map'.",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    function declarationHasReadonlyMapConstituent(declarationNode: TSESTree.Identifier): boolean {
      const tsNode = services.esTreeNodeToTSNodeMap.get(declarationNode);
      const declaredType = checker.getTypeAtLocation(tsNode);
      const constituents = declaredType.isUnion() ? declaredType.types : [declaredType];
      return constituents.some((constituent) => constituent.getSymbol()?.name === 'ReadonlyMap');
    }

    return {
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.computed ||
          callee.object.type !== AST_NODE_TYPES.Identifier ||
          callee.property.type !== AST_NODE_TYPES.Identifier ||
          !MUTATING_MAP_METHODS.has(callee.property.name)
        ) {
          return;
        }

        const scope = context.sourceCode.getScope(node);
        const variable = scope.references.find((reference) => reference.identifier === callee.object)?.resolved;
        if (!variable) return;
        // A parameter or a plain local variable declaration (including a destructured binding, which eslint-scope still records as an ordinary DefinitionType.Variable) -- deliberately not FunctionName, ClassName, ImportBinding, or CatchClause, none of which can meaningfully hold a ReadonlyMap-typed value the way a parameter or a variable declarator can.
        const declarationDefinition = variable.defs.find(
          (definition) =>
            definition.type === TSESLint.Scope.DefinitionType.Parameter ||
            definition.type === TSESLint.Scope.DefinitionType.Variable,
        );
        if (!declarationDefinition) return;

        const declarationNode = declarationDefinition.name;
        if (declarationNode.type !== AST_NODE_TYPES.Identifier) return;
        if (!declarationHasReadonlyMapConstituent(declarationNode)) return;

        if (!isGuardedByInstanceofMap(node, variable, context)) return;

        context.report({
          node,
          messageId: 'unsound',
          data: { method: callee.property.name },
        });
      },
    };

    function resolvesToVariable(
      identifier: TSESTree.Identifier,
      target: TSESLint.Scope.Variable,
      atNode: TSESTree.Node,
      ruleContext: Readonly<TSESLint.RuleContext<'unsound', []>>,
    ): boolean {
      const scope = ruleContext.sourceCode.getScope(atNode);
      const resolved = scope.references.find((reference) => reference.identifier === identifier)?.resolved;
      return resolved === target;
    }

    // A negated `instanceof Map` test -- `!(x instanceof Map)`, the shape the early-return and else-branch guard idioms both test against.
    function isNegatedInstanceofMapExpression(
      testNode: TSESTree.Node,
      target: TSESLint.Scope.Variable,
      ruleContext: Readonly<TSESLint.RuleContext<'unsound', []>>,
    ): boolean {
      if (testNode.type !== AST_NODE_TYPES.UnaryExpression || testNode.operator !== '!') return false;
      return matchesInstanceofMapOn(testNode.argument, target, ruleContext);
    }

    function matchesInstanceofMapOn(
      testNode: TSESTree.Node,
      target: TSESLint.Scope.Variable,
      ruleContext: Readonly<TSESLint.RuleContext<'unsound', []>>,
    ): boolean {
      if (!isInstanceofMapExpression(testNode)) return false;
      const { left } = testNode;
      return left.type === AST_NODE_TYPES.Identifier && resolvesToVariable(left, target, testNode, ruleContext);
    }

    // Recognises every guard idiom this rule can prove is a real `instanceof Map` narrowing of the mutated parameter: the direct `if (x instanceof Map) { x.set('a', 1) }` (braced or not), `if (x instanceof Map) x.set('a', 1); else ...`'s consequent, `if (!(x instanceof Map)) { ... } else { x.set('a', 1) }`'s alternate, `x instanceof Map && x.set('a', 1)`, the ternary `x instanceof Map ? x.set('a', 1) : ...`, and the early-return/early-throw idiom `if (!(x instanceof Map)) return; x.set('a', 1);` (a preceding sibling statement in the same block, per definitelyExits above).
    function isGuardedByInstanceofMap(
      startNode: TSESTree.Node,
      parameterVariable: TSESLint.Scope.Variable,
      ruleContext: Readonly<TSESLint.RuleContext<'unsound', []>>,
    ): boolean {
      let current: TSESTree.Node = startNode;
      while (current.parent) {
        const { parent } = current;
        if (parent.type === AST_NODE_TYPES.IfStatement) {
          if (parent.consequent === current && matchesInstanceofMapOn(parent.test, parameterVariable, ruleContext)) return true;
          if (parent.alternate === current && isNegatedInstanceofMapExpression(parent.test, parameterVariable, ruleContext)) return true;
        }
        if (
          parent.type === AST_NODE_TYPES.LogicalExpression &&
          parent.operator === '&&' &&
          parent.right === current &&
          matchesInstanceofMapOn(parent.left, parameterVariable, ruleContext)
        ) {
          return true;
        }
        if (
          parent.type === AST_NODE_TYPES.ConditionalExpression &&
          parent.consequent === current &&
          matchesInstanceofMapOn(parent.test, parameterVariable, ruleContext)
        ) {
          return true;
        }
        current = parent;
      }
      return isGuardedByPrecedingEarlyReturn(startNode, parameterVariable, ruleContext);
    }

    // Walks the statement enclosing startNode back through its preceding siblings in the same block, looking for `if (!(x instanceof Map)) <exits>;` -- the early-return/early-throw idiom, where the mutating call is not nested inside any conditional at all.
    function isGuardedByPrecedingEarlyReturn(
      startNode: TSESTree.Node,
      parameterVariable: TSESLint.Scope.Variable,
      ruleContext: Readonly<TSESLint.RuleContext<'unsound', []>>,
    ): boolean {
      let current: TSESTree.Node = startNode;
      while (current.parent) {
        const { parent } = current;
        if (parent.type === AST_NODE_TYPES.BlockStatement || parent.type === AST_NODE_TYPES.Program) {
          // Every member of the Statement/ProgramStatement union parent.body holds structurally satisfies TSESTree.Node (type/loc/range/parent), so this assignment is plain structural covariance, not a cast -- a manual reference scan is used instead of Array.prototype.indexOf specifically because indexOf's generic signature would otherwise force `current` (typed as the wider TSESTree.Node) to be asserted down to the narrower statement-union element type.
          const statements: readonly TSESTree.Node[] = parent.body;
          let ownIndex = -1;
          for (let i = 0; i < statements.length; i++) {
            if (statements[i] === current) {
              ownIndex = i;
              break;
            }
          }
          if (ownIndex > 0) {
            for (let i = ownIndex - 1; i >= 0; i--) {
              const sibling = statements[i];
              if (
                sibling?.type === AST_NODE_TYPES.IfStatement &&
                !sibling.alternate &&
                isNegatedInstanceofMapExpression(sibling.test, parameterVariable, ruleContext) &&
                definitelyExits(sibling.consequent)
              ) {
                return true;
              }
            }
          }
        }
        current = parent;
      }
      return false;
    }
  },
});

export default noMapInstanceofMutation;
