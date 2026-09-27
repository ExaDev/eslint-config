import { describe, expect, it } from 'vitest';
import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from './no-array-isarray-mutation';

describe('rule metadata', () => {
  it('exposes the expected name, docs URL, description, and message text', () => {
    expect(rule.name).toBe('no-array-isarray-mutation');
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-array-isarray-mutation.ts');
    expect(rule.meta.docs?.description).toBe(
      "Disallow mutating-insertion calls on a parameter or local variable whose real type includes a readonly array, narrowed via Array.isArray, which silently discards the declared readonly guarantee.",
    );
    expect(rule.meta.messages.unsound).toBe(
      "'{{ method }}' mutates a parameter or local variable narrowed by Array.isArray — Array.isArray's own type declaration cannot preserve a readonly modifier through the guard, so a value whose real type includes a readonly array (a caller's array, for a parameter; the value's own declared type, for a local variable) can be mutated here despite that readonly guarantee. Copy the array before inserting (e.g. a spread into a new array), or narrow with a check that preserves readonly instead of Array.isArray.",
    );
  });
});

// This rule reads real type information (checker.getTypeAtLocation/isArrayType), specifically to see through a type alias and to catch a bare (non-union) readonly array parameter — neither is visible from the parameter's own TSESTree type-annotation syntax alone. `projectService.allowDefaultProject` lets each inline code snippet below run against an ad hoc single-file project, matching no-enum-reverse-lookup-widening.test.ts's own setup for the same reason.
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
    // A plain (non-union, non-readonly) array parameter has no readonly guarantee to lose in the first place — out of scope for this rule regardless of the Array.isArray guard or the mutating call.
    'function f(input: number[]): void { if (Array.isArray(input)) { input.push(1); } }',
    // Narrowed via Array.isArray but only read, never mutated — pop/slice/map are not in the mutating-insertion set.
    'function f(input: readonly number[] | number): void { if (Array.isArray(input)) { input.pop(); input.slice(0, 1); input.map((x) => x); } }',
    'function f(input: ReadonlyArray<number> | number): void { if (Array.isArray(input)) { input.slice(0, 1); } }',
    // Mutated, but with no Array.isArray guard anywhere in scope — out of scope for THIS rule specifically. This snippet would not actually type-check under tsc (input.push is not callable on an un-narrowed
    // `readonly number[] | number` union), but detection here is guard-gated regardless of whether the call site
    // itself compiles. no-mutable-union-array-param.ts does not cover this shape either: its own isUnionArrayType
    // helper only matches a union at the ARRAY ELEMENT type (`(string | number)[]` / `Array<string | number>`),
    // never a union at the parameter's own top level (`readonly number[] | number`) — so an un-narrowed mutation
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
    // The early-return idiom's guard tests the WRONG variable — a preceding sibling if-statement negated-guards `other`, not `input`, so the mutation is not actually guarded.
    'function f(input: readonly number[] | number, other: readonly number[] | number): void { if (!Array.isArray(other)) return; input.push(1); }',
    // An early-return if-statement that has an `else` branch is not the early-return idiom (the function does not unconditionally stop there), so it is deliberately not treated as a guard for a later sibling statement.
    'function f(input: readonly number[] | number): void { if (!Array.isArray(input)) { doSomething(); } else { doSomethingElse(); } input.push(1); }',
    // A `let` local reassigned to a definitely-mutable value before the guard does NOT produce a false positive here, but not for the reason it might look like: this rule deliberately checks the type at the declaration's own name node, and `let value;` with no type annotation and no initializer has no static type to read there at all — confirmed via the TS compiler API that `checker.getTypeAtLocation` on this bare declaration returns `any` (TypeScript's "evolving" type for an uninitialized `let`, which only accumulates a real type from the assignments that follow it, not before). With no readonly-array constituent visible at the declaration itself, the check correctly finds nothing to report, regardless of what value flows through the variable afterwards.
    'function f(x: readonly number[] | number): void { let value; value = x; value = [1, 2, 3]; if (Array.isArray(value)) { value.push(1); } }',
    // A negated early-guard whose consequent does not unconditionally exit (no return/throw/continue/break as its last statement) is not the early-return idiom — execution can fall through past it, so a later sibling mutation is not provably guarded.
    'function f(input: readonly number[] | number): void { if (!Array.isArray(input)) { doSomething(); } input.push(1); }',
    // Array.isArray narrows a caught exception binding, not a parameter or a plain local variable declaration — eslint-scope records a catch clause's own binding under a distinct definition kind, so this rule never even reaches the type check for it.
    'try { doSomething(); } catch (input) { if (Array.isArray(input)) { input.push(1); } }',
    // Guarded by an ordinary if-test that is not an Array.isArray call at all — this rule only recognises Array.isArray specifically, not just "any truthy guard".
    'declare const x: number; function f(input: readonly number[] | number): void { if (x > 0) { input.push(1); } }',
    // A lookalike `.isArray` call on an object that is not literally `Array` — this rule only recognises the real global `Array.isArray`, not any method sharing its name.
    'declare const Foo: { isArray: (x: unknown) => boolean }; function f(input: readonly number[] | number): void { if (Foo.isArray(input)) { input.push(1); } }',
    // A lookalike call on the real `Array` object but under a different method name — this rule only recognises `.isArray` specifically.
    'function f(input: readonly number[] | number): void { if (Array.isFoo(input)) { input.push(1); } }',
    // A private-named method access (`Array.#isArray`), which is syntactically a MemberExpression whose property is a PrivateIdentifier, not a plain Identifier — this rule's own `Array.isArray` detection only recognises a plain dotted Identifier property, not a private one, even when the object is literally named `Array` and the private name happens to read as `isArray`.
    'class Array { static #isArray(x: unknown): boolean { return true; } static test(input: readonly number[] | number): void { if (Array.#isArray(input)) { input.push(1); } } }',
    // A private-named method as the MUTATING call itself (`input.#push()`), which is syntactically a MemberExpression whose property is a PrivateIdentifier, not a plain Identifier — this rule's own mutating-call detection only recognises a plain dotted Identifier method name, not a private one, even when it reads as `push`.
    'class C { #push(): void {} test(input: readonly number[] | number): void { if (Array.isArray(input)) { input.#push(); } } }',
    // `void Array.isArray(input)` is a UnaryExpression whose operator is `void`, not `!` — this rule's own negated-guard detection only recognises the `!` operator specifically, so the else-branch below is not guarded even though its argument is a genuine Array.isArray call.
    'function f(input: readonly number[] | number): void { if (void Array.isArray(input)) { doSomething(); } else { input.push(1); } }',
    // The else-branch of a NON-negated `if (Array.isArray(input))` is the "not an array" branch — it is never guarded, regardless of how the consequent is shaped.
    'function f(input: readonly number[] | number): void { if (Array.isArray(input)) { doSomething(); } else { input.push(1); } }',
    // The CONSEQUENT (not the alternate) of a negated `if (!Array.isArray(input))` is the "not an array" branch — mutating there is never guarded, since the negated-guard idiom only ever protects the ALTERNATE of a negated test (or a later sibling, via the early-return idiom).
    'function f(input: readonly number[] | number): void { if (!Array.isArray(input)) { input.push(1); } else { doSomethingElse(); } }',
    // `Array.isArray(input) || input.push(1)` — a logical OR, not AND — runs the mutating call precisely when input is NOT an array, so it is never guarded by this idiom (which only recognises `&&`).
    'function f(input: readonly number[] | number): void { Array.isArray(input) || input.push(1); }',
    // The ternary's ALTERNATE (the "not an array" branch) is never guarded — only the consequent is.
    'function f(input: readonly number[] | number): void { Array.isArray(input) ? undefined : input.push(1); }',
    // A negated early-guard's consequent is a THREE-statement block whose LAST statement does not unconditionally exit (a statement follows the `return`) — this rule deliberately checks only the block's own last statement for an exit, not real control flow, so a `return` buried mid-block does not count.
    'function f(input: readonly number[] | number): void { if (!Array.isArray(input)) { logSomething(); return; logUnreachable(); } input.push(1); }',
    // The early-return idiom only protects a mutating call that comes AFTER the guard, never one that comes before it — a guard appearing LATER in the same block must never be mistaken for one preceding the mutating call.
    'function f(input: readonly number[] | number): void { input.push(1); if (!Array.isArray(input)) return; }',
  ],
  invalid: [
    // The early-return idiom recognised at Program (top-level) scope, not just inside a function/block — the preceding-sibling scan walks up through BlockStatement AND Program parents alike.
    {
      code: 'declare const input: readonly number[] | number; if (!Array.isArray(input)) throw new Error(); input.push(1);',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // The early-return idiom via `continue` inside a loop — `continue` unconditionally ends the current iteration, guarding a later sibling statement the same way `return`/`throw` do.
    {
      code: 'function f(items: (readonly number[] | number)[]): void { for (const input of items) { if (!Array.isArray(input)) continue; input.push(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // The early-return idiom via `break` inside a loop — `break` unconditionally exits the loop, guarding a later sibling statement the same way `return`/`throw` do.
    {
      code: 'function f(items: (readonly number[] | number)[]): void { for (const input of items) { if (!Array.isArray(input)) { break; } input.push(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    {
      // A TypeScript constructor parameter property: eslint-scope's own Parameter definition for it still names the bound Identifier itself, not the enclosing TSParameterProperty node, so this behaves identically to an ordinary parameter.
      code: 'class C { constructor(public input: readonly number[] | number) { if (Array.isArray(input)) { input.push(1); } } }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
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
    // A type ALIAS to a readonly array — confirmed via the TS compiler API that the checker's own type for an aliased parameter is the alias's real underlying type (symbol name 'ReadonlyArray'), the same as writing it out directly; a purely syntactic version of this rule could not see through the alias at all.
    {
      code: 'type RO = readonly number[]; function f(input: RO | number): void { if (Array.isArray(input)) { input.push(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // A BARE readonly array parameter, no union at all — Array.isArray discards the readonly modifier here too; confirmed via tsc --strict that this compiles clean with zero errors.
    {
      code: 'function f(input: readonly number[]): void { if (Array.isArray(input)) { input.push(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // The early-return guard idiom — the mutating call is a sibling statement AFTER the guard, not nested inside it.
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
    // A plain local `const` (not a parameter) whose own declared type includes a readonly array constituent — the type is read at the VariableDeclarator's own `id` node, the same declaration-site check already used for parameters, so this is caught the same way.
    {
      code: 'declare function getShared(): readonly number[] | number; function f(): void { const frozen: readonly number[] | number = getShared(); if (Array.isArray(frozen)) { frozen.push(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
    // A destructured local binding falls out of the same check for free: destructuring only changes how the initializer is computed, not the DefinitionType.Variable eslint-scope records for the bound identifier `frozen`.
    {
      code: 'declare function getShared(): { frozen: readonly number[] | number }; function f(): void { const { frozen } = getShared(); if (Array.isArray(frozen)) { frozen.push(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'push' } }],
    },
  ],
});
