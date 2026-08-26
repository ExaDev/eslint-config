import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import rule from './prefer-readonly-array-param';

// No type information is needed at lint time for this rule (it matches purely on the parameter's own TSESTree type annotation), so parserOptions.project/projectService is deliberately omitted here, matching no-mutable-union-array-param.test.ts's own rationale.
const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

ruleTester.run('prefer-readonly-array-param', rule, {
  valid: [
    // Already readonly -- an array, a tuple, and the generic ReadonlyArray<T> form.
    'function f(arr: readonly number[]): void {}',
    'function f(t: readonly [string, number]): void {}',
    'function f(arr: ReadonlyArray<number>): void {}',
    // Destructured parameters are out of scope -- there is no single parameter type annotation to mark readonly.
    'function f({ arr }: { arr: number[] }): void {}',
    'function f([a, b]: [number, number]): void {}',
    // Non-array/tuple parameter types are out of scope -- string, number, and a plain object type are all deliberately excluded (unlike the native @typescript-eslint/prefer-readonly-parameter-types, which also flags objects).
    'function f(x: string): void {}',
    'function f(x: number): void {}',
    'function f(x: { a: number }): void {}',
    // A parameter with no type annotation at all has nothing for this rule to inspect.
    'function f(x): void {}',
  ],
  invalid: [
    // Bare array param -- fixed to a readonly array.
    {
      code: 'function f(arr: number[]): void {}',
      output: 'function f(arr: readonly number[]): void {}',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    // Generic Array<T> param -- fixed to ReadonlyArray<T>.
    {
      code: 'function f(arr: Array<number>): void {}',
      output: 'function f(arr: ReadonlyArray<number>): void {}',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'ReadonlyArray<T>' } }],
    },
    // Tuple param -- fixed to a readonly tuple.
    {
      code: 'function f(t: [string, number]): void {}',
      output: 'function f(t: readonly [string, number]): void {}',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly [T, U]' } }],
    },
    // Arrow function parameter.
    {
      code: 'const f = (arr: number[]): void => {};',
      output: 'const f = (arr: readonly number[]): void => {};',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    // Class method parameter.
    {
      code: 'class C { m(arr: number[]): void {} }',
      output: 'class C { m(arr: readonly number[]): void {} }',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    // The function body DOES mutate the parameter -- the rule still fires unconditionally here too, matching the native sibling's own unconditional (mutation-independent) behaviour. The fix still applies mechanically; whether the resulting code still compiles is the deliberate, documented tradeoff (same as no-mutable-union-array-param's own fix, which likewise turns the existing call into a compile error).
    {
      code: 'function f(arr: number[]): void { arr.push(1); }',
      output: 'function f(arr: readonly number[]): void { arr.push(1); }',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    // Two array parameters on the same function -- both are flagged and both are fixed independently.
    {
      code: 'function f(a: number[], b: string[]): void {}',
      output: 'function f(a: readonly number[], b: readonly string[]): void {}',
      errors: [
        { messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } },
        { messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } },
      ],
    },
    // A rest parameter -- the type annotation lives on the RestElement itself, not its inner identifier.
    {
      code: 'function f(...xs: number[]): void {}',
      output: 'function f(...xs: readonly number[]): void {}',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    // A default-valued parameter -- the annotation lives on the AssignmentPattern's left identifier.
    {
      code: 'function f(xs: number[] = []): void {}',
      output: 'function f(xs: readonly number[] = []): void {}',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    // A constructor parameter property -- the annotation lives on the TSParameterProperty's inner parameter.
    {
      code: 'class C { constructor(private xs: number[]) {} }',
      output: 'class C { constructor(private xs: readonly number[]) {} }',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    // A constructor parameter property with a default value -- both wrappers nested at once.
    {
      code: 'class C { constructor(private xs: number[] = []) {} }',
      output: 'class C { constructor(private xs: readonly number[] = []) {} }',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    // An ambient/overload declaration with no body of its own.
    {
      code: 'declare function f(xs: number[]): void;',
      output: 'declare function f(xs: readonly number[]): void;',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    // An interface method signature.
    {
      code: 'interface I { m(xs: number[]): void; }',
      output: 'interface I { m(xs: readonly number[]): void; }',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    // A standalone function type alias.
    {
      code: 'type T = (xs: number[]) => void;',
      output: 'type T = (xs: readonly number[]) => void;',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    // A call signature and a construct signature.
    {
      code: 'interface I { (xs: number[]): void; }',
      output: 'interface I { (xs: readonly number[]): void; }',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    {
      code: 'interface I { new (xs: number[]): void; }',
      output: 'interface I { new (xs: readonly number[]): void; }',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    // An abstract class method (no body) and an ambient class method -- both are TSEmptyBodyFunctionExpression.
    {
      code: 'abstract class A { abstract m(xs: number[]): void; }',
      output: 'abstract class A { abstract m(xs: readonly number[]): void; }',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    {
      code: 'declare class D { m(xs: number[]): void; }',
      output: 'declare class D { m(xs: readonly number[]): void; }',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    // A union containing an array member -- only the array member is fixed, the rest of the union is untouched.
    {
      code: 'function f(xs: number[] | string): void {}',
      output: 'function f(xs: readonly number[] | string): void {}',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[]' } }],
    },
    // A union with two fixable members -- both are fixed independently in one pass.
    {
      code: 'function f(xs: number[] | string[]): void {}',
      output: 'function f(xs: readonly number[] | readonly string[]): void {}',
      errors: [{ messageId: 'preferReadonly', data: { suggestion: 'readonly T[] / readonly T[]' } }],
    },
  ],
});
