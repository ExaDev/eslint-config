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
    // Regression: a named alias to `any` -- the same vacuous-empty-property-loop mechanism as `unknown` above, and unsound in the same way rather than merely redundant: confirmed directly that a `Readonly<any>` parameter rejects `undefined` (TS2345) where the unwrapped `any` accepts it, so the wrap narrows what a caller may pass exactly as it does for `unknown`. Confirmed this exact case previously failed here too.
    'type Foo = any; function f(x: Foo): void {}',
    // Regression: a named alias to `never` -- the bottom type carries none of this rule's object-family flags either, and a parameter that can never actually be called with a value has no genuine object shape to wrap. Confirmed this exact case previously failed here too.
    'type Foo = never; function f(x: Foo): void {}',
    // Regression: a named alias to a bare primitive keyword type (`string`) -- the SAME vacuous-empty-property-loop root cause as unknown/any/never above, not a special case of it: `checker.getPropertiesOfType`/`getIndexInfosOfType` report zero entries for the raw `string` type just as they do for `unknown`, since primitive-keyword types carry no `ts.TypeFlags.Object` either. Confirmed this exact case previously failed here too, proving the fix is a general "must be a genuinely concrete object type" gate rather than an `unknown`/`any`-only exclusion list.
    'type Foo = string; function f(x: Foo): void {}',
    // Regression: a named alias to the `object` keyword type -- a THIRD flag family beyond the any/unknown/never and primitive-keyword cases above, since `object` carries `ts.TypeFlags.NonPrimitive` and appears in neither. It therefore pins the gate as the general "must carry `ts.TypeFlags.Object`" question rather than an exclusion list assembled from whichever families the cases above happen to name: a narrower gate spelled `Any | Unknown | Never | PRIMITIVE_LIKE_FLAGS` (reusing this rule's own existing constant, the obvious way to write that mistake) passes every case above yet still wrongly reports this one. Confirmed it did fire here before the gate existed -- though as a pure false positive rather than an unsound wrap: unlike `Readonly<unknown>`, `Readonly<object>` resolves straight back to `object` and accepts exactly what `object` accepted.
    'type Foo = object; function f(x: Foo): void {}',
    // Regression: a named alias to `void` -- `ts.TypeFlags.Void` sits outside PRIMITIVE_LIKE_FLAGS too (that constant covers only StringLike/NumberLike/BooleanLike/BigIntLike/ESSymbolLike/Null/Undefined), so like `object` above it is caught by the general Object gate and by no narrower flag list derived from the primitive cases. `Readonly<void>` also resolves back to `void`, so this was likewise a false positive rather than an unsound wrap.
    'type Foo = void; function f(x: Foo): void {}',
    // An unconstrained generic type parameter is out of scope: its real property set is not knowable at the declaration site, so flatness cannot be proven -- excluded by the `ts.TypeFlags.TypeParameter` check (and by the Object gate, which a type parameter never carries either).
    'function f<T>(x: T): void {}',
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
    // A mapped-type instantiation is a genuine object type and must still be reported -- the counterpart to the valid cases above, proving the `ts.TypeFlags.Object` gate excludes only non-object types rather than quietly narrowing the rule down to interfaces and inline literals. `Record<string, number>` resolves to a type carrying ObjectFlags.Mapped (not Interface or Anonymous, the two shapes every other invalid case here happens to produce), and its string index signature of primitives is flat exactly as the inline form above is. Confirmed the wrap is sound: `Readonly<Record<string, number>>` keeps the index signature, so a caller can still pass `{ k: 1 }`.
    {
      code: 'type Dict = Record<string, number>; function f(x: Dict): void {}',
      output: 'type Dict = Record<string, number>; function f(x: Readonly<Dict>): void {}',
      errors: [{ messageId: 'preferReadonlyObject' }],
    },
    // An OPTIONAL property resolves to `string | undefined`, which isFlatPropertyType's union recursion still counts as flat, so this is reported and wrapped like any other flat shape. Pinned because a `| undefined` member is exactly where an over-broad "reject anything that could be undefined" gate would wrongly go quiet: `Readonly<T>` is homomorphic, so it preserves the `?` modifier and leaves the `| undefined` intact (confirmed directly that `Readonly<{ a?: string }>` still accepts `{}`), and none of that resembles the way `Readonly<unknown>` collapses the top type.
    {
      code: 'type Opt = { a?: string }; function f(x: Opt): void {}',
      output: 'type Opt = { a?: string }; function f(x: Readonly<Opt>): void {}',
      errors: [{ messageId: 'preferReadonlyObject' }],
    },
  ],
});
