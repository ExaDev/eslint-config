import { AST_NODE_TYPES, ESLintUtils, TSESLint, type TSESTree } from '@typescript-eslint/utils';

// Array.isArray's own lib.es5.d.ts signature is `(arg: any) => arg is any[]` -- it has no way to preserve a `readonly` modifier through the type guard, so narrowing a parameter or local variable whose real type includes a readonly array through `Array.isArray` silently produces a plain mutable `T[]` inside the guarded branch. Confirmed directly: `function mutate(input: readonly number[] | number): void { if (Array.isArray(input)) { input.push(1); } }` compiles cleanly under `tsc --strict` with zero errors, even though `input`'s outer declared type is already `readonly` -- a caller's genuinely readonly array (`const frozen: readonly number[] = [1, 2, 3]; mutate(frozen);`) gets mutated despite its own declaration. The identical hole reproduces for a plain local: `const frozen: readonly number[] = getShared(); if (Array.isArray(frozen)) { frozen.push(1); }` also compiles clean under `tsc --strict`, since `Array.isArray`'s own narrowing behaviour is a property of the guard, not of whether the narrowed binding happens to be a parameter or a `const`/`let` declared in the function body.
//
// This is distinct from no-mutable-union-array-param.ts's own hole: that rule catches a parameter whose DECLARED array type is already a mutable union of element types (`(string | number)[]`); this rule catches a parameter or local variable correctly declared readonly that loses the guarantee purely through `Array.isArray`'s own narrowing, not through the declaration itself. Re-adding `readonly` to the outer parameter type -- the fix that closes the sibling rule's hole -- does not help here: the type guard already discards it inside the branch regardless of the outer annotation, confirmed by the reproduction above already using a `readonly` parameter.
//
// This rule reads real type information rather than matching the declaration's TSESTree type-annotation shape syntactically, specifically so it sees through a type alias (`type RO = readonly number[]; function f(input: RO | number)`) and catches a BARE `readonly T[]` declaration with no union at all (`function f(input: readonly number[])` -- Array.isArray discards the readonly modifier here too, with no union involved) -- a first version of this rule matched the syntax directly and silently missed both, confirmed via the same tsc --strict reproduction pattern used throughout this rule's own history. `checker.isArrayType(t) && t.getSymbol()?.name === 'ReadonlyArray'` is confirmed empirically to distinguish a readonly array (`ReadonlyArray`) from a mutable one (`Array`) even through a resolved type alias, since the checker's own type for an aliased type is the alias's real underlying type, not a separate "alias type."
//
// The type is read at the declaration's own name node -- the parameter's own identifier, or a `VariableDeclarator`'s own `id` -- never at the reference inside the guard. By the time execution reaches `Array.isArray(x)`, TypeScript's control-flow narrowing has already discarded the readonly-ness at that location (that is the entire bug this rule exists to catch), so checking the type there would always observe a plain, already-narrowed type and the rule would never fire. Checking the declaration's own name node is also what makes a destructured local binding (`const { frozen } = getShared();`) fall out for free: destructuring only changes how the initializer is computed, not the definition kind eslint-scope records for the bound identifier, so it is picked up as an ordinary `DefinitionType.Variable` the same as a plain `const`.
//
// No autofix is shipped. Marking the declaration readonly again is a no-op (see above). Rewriting the mutating call itself into a copy-first pattern (`input.push(x)` -> a fresh-array assignment) is not safely mechanical even for push/unshift alone: an alias taken before the mutating call -- `const other = input; input.push(1); return other;` -- observes the in-place mutation through `other` today, but would silently stop observing it if the call were rewritten to assign a fresh array to `input` instead of mutating the shared object. Report-only, matching no-enum-number-widening.ts's own precedent of shipping zero fix when nothing is provably safe.

