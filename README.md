# @exadev/eslint-config

[![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white)](https://github.com/ExaDev/eslint-config) [![npm](https://img.shields.io/badge/npm-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@exadev/eslint-config) [![Release](https://img.shields.io/github/v/release/ExaDev/eslint-config)](https://github.com/ExaDev/eslint-config/releases/latest) [![CI](https://img.shields.io/github/actions/workflow/status/ExaDev/eslint-config/ci.yml?branch=main)](https://github.com/ExaDev/eslint-config/actions)

> A real ESLint plugin (not a shareable config) exposing custom rules shared across ExaDev projects. Also published under the unscoped alias `exadev-eslint-config`.

## Why

Multiple ExaDev repos carried identical copies of a handful of custom ESLint rules (barrel/index discipline, re-export placement, pointless-alias detection). This package is the single source of truth for those rules. Only the *rules* are centralized — not a consumer's whole `eslint.config.ts`, since file-scoping, tsconfig wiring, and runtime-isomorphism import bans are genuinely project-specific. Each consumer keeps its own `eslint.config.ts`, importing rule implementations from here.

## Getting started

Consumers need `eslint >=10.0.0` and `typescript-eslint >=8.0.0` as required peer dependencies. Importing anything from this package resolves `typescript-eslint`, since both the default export and `plugin` share the same root module — ESM/CJS module evaluation runs a module's entire top-level import graph regardless of which export the caller reads (see [Architecture](#architecture)).

```sh
pnpm add -D @exadev/eslint-config typescript-eslint eslint
```

The default export is the full, type-checked ruleset: typescript-eslint's `strictTypeChecked` + `stylisticTypeChecked` presets (`strictTypeChecked` subsumes `recommendedTypeChecked`, so it already includes `no-deprecated`, `no-misused-spread`, `no-mixed-enums`, `no-unnecessary-condition`, `use-unknown-in-catch-callback-variable`, `return-await`, `related-getter-setter-pairs`, `no-unnecessary-type-parameters`, and more — those are no longer re-listed below), `exadev/barrel-policy` at its auto-detecting default (see [Barrel policy](#barrel-policy)), `exadev/no-object-assign`, `exadev/no-mutable-union-array-param`, `exadev/no-array-isarray-mutation`, `exadev/no-enum-number-widening`, `exadev/no-enum-reverse-lookup-widening`, `exadev/no-map-instanceof-mutation`, `exadev/no-set-instanceof-mutation`, `exadev/prefer-readonly-array-param`, `exadev/prefer-readonly-object-param`, `exadev/prefer-numeric-sort-compare`, `exadev/no-pointless-reassignment`, `exadev/test-file-kind`, `linterOptions.noInlineConfig`, `@typescript-eslint/consistent-type-assertions` banning all type assertions, `@typescript-eslint/consistent-type-imports`, `@typescript-eslint/consistent-type-exports`, `@typescript-eslint/consistent-return` (a function that implicitly returns `undefined` on one path and a real value on another — a common real bug, not a deliberate design), `@typescript-eslint/no-non-null-assertion` banning the `!` operator (the same manual-override escape hatch as a type assertion, under a different spelling), `@typescript-eslint/no-redeclare`, `@typescript-eslint/no-shadow`, `@typescript-eslint/no-use-before-define` set to `{ functions: false }` (a genuine temporal-dead-zone crash risk for `let`/`const`/`class`/enum bindings, but exempting function declarations, which are fully hoisted and therefore runtime-safe to call before their point of textual declaration — this codebase's own rule files consistently define their helper functions after the logic that calls them), `@typescript-eslint/ban-ts-comment` banning `@ts-expect-error` outright, `@typescript-eslint/method-signature-style` set to `'property'` (method-shorthand signatures are checked bivariantly under `strictFunctionTypes`, which is unsound), `@typescript-eslint/prefer-readonly`, `@typescript-eslint/promise-function-async`, `@typescript-eslint/require-array-sort-compare`, `@typescript-eslint/strict-void-return` (not yet in any typescript-eslint preset — disallows passing a value-returning function where a void-returning one is expected, e.g. `arr.forEach(x => otherArray.push(x))`, which typechecks today under TS's own void-return contravariance leniency), `@typescript-eslint/switch-exhaustiveness-check`, `@typescript-eslint/strict-boolean-expressions` at the rule's own bare defaults (an unambiguous non-nullable truthy check stays allowed; an ambiguous nullable check does not), `@typescript-eslint/no-magic-numbers` tuned to exempt array indexes, enum members, readonly class properties, default parameter values, numeric literal types (e.g. `type Indent = 2 | 4`), and the handful of universally-idiomatic bare numbers (`-1`, `0`, `1`, `2`), `max-lines` set to `{ max: 800, skipBlankLines: true, skipComments: true }` (counting only real code, so a file isn't pushed over the limit by whitespace or its own WHY-explanation comments), and `no-warning-comments` banning any comment containing `Stryker disable` (Stryker's own mutation-testing suppression directive, invisible to ESLint's `noInlineConfig` above since it isn't an eslint-disable comment at all) — the type-assertion and ts-comment rules are relaxed in test files, and `no-magic-numbers`/`max-lines`/`no-warning-comments` are not (see below). Spread it directly into `tseslint.config(...)`:

```ts
// eslint.config.ts
import exadev from '@exadev/eslint-config';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    languageOptions: {
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
  },
  ...exadev,
  // ...your own config on top...
);
```

**The default export's `barrel-policy` mode is `'auto'`, so a published package's `src/index.ts` is permitted as a barrel with no config change on your part** — it walks up from the linted file to the nearest ancestor `package.json` and checks for a real `exports` or `main`; find one and the file's package resolves to `single`, find neither and it resolves to `banned`, identical to this package's old hardcoded default. Override only when you want a fixed policy regardless of what your own `package.json` looks like — e.g. `siblings` mode, which `auto` never resolves to on its own (flat-config later blocks override earlier rule settings):

```ts
  ...exadev,
  { rules: { 'exadev/barrel-policy': ['error', { mode: 'siblings' }] } }, // any index file may be a barrel, not just src/index.ts
```

`strictTypeChecked` subsumes both typescript-eslint's plain `recommended` and `recommendedTypeChecked` outright (every rule in each is also present in `strictTypeChecked`), and its base config registers the `@typescript-eslint` plugin and sets `languageOptions.parser` itself. That is why **you must remove your own `...tseslint.configs.recommended`/`recommendedTypeChecked`/`strictTypeChecked`/`stylisticTypeChecked` spreads** — flat config rejects two different plugin object instances registered under the same namespace. You still supply `languageOptions.parserOptions.project`/`projectService` pointing at your own tsconfig(s).

**Test files (`**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`) get two narrow relaxations of this package's own additions, and only those two.** `@ts-expect-error` reverts to `allow-with-description` (a compile-time-only assertion of a type failure is a legitimate test pattern; `@ts-ignore`/`@ts-nocheck` stay banned since `@ts-expect-error` is strictly better). `consistent-type-assertions` relaxes to `assertionStyle: 'as'` (the legacy `<Type>value` form stays banned everywhere). Nothing inherited from the presets is relaxed.

### The lighter option: the `plugin` named export

For a project that wants only this package's own rules without the full type-checked bundle, import the named `plugin` export and wire rules individually:

```ts
// eslint.config.ts
import { plugin } from '@exadev/eslint-config';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // ...your own config...
  {
    files: ['src/**/*.ts'],
    ignores: ['src/index.ts'],
    plugins: { exadev: plugin },
    rules: {
      'exadev/no-non-barrel-reexport': 'error',
    },
  },
);
```

Or use one of `plugin`'s two bundled configs to enable a whole set at once:

```ts
import { plugin } from '@exadev/eslint-config';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    files: ['**/*.ts'],
    plugins: { exadev: plugin },
    extends: ['exadev/recommended'], // this plugin's own non-type-aware rules, plus linterOptions.noInlineConfig — no type-checked rules at all
    // or: extends: ['exadev/barrel'], // just the barrel-discipline trio (no-non-barrel-index, no-non-barrel-reexport, no-side-effects-in-index)
  },
]);
```

`tseslint.config()` does **not** accept string `extends` (only `defineConfig()` does); pass the config value directly instead:

```ts
import { plugin } from '@exadev/eslint-config';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // ...your own config...
  {
    files: ['**/*.ts'],
    plugins: { exadev: plugin },
    extends: [plugin.configs.recommended], // or plugin.configs.barrel
  },
);
```

**`plugin.configs.recommended`/`plugin.configs.barrel` carry no `files`/`ignores` and are safe unscoped** — `no-side-effects-in-index` and `no-non-barrel-reexport` each check `context.filename` themselves (self-scoping). For a barrel not at `src/index.ts`, or a project-specific exception, layer an override on top (e.g. `{ files: ['lib/other.ts'], rules: { 'exadev/no-non-barrel-reexport': 'off' } }`) rather than wiring all four rules individually.

## Optional React and Next.js support

`import exadev from '@exadev/eslint-config'` keeps working unchanged — it's now literally `exadevConfig()` called with no arguments, no migration required. React/hooks/a11y and Next.js rule blocks are folded in automatically, with no separate import or config needed, gated on two independent, always-both-required conditions:

1. **The corresponding package must actually be resolvable.** `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, and `@next/eslint-plugin-next` are all *optional* peer dependencies (`peerDependenciesMeta.<pkg>.optional: true`) — install only whichever your project actually needs:
   ```sh
   pnpm add -D eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y   # React support
   pnpm add -D @next/eslint-plugin-next                                               # Next.js support
   ```
   If none of these resolve, `@exadev/eslint-config`'s default export is byte-for-byte identical to the plain TypeScript ruleset — nothing about the base package changes.
2. **For React specifically, the file must actually be `.jsx`/`.tsx`.** The React/hooks/a11y rule block is scoped to `files: ['**/*.jsx', '**/*.tsx']`, so even if `eslint-plugin-react` is resolvable only incidentally (e.g. hoisted as a transitive dependency of something unrelated in a monorepo, with zero real JSX anywhere in the linted project), its rules are never matched against a file that isn't JSX — ESLint's flat-config `files` matching happens per linted file, at lint time, not at config-build time. `@next/eslint-plugin-next`'s block carries no such glob: its own presence is already an unambiguous signal on its own (nothing installs it except a real Next.js project).

React support pairs `eslint-plugin-react`'s `flat/recommended` with its own `flat/jsx-runtime` config, which turns `react/react-in-jsx-scope` and `react/jsx-uses-react` back off. `flat/recommended` alone assumes the classic runtime, where every file using JSX needs `import React` in scope; the automatic JSX runtime, the default since React 17 and the only mode Next.js's own compiler supports, needs no such import. Without this pairing, a consumer on the automatic runtime would see `react/react-in-jsx-scope` fire on every JSX file in the project.

### Explicit control

Two ways to override the automatic behaviour, for anyone who doesn't want to rely on it:

**`plugin.configs.react`/`plugin.configs.nextjs`** — explicit tier selection, mirroring `plugin.configs.recommended`/`.barrel`. Unlike those two, which only ever reference this package's own always-present rules, selecting `configs.react`/`.nextjs` is itself an explicit request: it **throws** a clear, actionable error if the underlying peer isn't installed, rather than silently returning nothing.
```ts
import { plugin } from '@exadev/eslint-config';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // ...your own config...
  {
    files: ['**/*.tsx'],
    plugins: { exadev: plugin },
    extends: [plugin.configs.react], // throws if eslint-plugin-react isn't installed
  },
);
```

**`exadevConfig(options, ...userConfigs)`** — the named factory export, for fine-grained tri-state control per feature:

```ts
// eslint.config.ts
import { exadevConfig } from '@exadev/eslint-config';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    languageOptions: {
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
  },
  ...exadevConfig({ react: true, nextjs: false }),
  // ...your own config...
);
```

| Value | React (`options.react`) | Next.js (`options.nextjs`) |
| --- | --- | --- |
| `true` | Force on — throws if `eslint-plugin-react` isn't resolvable | Force on — throws if `@next/eslint-plugin-next` isn't resolvable |
| `false` | Force off — always `[]`, no resolution attempted | Force off — always `[]`, no resolution attempted |
| `undefined` / omitted | Auto-detect (the default) | Auto-detect (the default) |

Trailing arguments are arbitrary flat-config objects, appended in order after everything else — `exadevConfig({}, { rules: { 'no-console': 'warn' } })` is equivalent to spreading the default export plus one more config object.

## Gitignore-derived ignores

`exadevConfig()`'s default output includes an `ignores` block derived directly from your project's own `.gitignore` (via [`@eslint/config-helpers`](https://www.npmjs.com/package/@eslint/config-helpers)'s `includeIgnoreFile`), so a generated directory your `.gitignore` already knows about (`dist/`, `coverage/`, a tool's own report output) is never linted, without hand-duplicating that list in `eslint.config.ts` too. This closes a real gap: a `.gitignore`d directory that nothing previously linted broadly enough to reach could still get linted the moment a wide-reaching rule (this package's own bundled RFC 8785 JSON canonicalization, say) started matching every file its glob covers.

| Value | `options.gitignore` |
| --- | --- |
| `true` | Force on — throws if no `.gitignore` exists |
| `false` | Force off — always `[]`, no resolution attempted |
| `undefined` / omitted | Auto-detect (the default): on if the project has a `.gitignore`, silently off if it doesn't (nothing to read from a project with no version control set up yet) |

Needs no peer to install — `@eslint/config-helpers` is bundled into this package's own build.

## RFC 8785 canonical JSON formatting

Every JSON file is linted against [`eslint-plugin-json-canonical`](https://github.com/ExaDev/eslint-plugin-json-canonical) v2 — plain UTF-16 code-unit key ordering, canonical number formatting, canonical string escaping, and (as of that plugin's own v2) pretty-printed layout (2-space indentation, one member/element per line, a trailing newline), per [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785). This is bundled unconditionally, the same way jsdoc/tsdoc support is: `eslint-plugin-json-canonical` is a plain dependency of this package, so every consumer already has it. There is no option to turn it off.

The plugin's own full-canonicalization rule (`no-insignificant-whitespace`, which collapses a document to a single compacted line with no whitespace at all) is deliberately not part of the config this package extends — it stays available for a consumer to opt into directly for their own genuine canonicalization pass (hashing, signing, byte-for-byte comparison).

`**/*.jsonc`, `**/tsconfig*.json`, and `**/turbo.json` get the plugin's `configs.contentOnlyJsonc` instead of the plain-JSON config: they genuinely carry comments (TypeScript and turbo both accept them), which `@eslint/json`'s `json/json` language has no concept of and fails to parse, and neither pretty-printing nor whitespace-collapsing has a well-defined answer for a comment's own attachment to a member once its surrounding whitespace is rewritten. Content canonicalization (key order, number/string formatting) still applies to these files under `json/jsonc`.

`**/package.json` gets everything the plain-JSON config gives every other file — including pretty-printed layout — except `json/sort-keys`, turned back off in its own override block, since its key order is the separate, syncpack-aware concern the next section covers.

## Optional package.json key ordering

`exadevConfig({ packageJsonKeyOrder: true })` enables `exadev/package-json-key-order` for `**/package.json`, requiring the same key order [`syncpack format`](https://syncpack.dev/command/format) would produce — `sortFirst` fields (`name`, `description`, `version`, `author` by default) pinned to the top in that exact order, then every other top-level key alphabetically; and, inside each `sortAz`-listed field's own object or array value (`dependencies`, `devDependencies`, `scripts`, `keywords`, and the rest of syncpack's own default list), its members/elements sorted the same way. Confirmed directly against real `syncpack@15` output, not assumed from its docs — see this rule's own source comment for the exact reverse-engineering method (a symbol-before-digit-before-letter, case-insensitive comparison syncpack's docs don't specify precisely enough to derive from prose alone).

This exists for a project that wants real `package.json` canonicalization without installing syncpack, and so a project that already has syncpack never sees the two fight: `eslint --fix` and `syncpack format` converge on the identical output.

| Value | `options.packageJsonKeyOrder` |
| --- | --- |
| `true` | Force on — throws if `@eslint/json` isn't resolvable |
| `false` | Force off — always `[]`, no resolution attempted |
| `undefined` / omitted | Auto-detect (the default): on unless the project already has a syncpack config (a `.syncpackrc*`/`syncpack.config.*` file, or a `"syncpack"` key in its own `package.json`), since syncpack already produces this exact order for free |

Like React/Next.js support, this needs its own optional peer resolvable — `pnpm add -D @eslint/json` — and, unlike them, also needs its `json/json` language registered for the file (this option's own config block does that for you; nothing extra to wire up).

Bundled into `exadevConfig()`'s default output the same way React/Next.js auto-detection is (see the table above) — `packageJsonKeyOrder: true`/`false` only forces the tri-state explicitly, it isn't the only way to reach it. Not part of `plugin.configs.recommended`, and not available as a `plugin.configs.packageJsonKeyOrder` explicit-tier config the way `.react`/`.nextjs` are, since wiring it through `plugin.configs` would need `plugin.ts` and this option's own config builder to import each other.

## Rules

| Rule | Fixable | Description |
| --- | --- | --- |
| `barrel-policy` | | Umbrella over the four barrel rules below: one `{ mode }` option selecting a whole index-file policy. See [Barrel policy](#barrel-policy). |
| `no-index-files` | | Bans any `index.*` file outright (mode 1). The strictest policy. |
| `no-non-barrel-index` | | Only `src/index.ts` may be named `index.*` — any other `index.ts`/`.js`/etc would be silently selected by a consumer's bare directory import. |
| `no-non-barrel-reexport` | ✓ | Re-exports belong only in a barrel. Catches the split form across two statements (`import { x } from './y'; export { x };` or `export default x;`) which no AST selector alone can match. Autofix deletes the export and the now-pointless import when it was the import's only use. Self-scopes away from any index file. |
| `no-side-effects-in-index` | | A barrel file may contain only re-export statements — nothing that could execute at import time. Self-scopes to any index file. |
| `barrel-direct-siblings-only` | | A barrel may re-export only from a direct sibling (`./module`), never a nested path, parent, or bare package specifier (mode 3). |
| `no-control-flow` | | Bans `if`/`switch`/`for`/`for-in`/`for-of`/`while`/`do-while`/the ternary operator outright. Not part of `recommended` or `barrel` — ordinary code legitimately needs control flow, so this is opt-in, wired via a consumer's own `files` glob for the specific packages that want it (a composition-root package selecting an adapter/strategy by a validated key, say): a lookup table replaces a branch, a declarative array method (`map`/`filter`/`some`/`every`/...) replaces a loop. Requires no type information. |
| `no-pointless-reassignment` | ✓ | `const foo = bar` where both sides are plain identifiers and the alias adds no transformation. Autofix rewrites every read to the original name and deletes the declaration (including its `export` keyword, when exported). Still reported but deliberately not auto-fixable where collapsing the alias would change meaning: an explicit type annotation (`const exhaustive: never = item` — the annotation is the point), a read where the original name is shadowed, a read as a shorthand object property, more than one declarator in the statement, or a source that is written to anywhere. |
| `no-object-assign` | ✓/suggestion | `Object.assign` does not check a source object's properties against the target's declared types, unlike object spread. A fresh object-literal target autofixes to `{ ...target, ...source }`; mutating an existing reassignable binding offers a suggestion only (changes the object's identity); a `const` binding or a non-statement call site gets a plain report with no fix. |
| `no-mutable-union-array-param` | ✓ | A function parameter typed as an array of a union (`(string \| number)[]`) accepts a narrower caller array (`number[]`) by covariance; calling `push`/`unshift`/`splice`/`fill`/`copyWithin` on it can then insert a value the caller's own array was never declared to hold. Autofix marks the parameter `readonly`, turning the mutating call into a real compile error to resolve deliberately. Requires no type information. |
| `prefer-readonly-array-param` | ✓ | A narrower, safely-autofixable sibling of `@typescript-eslint/prefer-readonly-parameter-types` scoped to array/tuple parameter shapes only: fires unconditionally on every non-readonly array or tuple parameter, regardless of whether the function body mutates it, in any parameter position (a plain identifier, a rest parameter, a default-valued parameter, or a constructor parameter property) and any function-like shape (a concrete function/arrow/method, or a declaration-only ambient function, interface method, function type alias, call/construct signature, or abstract/ambient class method). A union containing an array/tuple member is fixed on that member alone. Autofix prepends `readonly ` (or renames `Array<T>` to `ReadonlyArray<T>`), turning any resulting mutation into a real compile error to resolve deliberately. Requires no type information — registered in both `plugin.configs.recommended` and the default (type-checked) export. |
| `prefer-readonly-object-param` | ✓ | The object-shape sibling of `prefer-readonly-array-param` above, scoped to "flat" object parameters where a shallow fix is provably sufficient: an inline `{ ... }` literal or a reference to a plain named type/interface where every property (and index-signature value, if any) is itself a primitive, a literal/union of primitives, or a callback — with no nested object, array, tuple, Map, Set, class instance, union, intersection, or unconstrained type parameter anywhere in the shape. Autofix wraps the parameter's own type annotation in `Readonly<...>`, which TypeScript's own deep-readonly check accepts as fully sufficient for a shape this flat. Requires type information — only in the default (type-checked) export, not `plugin.configs.recommended` — to resolve each property's real type via the checker. |
| `no-array-isarray-mutation` | | `Array.isArray`'s own type declaration narrows to plain `any[]`, discarding the `readonly` guarantee of any array type in the narrowed parameter's or local variable's real type — a bare `readonly T[]`, a `ReadonlyArray<T>`, one behind a type alias, or one alongside other union members — inside the guarded branch; calling `push`/`unshift`/`splice`/`fill`/`copyWithin` there can mutate a caller's genuinely readonly array. Recognises the direct `if (Array.isArray(x))` guard (braced or not), the early-return/early-throw idiom, `&&`, the ternary form, and the else-of-a-negated-test form. No autofix: re-adding `readonly` is a no-op (the guard already discarded it) and rewriting the mutating call into a copy-first pattern is not safely mechanical in the presence of aliasing. Requires type information — only in the default (type-checked) export, not `plugin.configs.recommended` — specifically to see through a type alias and to catch a bare, non-union readonly array parameter or local variable, neither visible from its own syntax alone. |
| `no-map-instanceof-mutation` | | `Map` is declared as extending `ReadonlyMap`, so `instanceof Map` narrows a parameter or local variable whose real type includes a `ReadonlyMap` — bare, unioned, or reached through a type alias — straight past the readonly guarantee to the full mutable interface; calling `set`/`delete`/`clear` there can mutate a caller's genuinely read-only map. Recognises the direct `if (input instanceof Map)` guard (braced or not), the early-return/early-throw idiom, `&&`, the ternary form, and the else-of-a-negated-test form. No autofix: rewriting the mutating call into a copy-first pattern is not safely mechanical in the presence of aliasing. Requires type information — only in the default (type-checked) export, not `plugin.configs.recommended`. |
| `no-set-instanceof-mutation` | | `instanceof Set` narrows a parameter or local variable whose real type includes a `ReadonlySet` — bare, unioned, or reached through a type alias — straight to the fully mutable `Set` interface, with no way to preserve the read-only guarantee through the narrowing; calling `add`/`delete`/`clear` there can mutate a caller's genuinely read-only set. Recognises the same guard idioms as `no-map-instanceof-mutation` above. No autofix, for the same aliasing reason. Requires type information — only in the default (type-checked) export, not `plugin.configs.recommended`. |
| `no-enum-number-widening` | | A bare (non-literal) `number` is accepted anywhere a numeric enum is expected, without checking it is actually one of the enum's members — only a numeric *literal* gets range-checked by `tsc`. No autofix: the only provably safe fix is a genuine runtime membership check against the enum's own values, which is a behavioural choice a mechanical fix cannot responsibly make. Requires type information — only in the default (type-checked) export, not `plugin.configs.recommended`. |
| `no-enum-reverse-lookup-widening` | suggestion | Indexing a numeric enum's reverse mapping (`Direction[n]`) with a bare (non-literal) `number`, or with a different enum's member, types as plain `string` for any index, including one outside the enum's actual members, where it genuinely returns `undefined` at runtime — `tsc` does not range-check even a numeric literal index here. When the indexed expression is the init of a variable with an explicit `: string` annotation, a suggestion widens it to `: string \| undefined`, forcing later uses as a bare `string` to surface as real compile errors; every other syntactic position gets a plain report with no fix, and no case gets a full `--fix` autofix. Requires type information — only in the default (type-checked) export, not `plugin.configs.recommended`. |
| `prefer-numeric-sort-compare` | suggestion | A deliberately narrow addition alongside `@typescript-eslint/require-array-sort-compare` (which already flags any bare `.sort()`/`.toSorted()` except on a plain string array, with no fix): when the array's element type is definitively `number`, a suggestion offers an ascending compare function (`(a, b) => a - b`), since the default comparator sorts lexicographically (`[1, 2, 10].sort()` becomes `[1, 10, 2]`). Not a full autofix — descending order is a real, if less common, alternative intent. Requires type information — only in the default (type-checked) export, not `plugin.configs.recommended`, since it needs the checker to confirm the array's element type. |
| `package-json-key-order` | ✓ | Requires `package.json`'s keys to be ordered the same way `syncpack format` would order them. See [Optional package.json key ordering](#optional-package-json-key-ordering) — opt-in via `exadevConfig({ packageJsonKeyOrder: true })`, not part of `recommended`/`barrel`. A JSON-language rule (`@eslint/json`'s `json/json`), not a TSESLint one — needs no type information and doesn't apply to any `.ts`/`.js` file. |
| `test-file-kind` | | Requires a test/spec file's own name to declare its test kind via a filename suffix immediately before `.test`/`.spec` (e.g. `foo.unit.test.ts`), one of a configurable `{ kinds }` set (default: `unit`, `integration`, `e2e`). A naming-discipline rule, not a content classifier — it checks only the filename, never what the file actually tests. Self-scoped to real test/spec files (`context.filename`), so it never misfires when applied unscoped and never relies on a consumer's own `files` config. Requires no type information. |

## Barrel policy

`exadev/barrel-policy` is the convenience layer: one rule id, one `{ mode }` option selecting a complete index-file policy. Use EITHER this umbrella OR the individual rules (not both — they double-report). Omitting `mode` entirely, or passing an options object with no `mode` key, means `'auto'`.

| `mode` | Which files may be barrels | What a barrel may contain | Where re-exports may come from |
| --- | --- | --- | --- |
| `'auto'` (what an omitted `mode` means) | detected per file — walks up to the nearest ancestor `package.json`; a real `exports`/`main` there resolves to `single`, otherwise `banned` | only re-exports when detected as `single` | anywhere, when detected as `single` |
| `'banned'` (`plugin.configs.recommended`'s explicit choice) | none | — | — |
| `'single'` (`plugin.configs.barrel`'s explicit choice) | exactly `src/index.ts` | only re-exports | anywhere |
| `'siblings'` | any `index.ts` | only re-exports | a direct sibling only (`./module`) |

`'auto'` only ever resolves to `banned` or `single` — there is no single-signal auto-equivalent for `siblings` (which package.json field would suggest "any index file, not just the entry point"?), so a project wanting that policy still states it explicitly. `private: true` in `package.json` is not consulted by the detection: a pnpm workspace package is routinely both `private` and a genuine import target for sibling packages via `exports`, so `private` says nothing about whether a barrel is warranted.

In every mode, re-exports are banned outside a permitted barrel, and a permitted barrel may contain only re-export statements. The umbrella composes the identical predicates the standalone rules use (shared in `src/rules/barrel-helpers.ts`). It is non-fixable — the autofix lives on `no-non-barrel-reexport`.

## Build, test, and lint

```sh
pnpm install    # requires Node >=20 and pnpm 11.6.0 (pinned via packageManager)
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Each rule has a co-located `*.unit.test.ts` exercising it with ESLint's `RuleTester` under Vitest. `vitest.setup.ts` wires `RuleTester.describe`/`.it`/`.itOnly` to Vitest's `describe`/`it` explicitly (no `test.globals`). Each test uses typescript-eslint's parser for TypeScript-only fixtures; none need type information.

