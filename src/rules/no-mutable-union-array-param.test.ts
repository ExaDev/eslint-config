import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import rule from './no-mutable-union-array-param';

// This rule is built with ESLintUtils.RuleCreator (needed for typed TSESTree node access), which plain eslint's own RuleTester cannot type-check a rule against -- see
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
    // A readonly union array has no mutating methods to call in the first place -- represented as TSTypeOperator wrapping TSArrayType, not TSArrayType itself, so it's already out of scope.
    'function f(arr: readonly (string | number)[]): void { arr.slice(0, 1); }',
    // Mutating a differently-named variable, not the union-typed parameter itself.
    'function f(arr: (string | number)[]): void { const other: number[] = []; other.push(1); }',
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
    // Generic Array<T> form -- rewritten to ReadonlyArray<T>, not `readonly Array<T>[]`.
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
