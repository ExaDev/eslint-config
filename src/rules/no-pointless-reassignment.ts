import type { Rule, Scope } from 'eslint';

// Detects and auto-fixes redundant alias declarations -- `const foo = bar` where both sides are plain identifiers and the alias adds no transformation. The fixer replaces all reads of the alias with the original name and removes the declaration. Variables prefixed with `_` are exempt (discard convention). Aliases that are written to after declaration are not auto-fixed (scope mutation), nor is an alias read as a shorthand object property (`{ x }` from `const x = y` would need its key rewritten to `{ x: y }`, which a plain text-replacement fixer cannot do safely), nor one carrying an explicit type annotation, nor one whose reads sit where the original name is shadowed (see the individual bail-out comments in `fix` below).
//
// A scope reference's own `identifier` field is typed `ESTree.Identifier | JSXIdentifier` (eslint's own Scope.Reference), but `JSXIdentifier` isn't itself an exported type from `eslint` -- there is nothing to import or name directly. `IdentifierReference` narrows to the `Identifier` branch structurally via `Extract`, and `isIdentifierReference` is the real (non-`as`) type-guard predicate that performs the narrowing at the one place a reference's identifier is actually read (this codebase bans type assertions entirely -- see `@typescript-eslint/consistent-type-assertions` in eslint.config.ts).
type Identifier = Extract<Scope.Reference['identifier'], { type: 'Identifier' }>;
type IdentifierReference = Scope.Reference & { identifier: Identifier };

function isIdentifierReference(reference: Scope.Reference): reference is IdentifierReference {
  return reference.identifier.type === 'Identifier';
}

// `typeAnnotation` is a typescript-eslint extension to the ESTree `Identifier` node, so it isn't present on the `estree` type this rule is written against. `in` narrows structurally without a type assertion (this codebase bans them outright -- see `@typescript-eslint/consistent-type-assertions` in eslint.config.ts).
function hasTypeAnnotation(id: Identifier): boolean {
  return 'typeAnnotation' in id && id.typeAnnotation !== undefined && id.typeAnnotation !== null;
}

// Resolve `name` the way the runtime would from a given scope: innermost binding outwards. Returns undefined for an unresolved (global/implicit) name.
function resolveFrom(scope: Scope.Scope | null, name: string): Scope.Variable | undefined {
  for (let current = scope; current; current = current.upper) {
    const found = current.set.get(name);
    if (found) return found;
  }
  return undefined;
}

const noPointlessReassignment: Rule.RuleModule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: {
      pointlessReassignment: "Pointless reassignment: '{{ name }}' is just an alias for '{{ value }}'. Use the original directly.",
    },
  },
  create(context) {
    return {
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier' || node.init?.type !== 'Identifier' || node.id.name.startsWith('_')) return;
        // Only flag const -- let/var aliases are often intentional mutable copies.
        if (node.parent.type !== 'VariableDeclaration' || node.parent.kind !== 'const') return;

        const scope = context.sourceCode.getScope(node);

        // Bail out before reporting at all (not just before fixing) when the source is ever mutated anywhere in its own scope: `const start = cursor;` immediately before a loop advances `cursor` is a deliberate snapshot of a mutable value at a point in time, not a pointless alias -- collapsing it would silently change which value every later read of `start` observes to whatever `cursor` holds by then. A source that can't be resolved at all (an unrecognised global) is treated the same way, conservatively. `!reference.init` excludes the source variable's own declaring initializer, which is itself a write.
        const sourceReference = scope.references.find((reference) => reference.identifier === node.init);
        const sourceVariable = sourceReference?.resolved;
        if (!sourceVariable || sourceVariable.references.some((reference) => reference.isWrite() && reference.init !== true)) return;

        const aliasName = node.id.name;
        const originalName = node.init.name;
        // Read outside `fix` because narrowing of `node.id` to an Identifier does not survive into the nested closure.
        const aliasIsAnnotated = hasTypeAnnotation(node.id);

        context.report({
          node,
          messageId: 'pointlessReassignment',
          data: { name: aliasName, value: originalName },
          fix(fixer) {
            const variable = scope.set.get(aliasName);
            if (!variable) return null;

            // An explicit type annotation is load-bearing: `const exhaustive: never = item` is an exhaustiveness check whose entire purpose is the annotation, and narrowing/branding annotations behave the same way. Collapsing the alias deletes a compile-time guarantee the bare original does not carry, so report without offering a fix.
            if (aliasIsAnnotated) return null;

            // Abort if the alias is mutated after the initial write.
            const mutationRefs = variable.references.filter((reference) => reference.isWrite() && reference.identifier !== node.id);
            if (mutationRefs.length > 0) return null;

            const readRefs = variable.references.filter((reference): reference is IdentifierReference => reference.isRead() && isIdentifierReference(reference));

            // Abort when any read is a shorthand property ({ x } from const x = y) -- rewriting { x } -> { x: original } needs a key change replaceText can't do safely.
            const hasShorthand = readRefs.some((reference) => {
              const afterToken = context.sourceCode.getTokenAfter(reference.identifier);
              if (afterToken?.value === ':') return false;
              if (afterToken?.value !== '}' && afterToken?.value !== ',') return false;
              let token = context.sourceCode.getTokenBefore(reference.identifier);
              while (token) {
                if (token.value === '{') return true;
                if (token.value === '[' || token.value === '(') return false;
                if (token.value === ':') return false;
                token = context.sourceCode.getTokenBefore(token);
              }
              return false;
            });
            if (hasShorthand) return null;

            // Abort when the original name is shadowed at any read site: substituting the text there would silently rebind the read to whatever `originalName` means in that scope rather than to the source. `const bar = 1; const foo = bar; function g(bar) { return foo + bar; }` collapses to `return bar + bar`, reading the parameter instead of the outer constant -- a behaviour change, not a refactor.
            const isShadowedAtAnyRead = readRefs.some((reference) => resolveFrom(reference.from, originalName) !== sourceVariable);
            if (isShadowedAtAnyRead) return null;

            const fixes = readRefs.map((reference) => fixer.replaceText(reference.identifier, originalName));

            // Remove the whole declaration only when this is the sole declarator.
            const declaration = node.parent;
            if (declaration.type !== 'VariableDeclaration' || declaration.declarations.length !== 1) return null;
            // Remove the enclosing `export` statement rather than just the declaration it wraps -- deleting only the VariableDeclaration out of `export const foo = bar;` leaves a bare `export` keyword behind, which does not parse.
            fixes.push(fixer.remove(declaration.parent.type === 'ExportNamedDeclaration' ? declaration.parent : declaration));
            return fixes;
          },
        });
      },
    };
  },
};

export default noPointlessReassignment;
