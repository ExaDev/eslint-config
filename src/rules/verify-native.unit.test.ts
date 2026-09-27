import { RuleTester } from '@typescript-eslint/rule-tester';
import type { TSESLint } from '@typescript-eslint/utils';
import tseslintPlugin from 'typescript-eslint';

// typescript-eslint's own `plugin` export is typed as `CompatiblePlugin`, which declares only `meta` -- deliberately minimal for cross-ESLint-version compatibility -- even though the real runtime object also carries `rules`. Narrowed here with an `in` guard rather than an `as` assertion, since the property genuinely may be absent under the declared type.
function hasRules(plugin: object): plugin is { rules: Record<string, TSESLint.RuleModule<string, readonly unknown[]>> } {
  return 'rules' in plugin && typeof plugin.rules === 'object' && plugin.rules !== null;
}

if (!hasRules(tseslintPlugin.plugin)) {
  throw new Error("typescript-eslint's plugin export no longer exposes a 'rules' map -- verify-native.test.ts can't verify the native rule's behaviour without it.");
}

const rule = tseslintPlugin.plugin.rules['prefer-readonly-parameter-types'];
if (rule === undefined) {
  throw new Error("typescript-eslint's plugin export no longer registers a 'prefer-readonly-parameter-types' rule -- verify-native.test.ts can't verify a rule that doesn't exist.");
}

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: { allowDefaultProject: ['*.ts*'] },
      tsconfigRootDir: import.meta.dirname,
    },
  },
});

ruleTester.run('prefer-readonly-parameter-types (native, verification only)', rule, {
  valid: [
    // Flat object wrapped in Readonly<T> -- claim: this satisfies the native rule.
    'function f(x: Readonly<{ a: string; b: number }>): void {}',
    // Named interface wrapped in Readonly<T>.
    'interface Foo { a: string; b: number } function f(x: Readonly<Foo>): void {}',
    // Function-typed property -- claim: Readonly<T> is sufficient (no nested mutable state via a callback).
    'function f(x: Readonly<{ a: string; cb: () => void }>): void {}',
    // Union of primitive literals as a property -- claim: still flat.
    'function f(x: Readonly<{ a: "x" | "y"; b: 1 | 2 }>): void {}',
    // Optional primitive property.
    'function f(x: Readonly<{ a?: string }>): void {}',
    // Primitive string-index signature only -- claim TBD: does Readonly<T> satisfy the native rule here?
    'function f(x: Readonly<{ [key: string]: number }>): void {}',
    // Already-readonly properties, no Readonly<T> wrapper at all -- claim: satisfies the native rule without wrapping, since there is nothing left for a wrapper to add.
    'interface Frozen { readonly a: string; readonly b: number } function f(x: Frozen): void {}',
    // A named alias to an already-Readonly<T>-wrapped type -- claim: also satisfies the native rule unwrapped, for the same reason.
    'interface Foo { a: string; b: number } type ROFoo = Readonly<Foo>; function f(x: ROFoo): void {}',
    // A construct-signature-only type wrapped in Readonly<T> -- confirmed empirically (this exact case initially failed here as an assumed `invalid` case): the native rule does NOT flag this, even though wrapping it is a genuine, separate compile error at any `new x()` call site (Readonly<T>'s mapped type drops construct signatures the same way it drops call signatures). The native rule appears to share prefer-readonly-object-param.ts's own original blind spot -- a construct-signature-only type has zero named properties, so a property-only deep-readonly check vacuously treats it as already satisfied. prefer-readonly-object-param.ts explicitly excludes construct-signature types from its own "flat" check for exactly this reason, going further than the native rule does here.
    'function f(x: Readonly<{ new (): Date }>): Date { return new x(); }',
  ],
  invalid: [
    // No readonly at all -- flagged.
    {
      code: 'function f(x: { a: string; b: number }): void {}',
      errors: [{ messageId: 'shouldBeReadonly' }],
    },
    // Nested plain object property -- Readonly<T> should NOT be sufficient (shallow only).
    {
      code: 'function f(x: Readonly<{ a: { nested: string } }>): void {}',
      errors: [{ messageId: 'shouldBeReadonly' }],
    },
    // Nested array property.
    {
      code: 'function f(x: Readonly<{ a: string[] }>): void {}',
      errors: [{ messageId: 'shouldBeReadonly' }],
    },
    // Nested Map property.
    {
      code: 'function f(x: Readonly<{ a: Map<string, number> }>): void {}',
      errors: [{ messageId: 'shouldBeReadonly' }],
    },
    // Nested Set property.
    {
      code: 'function f(x: Readonly<{ a: Set<string> }>): void {}',
      errors: [{ messageId: 'shouldBeReadonly' }],
    },
    // Index signature whose VALUE type is itself an array -- claim: shallow Readonly<T> is NOT sufficient here (mutable nested state via the index value), even though getPropertiesOfType would report zero named properties for a pure index-signature type.
    {
      code: 'function f(x: Readonly<{ [key: string]: string[] }>): void {}',
      errors: [{ messageId: 'shouldBeReadonly' }],
    },
    // A hybrid callable-plus-data shape wrapped in Readonly<T> -- claim: still insufficient, since the mapped type only shallow-freezes the outer property, not the callable value's own nested `prop` property.
    {
      code: 'function f(x: { cb: Readonly<{ (): void; prop: string[] }> }): void {}',
      errors: [{ messageId: 'shouldBeReadonly' }],
    },
  ],
});
