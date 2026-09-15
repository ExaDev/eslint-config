import { describe, expect, it } from 'vitest';
import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from './no-map-instanceof-mutation';

describe('rule metadata', () => {
  it('exposes the expected name, docs URL, description, and message text', () => {
    expect(rule.name).toBe('no-map-instanceof-mutation');
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-map-instanceof-mutation.ts');
    expect(rule.meta.docs?.description).toBe(
      "Disallow mutating calls on a parameter or local variable whose real type includes a ReadonlyMap, narrowed via `instanceof Map`, which silently discards the declared readonly guarantee.",
    );
    expect(rule.meta.messages.unsound).toBe(
      "'{{ method }}' mutates a parameter or local variable narrowed by 'instanceof Map' — Map is declared as extending ReadonlyMap, so 'instanceof Map' narrows straight past the readonly guarantee to the full mutable interface, and a value whose real type includes ReadonlyMap (a caller's map, for a parameter; the value's own declared type, for a local variable) can be mutated here despite that readonly guarantee. Copy the map before mutating (e.g. `new Map(input)`), or narrow with a check that preserves readonly instead of 'instanceof Map'.",
    );
  });
});

// This rule reads real type information (checker.getTypeAtLocation, then a symbol-name check since there is no isArrayType equivalent for maps), specifically to see through a type alias and to catch a bare (non-union) ReadonlyMap parameter — neither is visible from the parameter's own TSESTree type-annotation syntax alone. `projectService.allowDefaultProject` lets each inline code snippet below run against an ad hoc single-file project, matching no-array-isarray-mutation.test.ts's own setup for the same reason.
const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: { allowDefaultProject: ['*.ts*'] },
      tsconfigRootDir: import.meta.dirname,
    },
  },
});

