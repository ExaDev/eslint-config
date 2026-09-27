import { describe, expect, it } from 'vitest';
import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from './no-set-instanceof-mutation';

describe('rule metadata', () => {
  it('exposes the expected name, docs URL, description, and message text', () => {
    expect(rule.name).toBe('no-set-instanceof-mutation');
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-set-instanceof-mutation.ts');
    expect(rule.meta.docs?.description).toBe(
      'Disallow mutating calls on a parameter or local variable whose real type includes a ReadonlySet, narrowed via instanceof Set, which silently discards the declared read-only guarantee.',
    );
    expect(rule.meta.messages.unsound).toBe(
      "'{{ method }}' mutates a parameter or local variable narrowed by instanceof Set — instanceof Set's own narrowing widens straight to the mutable Set interface, so a value whose real type includes a ReadonlySet (a caller's set, for a parameter; the value's own declared type, for a local variable) can be mutated here despite that readonly guarantee. Copy the set before mutating (e.g. new Set(input)), or narrow with a check that preserves read-only instead of instanceof Set.",
    );
  });
});

// This rule reads real type information (checker.getTypeAtLocation, symbol-name matching), specifically to see through a type alias and to catch a bare (non-union) ReadonlySet parameter — neither is visible from the parameter's own TSESTree type-annotation syntax alone. `projectService.allowDefaultProject` lets each inline code snippet below run against an ad hoc single-file project, matching no-array-isarray-mutation.test.ts's own setup for the same reason.
const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: { allowDefaultProject: ['*.ts*'] },
      tsconfigRootDir: import.meta.dirname,
    },
  },
});

