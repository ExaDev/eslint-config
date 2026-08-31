import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from './prefer-readonly-object-param';

// This rule reads real type information (checker.getPropertiesOfType/getIndexInfosOfType/getSignaturesOfType, plus isArrayType/isTupleType and symbol-name/flag checks), specifically to resolve a named interface/type-alias reference down to its real properties and to see through generics -- none of which is visible from the parameter's own TSESTree type-annotation syntax alone. `projectService.allowDefaultProject` lets each inline code snippet below run against an ad hoc single-file project, matching this package's other type-aware rule tests (e.g. no-map-instanceof-mutation.test.ts).
const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: { allowDefaultProject: ['*.ts*'] },
      tsconfigRootDir: import.meta.dirname,
    },
  },
});

ruleTester.run('prefer-readonly-object-param', rule, {
  valid: [
    // Already Readonly-wrapped -- nothing left for this rule to do.
    'function f(x: Readonly<{ a: string; b: number }>): void {}',
    // A nested plain object property is NOT flat -- a shallow Readonly<T> would not protect it, matching the native rule's own deep-readonly boundary (confirmed in verify-native.test.ts).
    'function f(x: { a: { nested: string } }): void {}',
    // An array-typed property is NOT flat.
    'function f(x: { a: string[] }): void {}',
    // A Map-typed property is NOT flat.
    'function f(x: { a: Map<string, number> }): void {}',
    // A Set-typed property is NOT flat.
    'function f(x: { a: Set<string> }): void {}',
    // A plain array parameter itself is prefer-readonly-array-param's own domain, not this rule's.
    'function f(x: number[]): void {}',
    // A plain tuple parameter itself is also out of scope for this rule.
    'function f(x: [string, number]): void {}',
    // A destructured object parameter has no single parameter-shaped type annotation to mark readonly.
    'function f({ a }: { a: string }): void {}',
    // A parameter with no type annotation at all has nothing for this rule to inspect.
    'function f(x): void {}',
    // A plain primitive parameter is not an object shape at all.
    'function f(x: string): void {}',
    // A pure index signature whose VALUE type is itself an array is NOT flat -- matching the native rule's own boundary (verify-native.test.ts): getPropertiesOfType reports zero named properties here, so the index-signature value needs the identical flatness check, not a free pass.
    'function f(x: { [key: string]: string[] }): void {}',
    // A HYBRID callable-plus-data shape is NOT flat, even though it is callable -- confirmed directly that Readonly<{ (): void; prop: string[] }> still compiles with x.cb.prop.push(...) inside the function, and that the real native rule still flags the wrapped form too. Being callable only counts as flat when the callable has no properties/index signature of its own (a pure `() => void`).
    'function f(x: { cb: { (): void; prop: string[] } }): void {}',
    // An interface whose properties are ALREADY all readonly by hand -- nothing left to fix; re-wrapping in Readonly<...> would be pure churn. Confirmed against the native rule: it already accepts this shape unwrapped.
    'interface Frozen { readonly a: string; readonly b: number } function f(x: Frozen): void {}',
    // A named alias to an ALREADY-Readonly-wrapped type -- wrapping it again would be a redundant double wrap. Confirmed against the native rule: it already accepts the alias unwrapped.
    'interface Foo { a: string; b: number } type ROFoo = Readonly<Foo>; function f(x: ROFoo): void {}',
    // A construct-signature-only type has zero named properties, so it is NOT flat despite vacuously passing the property loop -- confirmed directly that Readonly<{ new (): Date }> is a real compile error at the call site (`new x()`), since Readonly<T>'s mapped type drops construct signatures the same way it drops call signatures.
    'function f(x: { new (): Date }): Date { return new x(); }',
    // Regression: a named alias to `unknown` -- confirmed as a real downstream defect (a consumer package's `EvaluationContext` parameter, typed `type EvaluationContext = unknown`, was wrapped in `Readonly<EvaluationContext>`; TypeScript's mapped-type machinery collapses `Readonly<unknown>` to `{}`, and `{}` rejects `undefined`, so the "fix" narrowed a type explicitly allowed to be `undefined` into one that isn't -- unsound, not merely redundant). `unknown` carries none of the object/array/tuple/callable/class/Map/Set flags this rule already excludes, and `checker.getPropertiesOfType`/`getIndexInfosOfType` both report zero entries for it -- not because it has no mutable state, but because it isn't an object type at all, so the old property/index-signature loop vacuously "passed" it. Confirmed this exact case previously failed here (flagged and autofixed to `Readonly<EvaluationContext>`) before the `ts.TypeFlags.Object` gate was added.
    'type EvaluationContext = unknown; function f(x: EvaluationContext): void {}',
    // Regression: a named alias to `any` -- the same vacuous-empty-property-loop mechanism as `unknown` above, and `Readonly<any>` is equally nonsensical (there is no genuine object shape to shallow-protect). Confirmed this exact case previously failed here too.
    'type Foo = any; function f(x: Foo): void {}',
    // Regression: a named alias to `never` -- the bottom type carries none of this rule's object-family flags either, and a parameter that can never actually be called with a value has no genuine object shape to wrap. Confirmed this exact case previously failed here too.
    'type Foo = never; function f(x: Foo): void {}',
    // Regression: a named alias to a bare primitive keyword type (`string`) -- the SAME vacuous-empty-property-loop root cause as unknown/any/never above, not a special case of it: `checker.getPropertiesOfType`/`getIndexInfosOfType` report zero entries for the raw `string` type just as they do for `unknown`, since primitive-keyword types carry no `ts.TypeFlags.Object` either. Confirmed this exact case previously failed here too, proving the fix is a general "must be a genuinely concrete object type" gate rather than an `unknown`/`any`-only exclusion list.
    'type Foo = string; function f(x: Foo): void {}',
  ],
  invalid: [
    // A flat inline object literal -- fixed by wrapping the whole literal in Readonly<...>.
    {
      code: 'function f(x: { a: string; b: number }): void {}',
      output: 'function f(x: Readonly<{ a: string; b: number }>): void {}',
      errors: [{ messageId: 'preferReadonlyObject' }],
    },
    // A flat named interface reference -- fixed by wrapping the reference itself, not the interface's own declaration.
    {
      code: 'interface Flat { a: string; b: number } function f(x: Flat): void {}',
      output: 'interface Flat { a: string; b: number } function f(x: Readonly<Flat>): void {}',
      errors: [{ messageId: 'preferReadonlyObject' }],
    },
    // A flat named type alias reference -- fixed the same way.
    {
      code: 'type Flat = { a: string; b: number }; function f(x: Flat): void {}',
      output: 'type Flat = { a: string; b: number }; function f(x: Readonly<Flat>): void {}',
      errors: [{ messageId: 'preferReadonlyObject' }],
    },
    // A function-typed property -- confirmed safe against the native rule (verify-native.test.ts), so this fires and fixes the same as any other flat shape.
    {
      code: "function f(x: { a: string; cb: () => void }): void {}",
      output: "function f(x: Readonly<{ a: string; cb: () => void }>): void {}",
      errors: [{ messageId: 'preferReadonlyObject' }],
    },
    // A default-valued parameter -- proves the ported traversal machinery resolves the annotation through the AssignmentPattern's left identifier, not just for a bare concrete-function parameter.
    {
      code: "function f(x: { a: string } = { a: 'x' }): void {}",
      output: "function f(x: Readonly<{ a: string }> = { a: 'x' }): void {}",
      errors: [{ messageId: 'preferReadonlyObject' }],
    },
    // A constructor parameter property -- proves the annotation resolves through TSParameterProperty's inner parameter too.
    {
      code: 'class C { constructor(private x: { a: string }) {} }',
      output: 'class C { constructor(private x: Readonly<{ a: string }>) {} }',
      errors: [{ messageId: 'preferReadonlyObject' }],
    },
    // A declaration-only shape with no body of its own -- an interface method signature.
    {
      code: 'interface I { m(x: { a: string }): void; }',
      output: 'interface I { m(x: Readonly<{ a: string }>): void; }',
      errors: [{ messageId: 'preferReadonlyObject' }],
    },
    // A declaration-only shape -- a standalone function type alias.
    {
      code: 'type F = (x: { a: string }) => void;',
      output: 'type F = (x: Readonly<{ a: string }>) => void;',
      errors: [{ messageId: 'preferReadonlyObject' }],
    },
    // A pure index signature whose value type is a primitive IS flat -- confirmed against the native rule (verify-native.test.ts).
    {
      code: 'function f(x: { [key: string]: number }): void {}',
      output: 'function f(x: Readonly<{ [key: string]: number }>): void {}',
      errors: [{ messageId: 'preferReadonlyObject' }],
    },
  ],
});
