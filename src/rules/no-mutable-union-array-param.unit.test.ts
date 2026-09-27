import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule from './no-mutable-union-array-param';

// Pins every literal in the rule's own metadata — name, docs url/description, message text, and the empty defaultOptions array — against mutation, since none of these are otherwise observable through a RuleTester fixture.
describe('rule metadata', () => {
  it('has the expected name, docs, message, and default options', () => {
    expect(rule.name).toBe('no-mutable-union-array-param');
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-mutable-union-array-param.ts');
    expect(rule.meta.docs?.description).toBe(
      'Disallow mutating-insertion calls on a union-element array parameter, which lets a caller pass a narrower array whose declared element type the call can silently violate.',
    );
    expect(rule.meta.messages.unsound).toBe(
      "'{{ method }}' inserts into a parameter typed as an array of a union — a caller may have passed a narrower array (e.g. number[] where (string | number)[] is declared), and TypeScript's covariant array typing does not catch the resulting mismatch. Mark the parameter readonly to turn this into a real compile error, or narrow the parameter type.",
    );
    expect(rule.meta.defaultOptions).toEqual([]);
  });
});

// This rule is built with ESLintUtils.RuleCreator (needed for typed TSESTree node access), which plain eslint's own RuleTester cannot type-check a rule against — see
// @typescript-eslint/rule-tester's own docs. No type information is actually needed at lint time
// for THIS rule (it never touches the type checker), so parserOptions.project/projectService is deliberately omitted here.
const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

ruleTester.run('no-mutable-union-array-param', rule, {
  valid: [
    // A single-type (non-union) array param has no covariance risk to smuggle a mismatched value through.
    'function f(arr: number[]): void { arr.push(1); }',
    'function f(arr: Array<number>): void { arr.push(1); }',
    // Read-only / removal-only methods never insert a new element, so they carry no equivalent risk.
    'function f(arr: (string | number)[]): void { arr.pop(); arr.shift(); arr.slice(0, 1); arr.filter(Boolean); arr.map((x) => x); }',
    // A readonly union array has no mutating methods to call in the first place — represented as TSTypeOperator wrapping TSArrayType, not TSArrayType itself, so it's already out of scope.
    'function f(arr: readonly (string | number)[]): void { arr.slice(0, 1); }',
    // Mutating a differently-named variable, not the union-typed parameter itself.
    'function f(arr: (string | number)[]): void { const other: number[] = []; other.push(1); }',
    // A parameter with no type annotation at all has no array-of-union shape for this rule to find in the first place.
    'function f(arr): void { arr.push(1); }',
    // A generic type reference with a single union type argument, but NOT actually named 'Array' — the whole-parameter check must match on the type reference's own name, not merely "single union type argument", or an unrelated generic container would be wrongly treated as an array.
    'function f(arr: Foo<string | number>): void { arr.push(1); }',
    // A private class method sharing a mutating-insertion method's own name — callee.property here is a PrivateIdentifier, not an Identifier, so it must not be confused with a call to the union array's own push method even though '#push' happens to share that name.
    'class C { #push(): void {} m(arr: (string | number)[]): void { arr.#push(); } }',
    // A local variable typed as an array of a union, mutated the same way a parameter would be — this rule is scoped to PARAMETERS specifically (a caller can only smuggle a narrower array in through a parameter), so a local variable's own declared type carries no equivalent risk and must not be flagged.
    'function f(): void { const arr: (string | number)[] = []; arr.push(1); }',
  ],
  invalid: [
    {
      code: 'function f(arr: (string | number)[]): void { arr.push(1); }',
      output: 'function f(arr: readonly (string | number)[]): void { arr.push(1); }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    {
      code: 'function f(arr: (string | number)[]): void { arr.unshift(1); }',
      output: 'function f(arr: readonly (string | number)[]): void { arr.unshift(1); }',
      errors: [{ messageId: 'unsound', data: { method: 'unshift' } }],
    },
    {
      code: 'function f(arr: (string | number)[]): void { arr.splice(0, 0, 1); }',
      output: 'function f(arr: readonly (string | number)[]): void { arr.splice(0, 0, 1); }',
      errors: [{ messageId: 'unsound', data: { method: 'splice' } }],
    },
    {
      code: 'function f(arr: (string | number)[]): void { arr.fill(1); }',
      output: 'function f(arr: readonly (string | number)[]): void { arr.fill(1); }',
      errors: [{ messageId: 'unsound', data: { method: 'fill' } }],
    },
    {
      code: 'function f(arr: (string | number)[]): void { arr.copyWithin(0, 1); }',
      output: 'function f(arr: readonly (string | number)[]): void { arr.copyWithin(0, 1); }',
      errors: [{ messageId: 'unsound', data: { method: 'copyWithin' } }],
    },
    // Generic Array<T> form — rewritten to ReadonlyArray<T>, not `readonly Array<T>[]`.
    {
      code: 'function f(arr: Array<string | number>): void { arr.push(1); }',
      output: 'function f(arr: ReadonlyArray<string | number>): void { arr.push(1); }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // Arrow function parameter.
    {
      code: 'const f = (arr: (string | number)[]): void => { arr.push(1); };',
      output: 'const f = (arr: readonly (string | number)[]): void => { arr.push(1); };',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
  ],
});
