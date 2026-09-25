import type { Rule, Scope } from 'eslint';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import tseslint from 'typescript-eslint';
import rule, { asVariableDeclaration, findTopLevelScope, hasEnclosingShorthandBoundary, isConstDeclarator, isExportedAlias, resolveFrom, variableInScope } from './no-pointless-reassignment';

describe('rule metadata', () => {
  it('carries the exact reported message text', () => {
    expect(rule.meta?.messages?.['pointlessReassignment']).toBe(
      "Pointless reassignment: '{{ name }}' is just an alias for '{{ value }}'. Use the original directly.",
    );
  });
});

describe('isConstDeclarator', () => {
  it('returns true for a const declarator', () => {
    expect(isConstDeclarator({ parent: { type: 'VariableDeclaration', kind: 'const' } })).toBe(true);
  });

  it('returns false for a let declarator', () => {
    expect(isConstDeclarator({ parent: { type: 'VariableDeclaration', kind: 'let' } })).toBe(false);
  });

  it('throws for a parent that is not a VariableDeclaration — an invariant no real fixture can reach, since a VariableDeclarator is only ever produced by the grammar as a VariableDeclaration\'s own child', () => {
    expect(() => isConstDeclarator({ parent: { type: 'ExpressionStatement' } })).toThrow(/Unreachable/);
  });
});

describe('asVariableDeclaration', () => {
  // Captures real nodes from a genuine (throwaway) rule run, rather than hand-constructing fake ones: a real Rule.Node's own shape (range, loc, parent, and everything else) is only ever produced by a real parse.
  let capturedVariableDeclaration: Rule.Node | undefined;
  let capturedNonDeclaration: Rule.Node | undefined;
  const probe: Rule.RuleModule = {
    meta: { schema: [] },
    create() {
      return {
        VariableDeclaration(node) {
          capturedVariableDeclaration = node;
        },
        ExpressionStatement(node) {
          capturedNonDeclaration = node;
        },
      };
    },
  };
  new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } }).run('probe', probe, {
    valid: ['const foo = 1;\nfoo;'],
    invalid: [],
  });

  it('returns the node unchanged when it really is a VariableDeclaration', () => {
    const node = capturedVariableDeclaration;
    if (node === undefined) throw new Error('Unreachable: expected the probe rule above to have captured a VariableDeclaration.');
    expect(asVariableDeclaration(node)).toBe(node);
  });

  it('throws for a node that is not a VariableDeclaration, an invariant no real fixture can reach since this rule only ever calls it on a VariableDeclarator\'s own parent', () => {
    const node = capturedNonDeclaration;
    if (node === undefined) throw new Error('Unreachable: expected the probe rule above to have captured an ExpressionStatement.');
    expect(() => asVariableDeclaration(node)).toThrow(/Unreachable/);
  });
});

