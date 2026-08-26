import { AST_NODE_TYPES, ESLintUtils, TSESLint, type TSESTree } from '@typescript-eslint/utils';

// Object.assign's own overload signatures merge the target and source parameter types without checking that a source object's properties are actually assignable to the corresponding property on the target -- confirmed directly: given `const f: { bar: string } = { bar: 'x' }`, `Object.assign(f, { bar: 42 })` passes `tsc --strict` with zero errors, while the equivalent direct assignment `f.bar = 42` is correctly rejected as `Type 'number' is not assignable to type 'string'`. This holds for a literal, non-computed property key too -- the hole is in Object.assign's own typing, not specific to a computed key or a generic call site. Object spread (`{ ...target, ...source }`) does not carry this hole: TypeScript checks a spread's resulting object literal against its target type the normal way.
//
// Two genuinely different autofix situations, handled differently:
//  - `Object.assign({...}, ...sources)` where the target is a FRESH object literal has no pre-existing
// binding anything else could be aliasing, so rewriting it to `{ ...targetProps, ...sources }` is always safe -- offered as a real, automatic fix.
//  - `Object.assign(existingVar, ...sources)` mutates a pre-existing binding in place; rewriting it to
// `existingVar = { ...existingVar, ...sources }` changes existingVar's identity to a new object, which is only safe when nothing else holds a reference to the original expecting to observe the mutation, and that can't be proven from local analysis alone. Offered as a suggestion (never an automatic fix), and only when the binding is genuinely reassignable (never `const`), so a developer consciously chooses it.

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`,
);

// Resolve `name` the way the runtime would from a given scope: innermost binding outwards. Mirrors the same helper in no-pointless-reassignment.ts.
function resolveFrom(scope: TSESLint.Scope.Scope | null, name: string): TSESLint.Scope.Variable | undefined {
  for (let current = scope; current; current = current.upper) {
    const found = current.set.get(name);
    if (found) return found;
  }
  return undefined;
}

const noObjectAssign = createRule({
  name: 'no-object-assign',
  meta: {
    type: 'problem',
    fixable: 'code',
    hasSuggestions: true,
    docs: {
      description:
        "Disallow Object.assign, whose own type declarations do not check a source object's properties against the target's declared types -- object spread does.",
    },
    schema: [],
    messages: {
      unsound:
        "Object.assign does not verify that a source object's properties are assignable to the target's declared types, so a type mismatch here passes silently where a direct property assignment would be rejected. Use object spread ({ ...target, ...source }) to build a correctly type-checked replacement instead.",
      suggestSpreadReassign:
        'Replace with object spread and reassignment (changes the object reference -- anything else already holding this object will not see the update).',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (
          !(
            callee.type === AST_NODE_TYPES.MemberExpression &&
            !callee.computed &&
            callee.object.type === AST_NODE_TYPES.Identifier &&
            callee.object.name === 'Object' &&
            callee.property.type === AST_NODE_TYPES.Identifier &&
            callee.property.name === 'assign'
          )
        ) {
          return;
        }

        const [target, ...sources] = node.arguments;
        const sourcesAreSpreadable = sources.every((argument) => argument.type !== AST_NODE_TYPES.SpreadElement);

        // Case A: fresh object literal target -- no pre-existing binding, always safe to rewrite.
        if (target?.type === AST_NODE_TYPES.ObjectExpression && sourcesAreSpreadable) {
          // A leading `{` is ambiguous at the start of an ExpressionStatement (parsed as a block, not an object literal) -- wrap in parens exactly when this call is the statement's entire expression.
          const isBareStatement = node.parent.type === AST_NODE_TYPES.ExpressionStatement && node.parent.expression === node;
          context.report({
            node,
            messageId: 'unsound',
            fix(fixer) {
              const targetProps = target.properties.map((property) => context.sourceCode.getText(property));
              const sourceSpreads = sources.map((argument) => `...${context.sourceCode.getText(argument)}`);
              const objectLiteral = `{ ${[...targetProps, ...sourceSpreads].join(', ')} }`;
              return fixer.replaceText(node, isBareStatement ? `(${objectLiteral})` : objectLiteral);
            },
          });
          return;
        }

        // Case B: an existing identifier, mutated as a bare statement -- offer a suggestion only, and only when the binding is genuinely reassignable.
        if (
          target?.type === AST_NODE_TYPES.Identifier &&
          sourcesAreSpreadable &&
          node.parent.type === AST_NODE_TYPES.ExpressionStatement &&
          node.parent.expression === node
        ) {
          const targetName = target.name;
          const scope = context.sourceCode.getScope(node);
          const variable = resolveFrom(scope, targetName);
          // `.parent` (the enclosing VariableDeclaration) lives on the Definition itself for a 'Variable' definition, not on its `.node` (a plain VariableDeclarator, which carries no `.parent` in these ESTree types) -- see TSESLint.Scope.DefinitionType.
          const definition = variable?.defs.find((candidate) => candidate.type === TSESLint.Scope.DefinitionType.Variable);
          const isConst = definition?.parent.kind === 'const';
          const statement: TSESTree.ExpressionStatement = node.parent;

          if (variable && !isConst) {
            context.report({
              node,
              messageId: 'unsound',
              suggest: [
                {
                  messageId: 'suggestSpreadReassign',
                  fix(fixer) {
                    const sourceSpreads = sources.map((argument) => `...${context.sourceCode.getText(argument)}`);
                    return fixer.replaceText(statement, `${targetName} = { ...${targetName}, ${sourceSpreads.join(', ')} };`);
                  },
                },
              ],
            });
            return;
          }
        }

        context.report({ node, messageId: 'unsound' });
      },
    };
  },
});

export default noObjectAssign;
