import type { Rule, Scope } from 'eslint';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import tseslint from 'typescript-eslint';
import rule, { hasEnclosingShorthandBoundary, isConstDeclarator, resolveFrom, variableInScope } from './no-pointless-reassignment';

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
    // An exported alias must have its whole `export` statement removed. Removing only the inner VariableDeclaration left a bare `export` keyword behind, which does not parse.
    {
      code: ['const bar = 1;', 'export const foo = bar;', 'console.log(foo);'].join('\n'),
      output: ['const bar = 1;', '', 'console.log(bar);'].join('\n'),
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    {
      code: ["import { bar } from './bar';", 'export const foo = bar;', 'console.log(foo);'].join('\n'),
      output: ["import { bar } from './bar';", '', 'console.log(bar);'].join('\n'),
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // An exported alias with no other read still collapses to valid syntax.
    {
      code: ['const bar = 1;', 'export const foo = bar;', ''].join('\n'),
      output: ['const bar = 1;', '', ''].join('\n'),
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // An explicit type annotation is load-bearing — still reported, never auto-fixed.
    {
      code: ['function f(item: never) {', '  const exhaustive: never = item;', '  throw new Error(String(exhaustive));', '}'].join('\n'),
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'exhaustive', value: 'item' } }],
    },
    {
      code: ['const bar = 1;', 'export const foo: number = bar;', 'console.log(foo);'].join('\n'),
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // Shadowing: rewriting the read to `bar` would bind to the parameter, not the outer constant.
    {
      code: ['const bar = 1;', 'const foo = bar;', 'export function g(bar: number) {', '  return foo + bar;', '}'].join('\n'),
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