describe('isExportedAlias', () => {
  const aliasVariable = {} as Scope.Variable;
  const otherVariable = {} as Scope.Variable;

  it('returns true immediately for a direct "export const alias = original;" without even inspecting the program body', () => {
    // An empty programBody and a resolve that always returns undefined prove the true result came from declarationParentType alone, not from a stray specifier/default match below.
    expect(isExportedAlias('ExportNamedDeclaration', [], () => undefined, aliasVariable)).toBe(true);
  });

  it('returns false when the declaration sits at the top level with no matching export anywhere', () => {
    expect(isExportedAlias('Program', [], () => undefined, aliasVariable)).toBe(false);
  });

  it('returns true for a later top-level "export { alias };"', () => {
    const programBody = [{ type: 'ExportNamedDeclaration', specifiers: [{ local: { type: 'Identifier', name: 'alias' } }] }];
    expect(isExportedAlias('Program', programBody, () => aliasVariable, aliasVariable)).toBe(true);
  });

  it('returns false when a specifier\'s local name resolves to a different variable, a nested differently-scoped local sharing a name with an unrelated top-level export', () => {
    const programBody = [{ type: 'ExportNamedDeclaration', specifiers: [{ local: { type: 'Identifier', name: 'alias' } }] }];
    expect(isExportedAlias('Program', programBody, () => otherVariable, aliasVariable)).toBe(false);
  });

  it('skips a specifier whose local is not a plain Identifier', () => {
    const programBody = [{ type: 'ExportNamedDeclaration', specifiers: [{ local: { type: 'Literal' } }] }];
    expect(isExportedAlias('Program', programBody, () => aliasVariable, aliasVariable)).toBe(false);
  });

  it('skips a specifier whose local is not a plain Identifier even when it happens to carry a matching name', () => {
    // Distinct from the case above: this specifier's local DOES carry a name, so only the type check itself (not the name-presence check) can be what excludes it.
    const programBody = [{ type: 'ExportNamedDeclaration', specifiers: [{ local: { type: 'Literal', name: 'alias' } }] }];
    expect(isExportedAlias('Program', programBody, () => aliasVariable, aliasVariable)).toBe(false);
  });

  it('skips a specifier whose local carries no name at all', () => {
    const programBody = [{ type: 'ExportNamedDeclaration', specifiers: [{ local: { type: 'Identifier' } }] }];
    expect(isExportedAlias('Program', programBody, () => aliasVariable, aliasVariable)).toBe(false);
  });

  it('falls back to an empty specifier list when specifiers is absent, never true of a real ExportNamedDeclaration whose own grammar always provides an array', () => {
    const programBody = [{ type: 'ExportNamedDeclaration' }];
    expect(isExportedAlias('Program', programBody, () => aliasVariable, aliasVariable)).toBe(false);
  });

  it('never matches a re-export forwarded from another module: "export { alias } from \'./other\'" refers to a binding in that module, not the local one', () => {
    const programBody = [{ type: 'ExportNamedDeclaration', source: './other', specifiers: [{ local: { type: 'Identifier', name: 'alias' } }] }];
    expect(isExportedAlias('Program', programBody, () => aliasVariable, aliasVariable)).toBe(false);
  });

  it('returns true for "export default alias;"', () => {
    const programBody = [{ type: 'ExportDefaultDeclaration', declaration: { type: 'Identifier', name: 'alias' } }];
    expect(isExportedAlias('Program', programBody, () => aliasVariable, aliasVariable)).toBe(true);
  });

  it('returns false for "export default alias;" whose identifier resolves to a different variable', () => {
    const programBody = [{ type: 'ExportDefaultDeclaration', declaration: { type: 'Identifier', name: 'alias' } }];
    expect(isExportedAlias('Program', programBody, () => otherVariable, aliasVariable)).toBe(false);
  });

  it('skips an "export default" whose own declaration is not a plain Identifier (a function/class/expression default export)', () => {
    const programBody = [{ type: 'ExportDefaultDeclaration', declaration: { type: 'FunctionDeclaration' } }];
    expect(isExportedAlias('Program', programBody, () => aliasVariable, aliasVariable)).toBe(false);
  });

  it('skips an "export default" whose own declaration carries no name at all', () => {
    const programBody = [{ type: 'ExportDefaultDeclaration', declaration: { type: 'Identifier' } }];
    expect(isExportedAlias('Program', programBody, () => aliasVariable, aliasVariable)).toBe(false);
  });

  it('treats a missing declaration the same as a non-Identifier one, never true of a real ExportDefaultDeclaration whose own grammar always provides one', () => {
    const programBody = [{ type: 'ExportDefaultDeclaration' }];
    expect(isExportedAlias('Program', programBody, () => aliasVariable, aliasVariable)).toBe(false);
  });

  it('ignores a statement that is neither an export specifier list nor an export default', () => {
    const programBody = [{ type: 'ImportDeclaration' }];
    expect(isExportedAlias('Program', programBody, () => aliasVariable, aliasVariable)).toBe(false);
  });

  it('never treats an unrelated statement\'s own "declaration" field as an export default, even when it happens to be a matching Identifier', () => {
    // Only ExportDefaultDeclaration's own declaration is ever consulted: some other statement shape that coincidentally also has a "declaration" property must not be read as one.
    const programBody = [{ type: 'ImportDeclaration', declaration: { type: 'Identifier', name: 'alias' } }];
    expect(isExportedAlias('Program', programBody, () => aliasVariable, aliasVariable)).toBe(false);
  });

  it('keeps scanning past a non-matching statement to find a later matching one', () => {
    const programBody = [{ type: 'ImportDeclaration' }, { type: 'ExportNamedDeclaration', specifiers: [{ local: { type: 'Identifier', name: 'alias' } }] }];
    expect(isExportedAlias('Program', programBody, () => aliasVariable, aliasVariable)).toBe(true);
  });
});

