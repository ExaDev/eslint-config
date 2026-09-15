import type { Rule, Scope } from 'eslint';

// Detects and auto-fixes redundant alias declarations — `const foo = bar` where both sides are plain identifiers and the alias adds no transformation. The fixer replaces all reads of the alias with the original name and removes the declaration. Variables prefixed with `_` are exempt (discard convention). Aliases that are written to after declaration are not auto-fixed (scope mutation), nor is an alias read as a shorthand object property (`{ x }` from `const x = y` would need its key rewritten to `{ x: y }`, which a plain text-replacement fixer cannot do safely), nor one carrying an explicit type annotation, nor one whose reads sit where the original name is shadowed (see the individual bail-out comments in `fix` below).
//
// A scope reference's own `identifier` field is typed `ESTree.Identifier | JSXIdentifier` (eslint's own Scope.Reference), but `JSXIdentifier` isn't itself an exported type from `eslint` — there is nothing to import or name directly. `IdentifierReference` narrows to the `Identifier` branch structurally via `Extract`, and `isIdentifierReference` is the real (non-`as`) type-guard predicate that performs the narrowing at the one place a reference's identifier is actually read (this codebase bans type assertions entirely — see `@typescript-eslint/consistent-type-assertions` in eslint.config.ts).
type Identifier = Extract<Scope.Reference['identifier'], { type: 'Identifier' }>;
type IdentifierReference = Scope.Reference & { identifier: Identifier };

function isIdentifierReference(reference: Scope.Reference): reference is IdentifierReference {
  return reference.identifier.type === 'Identifier';
}

// `typeAnnotation` is a typescript-eslint extension to the ESTree `Identifier` node, so it isn't present on the `estree` type this rule is written against. `in` narrows structurally without a type assertion (this codebase bans them outright — see `@typescript-eslint/consistent-type-assertions` in eslint.config.ts). A real parse never sets this field to `null` (confirmed directly: the typescript-eslint parser always sets `typeAnnotation` to either a real `TSTypeAnnotation` node or `undefined`, never `null`), so only the `undefined` case needs checking here.
function hasTypeAnnotation(id: Identifier): boolean {
  return 'typeAnnotation' in id && id.typeAnnotation !== undefined;
}

// A VariableDeclarator's own parent is always a VariableDeclaration by grammar — no other node type can directly contain one, even inside a `for (const x of y)` loop's own init position — but eslint's own types don't encode that relationship, so this narrows it explicitly rather than assuming it away with a cast. Exported so the throw is exercised directly against a deliberately impossible parent type.
export function isConstDeclarator(declarator: { readonly parent: { readonly type: string; readonly kind?: string } }): boolean {
  if (declarator.parent.type !== 'VariableDeclaration') {
    throw new Error(`Unreachable: expected a VariableDeclarator's own parent to be a VariableDeclaration, got "${declarator.parent.type}" instead.`);
  }
  return declarator.parent.kind === 'const';
}

// `scope.set` is guaranteed to hold `name` at the one real call site in this file: `scope` is the exact VariableDeclarator's own containing scope, and `name` is the very name it declares in it. Exported so that guarantee is checked directly against a deliberately absent name, rather than assumed away with a cast.
export function variableInScope(scope: Scope.Scope, name: string): Scope.Variable {
  const variable = scope.set.get(name);
  if (variable === undefined) {
    throw new Error(`Unreachable: expected scope.set to hold a variable named "${name}".`);
  }
  return variable;
}

// Resolve `name` the way the runtime would from a given scope: innermost binding outwards. Returns undefined for an unresolved (global/implicit) name. Exported so its own "genuinely unresolved" path — unreachable from a real fixture, since this rule never calls it for a name that wasn't already resolved at the alias's own declaration — can be exercised directly against a scratch scope chain.
export function resolveFrom(scope: Scope.Scope | null, name: string): Scope.Variable | undefined {
  for (let current = scope; current; current = current.upper) {
    const found = current.set.get(name);
    if (found) return found;
  }
  return undefined;
}

