import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from './no-array-isarray-mutation';

// This rule reads real type information (checker.getTypeAtLocation/isArrayType), specifically to see through a type alias and to catch a bare (non-union) readonly array parameter -- neither is visible from the parameter's own TSESTree type-annotation syntax alone. `projectService.allowDefaultProject` lets each inline code snippet below run against an ad hoc single-file project, matching no-enum-reverse-lookup-widening.test.ts's own setup for the same reason.
const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: { allowDefaultProject: ['*.ts*'] },
      tsconfigRootDir: import.meta.dirname,
    },
  },
});

ruleTester.run('no-array-isarray-mutation', rule, {
  valid: [
    // A plain (non-union, non-readonly) array parameter has no readonly guarantee to lose in the first place -- out of scope for this rule regardless of the Array.isArray guard or the mutating call.
    'function f(input: number[]): void { if (Array.isArray(input)) { input.push(1); } }',
    // Narrowed via Array.isArray but only read, never mutated -- pop/slice/map are not in the mutating-insertion set.
    'function f(input: readonly number[] | number): void { if (Array.isArray(input)) { input.pop(); input.slice(0, 1); input.map((x) => x); } }',
    'function f(input: ReadonlyArray<number> | number): void { if (Array.isArray(input)) { input.slice(0, 1); } }',
    // Mutated, but with no Array.isArray guard anywhere in scope -- out of scope for THIS rule specifically. This snippet would not actually type-check under tsc (input.push is not callable on an un-narrowed
    // `readonly number[] | number` union), but detection here is guard-gated regardless of whether the call site
    // itself compiles. no-mutable-union-array-param.ts does not cover this shape either: its own isUnionArrayType
    // helper only matches a union at the ARRAY ELEMENT type (`(string | number)[]` / `Array<string | number>`),
    // never a union at the parameter's own top level (`readonly number[] | number`) -- so an un-narrowed mutation
    // on this parameter shape is a genuine, unaddressed gap between the two rules, not double-covered.
    'function f(input: readonly number[] | number): void { input.push(1); }',
    // Guarded, but the mutating call targets a differently-named variable, not the narrowed parameter itself.
    'function f(input: readonly number[] | number): void { if (Array.isArray(input)) { const other: number[] = []; other.push(1); } }',
    // Array.isArray narrows a variable that is not this function's parameter at all (Array.isArray's own signature narrows any argument to `any[]`, so this type-checks without needing local's own declared type to already be array-shaped).
    'function f(input: readonly number[] | number): void { const local: unknown = []; if (Array.isArray(local)) { local.push(1); } }',
    // Mutating call sits outside the guarded branch (after the if, not inside its consequent).
    'function f(input: readonly number[] | number): void { if (Array.isArray(input)) { /* no-op */ } input.push(1); }',
    // The guard narrows a different parameter than the one being mutated.
    'function f(input: readonly number[] | number, other: number[]): void { if (Array.isArray(other)) { input.push(1); } }',
    // Mutating call on an identifier that never resolves to a declared variable at all.
    'undeclaredGlobalThing.push(1);',
    // Array.isArray's own argument is not a plain identifier, so it cannot resolve back to the parameter at all.
    'function f(input: readonly number[] | number): void { if (Array.isArray([])) { input.push(1); } }',
    // The early-return idiom's guard tests the WRONG variable -- a preceding sibling if-statement negated-guards `other`, not `input`, so the mutation is not actually guarded.
    'function f(input: readonly number[] | number, other: readonly number[] | number): void { if (!Array.isArray(other)) return; input.push(1); }',
    // An early-return if-statement that has an `else` branch is not the early-return idiom (the function does not unconditionally stop there), so it is deliberately not treated as a guard for a later sibling statement.
    'function f(input: readonly number[] | number): void { if (!Array.isArray(input)) { doSomething(); } else { doSomethingElse(); } input.push(1); }',
  ],
  invalid: [
    {
      code: 'function f(input: readonly number[] | number): void { if (Array.isArray(input)) { input.push(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    {
      code: 'function f(input: readonly number[] | number): void { if (Array.isArray(input)) { input.unshift(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'unshift' } }],
    },
    {
      code: 'function f(input: readonly number[] | number): void { if (Array.isArray(input)) { input.splice(0, 0, 1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'splice' } }],
    },
    {
      code: 'function f(input: readonly number[] | number): void { if (Array.isArray(input)) { input.fill(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'fill' } }],
    },
    {
      code: 'function f(input: readonly number[] | number): void { if (Array.isArray(input)) { input.copyWithin(0, 1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'copyWithin' } }],
    },
    // Generic ReadonlyArray<T> union member, not just `readonly T[]`.
    {
      code: 'function f(input: ReadonlyArray<number> | number): void { if (Array.isArray(input)) { input.push(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // Arrow function parameter.
    {
      code: 'const f = (input: readonly number[] | number): void => { if (Array.isArray(input)) { input.push(1); } };',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // Single-statement if consequent, no block braces.
    {
      code: 'function f(input: readonly number[] | number): void { if (Array.isArray(input)) input.push(1); }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // Wider union with more than two members still carries the same hole.
    {
      code: 'function f(input: readonly string[] | number | boolean): void { if (Array.isArray(input)) { input.push("x"); } }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // A type ALIAS to a readonly array -- confirmed via the TS compiler API that the checker's own type for an aliased parameter is the alias's real underlying type (symbol name 'ReadonlyArray'), the same as writing it out directly; a purely syntactic version of this rule could not see through the alias at all.
    {
      code: 'type RO = readonly number[]; function f(input: RO | number): void { if (Array.isArray(input)) { input.push(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // A BARE readonly array parameter, no union at all -- Array.isArray discards the readonly modifier here too; confirmed via tsc --strict that this compiles clean with zero errors.
    {
      code: 'function f(input: readonly number[]): void { if (Array.isArray(input)) { input.push(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // The early-return guard idiom -- the mutating call is a sibling statement AFTER the guard, not nested inside it.
    {
      code: 'function f(input: readonly number[] | number): void { if (!Array.isArray(input)) return; input.push(1); }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // The early-throw variant of the same idiom.
    {
      code: "function f(input: readonly number[] | number): void { if (!Array.isArray(input)) throw new Error('not an array'); input.push(1); }",
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // The early-return idiom with a braced, multi-statement consequent that still unconditionally exits as its last statement.
    {
      code: 'function f(input: readonly number[] | number): void { if (!Array.isArray(input)) { logSomething(); return; } input.push(1); }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // The logical-AND guard idiom.
    {
      code: 'function f(input: readonly number[] | number): void { Array.isArray(input) && input.push(1); }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // The ternary guard idiom.
    {
      code: 'function f(input: readonly number[] | number): void { Array.isArray(input) ? input.push(1) : undefined; }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // The else-of-negated-test guard idiom.
    {
      code: 'function f(input: readonly number[] | number): void { if (!Array.isArray(input)) { doSomething(); } else { input.push(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
  ],
});