describe('findTopLevelScope', () => {
  // Captures a real global scope from a genuine (throwaway) rule run under each sourceType, rather than hand-constructing one: eslint-scope's own module/global Scope objects are only ever produced by a real scope analysis pass.
  let moduleGlobalScope: Scope.Scope | undefined;
  const moduleProbe: Rule.RuleModule = {
    meta: { schema: [] },
    create(context) {
      return {
        Program(node) {
          moduleGlobalScope = context.sourceCode.getScope(node);
        },
      };
    },
  };
  new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } }).run('module-probe', moduleProbe, {
    valid: ['const foo = 1;'],
    invalid: [],
  });

  let scriptGlobalScope: Scope.Scope | undefined;
  const scriptProbe: Rule.RuleModule = {
    meta: { schema: [] },
    create(context) {
      return {
        Program(node) {
          scriptGlobalScope = context.sourceCode.getScope(node);
        },
      };
    },
  };
  new RuleTester({ languageOptions: { sourceType: 'script', ecmaVersion: 2020 } }).run('script-probe', scriptProbe, {
    valid: ['var foo = 1;'],
    invalid: [],
  });

  it('returns the module child scope when getScope(Program) is the outer global scope, as under sourceType "module"', () => {
    const scope = moduleGlobalScope;
    if (scope === undefined) throw new Error('Unreachable: expected the module probe rule above to have captured a scope.');
    expect(findTopLevelScope(scope).type).toBe('module');
  });

  it('falls back to the global scope itself when it has no module child, as under sourceType "script"', () => {
    const scope = scriptGlobalScope;
    if (scope === undefined) throw new Error('Unreachable: expected the script probe rule above to have captured a scope.');
    expect(findTopLevelScope(scope)).toBe(scope);
  });
});

describe('resolveFrom', () => {
  it('returns undefined once the scope chain is exhausted without finding the name — an invariant no real fixture can reach, since this rule only ever calls it with a name already resolved at the alias\'s own declaration', () => {
    expect(resolveFrom(null, 'neverDeclaredAnywhere')).toBeUndefined();
  });
});

describe('hasEnclosingShorthandBoundary', () => {
  it('returns false once the backward walk exhausts the token list without ever finding an enclosing brace, comma, bracket, paren, or colon — an invariant no real fixture can reach, since a token stream ending in "}" or "," can only originate from a real enclosing "{" or "," somewhere earlier', () => {
    expect(hasEnclosingShorthandBoundary([])).toBe(false);
  });

  it('returns true for an immediately-preceding "{"', () => {
    expect(hasEnclosingShorthandBoundary([{ value: '{' }])).toBe(true);
  });

  it('returns true for an immediately-preceding "," (a non-first shorthand property)', () => {
    expect(hasEnclosingShorthandBoundary([{ value: '{' }, { value: 'a' }, { value: ':' }, { value: '1' }, { value: ',' }])).toBe(true);
  });

  it('returns false for an immediately-preceding ":" (an explicit key: value pair, not shorthand)', () => {
    expect(hasEnclosingShorthandBoundary([{ value: '{' }, { value: 'a' }, { value: ':' }])).toBe(false);
  });

  it('returns false for an immediately-preceding "[" even when an earlier token would otherwise resolve true', () => {
    expect(hasEnclosingShorthandBoundary([{ value: '{' }, { value: '[' }])).toBe(false);
  });

  it('returns false for an immediately-preceding "(" even when an earlier token would otherwise resolve true', () => {
    expect(hasEnclosingShorthandBoundary([{ value: '{' }, { value: '(' }])).toBe(false);
  });

  it('returns false for an immediately-preceding ":" even when an earlier token would otherwise resolve true', () => {
    expect(hasEnclosingShorthandBoundary([{ value: '{' }, { value: ':' }])).toBe(false);
  });

  it('keeps walking past a token that is none of the recognised boundaries', () => {
    expect(hasEnclosingShorthandBoundary([{ value: '{' }, { value: 'a' }])).toBe(true);
  });
});

