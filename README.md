# @exadev/eslint-config

[![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white)](https://github.com/ExaDev/eslint-config) [![npm](https://img.shields.io/badge/npm-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@exadev/eslint-config) [![Release](https://img.shields.io/github/v/release/ExaDev/eslint-config)](https://github.com/ExaDev/eslint-config/releases/latest) [![CI](https://img.shields.io/github/actions/workflow/status/ExaDev/eslint-config/ci.yml?branch=main)](https://github.com/ExaDev/eslint-config/actions)

> A real ESLint plugin (not a shareable config) exposing custom rules shared across ExaDev projects. Also published under the unscoped alias `exadev-eslint-config`.

**Contents:** [Why](#why) · [Getting started](#getting-started) · [The lighter option](#the-lighter-option-the-plugin-named-export) · [Optional features](#optional-features) · [Rules](#rules) · [Barrel policy](#barrel-policy) · [Workspace architecture](#workspace-architecture) · [Development](#development) · [License](#license)

## Why

Multiple ExaDev repos carried identical copies of a handful of custom ESLint rules (barrel/index discipline, re-export placement, pointless-alias detection). This package is the single source of truth for those rules. Only the *rules* are centralized — not a consumer's whole `eslint.config.ts`, since file-scoping, tsconfig wiring, and runtime-isomorphism import bans are genuinely project-specific. Each consumer keeps its own `eslint.config.ts`, importing rule implementations from here.

## Getting started

```sh
pnpm add -D @exadev/eslint-config typescript-eslint eslint
```

Requires [`eslint`](https://eslint.org) `>=10.0.0` and [`typescript-eslint`](https://typescript-eslint.io/packages/typescript-eslint) `>=8.0.0` as peer dependencies. Importing anything from this package resolves `typescript-eslint`, since the default export and the `plugin` named export share one root module — see [Architecture](#architecture).

```ts
// eslint.config.ts
import { defineConfig } from 'eslint/config';
import exadev from '@exadev/eslint-config';

export default defineConfig(
  {
    languageOptions: {
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
  },
  ...exadev,
  // ...your own config on top...
);
```

**Why [`defineConfig()`](https://eslint.org/docs/latest/use/configure/configuration-files#defineconfig-utility) rather than `tseslint.config()` here:** [`tseslint.config()`](https://typescript-eslint.io/packages/typescript-eslint/#config-deprecated) is now `@deprecated` upstream in favour of ESLint core's own `defineConfig()`, so this package's default export is typed against ESLint core's own config type specifically so it satisfies `defineConfig()` directly. If you haven't migrated off `tseslint.config()` yet, it still works exactly the same — this package's exported config array is typed to satisfy either wrapper, and that compatibility is itself covered by a real regression test (`src/consumer-compatibility.ts`) — but new consumers should reach for `defineConfig()`.

**Remove your own `tseslint.configs.recommended`/`recommendedTypeChecked`/`strictTypeChecked`/`stylisticTypeChecked` spreads.** The default export already includes [`strictTypeChecked`](https://typescript-eslint.io/users/configs/#strict-type-checked) (which subsumes both plain [`recommended`](https://typescript-eslint.io/users/configs/#recommended) and [`recommendedTypeChecked`](https://typescript-eslint.io/users/configs/#recommended-type-checked)) plus [`stylisticTypeChecked`](https://typescript-eslint.io/users/configs/#stylistic-type-checked), and registers the `@typescript-eslint` plugin/parser itself — [flat config](https://eslint.org/docs/latest/use/configure/configuration-files) rejects two different plugin object instances registered under the same namespace. You still supply your own `languageOptions.parserOptions.project`/`projectService` pointing at your tsconfig(s).

**Remove your own `plugins: { '@stylistic': ... }` registration too.** The default export bundles [`@stylistic/eslint-plugin`](https://eslint.style) (see [Stylistic comment, class-member and JSX rules](#stylistic-comment-class-member-and-jsx-rules)) and registers it under the `@stylistic` namespace itself, so a consumer block registering its own copy of the plugin (a different version resolved from elsewhere in the lockfile, or a duplicated install) makes ESLint throw `Config: Key "plugins": Cannot redefine plugin "@stylistic".` at config load, the identical flat-config restriction as the typescript-eslint case above. Registering the very same instance is harmless, but the robust migration is to drop the registration entirely: configure any further `@stylistic/*` rules directly in your own `rules` block, since this package's block already registers the plugin for every JS/TS and JSX file.

### What the default export includes

**typescript-eslint presets:**

- [`strictTypeChecked`](https://typescript-eslint.io/users/configs/#strict-type-checked) + [`stylisticTypeChecked`](https://typescript-eslint.io/users/configs/#stylistic-type-checked) — already covers [`no-deprecated`](https://typescript-eslint.io/rules/no-deprecated/), [`no-misused-spread`](https://typescript-eslint.io/rules/no-misused-spread/), [`no-mixed-enums`](https://typescript-eslint.io/rules/no-mixed-enums/), [`no-unnecessary-condition`](https://typescript-eslint.io/rules/no-unnecessary-condition/), [`use-unknown-in-catch-callback-variable`](https://typescript-eslint.io/rules/use-unknown-in-catch-callback-variable/), [`return-await`](https://typescript-eslint.io/rules/return-await/), [`related-getter-setter-pairs`](https://typescript-eslint.io/rules/related-getter-setter-pairs/), [`no-unnecessary-type-parameters`](https://typescript-eslint.io/rules/no-unnecessary-type-parameters/), and more (not re-listed individually below).

**This package's own rules** (full details in [Rules](#rules)):

- `exadev/barrel-policy` at its auto-detecting default — see [Barrel policy](#barrel-policy)
- `exadev/no-object-assign`
- `exadev/no-mutable-union-array-param`
- `exadev/no-array-isarray-mutation`
- `exadev/no-enum-number-widening`
- `exadev/no-enum-reverse-lookup-widening`
- `exadev/no-map-instanceof-mutation`
- `exadev/no-set-instanceof-mutation`
- `exadev/prefer-readonly-array-param`
- `exadev/prefer-readonly-object-param`
- `exadev/prefer-numeric-sort-compare`
- `exadev/prefer-options-object-param`
- `exadev/prefer-doc-comment`
- `exadev/no-pointless-reassignment`
- `exadev/test-file-kind`

**Individual rule tuning**, each with its own reasoning:

- **`linterOptions.noInlineConfig`** — no `eslint-disable` comments of any kind.
- **[`consistent-type-assertions`](https://typescript-eslint.io/rules/consistent-type-assertions/)** — bans all type assertions (relaxed in test files, see below).
- **[`consistent-type-imports`](https://typescript-eslint.io/rules/consistent-type-imports/)** and **[`consistent-type-exports`](https://typescript-eslint.io/rules/consistent-type-exports/)** — plain presence, no extra config.
- **[`consistent-return`](https://typescript-eslint.io/rules/consistent-return/)** — a function can't implicitly return `undefined` on one path and a real value on another.
  - *Why:* that split is usually a bug, not a deliberate design.
- **[`no-non-null-assertion`](https://typescript-eslint.io/rules/no-non-null-assertion/)** — bans the `!` operator.
  - *Why:* it's the same manual-override escape hatch as a type assertion, under a different spelling.
- **[`no-redeclare`](https://typescript-eslint.io/rules/no-redeclare/)** and **[`no-shadow`](https://typescript-eslint.io/rules/no-shadow/)** — plain presence, no extra config.
- **[`no-use-before-define`](https://typescript-eslint.io/rules/no-use-before-define/)** set to `{ functions: false }` — everything except function declarations must be defined before use.
  - *Why:* `let`/`const`/`class`/enum bindings have a genuine temporal-dead-zone crash risk, but function declarations are fully hoisted and safe to call before their point of textual declaration — this codebase's own rule files consistently define helper functions after the logic that calls them.
- **[`ban-ts-comment`](https://typescript-eslint.io/rules/ban-ts-comment/)** — bans `@ts-expect-error` outright (relaxed in test files, see below).
- **[`method-signature-style`](https://typescript-eslint.io/rules/method-signature-style/)** set to `'property'`.
  - *Why:* method-shorthand signatures are checked bivariantly under [`strictFunctionTypes`](https://www.typescriptlang.org/tsconfig/#strictFunctionTypes), which is unsound.
- **[`prefer-readonly`](https://typescript-eslint.io/rules/prefer-readonly/)**, **[`promise-function-async`](https://typescript-eslint.io/rules/promise-function-async/)**, **[`require-array-sort-compare`](https://typescript-eslint.io/rules/require-array-sort-compare/)** — plain presence, no extra config.
- **[`strict-void-return`](https://typescript-eslint.io/rules/strict-void-return/)** — bans passing a value-returning function where a void-returning one is expected (e.g. `arr.forEach(x => otherArray.push(x))`).
  - *Why:* not yet in any typescript-eslint preset; this typechecks today only because of TS's own void-return contravariance leniency.
- **[`switch-exhaustiveness-check`](https://typescript-eslint.io/rules/switch-exhaustiveness-check/)** — plain presence, no extra config.
- **[`strict-boolean-expressions`](https://typescript-eslint.io/rules/strict-boolean-expressions/)** at the rule's own bare defaults.
  - *Why:* an unambiguous non-nullable truthy check stays allowed; an ambiguous nullable check does not.
- **[`no-magic-numbers`](https://typescript-eslint.io/rules/no-magic-numbers/)** — tuned to exempt array indexes, enum members, readonly class properties, default parameter values, numeric literal types (e.g. `type Indent = 2 | 4`), and the handful of universally-idiomatic bare numbers (`-1`, `0`, `1`, `2`).
- **[`max-lines`](https://eslint.org/docs/latest/rules/max-lines)** set to `{ max: 800, skipBlankLines: true, skipComments: true }`.
  - *Why:* counting only real code means a file isn't pushed over the limit by whitespace or its own WHY-explanation comments.
- **[`max-params`](https://eslint.org/docs/latest/rules/max-params)** set to `{ max: 4 }`, one above the rule's own default of `3`. Needs no type information — registered in both `plugin.configs.recommended` and the default (type-checked) export, like `exadev/prefer-readonly-array-param` above.
  - *Why:* a deliberately loose backstop against a genuinely excessive number of REQUIRED parameters, distinct from `exadev/prefer-options-object-param` above, which already offers a real fix for the more common shape (a run of 2+ trailing OPTIONAL parameters) this rule structurally cannot see until the total count crosses its own threshold.
- **[`no-warning-comments`](https://eslint.org/docs/latest/rules/no-warning-comments)** — bans any comment containing `Stryker disable`.
  - *Why:* that's Stryker's own mutation-testing suppression directive, invisible to `noInlineConfig` above since it isn't an eslint-disable comment.

**Test files** (`**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`) get two narrow relaxations of this package's own additions, and only these two:

- **`@ts-expect-error`** reverts to `allow-with-description`.
  - *Why:* a compile-time-only assertion of a type failure is a legitimate test pattern; `@ts-ignore`/`@ts-nocheck` stay banned since `@ts-expect-error` is strictly better.
- **[`consistent-type-assertions`](https://typescript-eslint.io/rules/consistent-type-assertions/)** relaxes to `assertionStyle: 'as'`.
  - *Why:* the legacy `<Type>value` form stays banned everywhere.

Nothing else inherited from the presets is relaxed.

## The lighter option: the `plugin` named export

For a project that wants only this package's own rules without the full type-checked bundle, import the named `plugin` export and wire rules individually:

```ts
// eslint.config.ts
import { defineConfig } from 'eslint/config';
import { plugin } from '@exadev/eslint-config';

export default defineConfig(
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

[`tseslint.config()`](https://typescript-eslint.io/packages/typescript-eslint#config) does **not** accept string `extends` (only [`defineConfig()`](https://eslint.org/docs/latest/use/configure/configuration-files#defineconfig-utility) does); pass the config value directly instead:

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

`plugin.configs.recommended`/`plugin.configs.barrel` carry no `files`/`ignores` and are safe unscoped — `no-side-effects-in-index` and `no-non-barrel-reexport` each check `context.filename` themselves (self-scoping). For a barrel not at `src/index.ts`, or a project-specific exception, layer an override on top (e.g. `{ files: ['lib/other.ts'], rules: { 'exadev/no-non-barrel-reexport': 'off' } }`) rather than wiring all four rules individually.

## Optional features

| Feature | Default | Control it with |
| --- | --- | --- |
| [React & Next.js linting](#optional-react-and-nextjs-support) | Auto-detected: on if the relevant peer package is installed | `exadevConfig({ react, nextjs })` |
| [Gitignore-derived ignores](#gitignore-derived-ignores) | On if the project has a `.gitignore` | `exadevConfig({ gitignore })` |
| [RFC 8785 canonical JSON formatting](#rfc-8785-canonical-json-formatting) | Always on | Not optional |
| [package.json key ordering](#optional-packagejson-key-ordering) | On, unless the project already has a syncpack config | `exadevConfig({ packageJsonKeyOrder })` |
| [Workspace architecture rules](#workspace-architecture) | Off unless given (no sensible default for `groups`) | `exadevConfig({ workspaceArchitecture })` / `workspaceArchitectureConfig(options)` |

Every tri-state option above (`true`/`false`/`undefined`) is passed through the named `exadevConfig(options, ...userConfigs)` factory export:

```ts
// eslint.config.ts
import { defineConfig } from 'eslint/config';
import { exadevConfig } from '@exadev/eslint-config';

export default defineConfig(
  {
    languageOptions: {
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
  },
  ...exadevConfig({ react: true, nextjs: false }),
  // ...your own config...
);
```

Trailing arguments are arbitrary flat-config objects, appended in order after everything else — `exadevConfig({}, { rules: { 'no-console': 'warn' } })` is equivalent to spreading the default export plus one more config object. `import exadev from '@exadev/eslint-config'` (the default export) is just `exadevConfig()` called with no arguments.

### Optional React and Next.js support

React/hooks/a11y and Next.js rule blocks fold in automatically, with no separate import or config needed, gated on two independent, always-both-required conditions:

1. **The corresponding package must actually be resolvable.** [`eslint-plugin-react`](https://github.com/jsx-eslint/eslint-plugin-react), [`eslint-plugin-react-hooks`](https://github.com/facebook/react/tree/main/packages/eslint-plugin-react-hooks), [`eslint-plugin-jsx-a11y`](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y), and [`@next/eslint-plugin-next`](https://github.com/vercel/next.js/tree/canary/packages/eslint-plugin-next) are all *optional* peer dependencies (`peerDependenciesMeta.<pkg>.optional: true`) — install only whichever your project actually needs:
   ```sh
   pnpm add -D eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y   # React support
   pnpm add -D @next/eslint-plugin-next                                               # Next.js support
   ```
   If none of these resolve, `@exadev/eslint-config`'s default export is byte-for-byte identical to the plain TypeScript ruleset — nothing about the base package changes.
2. **For React specifically, the file must actually be `.jsx`/`.tsx`.** The React/hooks/a11y rule block is scoped to `files: ['**/*.jsx', '**/*.tsx']`, so even if `eslint-plugin-react` is resolvable only incidentally (e.g. hoisted as a transitive dependency of something unrelated in a monorepo, with zero real JSX anywhere in the linted project), its rules never match a file that isn't JSX. `@next/eslint-plugin-next`'s block carries no such glob: its own presence is already an unambiguous signal (nothing installs it except a real Next.js project).

React support pairs `eslint-plugin-react`'s `flat/recommended` with its own `flat/jsx-runtime` config, turning [`react/react-in-jsx-scope`](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/react-in-jsx-scope.md) and [`react/jsx-uses-react`](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-uses-react.md) back off. `flat/recommended` alone assumes the classic runtime, where every file using JSX needs `import React` in scope; the automatic JSX runtime (the default since React 17, and the only mode Next.js's own compiler supports) needs no such import. Without this pairing, a consumer on the automatic runtime would see `react/react-in-jsx-scope` fire on every JSX file.

**Explicit control**, for anyone who doesn't want to rely on auto-detection:

- **`plugin.configs.react`/`plugin.configs.nextjs`** — explicit tier selection, mirroring `plugin.configs.recommended`/`.barrel`. Unlike those two, selecting `.react`/`.nextjs` is itself an explicit request: it **throws** a clear, actionable error if the underlying peer isn't installed, rather than silently returning nothing.
  ```ts
  import { defineConfig } from 'eslint/config';
  import { plugin } from '@exadev/eslint-config';

  export default defineConfig(
    // ...your own config...
    {
      files: ['**/*.tsx'],
      plugins: { exadev: plugin },
      extends: [plugin.configs.react], // throws if eslint-plugin-react isn't installed
    },
    {
      files: ['**/*.ts', '**/*.tsx'],
      plugins: { exadev: plugin },
      extends: [plugin.configs.nextjs], // throws if @next/eslint-plugin-next isn't installed
    },
  );
  ```
- **`exadevConfig({ react, nextjs })`** — see the tri-state table below.

| Value | React (`options.react`) | Next.js (`options.nextjs`) |
| --- | --- | --- |
| `true` | Force on — throws if `eslint-plugin-react` isn't resolvable | Force on — throws if `@next/eslint-plugin-next` isn't resolvable |
| `false` | Force off — always `[]`, no resolution attempted | Force off — always `[]`, no resolution attempted |
| `undefined` / omitted | Auto-detect (the default) | Auto-detect (the default) |

**Compatibility note:** a consumer who already has `eslint-plugin-react`/`@next/eslint-plugin-next` resolvable for unrelated reasons (e.g. hoisted in a monorepo) and writes `.jsx`/`.tsx` files may see new rule activity the moment they upgrade to a version of this package that ships React/Next.js support, with zero action on their part. This is the normal, widely-accepted ESLint-ecosystem convention that adding rules to a shared/recommended config is a minor bump even though it can newly trip an existing `--max-warnings 0` gate — not a breaking change. Use the `react`/`nextjs` options above to force it off explicitly if needed.

### Gitignore-derived ignores

`exadevConfig()`'s default output includes an `ignores` block derived directly from your project's own `.gitignore` (via [`@eslint/config-helpers`](https://www.npmjs.com/package/@eslint/config-helpers)'s `includeIgnoreFile`), so a generated directory your `.gitignore` already knows about (`dist/`, `coverage/`, a tool's own report output) is never linted, without hand-duplicating that list in `eslint.config.ts` too. This closes a real gap: a `.gitignore`d directory that nothing previously linted broadly enough to reach could still get linted the moment a wide-reaching rule (this package's own bundled RFC 8785 JSON canonicalization, say) started matching every file its glob covers.

| Value | `options.gitignore` |
| --- | --- |
| `true` | Force on — throws if no `.gitignore` exists |
| `false` | Force off — always `[]`, no resolution attempted |
| `undefined` / omitted | Auto-detect (the default): on if the project has a `.gitignore`, silently off if it doesn't (nothing to read from a project with no version control set up yet) |

Needs no peer to install — `@eslint/config-helpers` is bundled into this package's own build.

### RFC 8785 canonical JSON formatting

Every JSON file is linted against [`eslint-plugin-json-canonical`](https://github.com/ExaDev/eslint-plugin-json-canonical) v2 — plain UTF-16 code-unit key ordering, canonical number formatting, canonical string escaping, and (as of that plugin's own v2) pretty-printed layout (2-space indentation, one member/element per line, a trailing newline), per [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785). This is bundled unconditionally, the same way jsdoc/tsdoc support is: `eslint-plugin-json-canonical` is a plain dependency of this package, so every consumer already has it. There is no option to turn it off.

The plugin's own full-canonicalization rule ([`no-insignificant-whitespace`](https://github.com/ExaDev/eslint-plugin-json-canonical/blob/main/src/rules/no-insignificant-whitespace.ts), which collapses a document to a single compacted line with no whitespace at all) is deliberately not part of the config this package extends — it stays available for a consumer to opt into directly for their own genuine canonicalization pass (hashing, signing, byte-for-byte comparison).

`**/*.jsonc`, `**/tsconfig*.json`, and `**/turbo.json` get the plugin's `configs.contentOnlyJsonc` instead of the plain-JSON config: they genuinely carry comments (TypeScript and turbo both accept them), which [`@eslint/json`](https://github.com/eslint/json#readme)'s `json/json` language has no concept of and fails to parse, and neither pretty-printing nor whitespace-collapsing has a well-defined answer for a comment's own attachment to a member once its surrounding whitespace is rewritten. Content canonicalization (key order, number/string formatting) still applies to these files under `json/jsonc`.

`**/package.json` gets everything the plain-JSON config gives every other file — including pretty-printed layout — except [`json/sort-keys`](https://github.com/eslint/json/blob/main/docs/rules/sort-keys.md), turned back off in its own override block, since its key order is the separate, syncpack-aware concern the next section covers.

### Stylistic comment, class-member and JSX rules

A hand-picked subset of [`@stylistic/eslint-plugin`](https://eslint.style) is bundled unconditionally, the same way jsdoc/tsdoc and RFC 8785 JSON support are: `@stylistic/eslint-plugin` is a plain dependency of this package, so every consumer already has it, and every rule below matches purely on comment shape, statement/class-member placement, or JSX prop/tag conventions, never on formatting (indentation, quotes, semicolons, trailing commas, line wrapping, bracket spacing), which stays Prettier's job in every consumer of this package. None of these rules appears in [`eslint-config-prettier`](https://github.com/prettier/eslint-config-prettier)'s own disabled-rules list.

- **[`multiline-comment-style`](https://eslint.style/rules/multiline-comment-style)** is deliberately NOT enabled: the installed release's own directive-comment filter only recognises the `eslint`/`jshint`/`jslint`/`istanbul`/`globals`/`exported`/`jscs` family, so a run of `//` lines mixed with a `prettier-ignore`, `c8 ignore`/`v8 ignore`, `@ts-expect-error`/`@ts-ignore`/`@ts-nocheck`/`@ts-check`, or `TODO`/`FIXME` comment gets merged into one block and the directive lost (a lost `prettier-ignore` then lets Prettier reformat the code it protected), and two or more consecutive triple-slash reference/AMD directives break the same way regardless of file extension. This is a confirmed upstream defect, [issue #1249](https://github.com/eslint-stylistic/eslint-stylistic/issues/1249), fixed by the merged [PR #1251](https://github.com/eslint-stylistic/eslint-stylistic/pull/1251); the triple-slash gap is also tracked upstream in [issue #1285](https://github.com/eslint-stylistic/eslint-stylistic/issues/1285). This rule is re-enabled once a stable release contains PR #1251's fix, tracked at [ExaDev/eslint-config#45](https://github.com/ExaDev/eslint-config/issues/45).
- **[`spaced-comment`](https://eslint.style/rules/spaced-comment)**: requires a space after `//`/`/*`, without fighting a `/**`-opening doc comment or a shebang line. Adds `{ block: { markers: ['!'] } }` on top of the bare default so a `/*!` license/banner block is not flagged either. A SPACED triple-slash reference/AMD directive (`/// <reference types="..." />`, TypeScript's own compiler-emitted spelling) is exempted by the installed rule's own hard-coded check; a no-space directive (`///<reference types="..." />`, also valid TypeScript syntax) is not, and gets rewritten by `--fix` into a broken `// /<reference ...>` comment TypeScript no longer recognises. Confirmed directly against the installed rule with no config-level workaround available (`markers`/`exceptions` both still require real whitespace immediately after the marker, which the no-space form never has); tracked at [ExaDev/eslint-config#47](https://github.com/ExaDev/eslint-config/issues/47). Also adds `{ line: { markers: ['#', '#region', '#endregion'] } }`: without it, the bare default rewrites a `//# sourceMappingURL=...`/`//# sourceURL=...` source-map comment into `// # sourceMappingURL=...`, which browsers and Node no longer recognise, and a bare `line: { markers: ['#'] }` alone would instead rewrite an unspaced `//#region`/`//#endregion` editor fold marker into `//# region`, which VS Code's own folding regex no longer matches. Listing all three markers together, confirmed directly against the installed rule, leaves every one of those four shapes untouched.
- **[`lines-between-class-members`](https://eslint.style/rules/lines-between-class-members)** at its bare default: a blank line between class members, except after a `.d.ts`-style method overload signature.
- **[`line-comment-position`](https://eslint.style/rules/line-comment-position)** at `'above'`: a `//` comment belongs above the code it describes, never trailing beside it on the same line. Not autofixable; a flagged trailing comment needs moving by hand. A trailing `// cspell:disable-line` is exempt (`ignorePattern`): cspell honours that directive only on the line it suppresses, so moving it above, as the report demands, would silently disable spell-checking for the wrong line. Every other directive this package recognises applies to the line(s) below it and is correctly relocated.
- **[`padding-line-between-statements`](https://eslint.style/rules/padding-line-between-statements)**: a blank line is required after the last statement of a directive prologue (not between two consecutive directives), after the last CommonJS or ES import in a run (not between two consecutive imports), and before a `return` statement.
- **[`jsx-curly-brace-presence`](https://eslint.style/rules/jsx-curly-brace-presence)**, **[`jsx-pascal-case`](https://eslint.style/rules/jsx-pascal-case)**, and **[`jsx-self-closing-comp`](https://eslint.style/rules/jsx-self-closing-comp)**, each at its own bare default: none of the three has any dependency on `eslint-plugin-react` or React itself (confirmed directly against `@stylistic/eslint-plugin`'s own `package.json`, whose only `peerDependencies` entry is `eslint`), since each matches purely on a JSX AST node shape and is a structural no-op on every non-JSX file.

`@stylistic/eslint-plugin` has no rule covering JSX's shorthand-boolean-prop convention (`<Foo enabled />` vs `<Foo enabled={true} />`) or shorthand-fragment syntax (`<>...</>` vs `<React.Fragment>...</React.Fragment>`); those are `eslint-plugin-react`'s own `react/jsx-boolean-value` and `react/jsx-fragments`, which stay entirely within the optional [React support](#optional-react-and-nextjs-support) gate above, not this unconditional bundle.

This package's own **`exadev/prefer-doc-comment`** rule (see [Rules](#rules)) is wired alongside these, in the same unconditional bundle.

### Optional package.json key ordering

`exadevConfig({ packageJsonKeyOrder: true })` enables `exadev/package-json-key-order` for `**/package.json`, requiring the same key order [`syncpack format`](https://syncpack.dev/command/format) would produce — `sortFirst` fields (`name`, `description`, `version`, `author` by default) pinned to the top in that exact order, then every other top-level key alphabetically; and, inside each `sortAz`-listed field's own object or array value (`dependencies`, `devDependencies`, `scripts`, `keywords`, and the rest of syncpack's own default list), its members/elements sorted the same way. Confirmed directly against real `syncpack@15` output, not assumed from its docs — see this rule's own source comment for the exact reverse-engineering method (a symbol-before-digit-before-letter, case-insensitive comparison syncpack's docs don't specify precisely enough to derive from prose alone).

This exists for a project that wants real `package.json` canonicalization without installing syncpack, and so a project that already has syncpack never sees the two fight: `eslint --fix` and `syncpack format` converge on the identical output.

| Value | `options.packageJsonKeyOrder` |
| --- | --- |
| `true` | Force on — throws if `@eslint/json` isn't resolvable |
| `false` | Force off — always `[]`, no resolution attempted |
| `undefined` / omitted | Auto-detect (the default): on unless the project already has a syncpack config (a `.syncpackrc*`/`syncpack.config.*` file, or a `"syncpack"` key in its own `package.json`), since syncpack already produces this exact order for free |

Like React/Next.js support, this needs its own optional peer resolvable — `@eslint/json` is declared in `peerDependenciesMeta` as optional, so install it in your project with `pnpm add -D @eslint/json` — and, unlike them, also needs its `json/json` language registered for the file (this option's own config block does that for you; nothing extra to wire up).

Bundled into `exadevConfig()`'s default output the same way React/Next.js auto-detection is — `packageJsonKeyOrder: true`/`false` only forces the tri-state explicitly, it isn't the only way to reach it. Not part of `plugin.configs.recommended`, and not available as a `plugin.configs.packageJsonKeyOrder` explicit-tier config the way `.react`/`.nextjs` are, since wiring it through `plugin.configs` would need `plugin.ts` and this option's own config builder to import each other.

## Rules

| Rule | Fixable | Description |
| --- | --- | --- |
| `barrel-policy` | | **Umbrella rule selecting a whole index-file barrel policy.** One `{ mode }` option covers the four barrel rules below. See [Barrel policy](#barrel-policy). |
| `no-index-files` | | **Bans any `index.*` file outright** (mode 1). The strictest policy. |
| `no-non-barrel-index` | | **Only `src/index.ts` may be named `index.*`** — any other `index.ts`/`.js`/etc would be silently selected by a consumer's bare directory import. |
| `no-non-barrel-reexport` | ✓ | **Re-exports belong only in a barrel.** Catches the split form across two statements (`import { x } from './y'; export { x };` or `export default x;`) which no AST selector alone can match. Autofix deletes the export and the now-pointless import when it was the import's only use. Self-scopes away from any index file. |
| `no-side-effects-in-index` | | **A barrel may contain only re-export statements** — nothing that could execute at import time. Self-scopes to any index file. |
| `barrel-direct-siblings-only` | | **A barrel may re-export only from a direct sibling** (`./module`), never a nested path, parent, or bare package specifier (mode 3). |
| `no-control-flow` | | **Bans `if`/`switch`/loops/the ternary operator outright.** Not part of `recommended` or `barrel` — ordinary code legitimately needs control flow, so this is opt-in, wired via a consumer's own `files` glob for the specific packages that want it (a composition-root package selecting an adapter/strategy by a validated key, say): a lookup table replaces a branch, a declarative array method (`map`/`filter`/`some`/`every`/...) replaces a loop. Requires no type information. |
| `no-pointless-reassignment` | ✓ | **Flags a `const` alias that adds no transformation** (`const foo = bar` where both sides are plain identifiers). Autofix rewrites every read to the original name and deletes the declaration. Still reported but deliberately not auto-fixable where collapsing the alias would change meaning: an explicit type annotation (`const exhaustive: never = item` — the annotation is the point), a read where the original name is shadowed, a read as a shorthand object property, more than one declarator in the statement, or a source that is written to anywhere. An alias that is itself part of the module's exported surface (`export const alias = original;`, a later `export { alias }`/`export { alias as other }`, or `export default alias;`) is neither reported nor fixed at all, since collapsing it would rename or delete a binding every importer of this module depends on. |
| `no-object-assign` | ✓/suggestion | **`Object.assign` skips the type-checking object spread gets** — it doesn't check a source object's properties against the target's declared types. A fresh object-literal target autofixes to `{ ...target, ...source }`; mutating an existing reassignable binding offers a suggestion only (changes the object's identity); a `const` binding or a non-statement call site gets a plain report with no fix. |
| `no-mutable-union-array-param` | ✓ | **A union-typed array parameter can be mutated with a value the caller's narrower array never declared.** A function parameter typed as an array of a union (`(string \| number)[]`) accepts a narrower caller array (`number[]`) by covariance; calling `push`/`unshift`/`splice`/`fill`/`copyWithin` on it can then insert a value the caller's own array was never declared to hold. Autofix marks the parameter `readonly`, turning the mutating call into a real compile error to resolve deliberately. Requires no type information. |
| `prefer-readonly-array-param` | ✓ | **Every non-readonly array/tuple parameter should be `readonly`.** A narrower, safely-autofixable sibling of [`@typescript-eslint/prefer-readonly-parameter-types`](https://typescript-eslint.io/rules/prefer-readonly-parameter-types/) scoped to array/tuple parameter shapes only: fires unconditionally on every non-readonly array or tuple parameter, regardless of whether the function body mutates it, in any parameter position (a plain identifier, a rest parameter, a default-valued parameter, or a constructor parameter property) and any function-like shape (a concrete function/arrow/method, or a declaration-only ambient function, interface method, function type alias, call/construct signature, or abstract/ambient class method). A union containing an array/tuple member is fixed on that member alone. Autofix prepends `readonly ` (or renames `Array<T>` to `ReadonlyArray<T>`), turning any resulting mutation into a real compile error to resolve deliberately. Requires no type information — registered in both `plugin.configs.recommended` and the default (type-checked) export. |
| `prefer-readonly-object-param` | ✓ | **A flat object parameter's type should be wrapped in `Readonly<...>`.** The object-shape sibling of `prefer-readonly-array-param` above, scoped to "flat" object parameters where a shallow fix is provably sufficient: an inline `{ ... }` literal or a reference to a plain named type/interface where every property (and index-signature value, if any) is itself a primitive, a literal/union of primitives, or a callback — with no nested object, array, tuple, Map, Set, class instance, union, intersection, or unconstrained type parameter anywhere in the shape. Autofix wraps the parameter's own type annotation in `Readonly<...>`, which TypeScript's own deep-readonly check accepts as fully sufficient for a shape this flat. Requires type information — only in the default (type-checked) export, not `plugin.configs.recommended` — to resolve each property's real type via the checker. |
| `no-array-isarray-mutation` | | **`Array.isArray` narrowing discards a `readonly` array's own guarantee.** Its type declaration narrows to plain `any[]`, discarding the `readonly` guarantee of any array type in the narrowed parameter's or local variable's real type — a bare `readonly T[]`, a `ReadonlyArray<T>`, one behind a type alias, or one alongside other union members — inside the guarded branch; calling `push`/`unshift`/`splice`/`fill`/`copyWithin` there can mutate a caller's genuinely readonly array. Recognises the direct `if (Array.isArray(x))` guard (braced or not), the early-return/early-throw idiom, `&&`, the ternary form, and the else-of-a-negated-test form. No autofix: re-adding `readonly` is a no-op (the guard already discarded it) and rewriting the mutating call into a copy-first pattern is not safely mechanical in the presence of aliasing. Requires type information — only in the default (type-checked) export, not `plugin.configs.recommended` — specifically to see through a type alias and to catch a bare, non-union readonly array parameter or local variable, neither visible from its own syntax alone. |
| `no-map-instanceof-mutation` | | **`instanceof Map` narrowing discards a `ReadonlyMap`'s own guarantee.** `Map` is declared as extending `ReadonlyMap`, so `instanceof Map` narrows a parameter or local variable whose real type includes a `ReadonlyMap` — bare, unioned, or reached through a type alias — straight past the readonly guarantee to the full mutable interface; calling `set`/`delete`/`clear` there can mutate a caller's genuinely read-only map. Recognises the direct `if (input instanceof Map)` guard (braced or not), the early-return/early-throw idiom, `&&`, the ternary form, and the else-of-a-negated-test form. No autofix: rewriting the mutating call into a copy-first pattern is not safely mechanical in the presence of aliasing. Requires type information — only in the default (type-checked) export, not `plugin.configs.recommended`. |
| `no-set-instanceof-mutation` | | **`instanceof Set` narrowing discards a `ReadonlySet`'s own guarantee**, straight to the fully mutable `Set` interface, with no way to preserve the read-only guarantee through the narrowing; calling `add`/`delete`/`clear` there can mutate a caller's genuinely read-only set. Recognises the same guard idioms as `no-map-instanceof-mutation` above. No autofix, for the same aliasing reason. Requires type information — only in the default (type-checked) export, not `plugin.configs.recommended`. |
| `no-enum-number-widening` | | **A bare `number` is accepted anywhere a numeric enum is expected**, without checking it is actually one of the enum's members — only a numeric *literal* gets range-checked by `tsc`. No autofix: the only provably safe fix is a genuine runtime membership check against the enum's own values, which is a behavioural choice a mechanical fix cannot responsibly make. Requires type information — only in the default (type-checked) export, not `plugin.configs.recommended`. |
| `no-enum-reverse-lookup-widening` | suggestion | **A numeric enum's reverse lookup can silently type as `string` for an out-of-range index.** Indexing a numeric enum's reverse mapping (`Direction[n]`) with a bare (non-literal) `number`, or with a different enum's member, types as plain `string` for any index, including one outside the enum's actual members, where it genuinely returns `undefined` at runtime — `tsc` does not range-check even a numeric literal index here. When the indexed expression is the init of a variable with an explicit `: string` annotation, a suggestion widens it to `: string \| undefined`, forcing later uses as a bare `string` to surface as real compile errors; every other syntactic position gets a plain report with no fix, and no case gets a full `--fix` autofix. Requires type information — only in the default (type-checked) export, not `plugin.configs.recommended`. |
| `prefer-numeric-sort-compare` | suggestion | **`.sort()` on a number array sorts lexicographically by default.** A deliberately narrow addition alongside [`@typescript-eslint/require-array-sort-compare`](https://typescript-eslint.io/rules/require-array-sort-compare/) (which already flags any bare `.sort()`/`.toSorted()` except on a plain string array, with no fix): when the array's element type is definitively `number`, a suggestion offers an ascending compare function (`(a, b) => a - b`), since the default comparator sorts lexicographically (`[1, 2, 10].sort()` becomes `[1, 10, 2]`). Not a full autofix — descending order is a real, if less common, alternative intent. Requires type information — only in the default (type-checked) export, not `plugin.configs.recommended`, since it needs the checker to confirm the array's element type. |
| `prefer-options-object-param` | suggestion | **A run of 2+ trailing optional parameters (`?`-marked or default-valued) should be bundled into one destructured `options` parameter.** Without this, a caller needing only the last optional parameter must still pass `undefined` for every optional parameter before it (the motivating case: a 10-parameter constructor with 8 trailing optional ones). The threshold is configurable (`{ minTrailingOptional }`, default `2`). A suggestion (not a full autofix) rewrites the parameter list and inserts a `const { ... } = options ?? {};` destructure as the body's first statement; call sites are never rewritten, since the signature edit alone turns every stale positional call site into a real compile error. Still reported, but with no suggestion offered, whenever collapsing the run would not be safe/mechanical: a parameter property in the run, a parameter with no simple resolvable name and explicit type of its own (including a destructured parameter, or one typed only through a separately-declared function-type alias), a decorated parameter, a rest parameter anywhere in the full parameter list, no `BlockStatement` body at all (an arrow's expression body, or any declaration-only signature — including an ambient `.d.ts` function, an interface method/construct signature, or an abstract/ambient class method), a `@param` JSDoc tag naming a parameter in the run, or a parameter/function-scope-local variable already named `options`. Complements `max-params` (see "Individual rule tuning" above), which catches the different shape (excessive REQUIRED parameters) this rule is deliberately blind to. Requires no type information — registered in both `plugin.configs.recommended` and the default (type-checked) export, like `prefer-readonly-array-param` above; unlike its own `prefer-readonly-object-param`/`prefer-numeric-sort-compare` siblings, which genuinely need the checker and so cannot be offered outside the default export at all. |
| `prefer-doc-comment` | ✓ | **A substantial leading comment on an exported declaration should be a doc comment, not a plain `//`/`/* */` comment.** "Substantial" means 2 or more comment lines, or a single line whose text exceeds a configurable length (`{ maxLineLength }`, default `80`). Covers an exported function declaration, an exported function's own signature (a body-less `TSDeclareFunction`, an ordinary overload signature and a genuinely ambient one alike, `declare function foo(): void;` included, since TypeScript never shows either one's own implementation to callers, only the signature itself), an exported `const` declaration, whatever its initialiser (a function expression or arrow function, an ordinary value such as `export const TIMEOUT_MS = 5000;`, or none at all in an ambient `export declare const x: number;`; reported once even when the statement declares several, e.g. `export const h1 = () => {}, h2 = () => {};`), an exported class declaration, ambient (`export declare class`) or ordinary alike (TypeScript strips only an ambient class's own MEMBER bodies, never its declaration shape, so its leading comment documents the identical public contract an ordinary exported class's does), an exported class's public (non-`private`/`protected`/`#`-private) method (covering both a method's own overload signature and its trailing implementation) and public abstract method (`abstract m(): void;`, needing no equivalent overload-implementation exemption of its own, since TypeScript's own grammar never lets an abstract method carry a body at all), an exported class's public function/arrow-valued property (the class-member equivalent of the function-initialised `const` shape above), an exported interface/type-alias declaration, an exported enum declaration (`const enum` alike; never an individual member, the identical reason an interface's members are never individually checked), an exported namespace/module declaration (ambient or ordinary alike, at any nesting depth whose enclosing namespaces are all exported themselves), and a default-exported expression (`export default (): number => 1;`, `export default 42;`; a default-exported `function`/`class` declaration or body-less signature is covered by its own shape above and reported exactly once, never twice); a non-exported declaration is never reported, regardless of its comment. A TypeScript function/method overload set's own body-carrying IMPLEMENTATION signature is never reported either, however substantial its own comment: TypeScript never shows that signature to callers at all, only the separate overload signatures above it (a body-less `TSDeclareFunction` for a function, written without `declare`, or a `MethodDefinition` whose own `value` is `TSEmptyBodyFunctionExpression` for a class method) are ever checked against a call site, and both of those are themselves reported like any other declaration in this rule's scope, as the overload set's own real public contract; a comment directly above the implementation is instead internal reasoning about how the overloads are actually realised, never a public contract. The implementation is detected via ESLint's own scope analysis for a function (the overload signatures and the implementation all share one Variable) and, for a class method, via an EARLIER (source-order), same-`static`-ness, same-key signature sibling: a same-named `static`/instance pair is never one overload set to TypeScript itself, and a same-named signature declared AFTER the implementation belongs to a different, later member, never the one the implementation itself realises, so neither is ever mistaken for the implementation's own overload signature. A trailing comment on the previous line of code (`const x = 1; // note`) is never treated as the next declaration's own leading comment. A directive-shaped line (the full ESLint directive/config-comment family, `eslint-disable`/`eslint-disable-line`/`eslint-disable-next-line`/`eslint-enable`/`eslint`/`eslint-env`/`global`/`globals`/`exported`, matched case-sensitively, exactly as ESLint's own directive parser matches them, each requiring real whitespace or end-of-string immediately after the keyword rather than a bare word boundary, so an ordinary compound word such as `eslint-plugin-x` is never mistaken for one, and, on a `//` Line comment specifically, recognised only as `eslint-disable-line`/`eslint-disable-next-line`, the two labels ESLint itself honours there; every other member of the family is a directive only in Block form, matching what ESLint itself does; `@ts-expect-error`/`@ts-ignore`/`@ts-nocheck`/`@ts-check`, the `ts-*` markers matched with or without their own leading `@`; `TODO`/`FIXME`, matched case-insensitively when all-uppercase or immediately followed by `:`/`(` (`todo:`, `fixme(scope):`), never a `Todo`/`Fixme` opening ordinary prose; `prettier-ignore`; `c8 ignore`/`v8 ignore`/`istanbul ignore`/`node:coverage ignore`/`node:coverage disable`/`node:coverage enable`; `cspell:disable`/`cspell:disable-line`/`cspell:disable-next-line`/`cspell:enable` (never cspell's own `ignore`/`words` directives, which name dictionary words rather than suppressing a stretch of text); `biome-ignore`; and `#region`/`#endregion`, an editor folding marker) found anywhere in a `//` run is never itself merged into the fix: only the prose segment directly adjacent to the declaration, the run of lines after the LAST such directive, is ever reported and converted; every earlier segment, and every directive line itself, is left completely untouched, since an earlier segment sits on the far side of a directive from the declaration and documents whatever the directive itself demarcates, never the declaration below it; a directive seated directly above the declaration itself is transparent to this split rather than a boundary of it, since group assembly skips past it before the run is ever collected, so the prose above it is still reported and converted, with the directive preserved untouched in place, still functional, directly above the declaration; a directive found inside an already-consolidated Block comment leaves the whole comment alone, since a partial fix cannot safely be sliced out of one physical comment node. A `///` triple-slash reference/AMD directive (`/// <reference types="..." />`) is recognised separately, by its own un-stripped comment value rather than this same pattern, and excluded from the fix the same way. An existing `/**`-opening doc comment, or a `/*!` license/banner block, is left alone regardless of length. Autofix rewraps the comment's existing text into a `/** ... */` block, one line per original logical line as this rule's own fixer writes it, preserving each line's own indentation beyond the delimiter's single conventional space (never flattening a nested example or sub-list to its neighbours' level), and unwraps a hand-written starred block's (`/* ... */` with its own leading `* ` per line) marker rather than doubling it against the fixer's own. This describes this rule's own fixer alone, not a guarantee that `exadevConfig()`'s combined output preserves that text verbatim: a bundled sibling rule's own fixer can still rewrite it further in the same `--fix` run, which is exactly why the fix is withheld below for the two such collisions this rule already guards against. Handles the leading comment whether it is a run of `//` lines or already a bare block: a bare block may be hand-written, or, for a consumer who separately enables `@stylistic/eslint-plugin`'s own `multiline-comment-style` themselves, produced by its own bare-block fixer. Always reported when substantial, but the fix withheld, rather than silently skipping the violation, whenever the exact resulting text would contain a literal closing-comment delimiter or fails to parse as valid TSDoc (checked directly against `@microsoft/tsdoc`'s own parser, the same one `eslint-plugin-tsdoc`'s `tsdoc/syntax` validates against). Also withheld when any considered line itself begins with a literal `*` once its own leading whitespace is trimmed (a hand-written markdown bullet, `* item`, or a bare block comment whose own lines are only partially starred): spliced verbatim into this fixer's own template, that reads as a repeated delimiter on a middle line, which eslint-plugin-jsdoc's own `jsdoc/no-multi-asterisks` rule (bundled unconditionally alongside this rule, see [`jsdoc.ts`](src/jsdoc.ts)) would then strip in the very same `--fix` run, silently losing real content in a way neither this rule nor `@microsoft/tsdoc`'s own parser has any way to detect on its own. Also withheld when any considered line carries an unescaped tag-shaped `@word` mention, at the line's own start (a genuine TSDoc block or modifier tag, `@remarks`, `@param foo`, `@internal`, `@typeParam T`, `@virtual`, `@override`, ...) or immediately after whitespace anywhere further into the line (a bare mid-line mention, `tseslint.config() is @deprecated upstream`), the identical shape `jsdoc/escape-inline-tags` itself keys on: a line-start tag withholds because jsdoc.ts spreads `flat/recommended-tsdoc-error` with no `settings.jsdoc` override of its own, so eslint-plugin-jsdoc's own tag-vocabulary rules (bundled unconditionally alongside this rule too) validate a doc comment's tags against JSDoc/TypeScript's own vocabulary rather than TSDoc's, and confirmed directly (a real combined-config run, not this rule in isolation) to delete, rewrite or otherwise fight over a genuine TSDoc-only tag in the very same `--fix` run: `jsdoc/empty-tags` deletes an `@internal` tag's own description text, `jsdoc/check-tag-names` deletes `@public`/`@readonly` outright and rewrites `@typeParam` to `@template` (which then fails `tsdoc/syntax`, since `@template` is not itself valid TSDoc) and `@virtual` to `@abstract`, and `@override` triggers a live fight between `check-tag-names` and `empty-tags`. A bare mid-line mention withholds because it is worse than a sibling-fixer collision: it parses as perfectly valid TSDoc, but confirmed directly (linting a scratch file with this repo's own bundled config) that TypeScript's own JSDoc parser reads the converted mention as a REAL tag on the symbol, so a converted `is @deprecated upstream` makes every use of the symbol fail `@typescript-eslint/no-deprecated`, changing what the symbol means rather than merely its formatting. A mention wrapped in a backtick code span (`@deprecated` inside one) is exempt from both and converts safely, the backtick immediately before the `@` breaking the whitespace-preceded shape for TypeScript's tag scanning and `escape-inline-tags` alike (both confirmed directly). Withholding on every tag-shaped line, not merely a blank line adjacent to one, is deliberate: this rule has no way to enumerate in advance which further TSDoc-only tag eslint-plugin-jsdoc's own vocabulary will next disagree with, so it withholds structurally rather than adding a further one-off guard each time a new collision is found. `jsdoc.ts`'s own `check-tag-names`/TSDoc-vocabulary disagreement is itself a pre-existing gap on `main`, not caused by this rule, tracked separately. Requires no type information. Wired only through `stylisticCommentsConfig` into the default (type-checked) `exadevConfig()` output (see [Stylistic comment, class-member and JSX rules](#stylistic-comment-class-member-and-jsx-rules)), never registered in `plugin.configs.recommended`/`.barrel`, so a consumer using the lighter `extends: [plugin.configs.recommended]` option (see [The lighter option](#the-lighter-option-the-plugin-named-export)) never gets it. |
| `package-json-key-order` | ✓ | **Requires `package.json`'s keys to match `syncpack format`'s order.** See [Optional package.json key ordering](#optional-packagejson-key-ordering) — opt-in via `exadevConfig({ packageJsonKeyOrder: true })`, not part of `recommended`/`barrel`. A JSON-language rule (`@eslint/json`'s `json/json`), not a TSESLint one — needs no type information and doesn't apply to any `.ts`/`.js` file. |
| `no-uphill-dependency` | | **Enforces a configured workspace's rank, rank-skip, slice and group-isolation boundaries** on every `package.json`'s declared dependencies. See [Workspace architecture](#workspace-architecture). Opt-in via `exadevConfig({ workspaceArchitecture })` or the standalone `workspaceArchitectureConfig()`, not part of `recommended`/`barrel`. A JSON-language rule, needs no type information. |
| `no-dependency-cycle` | | **Disallows a workspace dependency that can reach back to the package declaring it.** A same-rank or same-slice dependency passes `no-uphill-dependency` while still forming a cycle, which this rule catches instead. See [Workspace architecture](#workspace-architecture). |
| `package-name-mirrors-path` | | **Requires a workspace package's declared name to match the name its own path derives**, under the configured naming scope and separator. A package that declares no name at all is reported too (it plainly cannot mirror its path when it names nothing). Itself opt-in within workspace architecture: a no-op unless the shared `naming` option is given. See [Workspace architecture](#workspace-architecture). |
| `test-file-kind` | | **A test file's name must declare its own test kind.** A filename suffix immediately before `.test`/`.spec` (e.g. `foo.unit.test.ts`), one of a configurable `{ kinds }` set (default: `unit`, `integration`, `e2e`). A naming-discipline rule, not a content classifier — it checks only the filename, never what the file actually tests. Self-scoped to real test/spec files (`context.filename`), so it never misfires when applied unscoped and never relies on a consumer's own `files` config. Requires no type information. |

## Barrel policy

`exadev/barrel-policy` is the convenience layer: one rule id, one `{ mode }` option selecting a complete index-file policy. Use EITHER this umbrella OR the individual rules (not both — they double-report). Omitting `mode` entirely, or passing an options object with no `mode` key, means `'auto'`.

| `mode` | Which files may be barrels | What a barrel may contain | Where re-exports may come from |
| --- | --- | --- | --- |
| `'auto'` (what an omitted `mode` means) | detected per file — walks up to the nearest ancestor `package.json`; a real `exports`/`main` there resolves to `single`, otherwise `banned` | only re-exports when detected as `single` | anywhere, when detected as `single` |
| `'banned'` (`plugin.configs.recommended`'s explicit choice) | none | — | — |
| `'single'` (`plugin.configs.barrel`'s explicit choice) | exactly `src/index.ts` | only re-exports | anywhere |
| `'siblings'` | any `index.ts` | only re-exports | a direct sibling only (`./module`) |

Notes on `'auto'`:

- It only ever resolves to `banned` or `single` — there's no single-signal auto-equivalent for `siblings` (which package.json field would suggest "any index file, not just the entry point"?), so a project wanting that policy states it explicitly, e.g. to permit any index file as a barrel rather than just `src/index.ts` (flat-config later blocks override earlier rule settings):
  ```ts
    ...exadev,
    { rules: { 'exadev/barrel-policy': ['error', { mode: 'siblings' }] } }, // any index file may be a barrel, not just src/index.ts
  ```
- `private: true` in `package.json` is not consulted by the detection: a pnpm workspace package is routinely both `private` and a genuine import target for sibling packages via `exports`, so `private` says nothing about whether a barrel is warranted.

In every mode, re-exports are banned outside a permitted barrel, and a permitted barrel may contain only re-export statements. The umbrella composes the identical predicates the standalone rules use (shared in [`src/rules/barrel-helpers.ts`](src/rules/barrel-helpers.ts)). It is non-fixable — the autofix lives on `no-non-barrel-reexport`.

## Workspace architecture

Three rules (`no-uphill-dependency`, `no-dependency-cycle`, `package-name-mirrors-path`) share one options object, `WorkspaceArchitectureOptions`, describing a pnpm workspace's own dependency-direction rules: which package is allowed to depend on which other, checked directly against every `package.json`'s declared `dependencies`. Off by default, since `groups` has no sensible default; enable it either through `exadevConfig({ workspaceArchitecture })` (the full bundle) or the standalone `workspaceArchitectureConfig(options)` export (for a consumer building its own config from the lighter `plugin` export, e.g. one that isn't using `exadevConfig()` at all):

```ts
// eslint.config.ts
import { defineConfig } from 'eslint/config';
import { exadevConfig } from '@exadev/eslint-config';

export default defineConfig(
  {
    languageOptions: {
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
  },
  ...exadevConfig({
    workspaceArchitecture: {
      groups: [
        { name: 'core', rank: 0 },
        { name: 'features', rank: 1 },
        { name: 'targets', rank: 2 },
      ],
    },
  }),
);
```

Both entry points need `@eslint/json` resolvable (an optional peer dependency of this package: `pnpm add -D @eslint/json` in your project), the same optional peer [package.json key ordering](#optional-packagejson-key-ordering) uses; unlike that feature, workspace architecture has no tri-state auto-detection at all, since there is nothing to detect it against, only whether the option was given.

### Options

| Field | Meaning |
| --- | --- |
| `root` | The workspace root directory. Defaults to the nearest ancestor of the linted file that owns a `pnpm-workspace.yaml`. |
| `packages` | Workspace package globs, matching pnpm's own `pnpm-workspace.yaml` glob support (`*`, `**`, `[...]` character classes, `{...}` brace expansion, `!`-prefixed excludes; a wildcard segment never matches a name starting with "."; a `./` prefix, a `.`/`..` segment, and a repeated slash normalise the same way `path.posix.normalize` would, so `./packages/*`, `packages//*` and `a/../packages/*` all select the same projects). Defaults to that file's own top-level `packages:` block sequence, quoted or bare. A positive pattern that currently matches no directory (an empty group awaiting its first member, say) resolves to no packages, the same as pnpm itself. |
| `dependencyFields` | `package.json` fields read as a package's declared dependencies. Defaults to `['dependencies']`. |
| `groups` | The workspace's own directory taxonomy: `{ name, path?, rank?, slice?, naming? }`. `path` defaults to `name` (a group rooted at a directory of the same name). A group's own `naming` (`'drop-group'` \| `'keep-group'` \| `'basename'`, default `'drop-group'`) selects which segments of a package's path (after the group's own root) `package-name-mirrors-path` expects its declared name to derive: `'drop-group'` keeps every remaining path segment, falling back to the group's own `name` when a package sits exactly at the group's own root (a standalone `docs` package under a `{ name: 'docs' }` group expects `docs`, never an empty or bare-scope name); `'keep-group'` additionally keeps the group's own `name` ahead of them, always, regardless of how deep its `path` nests (a group `{ name: 'test', path: 'packages/tests' }` expects `test-e2e` for `packages/tests/e2e`, never a path segment standing in for the name); `'basename'` keeps only the path's own final segment, dropping every intermediate directory. The joined segments are prefixed with `naming.scope` (when given) and separated with `naming.separator` (default `-`). |
| `nameRanks` | The name-role rank model: `{ pattern, rank }[]`, a package's declared name checked against each `pattern` in order, first match wins, ahead of its own group's `rank`. Omit entirely for a pure group-rank model. pnpm allows a workspace package to declare no `name` at all; such a package has nothing for a pattern to match, so `nameRanks` is skipped for it entirely and its rank falls straight through to its own group's `rank` or `defaultRank`. |
| `defaultRank` | The rank a package gets when neither `nameRanks` nor its own group resolves one. |
| `rankSkip` | `{ maxDistance, exemptRanks }`. A dependency more than `maxDistance` ranks below its dependant, and not itself one of `exemptRanks` (typically a foundational rank 0), is a `rankSkip` violation. Omitted entirely, that check never runs. |
| `isolatedGroups` | `[groupName, groupName][]` pairs forbidden from depending on each other in either direction, on top of the rank/slice checks (for two groups that share a rank but must still stay separate). |
| `naming` | `{ scope?, separator? }`. Enables `package-name-mirrors-path`; omitted entirely, that rule is a no-op. |

A group's own `slice` (`{ segment: N }` or `{ namePrefix: true }`) partitions it further: two packages in the same or a differently-ranked group but a different slice (two feature verticals, say) are still isolated from each other, checked by the `crossSlice` violation. `{ segment: N }` reads the slice value directly from the package's own path (the Nth segment after the group's own root); `{ namePrefix: true }` is for a group with no such structure of its own (a flat `targets/` directory, say), whose packages instead take their slice from whichever other group's already-observed segment-derived value prefixes their own declared name.

### Example: a group-ranked repo

Every group states its own `rank` directly; `test` keeps its own group name in the derived name (`@novus/test-database`, not `@novus/database`), which every other group drops:

```ts
// eslint.config.ts
import { defineConfig } from 'eslint/config';
import { workspaceArchitectureConfig } from '@exadev/eslint-config';

export default defineConfig(
  // ...your own config...
  ...workspaceArchitectureConfig({
    groups: [
      { name: 'core', rank: 0 },
      { name: 'features', rank: 1 },
      { name: 'product', rank: 2 },
      { name: 'targets', rank: 3 },
      { name: 'test', rank: 4, naming: 'keep-group' },
    ],
    naming: { scope: '@novus' },
  }),
);
```

`workspaceArchitectureConfig()`'s own returned config block already registers `plugins: { exadev: plugin }` itself (see its own source), so a consumer using only this standalone export never wires the plugin by hand; that manual line is needed only alongside the "lighter option" section above, where nothing else in the array registers the plugin.

### Example: a name-ranked repo

Rank comes from a package's own declared name, not its directory; `packages/targets` infers its slice from whichever feature/product vertical its own name is prefixed with, and `rankSkip` lets a target reach a rank-0 contract directly while still blocking it from skipping straight past `store-application-context` to an adapter:

```ts
// eslint.shared.ts
import { exadevConfig } from '@exadev/eslint-config';

export default exadevConfig({
  workspaceArchitecture: {
    groups: [
      { name: 'core', path: 'packages/core' },
      { name: 'features', path: 'packages/features', slice: { segment: 0 } },
      { name: 'product', path: 'packages/product', slice: { segment: 0 } },
      { name: 'targets', path: 'packages/targets', slice: { namePrefix: true } },
    ],
    nameRanks: [
      { pattern: '-contract$', rank: 0 },
      { pattern: '-adapter-|-schema$|^store-api-router$', rank: 1 },
      { pattern: '^store-application-context$', rank: 2 },
    ],
    defaultRank: 3,
    rankSkip: { maxDistance: 1, exemptRanks: [0] },
  },
});
```

### Example: exchange-platform

`features` and `verticals` sit at the same rank, and both slice on their own first path segment, so a feature and a vertical for the same conceptual area (`store`, say) share a slice value and would otherwise pass the `crossSlice` check as though related; `isolatedGroups` is what actually keeps them from depending on each other, entirely independently of slice:

```ts
// eslint.shared.ts
import { exadevConfig } from '@exadev/eslint-config';

export default exadevConfig({
  workspaceArchitecture: {
    groups: [
      { name: 'core', rank: 0 },
      { name: 'features', rank: 1, slice: { segment: 0 } },
      { name: 'verticals', rank: 1, slice: { segment: 0 } },
      { name: 'product', rank: 2 },
      { name: 'targets', rank: 3 },
      { name: 'test', rank: 4, naming: 'keep-group' },
    ],
    isolatedGroups: [['features', 'verticals']],
    naming: { scope: '@exacap' },
  },
});
```

## Development

### Build, test, and lint

```sh
pnpm install    # requires Node >=20 and the pnpm version pinned in package.json's packageManager field
pnpm lint
pnpm typecheck
pnpm test
pnpm test:mutation   # Stryker, 100% break threshold
pnpm build
```

[`pnpm`](https://pnpm.io) is this repo's own package manager, pinned via `packageManager`.

- Each rule has a co-located `*.unit.test.ts` exercising it with ESLint's [`RuleTester`](https://eslint.org/docs/latest/integrate/nodejs-api#ruletester) under [Vitest](https://vitest.dev). [`vitest.setup.ts`](vitest.setup.ts) wires `RuleTester.describe`/`.it`/`.itOnly` to Vitest's `describe`/`it` explicitly (no `test.globals`). Each test uses typescript-eslint's parser for TypeScript-only fixtures; none need type information.
- Every test file's own name declares its kind via a filename suffix immediately before `.test`/`.spec` — `.unit`, `.integration`, or `.e2e` by default (`exadev/test-file-kind`, part of `recommended`; see [Rules](#rules)) — so a file's test kind is always visible from its name alone, without opening it, and downstream tooling (e.g. a Vitest project split by test kind) can select by filename glob rather than by convention nobody enforces. This package's own tests are exclusively `.unit.test.ts` today (a `.internal.unit.test.ts` variant exists for a handful of files that also test non-exported internals directly, `internal` just being an ordinary extra name segment — see [`no-mutable-union-array-param.internal.unit.test.ts`](src/rules/no-mutable-union-array-param.internal.unit.test.ts)).
- `pnpm test` always measures [coverage](https://vitest.dev/guide/coverage) (`@vitest/coverage-v8`), scoped to `src/**/*.ts` excluding `*.test.ts`. Text output in terminal; `html`/`lcov` in `coverage/` (gitignored alongside `.eslintcache` and `dist/`).
- The `lint`/`typecheck`/`test`/`build` npm scripts wrap [turbo](https://turborepo.dev) tasks named `_lint`/`_typecheck`/`_test`/`_build` — run `pnpm build`, not `turbo run build`.
- `pnpm build` runs [`tsdown`](https://tsdown.dev) from [`src/index.ts`](src/index.ts), bundling the whole module graph into ESM + CJS + declarations. `prepublishOnly` re-runs lint, typecheck, `test`, `tsdown`, [`publint`](https://publint.dev), and [`attw`](https://github.com/arethetypeswrong/arethetypeswrong.github.io) `--pack`.

### Architecture

<details>
<summary>Expand for implementation internals (not needed for ordinary consumption)</summary>

- [`src/plugin.ts`](src/plugin.ts) builds a `TSESLint.FlatConfig.Plugin` combining [`src/rules/`](src/rules) into a flat `rules` map.
  - That's [`@typescript-eslint/utils`](https://typescript-eslint.io/packages/utils)'s own type, not ESLint's own `ESLint.Plugin` — the latter can't hold a rule built with [`ESLintUtils.RuleCreator`](https://typescript-eslint.io/developers/custom-rules).
  - `configs.recommended`, `.barrel`, `.react`, and `.nextjs` are getters in the object literal, since each references the fully-built `plugin` (`plugins: { exadev: plugin }`), which a plain property initializer can't do mid-construction.
  - `recommended` ships `barrel-policy` at `mode: 'banned'`; `barrel` at `mode: 'single'`; `.react`/`.nextjs` call `buildReactConfig`/`buildNextjsConfig` with `enabled: true` (see below).
- [`src/config-types.ts`](src/config-types.ts) holds `ConfigValue`/`ConfigArrayValue` (`ConfigArrayValue = Extract<ConfigValue, unknown[]>`, the array-only member of ESLint's own config-value union), shared by every file below rather than redefined per file.
  - *Why:* annotating a config array with the wider `ConfigValue` union directly broke `...exadev` with `TS2488` ("must have a Symbol.iterator method").
  - It also holds `PublicConfigArray` (the default export's own `@eslint/core`-typed return shape) and `PublicPlugin` (the named `plugin` export's own boundary type, narrowing `configs` down to its four actual literal keys), the two public-boundary types [`src/to-public-config-array.ts`](src/to-public-config-array.ts)/[`src/to-public-plugin.ts`](src/to-public-plugin.ts) each cast into, isolated in their own single-cast modules for the reason each file's own comment gives.
- [`src/optional-plugin.ts`](src/optional-plugin.ts) is the lazy-resolution helper behind React/Next.js support.
  - `tryRequire` wraps [`createRequire(import.meta.url)`](https://nodejs.org/api/module.html#modulecreaterequirefilename) in try/catch, returning `unknown` (never a cast) so every call site narrows explicitly before use.
  - `readFlatConfig` walks a property path through that `unknown` value via a real type guard, normalizing a stray legacy top-level `parserOptions` key into `languageOptions.parserOptions` along the way.
  - Confirmed necessary: `eslint-plugin-jsx-a11y`'s own `configs.recommended` export carries exactly this legacy shape, which flat config's schema rejects outright rather than ignores.
- [`src/react.ts`](src/react.ts)/[`src/nextjs.ts`](src/nextjs.ts) each export a `build*Config(options)` function: resolve the relevant optional peer(s) via `tryRequire`, extract their real flat config via `readFlatConfig`, and return an array of 0-or-more config blocks.
  - `[]` if unresolvable and not explicitly forced on; a thrown `Error` if explicitly forced on (`enabled: true`) and still unresolvable.
  - `react.ts`'s blocks are scoped to `files: ['**/*.jsx', '**/*.tsx']`; `nextjs.ts`'s is not (see [Optional React and Next.js support](#optional-react-and-nextjs-support) for why).
- [`src/create-config.ts`](src/create-config.ts) is config assembly's single source of truth.
  - `exadevConfig(options, ...userConfigs)` concatenates, in order: `buildGitignoreConfig`, `recommendedTypeChecked`, `jsdocAndTsdoc`, `jsonCanonicalConfig`, `stylisticCommentsConfig`, `buildReactConfig`, `buildNextjsConfig`, `buildPackageJsonKeyOrderConfig` (each tri-state builder fed its matching option), `buildWorkspaceArchitectureConfig` (only when `workspaceArchitecture` is given; there is no auto-detected default), and any trailing user configs.
  - `defaultConfig` is `exadevConfig()` evaluated once, eagerly, at module load.
- [`src/stylistic-comments.ts`](src/stylistic-comments.ts) builds `stylisticCommentsConfig`: the hand-picked `@stylistic/eslint-plugin` rules plus this package's own `exadev/prefer-doc-comment`, in two blocks (one scoped to every JS/TS file, one scoped to JSX files only for the three JSX-specific rules). See [Stylistic comment, class-member and JSX rules](#stylistic-comment-class-member-and-jsx-rules).
- [`src/index.ts`](src/index.ts) is the entry point, still a pure re-export barrel:
  ```ts
  export { defaultConfig as default, exadevConfig } from './create-config';
  export { publicPlugin as plugin } from './plugin';
  export { workspaceArchitectureConfig } from './workspace-architecture';
  export type { GroupSpec, NamingOptions, RankRule, RankSkipOptions, SliceSpec, WorkspaceArchitectureOptions } from './rules/workspace-options';
  ```
  - The named export is `publicPlugin`, not `plugin`'s own internal default export: `plugin` (src/plugin.ts) is typed against `@typescript-eslint/utils`' `TSESLint.FlatConfig.Plugin` for full rule-option checking while this package assembles it, then cast once, at the very end of that same file, to `PublicPlugin` (see `src/to-public-plugin.ts`) before re-export, mirroring how `defaultConfig` is built against the internal `ConfigArrayValue` and cast to `PublicConfigArray` at `exadevConfig`'s own boundary.
  - Required by `no-side-effects-in-index`/`no-non-barrel-reexport`, both of which assume this file contains nothing but `export ... from ...`.
  - All exports share one root module, so importing `{ plugin }` alone still resolves `typescript-eslint` via the sibling re-export — an accepted trade-off (an earlier separate-subpath split proved more awkward in practice).
  - React/Next.js support never adds to this cost: none of the four optional packages are ever statically imported, only passed as a runtime string to `createRequire`'s resolver, so their absence never affects module evaluation for a consumer who doesn't use them.
- [`pnpm-workspace.yaml`](pnpm-workspace.yaml) declares an empty `packages: []` — not a real workspace, just giving turbo a root for local task caching.

</details>

### Conventions

- [`eslint.config.ts`](eslint.config.ts) dogfoods this package's own factory export on itself (`import { exadevConfig } from './src/index'`), spreading `exadevConfig({ react: false, nextjs: false })` — forced off explicitly, not the plain auto-detecting default, since `eslint-plugin-react`/`@next/eslint-plugin-next` are real devDependencies of *this* repo (needed to test [`src/react.ts`](src/react.ts)/[`src/nextjs.ts`](src/nextjs.ts)'s own "package is resolvable" branch) even though this repo is neither a React nor a Next.js project. `no-side-effects-in-index` and `no-non-barrel-reexport` self-scope to [`src/index.ts`](src/index.ts) internally, so no `files`/`ignores` wiring is needed here. Plugin construction lives in [`src/plugin.ts`](src/plugin.ts) specifically so `src/index.ts` stays a pure re-export point.
- [`tsconfig.json`](tsconfig.json) enables [`verbatimModuleSyntax`](https://www.typescriptlang.org/tsconfig/#verbatimModuleSyntax) (`import type`/`export type` required for type-only imports — also enforced by `consistent-type-imports`) and [`noUncheckedIndexedAccess`](https://www.typescriptlang.org/tsconfig/#noUncheckedIndexedAccess) (narrow indexed access before use rather than asserting).
- Conventional commits are enforced by [commitlint](https://commitlint.js.org), restricted to the type-enum defined once in [`release.config.ts`](release.config.ts)'s `commitTypes` — both commitlint and semantic-release derive from that single list.

### Gotchas and quirks

- [`.attw.json`](.attw.json) ignores `false-export-default`: tsdown/[rolldown](https://rolldown.rs)'s CJS output for this plugin's sole default export doesn't emit the `export =` form [`arethetypeswrong`](https://github.com/arethetypeswrong/arethetypeswrong.github.io) wants under legacy `node10` resolution. The modes ESLint flat config uses (`node16`, `bundler`) are unaffected, so the rule is suppressed rather than changing the default-export shape.
- [`src/index.ts`](src/index.ts) mixing a default export with a named one triggers rolldown's `MIXED_EXPORTS` warning: a raw CommonJS `require()` would see the raw exports object instead of the default. ESM `import` (the actual consumer path) resolves both correctly; `attw --pack` and `publint` report no problems, so the warning is accepted (see [`tsdown.config.ts`](tsdown.config.ts)).
- [Husky](https://github.com/typicode/husky) hooks: `pre-commit` runs [lint-staged](https://github.com/lint-staged/lint-staged#readme) (`eslint --fix` on staged `*.ts`), `commit-msg` runs commitlint, `pre-push` runs typecheck + test + build.
- The CI release job sets `HUSKY=0` (commit-msg hook skips the automated release commit) and blanks `NPM_TOKEN`/`NODE_AUTH_TOKEN` explicitly so an inherited token can't win over [OIDC trusted publishing](https://docs.npmjs.com/trusted-publishers).
- A consumer who already has `eslint-plugin-react`/`@next/eslint-plugin-next` resolvable for unrelated reasons (e.g. hoisted in a monorepo) and writes `.jsx`/`.tsx` files may see new rule activity the moment they upgrade to a version of this package that ships React/Next.js support — with zero action on their part. See the compatibility note under [Optional React and Next.js support](#optional-react-and-nextjs-support).
- [Workspace architecture](#workspace-architecture)'s dependency graph is cached for the life of the process, keyed by workspace root plus the resolved options, with no invalidation of its own. A long-running ESLint process (an editor's language server, most notably) that renames a package or edits its declared dependencies after that root/options combination's first lint keeps serving the stale graph built before the edit, until the process restarts. Both prior local implementations this feature replaced (Novus hive's and the monorepo-template's own workspace rule sets) carried the identical limitation.

### Contributing

Conventional commits are enforced by a husky `commit-msg` hook and re-checked in CI. CI runs commitlint, lint and typecheck+test+build+attw on every pull request, on push to `main`, and on manual dispatch; mutation testing (Stryker) runs on manual dispatch only and gates nothing; the release job runs only on `main` (push or manual dispatch), after the three automatic jobs pass.

### Release

Conventional commits drive [semantic-release](https://semantic-release.gitbook.io/semantic-release) on every push to `main`: version bump, `CHANGELOG.md`, GitHub Release, and npm publish via [OIDC trusted publishing](https://docs.npmjs.com/trusted-publishers) (no stored token). A second CI job republishes the identical build under the unscoped alias `exadev-eslint-config`.

## License

MIT