const MUTATING_INSERT_METHODS = new Set(['push', 'unshift', 'splice', 'fill', 'copyWithin']);

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`,
);

function isArrayIsArrayCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    node.callee.object.name === 'Array' &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'isArray'
  );
}

// A statement that unconditionally leaves the enclosing function/loop -- enough to recognise the common early-return guard idiom (`if (!Array.isArray(x)) return; x.push(1);`) without a full control-flow analysis. Deliberately narrow: a return/throw/continue/break directly, or a block whose LAST statement is one of those -- an if/else inside the block that itself always exits either way is not recognised (a real gap, but one that would need genuine CFA to close, and this rule already documents what it does and does not catch).
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

const noArrayIsArrayMutation = createRule({
  name: 'no-array-isarray-mutation',
  meta: {
    type: 'problem',
    schema: [],
    docs: {
      description:
        "Disallow mutating-insertion calls on a parameter or local variable whose real type includes a readonly array, narrowed via Array.isArray, which silently discards the declared readonly guarantee.",
    },
    messages: {
      unsound:
        "'{{ method }}' mutates a parameter or local variable narrowed by Array.isArray -- Array.isArray's own type declaration cannot preserve a readonly modifier through the guard, so a value whose real type includes a readonly array (a caller's array, for a parameter; the value's own declared type, for a local variable) can be mutated here despite that readonly guarantee. Copy the array before inserting (e.g. a spread into a new array), or narrow with a check that preserves readonly instead of Array.isArray.",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    function declarationHasReadonlyArrayConstituent(declarationNode: TSESTree.Identifier): boolean {
      const tsNode = services.esTreeNodeToTSNodeMap.get(declarationNode);
      const declaredType = checker.getTypeAtLocation(tsNode);
      const constituents = declaredType.isUnion() ? declaredType.types : [declaredType];
      return constituents.some((constituent) => checker.isArrayType(constituent) && constituent.getSymbol()?.name === 'ReadonlyArray');
    }

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
        if (!variable) return;
        // A parameter or a plain local variable declaration (including a destructured binding, which eslint-scope still records as an ordinary DefinitionType.Variable) -- deliberately not FunctionName, ClassName, ImportBinding, or CatchClause, none of which can meaningfully hold a readonly-array-typed value the way a parameter or a variable declarator can.
        const declarationDefinition = variable.defs.find(
          (definition) =>
            definition.type === TSESLint.Scope.DefinitionType.Parameter ||
            definition.type === TSESLint.Scope.DefinitionType.Variable,
        );
        if (!declarationDefinition) return;

        const declarationNode = declarationDefinition.name;
        if (declarationNode.type !== AST_NODE_TYPES.Identifier) return;
        if (!declarationHasReadonlyArrayConstituent(declarationNode)) return;

        if (!isGuardedByArrayIsArray(node, variable, context)) return;

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

    // A negated Array.isArray test -- `!Array.isArray(x)`, the shape the early-return and else-branch guard idioms both test against.
    function isNegatedArrayIsArrayCall(
      testNode: TSESTree.Node,
      target: TSESLint.Scope.Variable,
      ruleContext: Readonly<TSESLint.RuleContext<'unsound', []>>,
    ): boolean {
      if (testNode.type !== AST_NODE_TYPES.UnaryExpression || testNode.operator !== '!') return false;
      return matchesArrayIsArrayOn(testNode.argument, target, ruleContext);
    }

    function matchesArrayIsArrayOn(
      testNode: TSESTree.Node,
      target: TSESLint.Scope.Variable,
      ruleContext: Readonly<TSESLint.RuleContext<'unsound', []>>,
    ): boolean {
      if (!isArrayIsArrayCall(testNode)) return false;
      const [argument] = testNode.arguments;
      return argument?.type === AST_NODE_TYPES.Identifier && resolvesToVariable(argument, target, testNode, ruleContext);
    }

    // Recognises every guard idiom this rule can prove is a real Array.isArray narrowing of the mutated parameter: the direct `if (Array.isArray(x)) { x.push(1) }` (braced or not), `if (Array.isArray(x)) x.push(1); else ...`'s consequent, `if (!Array.isArray(x)) { ... } else { x.push(1) }`'s alternate, `Array.isArray(x) && x.push(1)`, the ternary `Array.isArray(x) ? x.push(1) : ...`, and the early-return/early-throw idiom `if (!Array.isArray(x)) return; x.push(1);` (a preceding sibling statement in the same block, per definitelyExits above).
    function isGuardedByArrayIsArray(
      startNode: TSESTree.Node,
      parameterVariable: TSESLint.Scope.Variable,
      ruleContext: Readonly<TSESLint.RuleContext<'unsound', []>>,
    ): boolean {
      let current: TSESTree.Node = startNode;
      while (current.parent) {
        const { parent } = current;
        if (parent.type === AST_NODE_TYPES.IfStatement) {
          if (parent.consequent === current && matchesArrayIsArrayOn(parent.test, parameterVariable, ruleContext)) return true;
          if (parent.alternate === current && isNegatedArrayIsArrayCall(parent.test, parameterVariable, ruleContext)) return true;
        }
        if (
          parent.type === AST_NODE_TYPES.LogicalExpression &&
          parent.operator === '&&' &&
          parent.right === current &&
          matchesArrayIsArrayOn(parent.left, parameterVariable, ruleContext)
        ) {
          return true;
        }
        if (
          parent.type === AST_NODE_TYPES.ConditionalExpression &&
          parent.consequent === current &&
          matchesArrayIsArrayOn(parent.test, parameterVariable, ruleContext)
        ) {
          return true;
        }
        current = parent;
      }
      return isGuardedByPrecedingEarlyReturn(startNode, parameterVariable, ruleContext);
    }

    // Walks the statement enclosing startNode back through its preceding siblings in the same block, looking for `if (!Array.isArray(x)) <exits>;` -- the early-return/early-throw idiom, where the mutating call is not nested inside any conditional at all.
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
                isNegatedArrayIsArrayCall(sibling.test, parameterVariable, ruleContext) &&
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

export default noArrayIsArrayMutation;