describe('variableInScope', () => {
  // Captures a real Scope from a genuine (throwaway) rule run, rather than trying to hand-construct one — eslint-scope's own Scope class is only ever produced by a real scope analysis pass.
  let capturedScope: Scope.Scope | undefined;
  const probe: Rule.RuleModule = {
    meta: { schema: [] },
    create(context) {
      return {
        VariableDeclarator(node) {
          capturedScope = context.sourceCode.getScope(node);
        },
      };
    },
  };
  new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } }).run('probe', probe, {
    valid: ['const foo = 1;'],
    invalid: [],
  });

  it('captured a real scope from the probe run', () => {
    expect(capturedScope).toBeDefined();
  });

  it('returns the variable when scope.set genuinely holds the given name', () => {
    const scope = capturedScope;
    if (scope === undefined) throw new Error('Unreachable: expected the probe rule above to have captured a scope.');
    expect(variableInScope(scope, 'foo').name).toBe('foo');
  });

  it('throws for a name scope.set does not hold — never true of a name this rule\'s own call site has not itself just declared in that exact scope', () => {
    const scope = capturedScope;
    if (scope === undefined) throw new Error('Unreachable: expected the probe rule above to have captured a scope.');
    expect(() => variableInScope(scope, 'neverDeclaredHere')).toThrow(/Unreachable/);
  });
});

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