// The actual backward walk, factored out into a plain function over a plain array of already-fetched tokens (rather than repeated sourceCode.getTokenBefore cursor calls) specifically so it can be tested directly with an ordinary array literal — no interface needed to stand in for ESLint's own overloaded, cursor-based SourceCode methods. Walking backward from the tail: an immediately-preceding '{' or ',' is always the start of THIS property (nothing but the enclosing brace or the previous property's own separator can appear directly before a value ending in '}'/','), so both confirm shorthand immediately; an immediately-preceding '[', '(', or ':' means this read is instead the tail of a nested expression (an array/call/ternary value) rather than the property's own bare key, so those bail out unresolved; some OTHER token (e.g. '=>' in a shorthand-method-like arrow body) keeps walking. Confirmed as a real bug via `{ a: 1, foo }` incorrectly resolving through the prior property's own colon and silently renaming the shorthand key itself when a fix that continued past a ',' rather than stopping at it was tried during this rule's own development. Exported so its own final "exhausted the whole list" fallback — unreachable via any real fixture, since real syntax can never produce a '}'/',' -terminated token run with no enclosing '{'/'['/'('/':' anywhere before it — is checked directly against a deliberately empty token list.
export function hasEnclosingShorthandBoundary(precedingTokens: readonly { readonly value: string }[]): boolean {
  for (const token of [...precedingTokens].reverse()) {
    if (token.value === '{' || token.value === ',') return true;
    if (token.value === '[' || token.value === '(' || token.value === ':') return false;
  }
  return false;
}

// True when `identifier` is read as an object-literal shorthand property ({ x } from const x = y) — rewriting { x } -> { x: original } needs a key change replaceText can't do safely. A read whose own next token is '}' or ',' is already confirmed to sit at the tail of some comma-separated list ending in '}'; see hasEnclosingShorthandBoundary above for what happens from there.
export function isShorthandPropertyRead(sourceCode: Rule.RuleContext['sourceCode'], identifier: Identifier): boolean {
  const afterToken = sourceCode.getTokenAfter(identifier);
  if (afterToken?.value === ':') return false;
  if (afterToken?.value !== '}' && afterToken?.value !== ',') return false;
  return hasEnclosingShorthandBoundary(sourceCode.getTokensBefore(identifier));
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
        // Only flag const — let/var aliases are often intentional mutable copies.
        if (!isConstDeclarator(node)) return;

        const scope = context.sourceCode.getScope(node);

        // Bail out before reporting at all (not just before fixing) when the source is ever mutated anywhere in its own scope: `const start = cursor;` immediately before a loop advances `cursor` is a deliberate snapshot of a mutable value at a point in time, not a pointless alias — collapsing it would silently change which value every later read of `start` observes to whatever `cursor` holds by then. A source that can't be resolved at all (an unrecognised global) is treated the same way, conservatively. `!reference.init` excludes the source variable's own declaring initializer, which is itself a write.
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
            const variable = variableInScope(scope, aliasName);

            // An explicit type annotation is load-bearing: `const exhaustive: never = item` is an exhaustiveness check whose entire purpose is the annotation, and narrowing/branding annotations behave the same way. Collapsing the alias deletes a compile-time guarantee the bare original does not carry, so report without offering a fix.
            if (aliasIsAnnotated) return null;

            // Abort if the alias is mutated after the initial write.
            const mutationRefs = variable.references.filter((reference) => reference.isWrite() && reference.identifier !== node.id);
            if (mutationRefs.length > 0) return null;

            const readReferences = variable.references.filter((reference) => reference.isRead());
            const readRefs = readReferences.filter(isIdentifierReference);
            // A read this fixer cannot safely rewrite by plain text replacement (a JSX component tag, `<Foo />`, whose identifier is a JSXIdentifier rather than a plain Identifier) blocks the whole fix: removing the declaration would leave that read referring to a binding that no longer exists.
            if (readRefs.length !== readReferences.length) return null;

            if (readRefs.some((reference) => isShorthandPropertyRead(context.sourceCode, reference.identifier))) return null;

            // Abort when the original name is shadowed at any read site: substituting the text there would silently rebind the read to whatever `originalName` means in that scope rather than to the source. `const bar = 1; const foo = bar; function g(bar) { return foo + bar; }` collapses to `return bar + bar`, reading the parameter instead of the outer constant — a behaviour change, not a refactor.
            const isShadowedAtAnyRead = readRefs.some((reference) => resolveFrom(reference.from, originalName) !== sourceVariable);
            if (isShadowedAtAnyRead) return null;

            const fixes = readRefs.map((reference) => fixer.replaceText(reference.identifier, originalName));

            // Remove the whole declaration only when this is the sole declarator.
            const declaration = node.parent;
            if (declaration.type !== 'VariableDeclaration' || declaration.declarations.length !== 1) return null;
            // Remove the enclosing `export` statement rather than just the declaration it wraps — deleting only the VariableDeclaration out of `export const foo = bar;` leaves a bare `export` keyword behind, which does not parse.
            fixes.push(fixer.remove(declaration.parent.type === 'ExportNamedDeclaration' ? declaration.parent : declaration));
            return fixes;
          },
        });
      },
    };
  },
};

export default noPointlessReassignment;