ruleTester.run('no-set-instanceof-mutation', rule, {
  valid: [
    // A plain (non-union, non-readonly) Set parameter has no read-only guarantee to lose in the first place — out of scope for this rule regardless of the instanceof Set guard or the mutating call.
    'function f(input: Set<number>): void { if (input instanceof Set) { input.add(1); } }',
    // Narrowed via instanceof Set but only read, never mutated — has/forEach/values are not in the mutating set.
    'function f(input: ReadonlySet<number> | number): void { if (input instanceof Set) { input.has(1); input.forEach((x) => x); input.values(); } }',
    // Mutated, but with no instanceof Set guard anywhere in scope — out of scope for THIS rule specifically. This snippet would not actually type-check under tsc (input.add is not callable on an un-narrowed
    // `ReadonlySet<number> | number` union), but detection here is guard-gated regardless of whether the call site
    // itself compiles.
    'function f(input: ReadonlySet<number> | number): void { input.add(1); }',
    // Guarded, but the mutating call targets a differently-named variable, not the narrowed parameter itself.
    'function f(input: ReadonlySet<number> | number): void { if (input instanceof Set) { const other: Set<number> = new Set(); other.add(1); } }',
    // instanceof Set narrows a variable that is not this function's parameter at all.
    'function f(input: ReadonlySet<number> | number): void { const local: unknown = new Set(); if (local instanceof Set) { local.add(1); } }',
    // Mutating call sits outside the guarded branch (after the if, not inside its consequent).
    'function f(input: ReadonlySet<number> | number): void { if (input instanceof Set) { /* no-op */ } input.add(1); }',
    // The guard narrows a different parameter than the one being mutated.
    'function f(input: ReadonlySet<number> | number, other: Set<number>): void { if (other instanceof Set) { input.add(1); } }',
    // Mutating call on an identifier that never resolves to a declared variable at all.
    'undeclaredGlobalThing.add(1);',
    // The early-return idiom's guard tests the WRONG variable — a preceding sibling if-statement negated-guards `other`, not `input`, so the mutation is not actually guarded.
    'function f(input: ReadonlySet<number> | number, other: ReadonlySet<number> | number): void { if (!(other instanceof Set)) return; input.add(1); }',
    // An early-return if-statement that has an `else` branch is not the early-return idiom (the function does not unconditionally stop there), so it is deliberately not treated as a guard for a later sibling statement.
    'function f(input: ReadonlySet<number> | number): void { if (!(input instanceof Set)) { doSomething(); } else { doSomethingElse(); } input.add(1); }',
    // A `let` local reassigned to a definitely-mutable value before the guard does NOT produce a false positive here, but not for the reason it might look like: this rule deliberately checks the type at the declaration's own name node, and `let value;` with no type annotation and no initializer has no static type to read there at all — confirmed via the TS compiler API that `checker.getTypeAtLocation` on this bare declaration returns `any` (TypeScript's "evolving" type for an uninitialized `let`, which only accumulates a real type from the assignments that follow it, not before). With no ReadonlySet constituent visible at the declaration itself, the check correctly finds nothing to report, regardless of what value flows through the variable afterwards.
    'function f(x: ReadonlySet<number> | number): void { let value; value = x; value = new Set<number>(); if (value instanceof Set) { value.add(1); } }',
    // A negated early-guard whose consequent does not unconditionally exit (no return/throw/continue/break as its last statement) is not the early-return idiom — execution can fall through past it, so a later sibling mutation is not provably guarded.
    'function f(input: ReadonlySet<number> | number): void { if (!(input instanceof Set)) { doSomething(); } input.add(1); }',
    // instanceof Set narrows a caught exception binding, not a parameter or a plain local variable declaration — eslint-scope records a catch clause's own binding under a distinct definition kind, so this rule never even reaches the type check for it.
    'try { doSomething(); } catch (input) { if (input instanceof Set) { input.add(1); } }',
    // Guarded by an ordinary if-test that is not an instanceof Set check at all — this rule only recognises instanceof Set specifically, not just "any truthy guard".
    'declare const x: number; function f(input: ReadonlySet<number> | number): void { if (x > 0) { input.add(1); } }',
    // A loose (`==`) comparison against `Set`, not `instanceof` — this rule only recognises the real `instanceof` operator.
    'function f(input: ReadonlySet<number> | number): void { (input == Set) && input.add(1); }',
    // `input instanceof Map`, not `instanceof Set` — this rule only recognises the real global `Set` on the right-hand side.
    'function f(input: ReadonlySet<number> | number): void { if (input instanceof Map) { input.add(1); } }',
    // A private-named method as the MUTATING call itself (`input.#add()`), which is syntactically a MemberExpression whose property is a PrivateIdentifier, not a plain Identifier — this rule's own mutating-call detection only recognises a plain dotted Identifier method name, not a private one, even when it reads as `add`.
    'class C { #add(): void {} test(input: ReadonlySet<number> | number): void { if (input instanceof Set) { input.#add(); } } }',
    // `void (input instanceof Set)` is a UnaryExpression whose operator is `void`, not `!` — this rule's own negated-guard detection only recognises the `!` operator specifically, so the else-branch below is not guarded even though its argument is a genuine instanceof Set test.
    'function f(input: ReadonlySet<number> | number): void { if (void (input instanceof Set)) { doSomething(); } else { input.add(1); } }',
    // The else-branch of a NON-negated `if (input instanceof Set)` is the "not a Set" branch — it is never guarded, regardless of how the consequent is shaped.
    'function f(input: ReadonlySet<number> | number): void { if (input instanceof Set) { doSomething(); } else { input.add(1); } }',
    // The CONSEQUENT (not the alternate) of a negated `if (!(input instanceof Set))` is the "not a Set" branch — mutating there is never guarded, since the negated-guard idiom only ever protects the ALTERNATE of a negated test (or a later sibling, via the early-return idiom).
    'function f(input: ReadonlySet<number> | number): void { if (!(input instanceof Set)) { input.add(1); } else { doSomethingElse(); } }',
    // `input instanceof Set || input.add(...)` — a logical OR, not AND — runs the mutating call precisely when input is NOT a Set, so it is never guarded by this idiom (which only recognises `&&`).
    'function f(input: ReadonlySet<number> | number): void { (input instanceof Set) || input.add(1); }',
    // The ternary's ALTERNATE (the "not a Set" branch) is never guarded — only the consequent is.
    'function f(input: ReadonlySet<number> | number): void { (input instanceof Set) ? undefined : input.add(1); }',
    // A negated early-guard's consequent is a THREE-statement block whose LAST statement does not unconditionally exit (a statement follows the `return`) — this rule deliberately checks only the block's own last statement for an exit, not real control flow, so a `return` buried mid-block does not count.
    'function f(input: ReadonlySet<number> | number): void { if (!(input instanceof Set)) { logSomething(); return; logUnreachable(); } input.add(1); }',
    // The early-return idiom only protects a mutating call that comes AFTER the guard, never one that comes before it — a guard appearing LATER in the same block must never be mistaken for one preceding the mutating call.
    'function f(input: ReadonlySet<number> | number): void { input.add(1); if (!(input instanceof Set)) return; }',
  ],
  invalid: [
    // The early-return idiom recognised at Program (top-level) scope, not just inside a function/block — the preceding-sibling scan walks up through BlockStatement AND Program parents alike.
    {
      code: 'declare const input: ReadonlySet<number> | number; if (!(input instanceof Set)) throw new Error(); input.add(1);',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // The early-return idiom via `continue` inside a loop — `continue` unconditionally ends the current iteration, guarding a later sibling statement the same way `return`/`throw` do.
    {
      code: 'function f(items: (ReadonlySet<number> | number)[]): void { for (const input of items) { if (!(input instanceof Set)) continue; input.add(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // The early-return idiom via `break` inside a loop — `break` unconditionally exits the loop, guarding a later sibling statement the same way `return`/`throw` do.
    {
      code: 'function f(items: (ReadonlySet<number> | number)[]): void { for (const input of items) { if (!(input instanceof Set)) { break; } input.add(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    {
      // A TypeScript constructor parameter property: eslint-scope's own Parameter definition for it still names the bound Identifier itself, not the enclosing TSParameterProperty node, so this behaves identically to an ordinary parameter.
      code: 'class C { constructor(public input: ReadonlySet<number> | number) { if (input instanceof Set) { input.add(1); } } }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    {
      code: 'function f(input: ReadonlySet<number> | number): void { if (input instanceof Set) { input.add(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    {
      code: 'function f(input: ReadonlySet<number> | number): void { if (input instanceof Set) { input.delete(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'delete' } }],
    },
    {
      code: 'function f(input: ReadonlySet<number> | number): void { if (input instanceof Set) { input.clear(); } }',
      errors: [{ messageId: 'unsound', data: { method: 'clear' } }],
    },
    // Arrow function parameter.
    {
      code: 'const f = (input: ReadonlySet<number> | number): void => { if (input instanceof Set) { input.add(1); } };',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // Single-statement if consequent, no block braces.
    {
      code: 'function f(input: ReadonlySet<number> | number): void { if (input instanceof Set) input.add(1); }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // Wider union with more than two members still carries the same hole.
    {
      code: 'function f(input: ReadonlySet<string> | number | boolean): void { if (input instanceof Set) { input.add("x"); } }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // A type ALIAS to a ReadonlySet — confirmed via the TS compiler API that the checker's own type for an aliased parameter is the alias's real underlying type (symbol name 'ReadonlySet'), the same as writing it out directly; a purely syntactic version of this rule could not see through the alias at all.
    {
      code: 'type RO = ReadonlySet<number>; function f(input: RO | number): void { if (input instanceof Set) { input.add(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // A BARE ReadonlySet parameter, no union at all — instanceof Set discards the read-only guarantee here too; confirmed via tsc --strict that this compiles clean with zero errors.
    {
      code: 'function f(input: ReadonlySet<number>): void { if (input instanceof Set) { input.add(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // The early-return guard idiom — the mutating call is a sibling statement AFTER the guard, not nested inside it.
    {
      code: 'function f(input: ReadonlySet<number> | number): void { if (!(input instanceof Set)) return; input.add(1); }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // The early-throw variant of the same idiom.
    {
      code: "function f(input: ReadonlySet<number> | number): void { if (!(input instanceof Set)) throw new Error('not a set'); input.add(1); }",
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // The early-return idiom with a braced, multi-statement consequent that still unconditionally exits as its last statement.
    {
      code: 'function f(input: ReadonlySet<number> | number): void { if (!(input instanceof Set)) { logSomething(); return; } input.add(1); }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // The logical-AND guard idiom.
    {
      code: 'function f(input: ReadonlySet<number> | number): void { (input instanceof Set) && input.add(1); }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // The ternary guard idiom.
    {
      code: 'function f(input: ReadonlySet<number> | number): void { (input instanceof Set) ? input.add(1) : undefined; }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // The else-of-negated-test guard idiom.
    {
      code: 'function f(input: ReadonlySet<number> | number): void { if (!(input instanceof Set)) { doSomething(); } else { input.add(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // A plain local `const` (not a parameter) whose own declared type includes a ReadonlySet constituent — the type is read at the VariableDeclarator's own `id` node, the same declaration-site check already used for parameters, so this is caught the same way.
    {
      code: 'declare function getShared(): ReadonlySet<number> | number; function f(): void { const frozen: ReadonlySet<number> | number = getShared(); if (frozen instanceof Set) { frozen.add(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // A destructured local binding falls out of the same check for free: destructuring only changes how the initializer is computed, not the DefinitionType.Variable eslint-scope records for the bound identifier `frozen`.
    {
      code: 'declare function getShared(): { frozen: ReadonlySet<number> | number }; function f(): void { const { frozen } = getShared(); if (frozen instanceof Set) { frozen.add(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
  ],
});