ruleTester.run('no-pointless-reassignment', rule, {
  valid: [
    { code: 'const foo = bar + 1;' },
    { code: 'let foo = bar;' },
    // A `let` alias whose own source IS resolvable (unlike the plain-global case above) still must not be flagged — this specifically isolates the const-only check from the separate "source is ever written to" bail-out, since an unresolved global would otherwise mask a missing const check by bailing out first for an unrelated reason.
    { code: ['let bar = 1;', 'let foo = bar;', 'console.log(foo);'].join('\n') },
    { code: 'const _foo = bar;' },
    { code: ['let bar = 1;', 'const foo = bar;', 'bar = 2;', 'console.log(foo);'].join('\n') },
    // A direct `export const alias = original;` is never reported at all, not merely left unfixed: collapsing it would delete a binding every importer of this module depends on by name.
    { code: ['const bar = 1;', 'export const foo = bar;', 'console.log(foo);'].join('\n') },
    { code: ["import { bar } from './bar';", 'export const foo = bar;', 'console.log(foo);'].join('\n') },
    { code: ['const bar = 1;', 'export const foo = bar;', ''].join('\n') },
    // An explicit type annotation would otherwise still be reported without a fix (see the invalid case below), but the export bail-out runs first: an exported alias is never reported regardless of any other property it also carries.
    { code: ['const bar = 1;', 'export const foo: number = bar;', 'console.log(foo);'].join('\n') },
    // The exact reproduction from https://github.com/ExaDev/eslint-config/issues/31: an exported alias of a function's return value, with a doc comment and an unrelated `.value` read that this rule never matches in the first place (a MemberExpression, not a plain identifier init).
    {
      code: [
        'function make(): { value: number } {',
        '  return { value: 1 };',
        '}',
        '',
        'const inner = make();',
        '',
        '/** Exported under another name. */',
        'export const outer = inner;',
        '',
        'export const used = inner.value;',
      ].join('\n'),
    },
    // A later, split-statement `export { alias };` is exactly as much a part of the module's interface as a direct `export const`, even though it carries no syntactic link to the declaration itself.
    { code: ['const bar = 1;', 'const foo = bar;', 'export { foo };', 'console.log(foo);'].join('\n') },
    // Renaming the exported name (`as other`) does not change that `foo` is still the local binding an outside importer resolves this export to.
    { code: ['const bar = 1;', 'const foo = bar;', 'export { foo as other };', 'console.log(foo);'].join('\n') },
    // `export default` carries no name of its own, but the alias it points at is still part of the module's interface the same way.
    { code: ['const bar = 1;', 'const foo = bar;', 'export default foo;'].join('\n') },
  ],
  invalid: [
    {
      code: ['let bar = 1;', 'const foo = bar;', 'console.log(foo);'].join('\n'),
      output: ['let bar = 1;', '', 'console.log(bar);'].join('\n'),
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // Only a LEADING underscore is exempt (the discard convention) — a trailing one is an ordinary name and still gets flagged.
    {
      code: ['const bar = 1;', 'const foo_ = bar;', 'console.log(foo_);'].join('\n'),
      output: ['const bar = 1;', '', 'console.log(bar);'].join('\n'),
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo_', value: 'bar' } }],
    },
    // A read this fixer cannot safely rewrite by plain text replacement — a JSX component tag's own identifier is a JSXIdentifier, not a plain Identifier — blocks the whole fix: removing the declaration would leave `<Foo />` referring to a binding that no longer exists.
    {
      code: ['const Bar = 1;', 'const Foo = Bar;', 'const el = <Foo />;'].join('\n'),
      filename: 'test.tsx',
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'Foo', value: 'Bar' } }],
    },
    {
      code: ['let bar = 1;', 'const foo = bar,', '  other = 2;', 'console.log(foo, other);'].join('\n'),
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // The alias binding itself is reassigned after its own declaration — a real parse-level SyntaxError under `tsc` (assigning to a const), but ESLint's own parser and scope analysis track it as a plain write reference regardless, so this rule still needs to bail out of fixing rather than assume `const` alone rules it out.
    {
      code: ['const bar = 1;', 'const foo = bar;', 'foo = 2;', 'console.log(foo);'].join('\n'),
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    {
      code: ['const bar = 1;', 'const foo = bar;', 'const obj = { foo };', 'console.log(obj);'].join('\n'),
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // A second, ordinary read alongside the shorthand one: only ONE of the alias's reads needs to be an unsafe shorthand property for the whole fix to be withheld, so this must bail even though the other read (`console.log(foo)`) is perfectly safe on its own.
    {
      code: ['const bar = 1;', 'const foo = bar;', 'const obj = { foo };', 'console.log(foo);'].join('\n'),
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // The same shorthand hazard when the alias is NOT the first property — the token immediately before it is the previous property's own comma separator, not the opening brace. A fixer that instead kept walking backward past that comma would (and once genuinely did, during this rule's own development) find the PRECEDING property's unrelated colon and wrongly conclude this read isn't shorthand at all, silently renaming the object's own "foo" key to "bar" instead of leaving it alone.
    {
      code: ['const bar = 1;', 'const foo = bar;', 'const obj = { a: 1, foo };', 'console.log(obj);'].join('\n'),
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // The mirror case: a shorthand property that is NOT the LAST one — its own next token is ',', not '}'. A "not shorthand" misclassification here would attempt the same unsafe key-renaming autofix as the case above, just triggered from the opposite direction.
    {
      code: ['const bar = 1;', 'const foo = bar;', 'const obj = { foo, b: 2 };', 'console.log(obj);'].join('\n'),
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // An explicit `key: foo` value is not shorthand at all — the token immediately before the read is the property's own colon, so it autofixes freely.
    {
      code: ['const bar = 1;', 'const foo = bar;', 'const obj = { a: foo, b: 2 };', 'console.log(obj);'].join('\n'),
      output: ['const bar = 1;', '', 'const obj = { a: bar, b: 2 };', 'console.log(obj);'].join('\n'),
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // A read nested inside an array literal value is never itself an object shorthand key, regardless of the comma separating it from a sibling array element.
    {
      code: ['const bar = 1;', 'const foo = bar;', 'const obj = { arr: [foo, 1] };', 'console.log(obj);'].join('\n'),
      output: ['const bar = 1;', '', 'const obj = { arr: [bar, 1] };', 'console.log(obj);'].join('\n'),
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // A read at the tail of a nested arrow-function body still ending exactly at the object's own closing brace: neither an immediate '{'/',' (shorthand) nor an immediate '['/'('/':' (a directly-nested value) resolves it, so the walk must step back past the arrow token itself before reaching the '(' that settles it as not shorthand.
    {
      code: ['const bar = 1;', 'const foo = bar;', 'const obj = { cb: () => foo };', 'console.log(obj);'].join('\n'),
      output: ['const bar = 1;', '', 'const obj = { cb: () => bar };', 'console.log(obj);'].join('\n'),
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // A read whose own next token is a ternary's ':' is never itself an object shorthand key, regardless of the enclosing object literal.
    {
      code: ['const bar = 1;', 'const foo = bar;', 'declare const cond: boolean;', 'const obj = { a: cond ? foo : 2 };', 'console.log(obj);'].join('\n'),
      output: ['const bar = 1;', '', 'declare const cond: boolean;', 'const obj = { a: cond ? bar : 2 };', 'console.log(obj);'].join('\n'),
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // An explicit type annotation is load-bearing — still reported, never auto-fixed.
    {
      code: ['function f(item: never) {', '  const exhaustive: never = item;', '  throw new Error(String(exhaustive));', '}'].join('\n'),
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'exhaustive', value: 'item' } }],
    },
    // A re-export forwarded from another module ("export { alias } from './other'") never refers to a local binding at all, so a same-named local alias is still reported and fixed normally: the specifier's own `source` excludes it from isExportedAlias's specifier match.
    {
      code: ['const bar = 1;', 'const foo = bar;', "export { foo } from './other';", 'console.log(foo);'].join('\n'),
      output: ['const bar = 1;', '', "export { foo } from './other';", 'console.log(bar);'].join('\n'),
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // A nested, function-scoped alias sharing its name with an unrelated top-level export is never itself exported: resolving "foo" from module scope finds the real top-level export target, not this nested local, so the fix still applies to the nested one.
    {
      code: [
        'function makeLocal() {',
        '  const innerValue = 1;',
        '  const foo = innerValue;',
        '  return foo;',
        '}',
        '',
        'const bar = 2;',
        'const foo = bar;',
        'export { foo };',
      ].join('\n'),
      output: [
        'function makeLocal() {',
        '  const innerValue = 1;',
        '  ',
        '  return innerValue;',
        '}',
        '',
        'const bar = 2;',
        'const foo = bar;',
        'export { foo };',
      ].join('\n'),
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'innerValue' } }],
    },
    // Shadowing: rewriting the read to `bar` would bind to the parameter, not the outer constant.
    {
      code: ['const bar = 1;', 'const foo = bar;', 'export function g(bar: number) {', '  return foo + bar;', '}'].join('\n'),
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // A second, unshadowed read alongside the shadowed one: only ONE of the alias's reads needs to be shadowed for the whole fix to be withheld, so this must bail even though the other read (`console.log(foo)`, outside `g`) is perfectly safe on its own.
    {
      code: ['const bar = 1;', 'const foo = bar;', 'console.log(foo);', 'export function g(bar: number) {', '  return foo + bar;', '}'].join('\n'),
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // The shadow guard is scoped to the read sites: a shadowing binding in a block the read is not inside does not block the fix.
    {
      code: ['const bar = 1;', 'const foo = bar;', '{', '  const bar = 2;', '  console.log(bar);', '}', 'console.log(foo);'].join('\n'),
      output: ['const bar = 1;', '', '{', '  const bar = 2;', '  console.log(bar);', '}', 'console.log(bar);'].join('\n'),
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // A read from inside a closure is still safely collapsible: the rule already refuses to report when the source is ever written, and a never-written source keeps both its runtime value and its narrowed type when read directly.
    {
      code: ['const bar = 1;', 'const foo = bar;', 'export const h = () => foo;'].join('\n'),
      output: ['const bar = 1;', '', 'export const h = () => bar;'].join('\n'),
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // A bare, unparenthesized read whose own next token is neither '}' nor ',' (here, ';') must never even reach hasEnclosingShorthandBoundary's own backward walk: an earlier, wholly unrelated multi-declarator statement's own comma sits further back in the same file, and if the walk were consulted here it would misread that unrelated comma as this read's own shorthand-property boundary, wrongly refusing a fix that is actually perfectly safe.
    {
      code: ['const a = 1,', '  b = 2;', 'const bar = 3;', 'const foo = bar;', 'foo;'].join('\n'),
      output: ['const a = 1,', '  b = 2;', 'const bar = 3;', '', 'bar;'].join('\n'),
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
  ],
});
