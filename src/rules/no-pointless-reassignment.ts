import type { Rule, Scope } from 'eslint';

// Detects and auto-fixes redundant alias declarations — `const foo = bar` where both sides are plain identifiers and the alias adds no transformation. The fixer replaces all reads of the alias with the original name and removes the declaration. Variables prefixed with `_` are exempt (discard convention). Aliases that are written to after declaration are not auto-fixed (scope mutation), nor is an alias read as a shorthand object property (`{ x }` from `const x = y` would need its key rewritten to `{ x: y }`, which a plain text-replacement fixer cannot do safely), nor one carrying an explicit type annotation, nor one whose reads sit where the original name is shadowed (see the individual bail-out comments in `fix` below). An alias that is itself part of the module's exported surface (`export const alias = original;`, a later `export { alias }`/`export { alias as other }`, or `export default alias;`) is neither reported nor fixed at all, since collapsing it would rename or delete a binding every importer of this module depends on; see isExportedAlias below.
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

// The identical grammar guarantee isConstDeclarator above already relies on and documents, but returning the narrowed value itself (rather than a boolean) so every later access to the result's own `.declarations`/`.kind`/`.parent` flows without a further type-level check, matching this file's own asExpression/asTypeReference-style helpers elsewhere in this codebase (see src/rules/ts-node-guards.ts). Exported so the throw is exercised directly, the same way isConstDeclarator's own is.
export function asVariableDeclaration(node: Rule.Node): Extract<Rule.Node, { readonly type: 'VariableDeclaration' }> {
  if (node.type !== 'VariableDeclaration') {
    throw new Error(`Unreachable: expected a VariableDeclarator's own parent to be a VariableDeclaration, got "${node.type}" instead.`);
  }
  return node;
}

// getScope(Program) itself returns the outer "global" scope, not the scope a top-level binding actually lives in: under sourceType "module" every top-level const/let sits in a "module" scope that is a CHILD of global, so resolving straight from the global scope would never find one. Falling back to the global scope itself covers sourceType "script", where there is no separate module scope and top-level bindings live directly in it. Exported so the fallback branch is exercised directly against a deliberately module-scope-less fake scope: in practice, sourceType "module" always produces a real module child scope regardless of a file's own content, and sourceType "script" can never syntactically contain an export statement for isExportedAlias to resolve against, so no real fixture reaches the fallback either way.
export function findTopLevelScope(globalScope: Scope.Scope): Scope.Scope {
  return globalScope.childScopes.find((child) => child.type === 'module') ?? globalScope;
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
  // A ':' is already excluded by the check below (it is neither '}' nor ','), so no separate check for it is needed on top.
  if (afterToken?.value !== '}' && afterToken?.value !== ',') return false;
  return hasEnclosingShorthandBoundary(sourceCode.getTokensBefore(identifier));
}

// Structural, not the full ESTree union: a narrow interface matching this file's existing style (see isConstDeclarator above) rather than importing large upstream node types wholesale. `name` is optional rather than this being a proper `type: 'Identifier'`-discriminated union, since a two-member union whose second branch is the unconstrained `{ type: string }` isn't actually discriminated (that branch's own wide `type` field already covers the literal `'Identifier'` too), so a `.type === 'Identifier'` check alone would never narrow `.name` into scope. An ExportSpecifier's own local/exported fields are typed `Identifier | Literal` upstream (a Literal only ever appears for a string-named re-export forwarded from another module, which the `source == null` guard in isExportedAlias below already excludes from consideration), and an ExportDefaultDeclaration's own declaration is typed as a large expression/declaration union whose non-Identifier members never carry a `name` field at all.
interface MaybeIdentifier {
  readonly type: string;
  readonly name?: string;
}

interface ExportSpecifierLike {
  readonly local: MaybeIdentifier;
}

interface ProgramStatementLike {
  readonly type: string;
  readonly source?: unknown;
  readonly specifiers?: readonly ExportSpecifierLike[];
  readonly declaration?: MaybeIdentifier | null | undefined;
}

// True when the alias `const` binding `aliasVariable` names is itself part of the module's own exported surface: `export const alias = original;` (declarationParentType is 'ExportNamedDeclaration', since that is the alias's own VariableDeclaration's parent in that shape), a later top-level `export { alias }`/`export { alias as other }`, or `export default alias;`. An exported binding is part of the module's interface, so collapsing every read of it to the original name is not a local rewrite: it renames (or, for a direct `export const`, deletes outright) something every importer of this module depends on by that exact name. `resolve`, which is `resolveFrom` closed over the module's own top-level scope, matches a specifier/default identifier against `aliasVariable` by real scope identity rather than by name alone, so a nested, differently-scoped local sharing a name with some unrelated top-level export is never mistaken for that export: resolving that name from module scope finds the real top-level binding, not the nested one. A specifier whose export carries its own `source` (`export { x } from './other'`) never refers to a local binding at all, since it forwards a name straight from another module, so those statements are skipped entirely rather than matched by name.
export function isExportedAlias(declarationParentType: string, programBody: readonly ProgramStatementLike[], resolve: (name: string) => Scope.Variable | undefined, aliasVariable: Scope.Variable): boolean {
  if (declarationParentType === 'ExportNamedDeclaration') return true;
  return programBody.some((statement) => {
    if (statement.type === 'ExportNamedDeclaration' && statement.source == null) {
      return (statement.specifiers ?? []).some((specifier) => specifier.local.type === 'Identifier' && specifier.local.name !== undefined && resolve(specifier.local.name) === aliasVariable);
    }
    const target = statement.type === 'ExportDefaultDeclaration' ? statement.declaration : undefined;
    return target?.type === 'Identifier' && target.name !== undefined && resolve(target.name) === aliasVariable;
  });
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
    // Computed once per file rather than per declarator: every specifier/default export check in isExportedAlias resolves names against this same top-level scope.
    const moduleScope = findTopLevelScope(context.sourceCode.getScope(context.sourceCode.ast));

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
        const variable = variableInScope(scope, aliasName);
        const declaration = asVariableDeclaration(node.parent);

        // An alias that is itself part of the module's exported surface is neither reported nor fixed, unlike every other bail-out below (type annotation, mutation, shorthand, shadowing), which report but decline to fix: reporting "pointless" here would itself be misleading, since the alias is doing real interface work. See isExportedAlias above for the three shapes this covers.
        if (isExportedAlias(declaration.parent.type, context.sourceCode.ast.body, (name) => resolveFrom(moduleScope, name), variable)) return;

        context.report({
          node,
          messageId: 'pointlessReassignment',
          data: { name: aliasName, value: originalName },
          fix(fixer) {
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

            // Remove the whole declaration only when this is the sole declarator. The exported form (`export const foo = bar;`) never reaches this fixer at all, since isExportedAlias above already bailed out before context.report for every exported shape, so removing only the plain VariableDeclaration is always the correct (and only reachable) removal.
            if (declaration.declarations.length !== 1) return null;
            fixes.push(fixer.remove(declaration));
            return fixes;
          },
        });
      },
    };
  },
};

export default noPointlessReassignment;
