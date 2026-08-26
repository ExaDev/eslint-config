import { AST_NODE_TYPES, ESLintUtils, TSESLint, type TSESTree } from '@typescript-eslint/utils';

// `instanceof Set` narrows any constituent of a union down to the global `Set<T>` interface itself, with no way to preserve a `ReadonlySet` modifier through the narrowing -- narrowing a parameter whose real type includes a `ReadonlySet` through `instanceof Set` silently produces a fully mutable `Set<T>` inside the guarded branch. Confirmed directly: `function mutate(input: ReadonlySet<number> | number): void { if (input instanceof Set) { input.add(1); } }` compiles cleanly under `tsc --strict` with zero errors, even though `ReadonlySet<number>` has no `.add` method at all -- a caller's genuinely read-only set (`const frozen: ReadonlySet<number> = new Set([1, 2, 3]); mutate(frozen);`) gets mutated despite its own declaration.
//
// This is the same class of hole as no-array-isarray-mutation.ts's own (Array.isArray narrowing a readonly array to a mutable one), just for Set, and the equivalent narrowing gap exists for instanceof Map against ReadonlyMap too. `instanceof Array` does not have this problem (TypeScript's control-flow narrowing for `instanceof` against a class/interface pair genuinely preserves a `readonly`-shaped constituent when the checked class's own instance type isn't the wider mutable supertype -- confirmed separately that `if (input instanceof Array) { input.push(1); }` on a `readonly number[] | number` parameter still errors under strict mode), but `Set`'s own global type declaration and `ReadonlySet`'s are two separate interfaces with no subtype relationship enforced by `instanceof`'s narrowing, so the checker widens straight to the mutable `Set<T>`.
//
// This rule reads real type information rather than matching the parameter's TSESTree type-annotation shape syntactically, specifically so it sees through a type alias (`type RO = ReadonlySet<number>; function f(input: RO | number)`) and catches a bare `ReadonlySet<T>` parameter with no union at all -- `instanceof Set` discards the read-only guarantee there too, with no union involved. `t.getSymbol()?.name === 'ReadonlySet'` is confirmed empirically (via the TS compiler API directly, and via the tsc --strict reproduction above) to distinguish a read-only set (`ReadonlySet`) from a mutable one (`Set`) even through a resolved type alias, since the checker's own type for an aliased type is the alias's real underlying type, not a separate "alias type." Unlike arrays, the checker has no `isArrayType`-equivalent helper for sets, so the symbol-name check alone is what identifies the shape -- confirmed sufficient because `ReadonlySet<T>` and `Set<T>` resolve to distinct symbols with no shared name.
//
// No autofix is shipped, for the same reason as no-array-isarray-mutation.ts: rewriting `input.add(x)` into a copy-first pattern (a fresh `Set` assigned to `input`) is not safely mechanical -- an alias taken before the mutating call (`const other = input; input.add(1); return other;`) observes the in-place mutation through `other` today, but would silently stop observing it if the call were rewritten to assign a fresh `Set` to `input` instead of mutating the shared object. Report-only, matching no-array-isarray-mutation.ts's own precedent of shipping zero fix when nothing is provably safe.

