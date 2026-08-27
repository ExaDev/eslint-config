import type { TSESLint } from '@typescript-eslint/utils';

// Derived from a real library type rather than hand-written: a getter's return expression is only contextually typed against its own explicit return-type annotation, not against the outer object literal's type the way a plain property initializer would be -- without this, each rule's 'error' literal below would widen to plain `string`, which the real Config['rules'] shape rejects.
export type ConfigValue = NonNullable<TSESLint.FlatConfig.Plugin['configs']>[string];

// `ConfigValue` (a single named config's value type) is `Config | ConfigArray` -- a union that is NOT guaranteed to be an array, because a plugin's own `configs` map can also hand back a single flat config object. A value that is unconditionally an array needs `ConfigArrayValue` instead: annotating it with the full union directly was a real, confirmed bug -- `...recommendedTypeChecked` failed to typecheck with TS2488 ("must have a Symbol.iterator method") wherever a consumer spread it, since TypeScript can't prove a value typed as that union is iterable. `Extract<ConfigValue, unknown[]>` narrows to the array-only member of the same union.
export type ConfigArrayValue = Extract<ConfigValue, unknown[]>;