Every test file's own name declares its kind via a filename suffix immediately before `.test`/`.spec` — `.unit`, `.integration`, or `.e2e` by default (`exadev/test-file-kind`, part of `recommended`; see [Rules](#rules) below) — so a file's test kind is always visible from its name alone, without opening it, and downstream tooling (e.g. a Vitest project split by test kind) can select by filename glob rather than by convention nobody enforces. This package's own tests are exclusively `.unit.test.ts` today (a `.internal.unit.test.ts` variant exists for a handful of files that also test non-exported internals directly, `internal` just being an ordinary extra name segment — see `no-mutable-union-array-param.internal.unit.test.ts`).

`pnpm test` always measures coverage (`@vitest/coverage-v8`), scoped to `src/**/*.ts` excluding `*.test.ts`. Text output in terminal; `html`/`lcov` in `coverage/` (gitignored alongside `.eslintcache` and `dist/`).

The `lint`/`typecheck`/`test`/`build` npm scripts wrap turbo tasks named `_lint`/`_typecheck`/`_test`/`_build` — run `pnpm build`, not `turbo run build`.

`pnpm build` runs `tsdown` from `src/index.ts`, bundling the whole module graph into ESM + CJS + declarations. `prepublishOnly` re-runs lint, typecheck, `test`, `tsdown`, `publint`, and `attw --pack`.

