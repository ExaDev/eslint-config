import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from './no-map-instanceof-mutation';

// This rule reads real type information (checker.getTypeAtLocation, then a symbol-name check since there is no isArrayType equivalent for maps), specifically to see through a type alias and to catch a bare (non-union) ReadonlyMap parameter -- neither is visible from the parameter's own TSESTree type-annotation syntax alone. `projectService.allowDefaultProject` lets each inline code snippet below run against an ad hoc single-file project, matching no-array-isarray-mutation.test.ts's own setup for the same reason.
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
    // A plain (non-union, non-readonly) Map parameter has no readonly guarantee to lose in the first place -- out of scope for this rule regardless of the instanceof guard or the mutating call.
    'function f(input: Map<string, number>): void { if (input instanceof Map) { input.set("a", 1); } }',
    // Narrowed via instanceof Map but only read, never mutated -- get/has/forEach are not in the mutating set.
    'function f(input: ReadonlyMap<string, number> | number): void { if (input instanceof Map) { input.get("a"); input.has("a"); input.forEach(() => {}); } }',
    // Mutated, but with no instanceof Map guard anywhere in scope -- out of scope for THIS rule specifically. This snippet would not actually type-check under tsc (input.set is not callable on an
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
    // The early-return idiom's guard tests the WRONG variable -- a preceding sibling if-statement negated-guards `other`, not `input`, so the mutation is not actually guarded.
    'function f(input: ReadonlyMap<string, number> | number, other: ReadonlyMap<string, number> | number): void { if (!(other instanceof Map)) return; input.set("a", 1); }',
    // An early-return if-statement that has an `else` branch is not the early-return idiom (the function does not unconditionally stop there), so it is deliberately not treated as a guard for a later sibling statement.
    'function f(input: ReadonlyMap<string, number> | number): void { if (!(input instanceof Map)) { doSomething(); } else { doSomethingElse(); } input.set("a", 1); }',
    // A `let` local reassigned to a definitely-mutable value before the guard does NOT produce a false positive here, but not for the reason it might look like: this rule deliberately checks the type at the declaration's own name node, and `let value;` with no type annotation and no initializer has no static type to read there at all -- confirmed via the TS compiler API that `checker.getTypeAtLocation` on this bare declaration returns `any` (TypeScript's "evolving" type for an uninitialized `let`, which only accumulates a real type from the assignments that follow it, not before). With no ReadonlyMap constituent visible at the declaration itself, the check correctly finds nothing to report, regardless of what value flows through the variable afterwards.
    'function f(x: ReadonlyMap<string, number> | number): void { let value; value = x; value = new Map<string, number>(); if (value instanceof Map) { value.set("a", 1); } }',
  ],
  invalid: [
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
    // A type ALIAS to a ReadonlyMap -- confirmed via the TS compiler API that the checker's own type for an aliased parameter is the alias's real underlying type (symbol name 'ReadonlyMap'), the same as writing it out directly; a purely syntactic version of this rule could not see through the alias at all.
    {
      code: 'type RO = ReadonlyMap<string, number>; function f(input: RO | number): void { if (input instanceof Map) { input.set("a", 1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // A BARE ReadonlyMap parameter, no union at all -- instanceof Map discards the readonly guarantee here too; confirmed via tsc --strict that this compiles clean with zero errors.
    {
      code: 'function f(input: ReadonlyMap<string, number>): void { if (input instanceof Map) { input.set("a", 1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'set' } }],
    },
    // The early-return guard idiom -- the mutating call is a sibling statement AFTER the guard, not nested inside it.
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
    // A plain local `const` (not a parameter) whose own declared type includes a ReadonlyMap constituent -- the type is read at the VariableDeclarator's own `id` node, the same declaration-site check already used for parameters, so this is caught the same way.
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
