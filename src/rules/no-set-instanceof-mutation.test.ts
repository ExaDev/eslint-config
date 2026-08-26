import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from './no-set-instanceof-mutation';

// This rule reads real type information (checker.getTypeAtLocation, symbol-name matching), specifically to see through a type alias and to catch a bare (non-union) ReadonlySet parameter -- neither is visible from the parameter's own TSESTree type-annotation syntax alone. `projectService.allowDefaultProject` lets each inline code snippet below run against an ad hoc single-file project, matching no-array-isarray-mutation.test.ts's own setup for the same reason.
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
    // A plain (non-union, non-readonly) Set parameter has no read-only guarantee to lose in the first place -- out of scope for this rule regardless of the instanceof Set guard or the mutating call.
    'function f(input: Set<number>): void { if (input instanceof Set) { input.add(1); } }',
    // Narrowed via instanceof Set but only read, never mutated -- has/forEach/values are not in the mutating set.
    'function f(input: ReadonlySet<number> | number): void { if (input instanceof Set) { input.has(1); input.forEach((x) => x); input.values(); } }',
    // Mutated, but with no instanceof Set guard anywhere in scope -- out of scope for THIS rule specifically. This snippet would not actually type-check under tsc (input.add is not callable on an un-narrowed
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
    // The early-return idiom's guard tests the WRONG variable -- a preceding sibling if-statement negated-guards `other`, not `input`, so the mutation is not actually guarded.
    'function f(input: ReadonlySet<number> | number, other: ReadonlySet<number> | number): void { if (!(other instanceof Set)) return; input.add(1); }',
    // An early-return if-statement that has an `else` branch is not the early-return idiom (the function does not unconditionally stop there), so it is deliberately not treated as a guard for a later sibling statement.
    'function f(input: ReadonlySet<number> | number): void { if (!(input instanceof Set)) { doSomething(); } else { doSomethingElse(); } input.add(1); }',
  ],
  invalid: [
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
    // A type ALIAS to a ReadonlySet -- confirmed via the TS compiler API that the checker's own type for an aliased parameter is the alias's real underlying type (symbol name 'ReadonlySet'), the same as writing it out directly; a purely syntactic version of this rule could not see through the alias at all.
    {
      code: 'type RO = ReadonlySet<number>; function f(input: RO | number): void { if (input instanceof Set) { input.add(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // A BARE ReadonlySet parameter, no union at all -- instanceof Set discards the read-only guarantee here too; confirmed via tsc --strict that this compiles clean with zero errors.
    {
      code: 'function f(input: ReadonlySet<number>): void { if (input instanceof Set) { input.add(1); } }',
      errors: [{ messageId: 'unsound', data: { method: 'add' } }],
    },
    // The early-return guard idiom -- the mutating call is a sibling statement AFTER the guard, not nested inside it.
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
  ],
});