ruleTester.run('no-map-instanceof-mutation', rule, {
  valid: [
    // A plain (non-union, non-readonly) Map parameter has no readonly guarantee to lose in the first place — out of scope for this rule regardless of the instanceof guard or the mutating call.
    'function f(input: Map<string, number>): void { if (input instanceof Map) { input.set("a", 1); } }',
    // Narrowed via instanceof Map but only read, never mutated — get/has/forEach are not in the mutating set.
    'function f(input: ReadonlyMap<string, number> | number): void { if (input instanceof Map) { input.get("a"); input.has("a"); input.forEach(() => {}); } }',
    // Mutated, but with no instanceof Map guard anywhere in scope — out of scope for THIS rule specifically. This snippet would not actually type-check under tsc (input.set is not callable on an
    // un-narrowed `ReadonlyMap<string, number> | number` union), but detection here is guard-gated regardless of whether the call site itself compiles.
    'function f(input: ReadonlyMap<string, number> | number): void { input.set("a", 1); }',
    // Guarded, but the mutating call targets a differently-named variable, not the narrowed parameter itself.
    'function f(input: ReadonlyMap<string, number> | number): void { if (input instanceof Map) { const other: Map<string, number> = new Map(); other.set("a", 1); } }',
    // instanceof Map narrows a variable that is not this function's parameter at all.
    'function f(input: ReadonlyMap<string, number> | number): void { const local: unknown = new Map(); if (local instanceof Map) { local.set("a", 1); } }',
    // Mutating call sits outside the guarded branch (after the if, not inside its consequent).
    'function f(input: ReadonlyMap<string, number> | number): void { if (input instanceof Map) { /* no-op */ } input.set("a", 1); }',
    // The guard narrows a different parameter than the one being mutated.
    'function f(input: ReadonlyMap<string, number> | number, other: Map<string, number>): void { if (other instanceof Map) { input.set("a", 1); } }',
    // Mutating call on an identifier that never resolves to a declared variable at all.
    'undeclaredGlobalThing.set("a", 1);',
    // instanceof Map's own left-hand side is not a plain identifier, so it cannot resolve back to the parameter at all.
    'function f(input: ReadonlyMap<string, number> | number): void { if (new Map() instanceof Map) { input.set("a", 1); } }',
    // The early-return idiom's guard tests the WRONG variable — a preceding sibling if-statement negated-guards `other`, not `input`, so the mutation is not actually guarded.
    'function f(input: ReadonlyMap<string, number> | number, other: ReadonlyMap<string, number> | number): void { if (!(other instanceof Map)) return; input.set("a", 1); }',
    // An early-return if-statement that has an `else` branch is not the early-return idiom (the function does not unconditionally stop there), so it is deliberately not treated as a guard for a later sibling statement.
    'function f(input: ReadonlyMap<string, number> | number): void { if (!(input instanceof Map)) { doSomething(); } else { doSomethingElse(); } input.set("a", 1); }',
    // A `let` local reassigned to a definitely-mutable value before the guard does NOT produce a false positive here, but not for the reason it might look like: this rule deliberately checks the type at the declaration's own name node, and `let value;` with no type annotation and no initializer has no static type to read there at all — confirmed via the TS compiler API that `checker.getTypeAtLocation` on this bare declaration returns `any` (TypeScript's "evolving" type for an uninitialized `let`, which only accumulates a real type from the assignments that follow it, not before). With no ReadonlyMap constituent visible at the declaration itself, the check correctly finds nothing to report, regardless of what value flows through the variable afterwards.
    'function f(x: ReadonlyMap<string, number> | number): void { let value; value = x; value = new Map<string, number>(); if (value instanceof Map) { value.set("a", 1); } }',
    // A negated early-guard whose consequent does not unconditionally exit (no return/throw/continue/break as its last statement) is not the early-return idiom — execution can fall through past it, so a later sibling mutation is not provably guarded.
    'function f(input: ReadonlyMap<string, number> | number): void { if (!(input instanceof Map)) { doSomething(); } input.set("a", 1); }',
    // instanceof Map narrows a caught exception binding, not a parameter or a plain local variable declaration — eslint-scope records a catch clause's own binding under a distinct definition kind, so this rule never even reaches the type check for it.
    'try { doSomething(); } catch (input) { if (input instanceof Map) { input.set("a", 1); } }',
    // Guarded by an ordinary if-test that is not an instanceof Map check at all — this rule only recognises instanceof Map specifically, not just "any truthy guard".
    'declare const x: number; function f(input: ReadonlyMap<string, number> | number): void { if (x > 0) { input.set("a", 1); } }',
    // A loose (`==`) comparison against `Map`, not `instanceof` — this rule only recognises the real `instanceof` operator.
    'function f(input: ReadonlyMap<string, number> | number): void { (input == Map) && input.set("a", 1); }',
    // `input instanceof Set`, not `instanceof Map` — this rule only recognises the real global `Map` on the right-hand side.
    'function f(input: ReadonlyMap<string, number> | number): void { if (input instanceof Set) { input.set("a", 1); } }',
    // A private-named method as the MUTATING call itself (`input.#set()`), which is syntactically a MemberExpression whose property is a PrivateIdentifier, not a plain Identifier — this rule's own mutating-call detection only recognises a plain dotted Identifier method name, not a private one, even when it reads as `set`.
    'class C { #set(): void {} test(input: ReadonlyMap<string, number> | number): void { if (input instanceof Map) { input.#set(); } } }',
    // `void (input instanceof Map)` is a UnaryExpression whose operator is `void`, not `!` — this rule's own negated-guard detection only recognises the `!` operator specifically, so the else-branch below is not guarded even though its argument is a genuine instanceof Map test.
    'function f(input: ReadonlyMap<string, number> | number): void { if (void (input instanceof Map)) { doSomething(); } else { input.set("a", 1); } }',
    // The else-branch of a NON-negated `if (input instanceof Map)` is the "not a Map" branch — it is never guarded, regardless of how the consequent is shaped.
    'function f(input: ReadonlyMap<string, number> | number): void { if (input instanceof Map) { doSomething(); } else { input.set("a", 1); } }',
    // The CONSEQUENT (not the alternate) of a negated `if (!(input instanceof Map))` is the "not a Map" branch — mutating there is never guarded, since the negated-guard idiom only ever protects the ALTERNATE of a negated test (or a later sibling, via the early-return idiom).
    'function f(input: ReadonlyMap<string, number> | number): void { if (!(input instanceof Map)) { input.set("a", 1); } else { doSomethingElse(); } }',
    // `input instanceof Map || input.set(...)` — a logical OR, not AND — runs the mutating call precisely when input is NOT a Map, so it is never guarded by this idiom (which only recognises `&&`).
    'function f(input: ReadonlyMap<string, number> | number): void { (input instanceof Map) || input.set("a", 1); }',
    // The ternary's ALTERNATE (the "not a Map" branch) is never guarded — only the consequent is.
    'function f(input: ReadonlyMap<string, number> | number): void { (input instanceof Map) ? undefined : input.set("a", 1); }',
    // A negated early-guard's consequent is a THREE-statement block whose LAST statement does not unconditionally exit (a statement follows the `return`) — this rule deliberately checks only the block's own last statement for an exit, not real control flow, so a `return` buried mid-block does not count.
    'function f(input: ReadonlyMap<string, number> | number): void { if (!(input instanceof Map)) { logSomething(); return; logUnreachable(); } input.set("a", 1); }',
    // The early-return idiom only protects a mutating call that comes AFTER the guard, never one that comes before it — a guard appearing LATER in the same block must never be mistaken for one preceding the mutating call.
    'function f(input: ReadonlyMap<string, number> | number): void { input.set("a", 1); if (!(input instanceof Map)) return; }',
  ],
  invalid: [
    // The early-return idiom recognised at Program (top-level) scope, not just inside a function/block — the preceding-sibling scan walks up through BlockStatement AND Program parents alike.
    {
      code: 'declare const input: ReadonlyMap<string, number> | number; if (!(input instanceof Map)) throw new Error(); input.set("a", 1);',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // The early-return idiom via `continue` inside a loop — `continue` unconditionally ends the current iteration, guarding a later sibling statement the same way `return`/`throw` do.
    {
      code: 'function f(items: (ReadonlyMap<string, number> | number)[]): void { for (const input of items) { if (!(input instanceof Map)) continue; input.set("a", 1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // The early-return idiom via `break` inside a loop — `break` unconditionally exits the loop, guarding a later sibling statement the same way `return`/`throw` do.
    {
      code: 'function f(items: (ReadonlyMap<string, number> | number)[]): void { for (const input of items) { if (!(input instanceof Map)) { break; } input.set("a", 1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    {
      // A TypeScript constructor parameter property: eslint-scope's own Parameter definition for it still names the bound Identifier itself, not the enclosing TSParameterProperty node, so this behaves identically to an ordinary parameter.
      code: 'class C { constructor(public input: ReadonlyMap<string, number> | number) { if (input instanceof Map) { input.set("a", 1); } } }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    {
      code: 'function f(input: ReadonlyMap<string, number> | number): void { if (input instanceof Map) { input.set("a", 1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    {
      code: 'function f(input: ReadonlyMap<string, number> | number): void { if (input instanceof Map) { input.delete("a"); } }',
      errors: [{ messageId: 'unsound', data: { method: 'delete' } }],
    },
    {
      code: 'function f(input: ReadonlyMap<string, number> | number): void { if (input instanceof Map) { input.clear(); } }',
      errors: [{ messageId: 'unsound', data: { method: 'clear' } }],
    },
    // Arrow function parameter.
    {
      code: 'const f = (input: ReadonlyMap<string, number> | number): void => { if (input instanceof Map) { input.set("a", 1); } };',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // Single-statement if consequent, no block braces.
    {
      code: 'function f(input: ReadonlyMap<string, number> | number): void { if (input instanceof Map) input.set("a", 1); }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // Wider union with more than two members still carries the same hole.
    {
      code: 'function f(input: ReadonlyMap<string, number> | number | boolean): void { if (input instanceof Map) { input.set("a", 1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // A type ALIAS to a ReadonlyMap — confirmed via the TS compiler API that the checker's own type for an aliased parameter is the alias's real underlying type (symbol name 'ReadonlyMap'), the same as writing it out directly; a purely syntactic version of this rule could not see through the alias at all.
    {
      code: 'type RO = ReadonlyMap<string, number>; function f(input: RO | number): void { if (input instanceof Map) { input.set("a", 1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // A BARE ReadonlyMap parameter, no union at all — instanceof Map discards the readonly guarantee here too; confirmed via tsc --strict that this compiles clean with zero errors.
    {
      code: 'function f(input: ReadonlyMap<string, number>): void { if (input instanceof Map) { input.set("a", 1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // The early-return guard idiom — the mutating call is a sibling statement AFTER the guard, not nested inside it.
    {
      code: 'function f(input: ReadonlyMap<string, number> | number): void { if (!(input instanceof Map)) return; input.set("a", 1); }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // The early-throw variant of the same idiom.
    {
      code: 'function f(input: ReadonlyMap<string, number> | number): void { if (!(input instanceof Map)) throw new Error("not a map"); input.set("a", 1); }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // The early-return idiom with a braced, multi-statement consequent that still unconditionally exits as its last statement.
    {
      code: 'function f(input: ReadonlyMap<string, number> | number): void { if (!(input instanceof Map)) { logSomething(); return; } input.set("a", 1); }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // The logical-AND guard idiom.
    {
      code: 'function f(input: ReadonlyMap<string, number> | number): void { input instanceof Map && input.set("a", 1); }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // The ternary guard idiom.
    {
      code: 'function f(input: ReadonlyMap<string, number> | number): void { input instanceof Map ? input.set("a", 1) : undefined; }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // The else-of-negated-test guard idiom.
    {
      code: 'function f(input: ReadonlyMap<string, number> | number): void { if (!(input instanceof Map)) { doSomething(); } else { input.set("a", 1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // A plain local `const` (not a parameter) whose own declared type includes a ReadonlyMap constituent — the type is read at the VariableDeclarator's own `id` node, the same declaration-site check already used for parameters, so this is caught the same way.
    {
      code: 'declare function getShared(): ReadonlyMap<string, number> | number; function f(): void { const frozen: ReadonlyMap<string, number> | number = getShared(); if (frozen instanceof Map) { frozen.set("a", 1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // A destructured local binding falls out of the same check for free: destructuring only changes how the initializer is computed, not the DefinitionType.Variable eslint-scope records for the bound identifier `frozen`.
    {
      code: 'declare function getShared(): { frozen: ReadonlyMap<string, number> | number }; function f(): void { const { frozen } = getShared(); if (frozen instanceof Map) { frozen.set("a", 1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
  ],
});