## Architecture

`src/plugin.ts` builds a `TSESLint.FlatConfig.Plugin` (`@typescript-eslint/utils`'s own type — not ESLint's own `ESLint.Plugin`, which can't hold a rule built with `ESLintUtils.RuleCreator`) combining `src/rules/` into a flat `rules` map. `configs.recommended`, `.barrel`, `.react`, and `.nextjs` are getters in the object literal — each references the fully-built `plugin` (`plugins: { exadev: plugin }`), which a plain property initializer can't do mid-construction. `recommended` ships `barrel-policy` at `mode: 'banned'`; `barrel` at `mode: 'single'`; `.react`/`.nextjs` call `buildReactConfig`/`buildNextjsConfig` with `enabled: true` (see below).

`src/config-types.ts` holds `ConfigValue`/`ConfigArrayValue` (`ConfigArrayValue = Extract<ConfigValue, unknown[]>`, the array-only member of ESLint's own config-value union), shared by every file below rather than redefined per file — annotating a config array with the wider `ConfigValue` union directly broke `...exadev` with `TS2488` ("must have a Symbol.iterator method").

`src/optional-plugin.ts` is the lazy-resolution helper behind React/Next.js support: `tryRequire` wraps `createRequire(import.meta.url)` in try/catch, returning `unknown` (never a cast) so every call site narrows explicitly before use; `readFlatConfig` walks a property path through that `unknown` value via a real type guard, normalizing a stray legacy top-level `parserOptions` key into `languageOptions.parserOptions` along the way (confirmed necessary: `eslint-plugin-jsx-a11y`'s own `configs.recommended` export carries exactly this legacy shape, which flat config's schema rejects outright rather than ignores).

`src/react.ts`/`src/nextjs.ts` each export a `build*Config(options)` function: resolve the relevant optional peer(s) via `tryRequire`, extract their real flat config via `readFlatConfig`, and return an array of 0-or-more config blocks — `[]` if unresolvable and not explicitly forced on, a thrown `Error` if explicitly forced on (`enabled: true`) and still unresolvable. `react.ts`'s blocks are scoped to `files: ['**/*.jsx', '**/*.tsx']`; `nextjs.ts`'s is not (see [Optional React and Next.js support](#optional-react-and-nextjs-support) for why).

`src/create-config.ts` is config assembly's single source of truth: `exadevConfig(options, ...userConfigs)` concatenates `recommendedTypeChecked` with both builders' output (each fed the matching tri-state option) and any trailing user configs; `defaultConfig` is `exadevConfig()` evaluated once, eagerly, at module load.

`src/index.ts` is the entry point, still a pure re-export barrel (required by `no-side-effects-in-index`/`no-non-barrel-reexport`, both of which assume this file contains nothing but `export ... from ...`): `export { defaultConfig as default, exadevConfig } from './create-config'; export { default as plugin } from './plugin';`. All exports share one root module, so importing `{ plugin }` alone still resolves `typescript-eslint` via the sibling re-export — an accepted trade-off (an earlier separate-subpath split proved more awkward in practice). React/Next.js support never adds to this cost: none of the four optional packages are ever statically imported, only passed as a runtime string to `createRequire`'s resolver, so their absence never affects module evaluation for a consumer who doesn't use them.

`pnpm-workspace.yaml` declares an empty `packages: []` — not a real workspace, just giving turbo a root for local task caching.

## Conventions

`eslint.config.ts` dogfoods this package's own factory export on itself (`import { exadevConfig } from './src/index'`), spreading `exadevConfig({ react: false, nextjs: false })` — forced off explicitly, not the plain auto-detecting default, since `eslint-plugin-react`/`@next/eslint-plugin-next` are real devDependencies of *this* repo (needed to test `src/react.ts`/`src/nextjs.ts`'s own "package is resolvable" branch) even though this repo is neither a React nor a Next.js project. `no-side-effects-in-index` and `no-non-barrel-reexport` self-scope to `src/index.ts` internally, so no `files`/`ignores` wiring is needed here. Plugin construction lives in `src/plugin.ts` specifically so `src/index.ts` stays a pure re-export point.

`tsconfig.json` enables `verbatimModuleSyntax` (`import type`/`export type` required for type-only imports — also enforced by `consistent-type-imports`) and `noUncheckedIndexedAccess` (narrow indexed access before use rather than asserting).

Conventional commits are enforced by commitlint, restricted to the type-enum defined once in `release.config.ts`'s `commitTypes` — both commitlint and semantic-release derive from that single list.

## Gotchas and quirks

- `.attw.json` ignores `false-export-default`: tsdown/rolldown's CJS output for this plugin's sole default export doesn't emit the `export =` form `arethetypeswrong` wants under legacy `node10` resolution. The modes ESLint flat config uses (`node16`, `bundler`) are unaffected, so the rule is suppressed rather than changing the default-export shape.
- `src/index.ts` mixing a default export with a named one triggers rolldown's `MIXED_EXPORTS` warning: a raw CommonJS `require()` would see the raw exports object instead of the default. ESM `import` (the actual consumer path) resolves both correctly; `attw --pack` and `publint` report no problems, so the warning is accepted (see `tsdown.config.ts`).
- Husky hooks: `pre-commit` runs lint-staged (`eslint --fix` on staged `*.ts`), `commit-msg` runs commitlint, `pre-push` runs typecheck + test + build.
- The CI release job sets `HUSKY=0` (commit-msg hook skips the automated release commit) and blanks `NPM_TOKEN`/`NODE_AUTH_TOKEN` explicitly so an inherited token can't win over OIDC trusted publishing.
- A consumer who already has `eslint-plugin-react`/`@next/eslint-plugin-next` resolvable for unrelated reasons (e.g. hoisted in a monorepo) and writes `.jsx`/`.tsx` files may see new rule activity the moment they upgrade to a version of this package that ships React/Next.js support — with zero action on their part. This is the normal, widely-accepted ESLint-ecosystem convention that adding rules to a shared/recommended config is a minor bump even though it can newly trip an existing `--max-warnings 0` gate, not a breaking change; see [Optional React and Next.js support](#optional-react-and-nextjs-support) for the `react`/`nextjs` options to force it off explicitly if needed.

## Contributing

Conventional commits are enforced by a husky `commit-msg` hook and re-checked in CI. CI runs commitlint, lint, and typecheck+test+build+attw on every push and pull request; the release job runs only on push to `main`, after all pass.

## Release

Conventional commits drive [semantic-release](https://semantic-release.gitbook.io/semantic-release) on every push to `main`: version bump, `CHANGELOG.md`, GitHub Release, and npm publish via OIDC (no stored token). A second CI job republishes the identical build under the unscoped alias `exadev-eslint-config`.

## License

MIT