const MUTATING_SET_METHODS = new Set(['add', 'delete', 'clear']);

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`,
);

function isSetInstanceofExpression(node: TSESTree.Node): node is TSESTree.BinaryExpression {
  return (
    node.type === AST_NODE_TYPES.BinaryExpression &&
    node.operator === 'instanceof' &&
    node.right.type === AST_NODE_TYPES.Identifier &&
    node.right.name === 'Set'
  );
}

// A statement that unconditionally leaves the enclosing function/loop -- enough to recognise the common early-return guard idiom (`if (!(x instanceof Set)) return; x.add(1);`) without a full control-flow analysis. Deliberately narrow: a return/throw/continue/break directly, or a block whose LAST statement is one of those -- an if/else inside the block that itself always exits either way is not recognised (a real gap, but one that would need genuine CFA to close, and this rule already documents what it does and does not catch).
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

const noSetInstanceofMutation = createRule({
  name: 'no-set-instanceof-mutation',
  meta: {
    type: 'problem',
    schema: [],
    docs: {
      description:
        'Disallow mutating calls on a parameter whose real type includes a ReadonlySet, narrowed via instanceof Set, which silently discards the declared read-only guarantee.',
    },
    messages: {
      unsound:
        "'{{ method }}' mutates a parameter narrowed by instanceof Set -- instanceof Set's own narrowing widens straight to the mutable Set interface, so a caller's genuinely read-only set can be mutated here even though the parameter's real type includes a ReadonlySet. Copy the set before mutating (e.g. new Set(input)), or narrow with a check that preserves read-only instead of instanceof Set.",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    function parameterHasReadonlySetConstituent(parameterNode: TSESTree.Identifier): boolean {
      const tsNode = services.esTreeNodeToTSNodeMap.get(parameterNode);
      const parameterType = checker.getTypeAtLocation(tsNode);
      const constituents = parameterType.isUnion() ? parameterType.types : [parameterType];
      return constituents.some((constituent) => constituent.getSymbol()?.name === 'ReadonlySet');
    }

    return {
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.computed ||
          callee.object.type !== AST_NODE_TYPES.Identifier ||
          callee.property.type !== AST_NODE_TYPES.Identifier ||
          !MUTATING_SET_METHODS.has(callee.property.name)
        ) {
          return;
        }

        const scope = context.sourceCode.getScope(node);
        const variable = scope.references.find((reference) => reference.identifier === callee.object)?.resolved;
        if (!variable) return;
        const parameterDefinition = variable.defs.find((definition) => definition.type === TSESLint.Scope.DefinitionType.Parameter);
        if (!parameterDefinition) return;

        const parameterNode = parameterDefinition.name;
        if (parameterNode.type !== AST_NODE_TYPES.Identifier) return;
        if (!parameterHasReadonlySetConstituent(parameterNode)) return;

        if (!isGuardedBySetInstanceof(node, variable, context)) return;

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

    // A negated `instanceof Set` test -- `!(x instanceof Set)`, the shape the early-return and else-branch guard idioms both test against.
    function isNegatedSetInstanceofExpression(
      testNode: TSESTree.Node,
      target: TSESLint.Scope.Variable,
      ruleContext: Readonly<TSESLint.RuleContext<'unsound', []>>,
    ): boolean {
      if (testNode.type !== AST_NODE_TYPES.UnaryExpression || testNode.operator !== '!') return false;
      return matchesSetInstanceofOn(testNode.argument, target, ruleContext);
    }

    function matchesSetInstanceofOn(
      testNode: TSESTree.Node,
      target: TSESLint.Scope.Variable,
      ruleContext: Readonly<TSESLint.RuleContext<'unsound', []>>,
    ): boolean {
      if (!isSetInstanceofExpression(testNode)) return false;
      const { left } = testNode;
      return left.type === AST_NODE_TYPES.Identifier && resolvesToVariable(left, target, testNode, ruleContext);
    }

    // Recognises every guard idiom this rule can prove is a real `instanceof Set` narrowing of the mutated parameter: the direct `if (x instanceof Set) { x.add(1) }` (braced or not), `if (x instanceof Set) x.add(1); else ...`'s consequent, `if (!(x instanceof Set)) { ... } else { x.add(1) }`'s alternate, `x instanceof Set && x.add(1)`, the ternary `x instanceof Set ? x.add(1) : ...`, and the early-return/early-throw idiom `if (!(x instanceof Set)) return; x.add(1);` (a preceding sibling statement in the same block, per definitelyExits above).
    function isGuardedBySetInstanceof(
      startNode: TSESTree.Node,
      parameterVariable: TSESLint.Scope.Variable,
      ruleContext: Readonly<TSESLint.RuleContext<'unsound', []>>,
    ): boolean {
      let current: TSESTree.Node = startNode;
      while (current.parent) {
        const { parent } = current;
        if (parent.type === AST_NODE_TYPES.IfStatement) {
          if (parent.consequent === current && matchesSetInstanceofOn(parent.test, parameterVariable, ruleContext)) return true;
          if (parent.alternate === current && isNegatedSetInstanceofExpression(parent.test, parameterVariable, ruleContext)) return true;
        }
        if (
          parent.type === AST_NODE_TYPES.LogicalExpression &&
          parent.operator === '&&' &&
          parent.right === current &&
          matchesSetInstanceofOn(parent.left, parameterVariable, ruleContext)
        ) {
          return true;
        }
        if (
          parent.type === AST_NODE_TYPES.ConditionalExpression &&
          parent.consequent === current &&
          matchesSetInstanceofOn(parent.test, parameterVariable, ruleContext)
        ) {
          return true;
        }
        current = parent;
      }
      return isGuardedByPrecedingEarlyReturn(startNode, parameterVariable, ruleContext);
    }

    // Walks the statement enclosing startNode back through its preceding siblings in the same block, looking for `if (!(x instanceof Set)) <exits>;` -- the early-return/early-throw idiom, where the mutating call is not nested inside any conditional at all.
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
                isNegatedSetInstanceofExpression(sibling.test, parameterVariable, ruleContext) &&
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

export default noSetInstanceofMutation;
