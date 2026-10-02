# @exadev/eslint-config

[![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white)](https://github.com/ExaDev/eslint-config) [![npm](https://img.shields.io/badge/npm-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@exadev/eslint-config) [![Release](https://img.shields.io/github/v/release/ExaDev/eslint-config)](https://github.com/ExaDev/eslint-config/releases/latest) [![CI](https://img.shields.io/github/actions/workflow/status/ExaDev/eslint-config/ci.yml?branch=main)](https://github.com/ExaDev/eslint-config/actions)

> A real ESLint plugin (not a shareable config) exposing custom rules shared across ExaDev projects. Also published under the unscoped alias `exadev-eslint-config`.

**Contents:** [Why](#why) · [Getting started](#getting-started) · [The lighter option](#the-lighter-option-the-plugin-named-export) · [Optional features](#optional-features) · [Rules](#rules) · [Barrel policy](#barrel-policy) · [Tool config files](#tool-config-files) · [Tooling wiring](#tooling-wiring) · [Verifying ESLint is applied](#verifying-eslint-is-applied) · [Workspace architecture](#workspace-architecture) · [Turbo](#turbo) · [Development](#development) · [License](#license)

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
- **[`strict-boolean-expressions`](https://typescript-eslint.io/rules/strict-boolean-expressions/)** at the rule's own bare defaults.
  - *Why:* an unambiguous non-nullable truthy check stays allowed; an ambiguous nullable check does not.
- **[`no-magic-numbers`](https://typescript-eslint.io/rules/no-magic-numbers/)** — tuned to exempt array indexes, enum members, readonly class properties, default parameter values, numeric literal types (e.g. `type Indent = 2 | 4`), and the handful of universally-idiomatic bare numbers (`-1`, `0`, `1`, `2`).
- **[`max-lines`](https://eslint.org/docs/latest/rules/max-lines)** set to `{ max: 800, skipBlankLines: true, skipComments: true }`.
  - *Why:* counting only real code means a file isn't pushed over the limit by whitespace or its own WHY-explanation comments.
- **[`max-params`](https://eslint.org/docs/latest/rules/max-params)** set to `{ max: 4 }`, one above the rule's own default of `3`. Needs no type information — registered in both `plugin.configs.recommended` and the default (type-checked) export, like `exadev/prefer-readonly-array-param` above.
  - *Why:* a deliberately loose backstop against a genuinely excessive number of REQUIRED parameters, distinct from `exadev/prefer-options-object-param` above, which already offers a real fix for the more common shape (a run of 2+ trailing OPTIONAL parameters) this rule structurally cannot see until the total count crosses its own threshold.
- **[`no-warning-comments`](https://eslint.org/docs/latest/rules/no-warning-comments)** — bans any comment containing `Stryker disable`.
  - *Why:* that's Stryker's own mutation-testing suppression directive, invisible to `noInlineConfig` above since it isn't an eslint-disable comment.
- **[`explicit-module-boundary-types`](https://typescript-eslint.io/rules/explicit-module-boundary-types/)**: an exported function or class member writes out its parameter and return types.
  - *Why:* an inferred return type changes silently when the body does; `isolatedDeclarations` is the compiler-side alternative and is a tsconfig matter.
- **[`switch-exhaustiveness-check`](https://typescript-eslint.io/rules/switch-exhaustiveness-check/)** set to `{ considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: true }`.
  - *Why:* a `default` branch cannot stand in for handling a newly added union member, and a switch over a non-union needs a `default` because the checker cannot prove its cases complete.
- **Core robustness rules**: `eqeqeq`, `no-implicit-coercion`, `no-param-reassign`, `no-await-in-loop`, `require-atomic-updates`, `default-case-last`, `no-return-assign` and `max-depth`. See [Robustness rules](#robustness-rules).

**Test files** (`**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`) get two narrow relaxations of this package's own additions, and only these two:

- **`@ts-expect-error`** reverts to `allow-with-description`.
  - *Why:* a compile-time-only assertion of a type failure is a legitimate test pattern; `@ts-ignore`/`@ts-nocheck` stay banned since `@ts-expect-error` is strictly better.
- **[`consistent-type-assertions`](https://typescript-eslint.io/rules/consistent-type-assertions/)** relaxes to `assertionStyle: 'as'`.
  - *Why:* the legacy `<Type>value` form stays banned everywhere.

Nothing else inherited from the presets is relaxed.

### Robustness rules

Core ESLint rules that nothing in the typescript-eslint presets enables. All need no type information, so `plugin.configs.recommended` carries them as well, with the same settings except `no-implicit-coercion` (below).

| Rule | Setting | Why |
| --- | --- | --- |
| [`eqeqeq`](https://eslint.org/docs/latest/rules/eqeqeq) | `always` | `== null` hides which of `null` and `undefined` the code means, so there is no `null` carve-out. |
| [`no-implicit-coercion`](https://eslint.org/docs/latest/rules/no-implicit-coercion) | `{ boolean: false }` in the default export, defaults in `plugin.configs.recommended` | `!!value` is allowed where `strict-boolean-expressions` backs it, because that rule already rejects `!` on an operand whose truthiness is ambiguous (a nullable string or number). `plugin.configs.recommended` registers no typescript-eslint rules, so it keeps banning `!!`. `+value`, `'' + value` and similar stay banned in both. |
| [`no-param-reassign`](https://eslint.org/docs/latest/rules/no-param-reassign) | `{ props: true }` | A parameter is the caller's value; assigning to it or to one of its properties is a hidden side effect. |
| [`no-await-in-loop`](https://eslint.org/docs/latest/rules/no-await-in-loop) | on | Iterations that could run together run one after another. `for await` is allowed. |
| [`require-atomic-updates`](https://eslint.org/docs/latest/rules/require-atomic-updates) | on | `total += await p` reads `total` before the `await` and writes it after, losing any update made in between. |
| [`default-case-last`](https://eslint.org/docs/latest/rules/default-case-last) | on | A `default` that is not last hides the cases written after it. |
| [`no-return-assign`](https://eslint.org/docs/latest/rules/no-return-assign) | `always` | Even a parenthesised assignment cannot be the returned value. |
| [`max-depth`](https://eslint.org/docs/latest/rules/max-depth) | `{ max: 4 }` | The rule's own default, written out so a change to it cannot loosen the limit. |

A loop that is sequential by design (migrations that must run in order, a rate-limited API) is exempted by a `files`-scoped override placed after the shared config, never by an inline disable comment, since `noInlineConfig` is on:

```ts
export default defineConfig(...exadevConfig(), {
  files: ['src/migrations/**/*.ts'],
  rules: { 'no-await-in-loop': 'off' },
});
```

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
    extends: ['exadev/recommended'], // this plugin's own non-type-aware rules, the core robustness rules, plus linterOptions.noInlineConfig — no type-checked rules at all
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
| [Turbo rules](#turbo) | Off unless given (only a repository can say it uses turbo) | `exadevConfig({ turbo })` / `turboConfig(options)` |
| [Import policy](#import-policy) | Off unless given (only a repository can say which imports it forbids) | `exadevConfig({ importPolicies })` / `importPolicyConfig(policies)` |
| [Pure modules](#pure-modules) | Off unless given (only a repository can say which modules are a functional core) | `exadevConfig({ pureModules })` / `pureModulesConfig(options)` |
| [Guard and conformance test hygiene](#guard-and-conformance-test-hygiene) | Off unless given (only a repository can say which tests are guards); needs the optional peer `@vitest/eslint-plugin` | `exadevConfig({ testHygiene })` / `testHygieneConfig(options)` |
| [Tooling wiring](#tooling-wiring) | Off unless given (only a repository can say it wants its publish checks, root tooling and hooks enforced); the package.json sections need the optional peer `@eslint/json` | `exadevConfig({ toolingWiring })` / `toolingWiringConfig(options)` |
| [Turbo environment variable checking](#environment-variables-read-in-source) | Auto-detected: on if `eslint-plugin-turbo` is installed | `exadevConfig({ turboEnv })` |
| [Required Markdown headings](#required-markdown-headings) | Off unless given (only a repository can say which documents need which headings); needs the optional peer `@eslint/markdown` | `exadevConfig({ markdownHeadings })` / `markdownHeadingsConfig(options)` |

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
2. **For React specifically, the file must actually be `.jsx`/`.tsx`.** The React/hooks/a11y rule block is scoped to `files: ['**/*.jsx', '**/*.tsx']`, so even if `eslint-plugin-react` is resolvable only incidentally (e.g. hoisted as a transitive dependency of something unrelated in a monorepo, with zero real JSX anywhere in the linted project), its rules never match a file that isn't JSX. `@next/eslint-plugin-next`'s own block carries no such glob: its own presence is already an unambiguous signal (nothing installs it except a real Next.js project). The [server component boundary](#server-component-boundary) rules added beside it are scoped to the same JSX files.

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

#### Server component boundary

Props a server component passes to a client component must be serialisable, and two easy mistakes surface only at runtime in a production build. The Next.js preset (auto-detected, `exadevConfig({ nextjs: true })` or `plugin.configs.nextjs`) therefore adds a block for `.jsx` and `.tsx` files enabling two rules. Both apply only to a file without a top-level `"use client"` directive, so a client file is never reported; neither needs type information.

- **`exadev/no-non-serialisable-server-prop`** reports a JSX attribute named in `names` (default `['component']`) whose value is not data. Data is a literal (not a regular expression), a template literal, object or array of data, `undefined`, a unary expression (`-x`, `!x`, `typeof x`, which always yields a primitive), or a JSX element, which React serialises. An identifier, member access, call, function, class, spread, or object member holding a function is reported, since it may be a function or component reference. Passing `component={Icon}` to a client component fails; passing a string key or `component={<Icon />}` does not.
- **`exadev/no-external-member-jsx-tag`** reports every member tag (`<Lib.Icon>`, `<Lib.Icons.Home>`) whose root identifier is bound by an import from a non-relative source, whether a namespace, default, named or `import x = require()` binding. Whether a library attaches statics after export cannot be worked out from one file, so the rule is deliberately over-broad. A relative import is the project's own code and is not reported; an alias to project code such as `@/ui` looks like a package, so list it in `allowSources`.

Both are approximations. They report a file without the directive that is only ever imported by client code (add the directive), a server-safe `<Ctx.Provider>` from an imported context (list it in `allowTags`), and a component passed to an element that is itself a server component (list the element in `allowElements`). Options, by rule:

| Rule | Option | Meaning |
| --- | --- | --- |
| `no-non-serialisable-server-prop` | `names` | Prop names whose value must be data. Replaces the default `['component']`. |
| `no-non-serialisable-server-prop` | `allowElements` | JSX element names as written (`Link`, `Lib.Icon`) whose props are not checked. |
| `no-external-member-jsx-tag` | `allowSources` | Import specifiers, in the [specifier pattern](#specifier-patterns) dialect (each also selects everything beneath it), whose member tags are not reported. |
| `no-external-member-jsx-tag` | `allowTags` | Tags as written (`Ctx.Provider`) that are not reported. |

The preset enables both at `error` with the defaults. To tune them, add a later block that sets the rule again for the same files:

```ts
{
  files: ['**/*.tsx'],
  rules: {
    'exadev/no-non-serialisable-server-prop': ['error', { names: ['component', 'icon'], allowElements: ['Link'] }],
    'exadev/no-external-member-jsx-tag': ['error', { allowSources: ['@/ui'], allowTags: ['ThemeCtx.Provider'] }],
  },
}
```

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
| `no-control-flow` | | **Bans `if`/`switch`/loops/the ternary operator outright.** Not part of `recommended` or `barrel` — ordinary code legitimately needs control flow, so this is opt-in, wired via a consumer's own `files` glob for the specific packages that want it (a composition-root package selecting an adapter/strategy by a validated key, say): a lookup table replaces a branch, a declarative array method (`map`/`filter`/`some`/`every`/...) replaces a loop. Requires no type information. See also [Pure modules](#pure-modules), which can add it to a block, and [a complexity ceiling](#a-complexity-ceiling-for-logic-free-modules) for a softer limit. |
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
| `no-uphill-dependency` | | **Enforces a configured workspace's rank, rank-skip, slice and group-isolation boundaries** on every `package.json`'s declared dependencies, plus selector-based dependency constraints (`dependencyConstraints`), with documented per-edge exceptions (`allow`) and exempt target groups (`exemptTargetGroups`). See [Workspace architecture](#workspace-architecture). Opt-in via `exadevConfig({ workspaceArchitecture })` or the standalone `workspaceArchitectureConfig()`, not part of `recommended`/`barrel`. A JSON-language rule, needs no type information. |
| `no-dependency-cycle` | | **Disallows a workspace dependency that can reach back to the package declaring it.** A same-rank or same-slice dependency passes `no-uphill-dependency` while still forming a cycle, which this rule catches instead. See [Workspace architecture](#workspace-architecture). |
| `package-name-mirrors-path` | | **Requires a workspace package's declared name to match the name its own path derives**, under the configured naming scope and separator. A package that declares no name at all is reported too (it plainly cannot mirror its path when it names nothing). Itself opt-in within workspace architecture: a no-op unless the shared `naming` option is given. See [Workspace architecture](#workspace-architecture). |
| `package-has-files` | | **Requires configured files to exist inside every matching workspace package.** ESLint cannot report a file that does not exist, so the diagnostic is anchored on the package's own `package.json`, listing the missing paths. Entries may be globs. Opt-in: a no-op unless the shared `requiredFiles` option is given. See [Required files](#required-files). |
| `dev-dependency-only` | | **A package may only appear under `devDependencies` of other workspace packages.** Reports a restricted package listed under `dependencies`, `peerDependencies` or `optionalDependencies`, at the offending entry. Opt-in: a no-op unless the shared `devOnly` option is given. See [Dev-only packages](#dev-only-packages). |
| `required-scripts` | | **Requires configured `scripts` in every matching workspace package,** optionally with an exact command or required and forbidden flags. Opt-in: a no-op unless the shared `requiredScripts` option is given. See [Required scripts](#required-scripts). |
| `package-requirements` | | **Requires configured fields, files and scripts in each `package.json` a condition selects:** private or publishable, the repository root, a name pattern, a declared dependency. The graph-free counterpart of `package-has-files` and `required-scripts`, so it applies to a single-package repository and to the root manifest. Wired by `toolingWiringConfig`. See [Tooling wiring](#tooling-wiring). |
| `turbo-script-convention` | | **Public scripts delegate to turbo.** In the root package every prefixed script (`_lint`) needs a public counterpart (`lint`) that is `turbo run _lint`, with only flags after it; in any other package a bare script named after a task the root orchestrates is reported. See [Turbo](#turbo). Opt-in via `exadevConfig({ turbo })` or `turboConfig()`. A JSON-language rule. |
| `turbo-script-has-task` | | **Every prefixed script is configured as a turbo task,** since turbo runs a script only when a task names it. See [Turbo](#turbo). |
| `turbo-task-has-script` | | **Every task in the root `turbo.json` is implemented and reachable.** A task no package implements is skipped silently by turbo; a `//#` task or an aggregate nothing depends on or invokes never runs. See [Turbo](#turbo). |
| `turbo-task-outputs` | | **Cached tasks declare `outputs`, persistent tasks disable caching.** A task with no `outputs` key caches its log only. See [Turbo](#turbo). |
| `turbo-task-config-inputs` | | **A cached task's key includes the config files of the tools its script runs** (`eslint`, `tsc`, `vitest` by default). See [Cached tasks include their tool configs](#cached-tasks-include-their-tool-configs). |
| `turbo-task-graph` | | **Tasks list the `dependsOn` edges the `taskGraph` option requires,** including in `package#task` entries and package `turbo.json` overrides. A no-op without the option. See [Required dependsOn edges](#required-dependson-edges). |
| `turbo-json-hygiene` | | **`turbo.json` declares a known `$schema`,** and optionally `CI` in `globalPassThroughEnv` and an aggregate pre-push task. See [turbo.json hygiene](#turbojson-hygiene). |
| `no-fix-in-cached-task-script` | | **A script that runs as a cached turbo task passes no fixing flag** (`--fix`, `--write` by default). See [Turbo](#check-and-fix-are-separate-tasks). |
| `turbo-boundaries-config` | | **The root `turbo.json` opts in to `turbo boundaries`** with a `boundaries` key. See [Turbo boundaries](#turbo-boundaries). |
| `turbo-package-tags` | | **Every workspace package has a `turbo.json` that extends the root and carries tags,** including its group name when groups are configured. See [Turbo boundaries](#turbo-boundaries). |
| `turbo-boundaries-script` | | **The root package has a `boundaries` script equal to `turbo boundaries`,** invoked from the configured aggregate script. See [Turbo boundaries](#turbo-boundaries). |
| `no-boundaries-ignore` | | **Bans the `@boundaries-ignore` comment** outside files listed with a reason. A JavaScript and TypeScript rule. See [Turbo boundaries](#turbo-boundaries). |
| `test-file-kind` | | **A test file's name must declare its own test kind.** A filename suffix immediately before `.test`/`.spec` (e.g. `foo.unit.test.ts`), one of a configurable `{ kinds }` set (default: `unit`, `integration`, `e2e`). A naming-discipline rule, not a content classifier — it checks only the filename, never what the file actually tests. Self-scoped to real test/spec files (`context.filename`), so it never misfires when applied unscoped and never relies on a consumer's own `files` config. Requires no type information. |
| `required-exports` | | **Files matching a glob must export the configured names.** `{ files, exports }` entries; presence only, no shape check. See [File-level rules](#file-level-rules). |
| `required-imports` | | **Files matching a glob must import, and optionally call, a module matching a specifier pattern.** See [File-level rules](#file-level-rules). |
| `import-policy` | | **Glob-scoped import policy:** deny lists, specifiers confined to named files, and exact exception edges, with a message that names the requirement. Wired by `importPolicyConfig`. See [Import policy](#import-policy). |
| `filename-pattern` | | **Filename conventions by glob:** a name regex, a required sibling file, and a naming scheme required once a file passes a line count. See [Filename patterns](#filename-patterns). |
| `pure-module` | | **Bans I/O, ambient state and `async` in the files it is wired onto:** imports of Node I/O modules, I/O and scheduling globals, argument-less `Date`, `Date.now`, `Math.random`, and `async`/`await`. Wired by `pureModulesConfig`. See [Pure modules](#pure-modules). |
| `scoped-first-parameter` | | **Every method of the configured repository-like interfaces takes a scope parameter first.** Checks the signature only, not that the scope is used or that tenants are isolated. Requires type information. Opt-in: needs its `interfaces` and `parameter` options. See [Scoped first parameter](#scoped-first-parameter). |
| `require-compiler-options` | | **The effective compiler options of the tsconfig ESLint type-checks against must have the configured values.** `extends` is resolved the way `tsc` resolves it. Reports once per tsconfig and run, and names the tsconfig it resolved. Requires type information. Opt-in. See [Compiler options](#compiler-options). |
| `vitest-config` | | **A Vitest config must not stop the run from failing:** `passWithNoTests: true`, `allowOnly: true`, a bare `node_modules` exclude, and coverage thresholds under a key Vitest reads as a file glob. Self-scopes to `vitest*.config.*` and `vitest.workspace.*`. Opt-in. See [Tool config files](#tool-config-files). |
| `vitest-coverage-config` | | **The shared base Vitest config must spell out a complete `coverage` block:** `provider`, `include` and all four `thresholds` keys. A no-op unless `files` names the base config files. See [Tool config files](#tool-config-files). |
| `stryker-break-threshold` | | **A Stryker config must set `thresholds.break` to a number,** optionally no lower than a minimum and no lower than the value in a shared base config. Self-scopes to `stryker*.config.*`. See [Tool config files](#tool-config-files). |
| `stryker-thresholds-order` | | **Stryker `thresholds` must satisfy `break <= low <= high`,** using Stryker's defaults for a key the config leaves out. See [Tool config files](#tool-config-files). |
| `playwright-config` | | **A Playwright config must set `forbidOnly`** to `true` or a non-literal expression such as `!!process.env.CI`, with optional checks that `fullyParallel` and `workers` are set. Self-scopes to `playwright*.config.*`. See [Tool config files](#tool-config-files). |
| `injected-test-hygiene` | | **A conformance kit's injected test functions get the same hygiene as imported ones:** no `.only`, no `.skip`, and an assertion in every test body, for the `describe` and `it` a kit receives as parameters, which `@vitest/eslint-plugin` skips. Wired by `testHygieneConfig`. See [Guard and conformance test hygiene](#guard-and-conformance-test-hygiene). |
| `non-vacuous-guard` | | **A guard test must show it can fail:** an unconditional lower bound on what it discovered, and its pattern checked against an input it must catch and one it must not. Wired by `testHygieneConfig`. See [Guard and conformance test hygiene](#guard-and-conformance-test-hygiene). |
| `no-multiline-template-literal` | ✓ | **An untagged template literal whose value spans several lines should be an array of lines joined with `\n`.** Autofixes only when the rewrite provably yields the same string. See [Multi-line template literals](#multi-line-template-literals). |
| `markdown-required-heading` | | **A Markdown document must contain each configured heading:** a `{ depth, text }` per required heading, matched on the text as it renders. A Markdown-language rule (`@eslint/markdown`). Wired by `markdownHeadingsConfig`. See [Required Markdown headings](#required-markdown-headings). |
| `no-defensive-fallback` | | **An empty-literal fallback hides a value that should have been modelled as absent.** Reports `value ?? []`, `value || ''` and the logical-assignment forms for an empty array, object or string, `0`, `false` or `null`, and a `catch` clause or `.catch()` handler that discards the error and returns nothing or a fixed value. Opt-in, not part of `recommended` or the default export. Needs no type information. See [Defensive fallbacks](#defensive-fallbacks). |
| `timeout-aborts-request` | | **A `Promise.race` timeout must abort the request it raced against,** not only settle the race: the timer callback calls `.abort()` on an `AbortController` created in the same function, the timer id is cleared in a `finally`, and a `catch` returns early on `controller.signal.aborted`. Opt-in, needs no type information. See [Timeout races](#timeout-races). |
| `no-non-serialisable-server-prop` | | **A configured prop (default `component`) of a JSX element in a file without `"use client"` must be serialisable data.** A function or component reference cannot cross from a server component to a client component. Enabled by the Next.js preset. See [Server component boundary](#server-component-boundary). |
| `no-external-member-jsx-tag` | | **A member tag (`<Lib.Icon>`) rooted at an import from a package, in a file without `"use client"`, is reported.** Statics a library attaches after export may not survive the server component boundary. Enabled by the Next.js preset. See [Server component boundary](#server-component-boundary). |

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

## File-level rules

`required-exports`, `required-imports`, `import-policy` and `filename-pattern` check one file against a convention that depends on its path. Each self-scopes through `context.filename`, so it is a no-op on every other file and can sit in a shared config without a `files` array of its own. None needs type information, and none is in `recommended`, since each takes options only a project can supply.

`files` in these rules is a glob, or a list of globs, in the dialect used for every file glob in this package (braces, `*`, `?`, `[...]`, `**` as whole segments, a leading `!` to exclude, wildcards never matching dot-prefixed names), matched against the path relative to ESLint's working directory. A glob without a `/` names a file at any depth, so `fake.ts` and `**/fake.ts` are the same.

### Required exports

```ts
'exadev/required-exports': ['error', [
  { files: '**/contract/src/errors.ts', exports: ['ContractError', 'contractErrorSchema'] },
  { files: 'fake.ts', exports: ['createFake'] },
]]
```

A file matching `files` must export every name in `exports`. Counted: `export const`, `let`, `var` (destructuring included), functions, classes, enums, interfaces, type aliases and namespaces, `export { a, b as c }` with or without `from`, `export type { ... }`, `export * as ns from`, and `export default` as the name `default`. `export = x` (a CommonJS-style TypeScript module) counts nothing, since it exports the value rather than a name. A bare `export * from './x'` counts nothing, because the names it forwards live in a file this rule does not read; list the names in an explicit re-export if a barrel must satisfy the rule. When several entries match one file, the file is reported once, listing every missing name.

### Required imports

```ts
'exadev/required-imports': ['error', [
  {
    files: '**/adapters/*/src/**/*.test.ts',
    from: ['**/contract/src/*conformance*', '@acme/contract/conformance'],
    call: true,
  },
]]
```

A file matching `files` must import at least one binding from a module whose specifier matches `from` (a pattern or a list). With `call: true` it must also call a binding it imported from there, which a bare import that is never used does not satisfy. A call counts wherever it sits (module top level or inside a callback), including through a namespace or default import (`kit.run(...)`), a non-null assertion (`kit!()`), a construction (`new Kit()`) and a tagged template (``kit`x` ``); passing the binding as an argument is not a call. Side-effect imports and type-only imports (`import type`, or every specifier inline `type`) bind no runtime value and do not count.

Resolution is by specifier pattern, not through the module graph, so no type information is needed and the package need not be installed. A `from` pattern follows the rules in [Specifier patterns](#specifier-patterns): a relative specifier such as `../../contract/src/run-conformance` is matched by the path it resolves to (the reference implementation's form), and a package specifier such as `@acme/contract/conformance/pg` is matched as written (the adapter's form). List both forms in `from` to cover a kit imported either way. The rule proves the kit is wired in, not that the kit is any good, and a skipped test still satisfies it.

Each unsatisfied entry reports once on the program node.

### Specifier patterns

`required-imports` (`from`) and [`import-policy`](#import-policy) (`specifiers`) match module specifiers the same way:

- Patterns use the file-glob dialect, and each also selects everything beneath it, so `fs` selects `fs/promises` and `@scope/pkg` selects `@scope/pkg/sub`.
- A leading `node:` is ignored on both sides, so `fs` and `node:fs` are one builtin.
- A relative specifier is resolved against the linted file's directory to a path relative to the working directory, then matched only by patterns containing a `/`. A bare pattern such as `fs` therefore never selects `./fs`. A relative specifier that leaves the working directory matches nothing.
- Nothing is resolved through `node_modules` or the TypeScript path map, so an alias such as `@/db` is matched as the string it is.

## Import policy

`importPolicyConfig` turns a list of policies into a flat-config block for `exadev/import-policy`, or pass the same list to `exadevConfig({ importPolicies })`.

```ts
import { defineConfig } from 'eslint/config';
import { exadevConfig, importPolicyConfig } from '@exadev/eslint-config';

export default defineConfig(
  ...exadevConfig(),
  ...importPolicyConfig([
    {
      files: ['src/worker/**'],
      deny: [{ specifiers: ['fs', 'path', 'child_process'], message: 'worker code runs where Node builtins do not exist' }],
    },
    {
      files: ['src/**'],
      ignores: ['src/**/*.test.ts'],
      confine: [{ specifiers: ['@anthropic-ai/sdk'], onlyIn: ['src/agent/adapter.ts'], allowTypeImports: true }],
    },
    {
      files: ['src/routes/**'],
      deny: [{ specifiers: ['src/db'], message: 'routes reach data through the service layer' }],
      exceptEdges: [{ file: 'src/routes/legacy.ts', specifier: '../db/client', reason: 'predates the service layer' }],
    },
  ]),
);
```

A policy selects files with `files` and `ignores` and holds them to:

- `deny`: `specifiers` the files may not import. `message` is required and should name the requirement (why, and what to do instead), not the rule. `importNames` limits the ban to those imported names (`default` for a default import); a namespace import, a dynamic import, `require` and `export *` take every name, so they are still reported. `allowTypeImports` leaves erased imports alone.
- `confine`: `specifiers` the files may import only in the files `onlyIn` selects, so the inverse case needs no hand-built complement. `allowTypeImports` and an optional `message` work as for `deny`; the default message lists `onlyIn`.
- `exceptEdges`: one exact `file` and `specifier` pair with a required `reason`. Neither may contain a glob character, so an exception cannot widen. The specifier is compared exactly as written in that file, and `file` is normalised, so `./src/a.ts` and `src/a.ts` name the same file. Creating the config throws for an exception that could never apply (a file the policy does not select, or a specifier that no `deny` entry selects and no `confine` entry forbids in that file, such as one inside the confine's `onlyIn`), so a stale exception fails instead of lingering.

Specifiers follow [Specifier patterns](#specifier-patterns). The rule is syntactic and covers `import`, `import type`, `export ... from`, `export * from`, `import x = require()`, dynamic `import()` with a static string, `require()` with a static string that is not shadowed, and `import('x')` type queries. A specifier built at runtime cannot be judged and is skipped.

ESLint's core `no-restricted-imports` covers only the static forms (`import`, `export ... from`, `export * from` and `import x = require()`); it has no check for dynamic `import()`, `require()` or `import('x')` type queries, and `no-restricted-modules` is deprecated since ESLint 7. A preset compiled to `no-restricted-imports` blocks would also inherit flat config's rule-level override: when two policies select the same file, the later block's option list replaces the earlier one's, and an exception edge would have to restate every other restriction of the file. So the preset compiles to one block for a purpose-built rule instead, where every policy that selects a file applies to it. Files outside a policy's `files` are untouched.

## Pure modules

A functional core should not touch I/O, read the clock, roll dice or wait on anything. `pureModulesConfig` (or `exadevConfig({ pureModules })`) wires `exadev/pure-module` onto the files that must stay pure:

```ts
import { defineConfig } from 'eslint/config';
import { exadevConfig, pureModulesConfig } from '@exadev/eslint-config';

export default defineConfig(
  ...exadevConfig(),
  ...pureModulesConfig({
    files: ['src/core/**', '!src/core/**/*.gen.ts'],
    allowImports: ['node:stream'],
    noControlFlow: true,
  }),
);
```

The same object goes to `exadevConfig({ pureModules: { files: ['src/core/**'] } })`. `files` follows the [file glob dialect](#file-level-rules) used across this package, with a leading `!` excluding. Like any flat-config `files` list, a glob that ends in `/**` or `/*` selects files only alongside a block that names their extension, which `exadevConfig()` provides for JavaScript and TypeScript.

In the selected files the rule reports:

- an import of a Node I/O module (`child_process`, `fs`, `http`, `net`, `os`, `process`, `stream`, `worker_threads` and their kin, the full list being `BANNED_MODULES` in [`src/rules/pure-module-options.ts`](src/rules/pure-module-options.ts)), through any syntax `import-policy` recognises. Subpaths and the `node:` form are covered by the module name. A type-only import is left alone, since it is erased before the module runs;
- a read of an I/O, scheduling or environment global (`fetch`, `process`, `console`, `setTimeout`, `WebSocket`, `Worker`, `localStorage`, `document` and the rest of `BANNED_GLOBALS`), including through `globalThis`;
- `Date.now`, `Math.random`, `performance.now`, `crypto.randomUUID`, `crypto.getRandomValues`, and `Date()` or `new Date()` with no argument. `new Date(value)` is pure and passes. These are reported when reached through `globalThis` too (`globalThis.Date.now()`). Node's `crypto` module is not banned as a whole, since hashing is pure, but its sources of randomness and key generation (`randomUUID`, `randomBytes`, `randomInt`, `randomFillSync`, the `generate*` functions, `getRandomValues`, `webcrypto`; the full list is `NODE_CRYPTO_NONDETERMINISTIC` in the options file) are reported as named imports from it and as members of a default or namespace import of it;
- an `async` function or method, `await`, and `for await`.

`allowImports` lists specifiers, in the [specifier pattern](#specifier-patterns) dialect, exempted from the module ban. Every entry must select a banned module, so an entry that could never apply fails when the config is created. `noControlFlow: true` adds `exadev/no-control-flow` to the same block, for a module that should hold lookup tables and nothing else.

It is one rule under one name, not a `no-restricted-imports`, `no-restricted-globals` and `no-restricted-syntax` recipe, because flat config replaces a rule's options when a later block sets the same rule for the same files. A consumer's own `no-restricted-syntax` block over the pure files would silently drop a recipe's entries; it cannot drop these. The bans are syntactic. They keep a module from reaching for ambient state directly, and they do not follow an alias (`const { random } = Math`) or prove the module deterministic. A repository needing a different list writes its own `no-restricted-*` blocks.

### A complexity ceiling for logic-free modules

`exadev/no-control-flow` is all or nothing: a module either may branch or may not. For view adapters and thin entry points that should hold almost no logic, a scoped `complexity` ceiling is the softer statement, and needs no new rule. Set it in a block for those globs, placed after the shared config:

```ts
import { defineConfig } from 'eslint/config';
import { exadevConfig } from '@exadev/eslint-config';

export default defineConfig(
  ...exadevConfig(),
  {
    files: ['src/views/**/*.ts', 'src/main.ts'],
    rules: { complexity: ['error', { max: 2 }] },
  },
);
```

`complexity` counts each function on its own, starting at 1 and adding one per branch, so `max: 2` allows a single `if`, ternary or `&&` per function. Flat config keeps the last value a block sets for a rule, so a broader `complexity` setting that follows this block over the same files replaces the ceiling; keep the scoped block last.

## Guard and conformance test hygiene

Source-scanning guard tests and conformance suites are worth having only if they cannot silently stop running. A `.skip`, a stray `.only` or a test with no assertion leaves CI green while checking nothing, and so does a scan that discovers no files. `testHygieneConfig` (or `exadevConfig({ testHygiene })`) holds both kinds of file to that:

```ts
import { defineConfig } from 'eslint/config';
import { exadevConfig } from '@exadev/eslint-config';

export default defineConfig(
  ...exadevConfig({
    testHygiene: {
      guardFiles: ['**/*.guard.test.ts'],
      conformanceFiles: ['**/*conformance*.test.ts', 'packages/*/src/conformance.ts'],
      assertFunctionNames: ['check*'],
      skippableFiles: ['**/live.conformance.test.ts'],
    },
  }),
);
```

Every field is optional and `{}` enables the defaults. The preset needs `@vitest/eslint-plugin`, an optional peer (`pnpm add -D @vitest/eslint-plugin`). Giving the option without it throws with the install command, as does an installed version that lacks `expect-expect`, `no-disabled-tests` or `no-focused-tests`. The plugin is registered under `vitest`, the namespace its own documentation uses.

| Field | Meaning |
| --- | --- |
| `guardFiles` | Guard test globs. Default `**/*.guard.test.ts`. These get the three vitest rules below, `exadev/injected-test-hygiene` and `exadev/non-vacuous-guard`. |
| `conformanceFiles` | Conformance suite globs. Default `**/*conformance*.test.ts`. These get the three vitest rules and `exadev/injected-test-hygiene`. A kit that is not named `*.test.ts` is listed by its own name (`conformance.ts`). |
| `assertFunctionNames` | Helper names counted as assertions, besides `expect` and `assert`, by `expect-expect` and by `exadev/injected-test-hygiene`. A kit that asserts by throwing from local helpers never calls `expect`. `*` matches any run of characters (`check*`), and a name also matches its members (`assert` matches `assert.equal`). |
| `skippableFiles` | Globs of files that are deliberately skipped, exempted from `no-disabled-tests` and from the `.skip` report of `exadev/injected-test-hygiene`, and nothing else. Flat-config globs, so a bare name needs `**/`. |

A leading `!` in `guardFiles` or `conformanceFiles` excludes, for that list only. All three vitest rules are set to `error`: `no-focused-tests`, `expect-expect` and `no-disabled-tests`. `describe.skipIf`, `describe.runIf` and `it.todo` are not reported by `no-disabled-tests`, so an opt-in project is written as `describe.skipIf(!process.env['LIVE'])` and needs no exemption; `skippableFiles` is for a file that is skipped unconditionally. Only vitest is supported: eslint-plugin-jest has rules of the same names, which a jest repository wires by hand, and `non-vacuous-guard` reads `expect` chains that both frameworks share.

A conformance kit usually takes its test functions as parameters (`runConformance({ describe, it })`, or `run(t)` calling `t.it(...)`) so that each adapter can run it under its own runner. `@vitest/eslint-plugin` resolves such a parameter as a local binding and reports nothing inside the function, so `expect-expect`, `no-disabled-tests` and `no-focused-tests` alone would pass a kit full of `.skip`, `.only` and assertion-free tests. `exadev/injected-test-hygiene` covers that shape, in the same files and with the same `assertFunctionNames` and `skippableFiles`: it reports `.only`, `.skip` (`.skipIf` is not reported) and a test body with no assertion, for a parameter of the enclosing function named `describe`, `suite`, `it` or `test` (directly, destructured, or renamed in the destructuring) and for those names read off any parameter (`t.it`). It is syntactic: a helper the kit calls counts as an assertion only when listed in `assertFunctionNames`, and an imported or global `it` is left to the vitest rules. A kit that is not named `*.test.ts` is listed in `conformanceFiles` by its own name so that both sets of rules reach it.

`guard` and `conformance` are test kinds to [`test-file-kind`](#rules), which by default accepts `unit`, `integration` and `e2e` only, so a repository using the default globs adds them:

```ts
{ rules: { 'exadev/test-file-kind': ['error', { kinds: ['unit', 'integration', 'e2e', 'guard', 'conformance'] }] } }
```

### Non-vacuous guards

The vitest rules cannot catch the commonest way a guard goes quiet: a scan that discovers no files, or a pattern that matches nothing, passes every assertion with no skip, no focus and no assertion-free test. `exadev/non-vacuous-guard` requires each guard file to contain all three of:

- a lower bound on what it discovered: `toBeGreaterThan(n)` with `n` at least 0, `toBeGreaterThanOrEqual(n)` with `n` at least 1, `toHaveLength(n)` with `n` at least 1, or `not.toHaveLength(0)`, `not.toBe(0)`, `not.toEqual([])`. A bound written as a name (`MINIMUM_FILES`) is accepted, since its value cannot be read from the syntax;
- a check that its pattern flags an input it must: `toMatch`, or on a call subject `toBe(true)`, `toBeTruthy()`, `not.toBeNull()`, `toEqual([violation])` and the like, as in `expect(pattern.test(violation)).toBe(true)`. `toBeDefined()` and `toBeUndefined()` are not recognised, since a pattern match returns `null` and on a read they only state that a file exists. An assertion counts once: `not.toEqual([])` is the lower bound above and never also a check of the pattern;
- a check that it leaves alone an input it must not: `not.toMatch`, or on a call subject `toBe(false)`, `toBeFalsy()`, `toBeNull()`, `toEqual([])` and the like.

Only assertions that run unconditionally count. One inside a loop, a `forEach`/`map`/`filter` callback, the mapper of `Array.from`, the callback of an `it.each`, `describe.each` or `.for` table that may be empty (a table literal with a row always runs), a branch, a `switch` case or a `catch` never runs when what it iterates is empty, so `for (const file of files) expect(read(file)).not.toMatch(pattern)` is the scan itself and satisfies none of the three. A helper function that asserts counts, since whether it is called is not visible.

The rule is syntactic. It shows the guard file states each of the three, not that the pattern checked is the one the scan uses or that the discovered count is the scan's; a table-driven check whose expected values are variables (`toBe(expected)`) is not recognised, so write the catch and the pass as separate assertions.

## Scoped first parameter

In a multi-tenant codebase, every method of a repository or store interface should take the tenant scope first, so that a call cannot be written without one. `exadev/scoped-first-parameter` reports the methods that do not:

```ts
// eslint.config.ts
export default defineConfig(
  ...exadevConfig(),
  {
    files: ['src/**/*.ts'],
    plugins: { exadev: plugin },
    rules: {
      'exadev/scoped-first-parameter': ['error', { interfaces: 'Repository$|Store$', parameter: { name: 'scope', type: 'TenantScope' } }],
    },
  },
);
```

```ts
interface OrderRepository {
  find(scope: TenantScope, id: OrderId): Promise<Order | undefined>; // ok
  list(): Promise<Order[]>; // reported: takes no parameters
  findAll(ids: OrderId[]): Promise<Order[]>; // reported: first parameter is OrderId[], not TenantScope
}
```

`interfaces` is a regular expression tested against the name of each interface and type alias; only the members of a matching declaration are checked. `parameter.type` is the declared name of the type the first parameter must resolve to, and the optional `parameter.name` fixes the parameter's name. The annotation is followed through the checker to the declarations it names: an import rename, `import Scope = Auth.TenantScope` and a type alias of a type alias (`type Scope = TenantScope`) all lead back to `TenantScope`, and a scope declared as an alias of a generic instantiation (`type TenantScope = Readonly<{ id: string }>`) or of a primitive (`type TenantId = string`) is named by the alias that declares it. A type parameter constrained to the scope (`<S extends TenantScope>(scope: S)`) stands for the scope. A structurally identical type of another name does not count, and neither does a union that merely includes the scope, nor the scope wrapped in another type (`Readonly<TenantScope>`; declare the scope itself as the readonly alias instead). Only the members a matching interface or type alias declares are checked, not those it inherits through `extends` from a base that does not match `interfaces`. Method signatures and function-typed properties are both checked; an optional or rest first parameter is reported, since a call could then leave the scope out. TypeScript's `this` pseudo-parameter is skipped.

This checks signatures, not isolation. A method can accept a `TenantScope` and ignore it, or read across tenants anyway, so a clean run shows only that no call can be written without a scope. Showing that tenants are actually isolated takes conformance tests run against each implementation, which [`required-imports`](#required-imports) can require every adapter to wire in.

## Filename patterns

```ts
'exadev/filename-pattern': ['error', [
  // A name convention: stories are PascalCase.stories.tsx.
  { files: '**/*.stories.tsx', pattern: '[A-Z][A-Za-z0-9]*\\.stories\\.tsx' },
  // A relationship between two files: a component needs its stylesheet beside it.
  { files: ['src/components/*.tsx', '!**/*.stories.tsx'], sibling: ['{name}.module.css', '{name}.module.scss'] },
  // A relationship between size and name: a file over 400 lines must be a numbered part.
  { files: 'src/**/*.ts', overLines: 400, pattern: '.+\\.part-\\d{2}\\.ts' },
]]
```

An entry applies to files matching `files` (and, with `overLines`, to those with more lines than that) and needs a `pattern`, a `sibling`, or both:

- `pattern` is a regular expression source that the whole file name (last path segment, extension included) must match. The source must be a valid regular expression on its own, so an unbalanced one such as `z)|(q` is rejected instead of escaping the anchoring.
- `sibling` is a path or list of paths relative to the linted file's directory; at least one must exist. `{name}` stands for the file's name without its final extension (`Button` for `Button.tsx`), and a path may enter a subdirectory (`styles/{name}.css`). Templates must be distinct, and a brace group other than `{name}` is rejected as a misspelling. To exempt other files, exclude them in `files`.
- `overLines` counts physical lines, ignoring the newline that ends the file. It is a naming requirement, so it does not replace ESLint's `max-lines`, which still reports the size; this rule requires that the parts an over-long file is split into follow the scheme. It does not check that the parts exist as a sequence.

Why not a dependency: [`eslint-plugin-check-file`](https://github.com/dukeluo/eslint-plugin-check-file) (`filename-naming-convention`, `folder-match-with-fex`, `filename-blocklist`, `folder-naming-convention`, `no-index`) and [`unicorn/filename-case`](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/filename-case.md) cover case styles and per-glob name patterns, and check-file also folder names and blocked names. Neither can express that another file must exist beside the linted one, or that a name depends on the file's line count, which are the two cases this rule exists for. The name-pattern case is the same as what check-file offers, so a project that already uses that plugin for case styles and folder layout can keep it alongside this rule.

## Multi-line template literals

`exadev/no-multiline-template-literal` reports an untagged template literal whose value contains a line feed, whether from a line break in the source or an `\n` escape, and rewrites it to an array of lines:

```ts
const prompt = `You are a reviewer.
Reply in ${language}.`;

// becomes
const prompt = [
  'You are a reviewer.',
  `Reply in ${language}.`
].join('\n');
```

A line with no substitution becomes a single-quoted string and a line with one stays a template literal on a single line. Substitutions are copied verbatim from the source, comments included, so their evaluation order and text do not change. The fix works on the template's raw source rather than its value: every escape carries over unchanged, since an escape means the same in a single-quoted string as in a template, and only an unescaped `'`, an escaped backtick and an escaped `$` are re-spelled for the literal that holds them. The array is indented one level deeper than the line the template starts on, using that line's own indentation style. Run the project's quote and trailing-comma rules afterwards if it prefers other styles.

The rule reports without offering a fix when it cannot show that the pieces join back to exactly the same value: a line continuation (a backslash before a line break), a carriage return or Unicode line separator in the source, a `\x` or `\u` escape that spells a line feed, or an octal-looking escape. A final check compares the line breaks it found with the line feeds in the cooked value, so a case the scanner mis-reads is refused rather than rewritten.

It also reports without a fix when the template sits where TypeScript needs its literal type, which the joined string (a plain `string`) does not have: under `as const`, `as`, `satisfies` or a type assertion (also through an enclosing array or object), as a string enum member's initialiser, or as the initialiser of a declaration with a type annotation. Without type information it cannot see the contextual type of a call argument or a return value, so those are still fixed.

A tagged template is never reported. The tag receives the literal's pieces, so joining them would change what it is called with, and multi-line `sql`, `css` or `markdown` templates are the point of the syntax. There is therefore no option listing tags to ignore. `allowFiles` takes globs in the [file glob dialect](#file-level-rules) for files whose multi-line strings are intended (fixtures, prompts):

```ts
'exadev/no-multiline-template-literal': ['error', { allowFiles: ['src/prompts/**', 'test/fixtures/**'] }]
```

The rule needs no type information and is not in `recommended`.

## Required Markdown headings

A documentation convention such as "every skill file has a `## Usage` heading" is otherwise enforced by a remark pipeline or by nothing. `@eslint/markdown` lets an ESLint rule visit the same heading nodes, so the check runs in the same lint as everything else. `markdownHeadingsConfig` (or `exadevConfig({ markdownHeadings })`) wires `exadev/markdown-required-heading` onto the Markdown files you name:

```ts
import { defineConfig } from 'eslint/config';
import { exadevConfig, markdownHeadingsConfig } from '@exadev/eslint-config';

export default defineConfig(
  ...exadevConfig(),
  ...markdownHeadingsConfig({
    files: ['skills/**/SKILL.md'],
    headings: [
      { depth: 2, text: 'Usage' },
      { depth: 2, text: 'Gotchas' },
    ],
  }),
);
```

The preset needs `@eslint/markdown`, an optional peer (`pnpm add -D @eslint/markdown`), and throws with the install command when it cannot be resolved. It registers the plugin under `markdown` and sets the language to `markdown/gfm`. `files` follows the [file glob dialect](#file-level-rules) with a leading `!` excluding. Whether ESLint lints `**/*.md` at all is a repository-wide decision the preset cannot make: a `.gitignore`-derived or other `ignores` entry that hides those files still hides them.

Each entry is a `depth` from 1 to 6 (`#` to `######`) and the `text` of the heading. A document is missing an entry unless some heading of that depth has that text once the heading is flattened from its inline children and read the way a renderer shows it: emphasis, strong, links and code spans contribute their text, an image its alternative text, a hard break a space, and raw inline HTML nothing. The text is trimmed and each run of whitespace collapses to one space, on both sides, so a two-line Setext heading equals its one-line spelling. Matching is otherwise exact, case included. A heading anywhere in the document counts, inside a blockquote or a list as well. Each missing entry is reported once, at the top of the file, after the whole document has been read.

The entries are a list rather than a single `{ depth, text }` because flat config replaces a rule's options when a later block sets the same rule for the same files, so a second required heading could not be added by enabling the rule again.

Frontmatter is parsed as a node of its own (`yaml` by default, or `frontmatter: 'toml'` or `'json'`). Without that, a leading `---` block is read as a thematic break followed by a Setext heading made of the block's first line, which could satisfy or spoil a check; the preset always sets it. A repository that wires the rule by hand sets `languageOptions: { frontmatter: 'yaml' }` on its own block for the same reason. The frontmatter is never treated as a heading, so `title: Usage` does not satisfy a required `Usage`.

## Timeout races

A timeout that settles a `Promise.race` but leaves the request it raced against running is a leak: the caller moves on while the provider call keeps consuming budget and connections. `exadev/timeout-aborts-request` requires the shape that both settles the race and cancels the work:

```ts
async function complete(url: string): Promise<Response | undefined> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetch(url, { signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('timed out'));
        }, TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    if (controller.signal.aborted) return undefined;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
```

For each `Promise.race([...])` with an arm that is a `new Promise(executor)` whose executor calls `setTimeout` (written in place or named by a `const` first), the rule reports:

- a timer callback that contains no `.abort()` call, including a callback it cannot read (an imported function, a bound method). Nothing aborts the request, so it keeps running after the race settles;
- an `.abort()` whose receiver is not a local `const controller = new AbortController()` of the function holding the race: a controller created at module level, in an outer function, received as a parameter or read off `this` is shared with other races or belongs to the caller, so aborting it cancels more than this request;
- a timer whose id is not kept in a variable and passed to `clearTimeout` in a `finally` around the race (a `try` statement's `finally`, or a `.finally(callback)` chained onto the race). A request that wins otherwise leaves the timer pending. A `try` counts only when it awaits the race, directly, through a type assertion or a chained `.then`, or through a `const` the race is stored in and later awaited inside the same block: a race that is returned or assigned without an await lets the `finally` run at once, clearing the timer before it can fire;
- a `catch` around the race (a `catch` clause, or a `.catch(callback)` chained onto it) that has no `if` testing `controller.signal.aborted` with a `return` in its consequent, so a timeout is handled apart from a failure of the request. The test must be `controller.signal.aborted` itself or an `&&` with that as one operand; its negation, or an `||`, is true without an abort. A `try` statement's `catch` counts only when the `try` block awaits the race, for the same reason as the `finally`;
- a controller that no other arm of the race refers to (directly or through a `const` the arm names), such as a request started with `other.signal`. The timer would abort a controller the raced request never received. The rule checks that the controller appears in the request's arm, not that a particular call forwards its signal to the underlying request.

The rule is syntactic and reads one function. It cannot see that a helper the race calls forwards `controller.signal` to the request, which is cross-file, and it does not check that a particular SDK call receives the signal, which is vendor-specific and belongs in the [import policy](#import-policy) or a recipe. A race over work that cannot be cancelled is a false positive; the escape hatch is a scoped block that turns the rule off for those files:

```ts
{ files: ['src/legacy/**'], rules: { 'exadev/timeout-aborts-request': 'off' } }
```

Off unless enabled (`'exadev/timeout-aborts-request': 'error'` with the plugin registered), and not in `recommended`, since a project chooses to adopt the shape.

## Defensive fallbacks

A fallback on a value that really can be absent turns the absence into a plausible answer, and the wrong result surfaces far from the cause. `@typescript-eslint/no-unnecessary-condition` reports only the fallbacks the types already prove unnecessary; `exadev/no-defensive-fallback` reports the ones they do not, by shape alone:

- a `??` or `||` (or `??=` / `||=`) whose right operand is an empty array, empty object, empty string (`''`, `""` or an empty template), `0`, `0n`, `false` or `null`, including one behind `as`, `satisfies` or `<T>`;
- a `catch` clause whose body is empty (a comment-only body included), or holds one `continue` or one `return` that gives back nothing or a fixed value: a literal, `undefined`, `void 0`, or an array or object built only from those;
- a `.catch(handler)` or `.then(onFulfilled, handler)` whose rejection handler does the same, as an expression-bodied arrow or a function body.

A catch that does anything else with the error (logs it, rethrows it, returns something computed from it) is not reported. The fix is to model absence as `T | undefined` and handle it where it is meaningful, or to let the failure reach the caller.

It is opt-in: it is in neither `plugin.configs.recommended` nor the default export, because a configuration reader legitimately treats a missing optional field as empty, and that boundary differs per repository. `allow` lists the files where the fallback is at such a boundary, each with a `reason` (required, so the exemption explains itself where it is configured, since `noInlineConfig` leaves no comment to do so). `files` follows the [file glob dialect](#file-level-rules), so a glob without a `/` names a file at any depth.

Two shapes are reported although they are sometimes right, and the fix for both is an `allow` entry. A predicate that turns a failure into `false` (`try { JSON.parse(text); return true; } catch { return false; }`) is reported as a catch that returns a fixed value. `.catch` is matched on any receiver, so a schema fallback such as Zod's `z.string().catch('')` is reported as a promise handler when it is written as a function returning a fixed value.

```ts
export default defineConfig(...exadevConfig(), {
  files: ['src/**/*.ts'],
  plugins: { exadev: plugin },
  rules: {
    'exadev/no-defensive-fallback': [
      'error',
      { allow: [{ files: ['src/config/**'], reason: 'optional settings default to empty at the parsing boundary' }] },
    ],
  },
});
```

Overlap: core `no-empty` already reports a catch block with no statements and no comment; this rule also reports the comment-only block, which `no-empty` accepts.

## Compiler options

Several enforcement patterns hold only while the compiler is strict: an exhaustive `satisfies Record<Command['type'], Handler>` map, `noUncheckedIndexedAccess` narrowing, `exactOptionalPropertyTypes`. Turning `strict` off in a tsconfig silently disables all of them, and nothing in the config notices. `exadev/require-compiler-options` reports it.

```ts
// eslint.config.ts
import { defineConfig } from 'eslint/config';
import { exadevConfig } from '@exadev/eslint-config';

export default defineConfig(
  ...exadevConfig(),
  {
    files: ['**/*.ts'],
    rules: {
      'exadev/require-compiler-options': [
        'error',
        {
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          noImplicitReturns: true,
          noImplicitOverride: true,
          noFallthroughCasesInSwitch: true,
          noPropertyAccessFromIndexSignature: true,
          noUncheckedSideEffectImports: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          verbatimModuleSyntax: true,
          isolatedModules: true,
          strictBuiltinIteratorReturn: true,
          forceConsistentCasingInFileNames: true,
          allowUnreachableCode: false,
          allowUnusedLabels: false,
          target: ['es2022', 'es2023', 'es2024', 'esnext'],
        },
      ],
    },
  },
);
```

Each key is a compiler option and each value says what the effective option must be: `true`, `false`, or a list of accepted values. An enum-valued option such as `target`, `module` or `moduleResolution` takes its tsconfig spelling, case-insensitively, and the rule converts it with the compiler's own tsconfig parser, so a list of accepted values is also how "at least" is written. An unknown option, a value the compiler rejects and a list-valued option such as `lib` throw when the rule is created, quoting the compiler.

The rule asks the program ESLint already has which tsconfig governs the file (`program.getCompilerOptions().configFilePath`, so `parserOptions.project` and `projectService` both work) and reads that configuration through TypeScript's own config parser, which follows the whole `extends` chain exactly as `tsc` does. A flag inherited from a shared base counts, and a flag the base sets but a package overrides does not. It re-reads the tsconfig rather than trusting `program.getCompilerOptions()` because typescript-eslint overrides `noEmit`, `noUnusedLocals`, `noUnusedParameters`, `allowJs` and `checkJs` in the programs it builds, so those options would look satisfied whatever the tsconfig says. A program with no tsconfig behind it, and none attributed to it as described below, has nothing to re-read and is judged on its own options, in which those five are the overridden values.

The value compared is the one the compiler acts on: a flag that follows `strict` (`strictNullChecks`, `noImplicitAny`) is judged on its effective value, and an option that is unset takes the plain default the installed compiler documents for it. An option whose unset state is neither true nor false, such as `allowUnreachableCode`, is reported as not set even when `false` is required, because `false` is a different setting from leaving it out. This reads the compiler's own option metadata, which TypeScript exports at run time without publishing in its typings, and needs a release that has it; the rule throws a clear error naming the requirement otherwise.

A tsconfig governs every file of its program, so the rule reports once per tsconfig and rule configuration per run, on the first file ESLint lints under it, and not once per source file. ESLint gives a rule no signal that a run has started, so the rule reads it from the order of the files it lints: a file it has already linted since the last report starts a new run, which a long-lived process (an editor integration, an ESLint instance that lints more than once) meets when it lints that file again in its next run, so the finding is reported again while the tsconfig still violates the requirement. A file linted again straight after itself with different text is ESLint applying fixes, which re-lints the fixed text and keeps only the last pass's messages, or an editor re-linting an edit; that lint repeats the file's previous outcome, so a run that applies fixes still reports once, on the same file. A run that lints only files not linted since the last report cannot be told apart from the same run and reports nothing.

The rule keeps this per tsconfig and not per TypeScript program, because typescript-eslint replaces programs. It rebuilds a watch or project service program after an edit, and when it infers a single run (`TSESTREE_SINGLE_RUN=true`, or by default `CI=true` or the `eslint` binary, either without `--fix`) it builds one program per tsconfig ahead of time and parses a file it has already parsed in the process, as in a fix pass through ESLint's API, with a program of that one file and no tsconfig. Such a program is attributed to the tsconfig the file was last linted under, as long as that tsconfig still lists the file, so the file is judged against that tsconfig and not against the throwaway program's defaults.

The message names the tsconfig it resolved and lists each option whose effective value differs together with the value required. `parserOptions.project` or `projectService` may select a different tsconfig from the one the build uses (a `tsconfig.eslint.json`, say), in which case the rule checks the lint tsconfig and says nothing about the build; the two need to agree for the check to mean anything. A root tsconfig that covers only tooling files, with each package carrying its own, makes the same point: the tsconfig the rule sees is the one that contains the file being linted.

Keep the strictness flags in a base config that compiles nothing and have the root and every package extend it. `skipLibCheck` is common in shared bases and weakens the checking of declaration files, so requiring it `false` is possible (`skipLibCheck: false`) but belongs in a repository that wants it, not in a default set. `isolatedDeclarations` is the compiler-side way to require explicit types on exported declarations and can be added to the set as `isolatedDeclarations: true`; `@typescript-eslint/explicit-module-boundary-types` in the default export is the lint-side alternative.

The rule needs type information, so it is in neither `plugin.configs.recommended` nor the default export. ESLint's `--cache` keys on a file's content and the ESLint configuration, not on tsconfig contents, so clear the cache after changing a tsconfig or the option set.

## Tool config files

Tool configs decide whether the tools they configure enforce anything, and several can be set so that they enforce nothing: a test runner that passes when it finds no tests, `allowOnly` left on so a focused test reaches CI, coverage with no thresholds, a mutation run with no `break` threshold. These rules lint the config files as ordinary TypeScript. They read the object the file exports and run no tool.

Each rule scopes itself by filename, so it can be switched on for every JavaScript and TypeScript file and acts only on the files it knows:

| Rule | Built-in scope |
| --- | --- |
| `vitest-config` | `vitest*.config.*` and `vitest.workspace.*`, so `vitest.mutation.config.ts` is covered |
| `vitest-coverage-config` | none: only the files named in its `files` option |
| `stryker-break-threshold`, `stryker-thresholds-order` | `stryker*.config.*`, `stryker*.conf.*` and the dot-prefixed `.stryker.config.*` and `.stryker.conf.*` |
| `playwright-config` | `playwright*.config.*` |

Every rule takes a `files` option, a glob or list of globs in the [file glob dialect](#file-level-rules), that replaces the built-in scope; a glob without a `/` names a file at any depth.

**Only what the file spells out is judged.** A rule follows the default export (`export default`, `export =` or `module.exports =`) through an object literal, an array, a call to a config helper (`defineConfig`, `defineProject`, `defineWorkspace`, `mergeConfig`), the returned value of a function, either branch of a conditional, and a top-level `const`. A value that is the result of any other call, an import, a spread or a computed key is not visible, and the rule stays silent about it instead of guessing. A package config that merges a shared base and sets only a few keys is therefore judged only on those keys, which is why the checks that need a complete picture run on the base file itself (`vitest-coverage-config`, and the `base` option of `stryker-break-threshold`).

```ts
// eslint.config.ts
import { defineConfig } from 'eslint/config';
import { exadevConfig } from '@exadev/eslint-config';

export default defineConfig(
  ...exadevConfig(),
  {
    files: ['**/*.config.{ts,mts,cts,js,mjs,cjs}'],
    rules: {
      'exadev/vitest-config': 'error',
      'exadev/vitest-coverage-config': ['error', { files: ['vitest.base.config.ts'] }],
      'exadev/stryker-break-threshold': ['error', { min: 80, base: { path: 'stryker.base.config.ts', relativeTo: 'root' } }],
      'exadev/stryker-thresholds-order': 'error',
      'exadev/playwright-config': 'error',
    },
  },
);
```

### Vitest

`exadev/vitest-config` reports, in the `test` object of a config and of every inline project in `test.projects` (at any depth) and in the project objects of a `vitest.workspace.*` file:

- `passWithNoTests: true`, which makes the run pass when no test file is found, so a mistyped include glob or a deleted suite goes unnoticed;
- `allowOnly: true`, which lets a committed `.only` through (Vitest's own default already allows it only outside CI);
- the bare string `node_modules` (or `node_modules/`) in `test.exclude`, which excludes only a top-level directory of that name; `**/node_modules/**` is the form that also excludes nested copies. `test.coverage.exclude` is not checked: coverage filtering matches with `contains: true`, so a bare name there also ignores nested copies;
- a key under `test.coverage.thresholds` that Vitest does not read. Verified against the installed Vitest source, which skips `statements`, `branches`, `functions`, `lines`, `perFile`, `autoUpdate` and `100` and treats every other key as a file glob matched against the covered files, so thresholds nested under a word such as `global` match no file and enforce nothing. A key counts as intended for a glob or a file when it contains a path separator, a dot (so a root file name such as `index.ts` is accepted) or one of `*`, `?`, `[`, `]`, `{`, `}`, `!`; anything else is reported. This was checked against Vitest 4 only.

The option `forbidNumericMaxWorkers: true` also reports a numeric `test.maxWorkers`, for a repository whose task runner already parallelises across packages and where a fixed worker count in each package multiplies. A percentage string or a computed value passes. The same setting in a `package.json` script is the concern of [`required-scripts`](#required-scripts): `{ name: 'test', excludes: ['--passWithNoTests'] }` reports the flag on the command line.

`exadev/vitest-coverage-config` takes `files`, the shared base config files, and does nothing without it. In those files, every `test.coverage` block that is an object literal must set `provider`, `include` and a `thresholds` object with `statements`, `branches`, `functions` and `lines`, and one diagnostic lists everything missing. Per-package configs merge the base with `mergeConfig` and often set only `coverage.exclude`, so requiring thresholds in every file would report each of them for what it inherits.

### Stryker

`exadev/stryker-break-threshold` requires `thresholds.break` to be a number, since a run with no `break` (the default is `null`) never fails however low the mutation score falls. A missing `thresholds`, a missing `break`, `null`, `undefined` and a non-number are reported. A mutation job may deliberately run without `break` until a real threshold has been measured, so the rule is its own rule: set it to `'warn'`, or switch it off for those files, without touching the ordering check.

A `break` is a gate only when it is high enough to fail something, and a value of 2 never does. Two options set a floor:

- `min`, a number from 0 to 100;
- `base`, a file reference (`{ path, relativeTo? }`, resolved against the linted file's directory or the workspace root) to the shared Stryker config. The rule parses that file, takes its `thresholds.break`, and reports a package whose own value is lower, so a package cannot quietly undercut the base. It throws, naming the file, when the base does not exist or spells out no numeric `break`, rather than comparing against nothing.

With both, the higher floor is the one named in the message.

`exadev/stryker-thresholds-order` requires `break <= low <= high`. A key left out takes Stryker's documented default (`high` 80, `low` 60) and `break` has none, so `thresholds: { break: 70 }` is reported because it exceeds the default `low`: the low and high marks are then unreachable on a passing run, which usually means they were left at their defaults when the break was raised. Equal marks are allowed, since `{ high: 100, low: 100, break: 100 }` is the strictest valid configuration. Stryker itself rejects only a `low` above `high`.

### Playwright

`exadev/playwright-config` requires `forbidOnly` to be set, because Playwright defaults it to false and a committed `test.only` then runs one test and passes. `true` and any non-literal expression pass, so `forbidOnly: !!process.env.CI` is accepted; an absent key, `false`, `undefined` and `null` are reported. Two options add checks that a setting is present: `fullyParallel: true` requires `fullyParallel` to be set and not false, and `workers: true` requires `workers` to be set to anything, so the worker count on CI and locally is a stated choice. Only the top level of the config is read.

## Tooling wiring

A repository that publishes a package or runs a shared toolchain wires in the same auxiliary tools: package-shape checks before publishing, dead-code detection, dependency-version consistency, commit hooks. Each is dropped one repository at a time without anything noticing, and a package that stops running its shape checks before publishing looks identical to one that never had them. `toolingWiringConfig` (or `exadevConfig({ toolingWiring })`) holds a repository to the wiring and wires the [tool config rules](#tool-config-files) beside it. Every section is on unless given as `false`, and `{}` enables all of them:

```ts
// eslint.config.ts
import { defineConfig } from 'eslint/config';
import { exadevConfig } from '@exadev/eslint-config';

export default defineConfig(
  ...exadevConfig({
    toolingWiring: {
      publish: { tools: ['publint', 'attw'], smokeProject: 'smoke' },
      root: { tools: ['knip', 'syncpack'] },
      hooks: true,
      toolConfigs: { stryker: { min: 80 }, vitest: { coverageFiles: ['vitest.base.config.ts'] } },
    },
  }),
);
```

| Section | Held to | Applies to |
| --- | --- | --- |
| `publish` | `prepublishOnly` runs each of `tools` (default `publint` and `attw`), `engines` is set, and the optional `smokeProject` directory exists (only its presence is checked, not what it imports). | Every `package.json` that does not set `"private": true`. |
| `root` | A configuration for each of `tools` (default `knip` and `syncpack`), a script of the same name that runs the tool, and `packageManager` is set. | The `package.json` at the repository root: the nearest ancestor of the manifest that holds a `pnpm-workspace.yaml`, a `package.json` listing `workspaces`, or a `.git` entry. |
| `hooks` | `prepare` runs `husky` and the `.husky` directory exists. | Every `package.json` that declares `husky` under `dependencies`, `devDependencies`, `peerDependencies` or `optionalDependencies`. |
| `toolConfigs` | The [tool config rules](#tool-config-files) for Vitest, Stryker and Playwright, each given the options of its tool (`forbidNumericMaxWorkers` and `coverageFiles`, `min` and `base`, `fullyParallel` and `workers`), or `false` to leave a tool out. | The JavaScript and TypeScript config files each rule scopes itself to. |

`prepublishOnly` is checked as the command written, split into whole tokens, so `tsdown && publint && attw --pack` and `pnpm run publint && pnpm run attw` both satisfy `tools: ['publint', 'attw']`, and no script named after the tool is needed. A root tool's configuration is accepted as any of the file names the tool reads (`knip.json`, `knip.jsonc`, `.knip.json`, `.knip.jsonc`, `knip.ts`, `knip.js`, `knip.config.ts`, `knip.config.js` for knip; `.syncpackrc` and its `.json`, `.yaml`, `.yml`, `.js`, `.ts`, `.mjs` and `.cjs` forms, and `syncpack.config.js`, `.ts`, `.mjs` and `.cjs` for syncpack), or as a `knip` property (knip) or a `syncpack` or `config.syncpack` property (syncpack) of `package.json`. The root script must run the tool: its command, split into whole tokens, contains the tool's name, so `knip --production` counts and `echo skip` does not. The names were read from the tools' own source and binary, so a release that reads a further name needs this list extended. The root is found from the manifest's location, not from where ESLint runs, so `eslint .` run from inside a workspace package (as a turbo `_lint` task does) does not hold that package to the root requirements; a tree with none of those markers is rooted where ESLint runs. A repository with no knip or syncpack setup gives `root: false` or lists the tools it has, and one that uses another hook manager gives `hooks: false`.

The package.json sections need `@eslint/json`, an optional peer (`pnpm add -D @eslint/json`), and throw with the install command when it cannot be resolved. `toolConfigs` needs nothing, and a tool whose config files the repository does not have is left alone, because each rule scopes itself by file name. The tool config blocks cover only `.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs` files, so a `vitest.workspace.json` is never read as a script.

### Package requirements

The three package.json sections are one `exadev/package-requirements` entry each. The rule is the graph-free counterpart of [`package-has-files`](#required-files) and [`required-scripts`](#required-scripts): those two select workspace packages by group and need a `pnpm-workspace.yaml`, so they cannot reach a single-package repository or the root manifest, which no group owns. This rule reads only the manifest and its directory, and a condition picks the manifests it applies to. Wire it directly for requirements the preset does not state:

```ts
{
  files: ['**/package.json'],
  language: 'json/json',
  plugins: { exadev: plugin, json },
  rules: {
    'exadev/package-requirements': [
      'error',
      {
        requirements: [
          { when: { private: false }, fields: ['engines', 'files'], scripts: [{ name: 'prepublishOnly', includes: ['publint'] }] },
          { when: { root: true }, files: ['.husky', { glob: 'knip.{json,ts}', orFields: ['knip'] }] },
          { when: { namePattern: '-contract$', declares: ['zod'] }, scripts: ['typecheck'] },
        ],
      },
    ],
  },
}
```

Each requirement lists `scripts`, `files` or `fields`, and an optional `when` whose stated conditions must all hold:

- `private`: `true` for a manifest that sets `"private": true`, `false` for any other.
- `root`: `true` for the manifest at the repository root (the nearest ancestor holding a `pnpm-workspace.yaml`, a `package.json` listing `workspaces`, or a `.git` entry; where ESLint runs when there is none), `false` for any other.
- `namePattern`: a regular expression the declared `name` matches, in the dialect of the [package selectors](#package-selectors). A manifest with no `name` never matches.
- `declares`: dependency names; at least one must appear under `dependencies`, `devDependencies`, `peerDependencies` or `optionalDependencies`.

`scripts` are checked as for [`requiredScripts`](#required-scripts), on the command as written. `files` are paths or globs relative to the package directory, resolved as for [`requiredFiles`](#required-files); an entry written `{ glob, orFields }` is also satisfied by any one of the listed manifest properties being set, for a tool that reads its configuration from either place; a property is a top-level field name, or the keys leading to a nested one (`['config', 'syncpack']`). `fields` must be set: present, and not `null`, an empty string, an empty object or an empty array. Requirements that select the same manifest merge, and one diagnostic lists everything missing of each kind, on the manifest, or on the `scripts` entry for a missing script.

## Verifying ESLint is applied

Every check in this package runs inside ESLint, so none of them can notice that a repository's `eslint.config.ts` no longer includes this package, has set its rules to `off`, or has been narrowed with `ignores` until nothing is linted. The repository looks configured and enforces nothing. `verifyEslintConfig` and `assertEslintConfig` check from outside the configuration: they resolve it through ESLint's Node API (`calculateConfigForFile`, the object `--print-config` prints, with `files` and `ignores` applied) for a sample file of each kind the repository lints, and report each file that is not linted and each required rule that is missing, off or weaker than required. They are plain async functions, so a test runs them:

```ts
// eslint-config.unit.test.ts
import { assertEslintConfig } from '@exadev/eslint-config';
import { it } from 'vitest';

it('applies the shared ESLint config to every kind of file', async () => {
  await assertEslintConfig({
    samples: ['src/index.ts', 'src/index.unit.test.ts', 'package.json', { path: 'eslint.config.ts', except: ['@typescript-eslint/no-unsafe-assignment'] }],
    rules: { 'exadev/require-compiler-options': 'error' },
    except: ['exadev/barrel-policy'],
  });
});
```

`assertEslintConfig` throws one error listing a line per violation, each naming the rule and the file; `verifyEslintConfig` returns the violations (`{ kind, file, rule?, required?, actual?, message }`, `kind` being `not-linted`, `missing`, `off` or `too-weak`) for a caller that wants to report them differently.

| Option | Meaning |
| --- | --- |
| `samples` | The files to resolve, relative to `cwd`: one per kind of source the repository lints. A bare string is `{ path }`; an object may add `rules` and `except` for that file alone. A sample need not exist, since ESLint resolves its configuration from the path. |
| `rules` | Rules required for every sample, each with the severity it must at least have (`warn` or `error`). They replace a baseline requirement for the same rule. |
| `except` | Baseline rules not required. |
| `baseline` | The configuration whose enabled rules every sample must also have enabled, each at least at the severity it gives. Defaults to this package's default export, so a repository lists only its exceptions. `false` requires only `rules`. |
| `cwd`, `configFile` | The directory ESLint resolves from (default: the working directory), and the config file under test (default: the one ESLint finds). |

A required rule passes when its resolved severity is at least the required one, so `error` satisfies a `warn` requirement. Severities are normalised first, since a resolved rule entry is `[severity, ...options]` with the severity a number or a string. A file that is ignored, or that no configuration block matches, is reported as `not-linted`: ESLint resolves no configuration for either.

The default baseline is the default export as it resolves in this process, including the React and Next.js rules it detects from the installed peers. A repository that configured `exadevConfig(options)` passes the same call as `baseline` (`baseline: exadevConfig({ react: false })`), or the shared options object both read, so the verifier requires what the repository meant to enable and not what auto-detection would add. The check proves the rules are active for the sample files; it does not run them.

## Workspace architecture

Six rules (`no-uphill-dependency`, `no-dependency-cycle`, `package-name-mirrors-path`, `package-has-files`, `dev-dependency-only`, `required-scripts`) share one options object, `WorkspaceArchitectureOptions`, describing a pnpm workspace's own dependency-direction rules (which package is allowed to depend on which other, checked directly against every `package.json`'s declared `dependencies`) and the per-package requirements layered on the same groups. The last four rules are opt-in within it: each does nothing unless its own option is given. Off by default, since `groups` has no sensible default; enable it either through `exadevConfig({ workspaceArchitecture })` (the full bundle) or the standalone `workspaceArchitectureConfig(options)` export (for a consumer building its own config from the lighter `plugin` export, e.g. one that isn't using `exadevConfig()` at all):

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
| `allow` | `{ from, to, reason }[]`, documented exceptions to `no-uphill-dependency`, one per edge. See [Documented exceptions](#documented-exceptions-and-exempt-groups). |
| `exemptTargetGroups` | `{ group, fields }[]`. Edges into a package of `group`, declared only under `fields`, skip every `no-uphill-dependency` check. See [Documented exceptions](#documented-exceptions-and-exempt-groups). |
| `dependencyConstraints` | `{ packages, allow?, deny?, reason }[]`. Limits which workspace packages a selected package may depend on, checked by `no-uphill-dependency`. See [Dependency constraints](#dependency-constraints). |
| `requiredFiles` | `{ packages, files }[]`. Enables `package-has-files`. See [Required files](#required-files). |
| `devOnly` | Selectors for packages that may appear only under `devDependencies`. Enables `dev-dependency-only`. See [Dev-only packages](#dev-only-packages). |
| `requiredScripts` | `{ match, scripts }[]`. Enables `required-scripts`. See [Required scripts](#required-scripts). |

A group's own `slice` (`{ segment: N }` or `{ namePrefix: true }`) partitions it further: two packages in the same or a differently-ranked group but a different slice (two feature verticals, say) are still isolated from each other, checked by the `crossSlice` violation. `{ segment: N }` reads the slice value directly from the package's own path (the Nth segment after the group's own root); `{ namePrefix: true }` is for a group with no such structure of its own (a flat `targets/` directory, say), whose packages instead take their slice from whichever other group's already-observed segment-derived value prefixes their own declared name.

### Package selectors

`dependencyConstraints`, `requiredFiles`, `devOnly` and `requiredScripts` pick packages with one selector shape. A string is a regular expression tested against the package's declared name, in the same dialect as `nameRanks` (so `-testkit$`, not a glob such as `*-testkit`). An object selects by `group` (one of the declared `groups`), by `namePattern` (the same regular expression), or by both, in which case both must hold. A package that declares no name is matched by its group only; a name pattern never matches it. An invalid pattern or an undeclared group fails when the options are read, naming the option.

### Documented exceptions and exempt groups

`allow` names single edges by declared package name. `reason` is required and must be non-empty, so an exception always says why it exists. It excuses that edge from every `no-uphill-dependency` check (rank, rank skip, slice, isolated groups and [dependency constraints](#dependency-constraints)); it does not affect `no-dependency-cycle`, so an allowed edge that closes a cycle is still reported there.

```ts
allow: [
  { from: '@scope/store-adapter-db', to: '@scope/orders-contract', reason: 'the adapter persists the contract types and owns their table mapping' },
],
```

An entry that stops excusing anything is itself reported, so the list cannot rot. It is reported on the `package.json` of the `from` package: on the dependency entry when the checks would have passed the edge anyway, and on the manifest when the dependency is no longer declared at all. When the `from` package no longer exists, it is reported on the workspace root `package.json`, which therefore needs to be linted by the rule (`**/package.json` includes it).

`exemptTargetGroups` covers the case a per-edge list handles badly: a shared test-database package consumed as a `devDependency` by every layer, so dozens of edges point from lower ranks up to a test rank by design. It applies once `dependencyFields` is widened to read the field at all, and each listed field must be one of those read, otherwise the exemption could never apply and the options fail to load. A name also declared under any other read field is not exempt, so a runtime edge cannot hide behind a dev entry.

```ts
dependencyFields: ['dependencies', 'devDependencies'],
exemptTargetGroups: [{ group: 'test', fields: ['devDependencies'] }],
```

### Dependency constraints

Ranks and isolated pairs cannot say that one group may depend only on certain others, or that packages of a given name inside a rank may not reach a given layer. `dependencyConstraints` states such rules directly. Each entry selects its source packages with `packages` and lists target [selectors](#package-selectors) under `allow`, `deny`, or both:

- `allow`: every workspace dependency of a selected package must match at least one of the selectors, otherwise it is a `constraintNotAllowed` violation.
- `deny`: no workspace dependency of a selected package may match any of the selectors, otherwise it is a `constraintDenied` violation.
- both: a dependency must match an `allow` selector and no `deny` selector, so "anything in `core` except its adapters" is `allow: [{ group: 'core' }], deny: ['-adapter-']`.

`reason` is required and non-empty, and appears in every diagnostic the entry produces. An entry with neither list, an empty list, an undeclared group or a pattern that does not compile fails when the options are read, naming the option.

Constraints are checked beside the rank, slice and isolation checks, not instead of them, so one edge can be reported by both. Each constraint is judged on its own: a dependency ruled out by two constraints is reported twice, once with each reason. Only workspace dependencies are constrained, as with every other check of the rule. An edge into an [exempt target group](#documented-exceptions-and-exempt-groups) skips the constraints too, and an `allow` edge excuses a constraint violation the same way it excuses a rank violation; an `allow` entry that excuses only a constraint violation is not stale. A source package that declares no name is selected by its group only, since a name pattern never matches it.

The three rules below are the ones that motivated the option. Targets may depend only on product packages:

```ts
dependencyConstraints: [
  { packages: { group: 'targets' }, allow: [{ group: 'product' }], reason: 'a target ships product code and nothing else' },
],
```

A product's application context may depend on contract packages, feature modules and vertical packages, and never on a core backend adapter. The `allow` list alone already rules the adapter out; the separate `deny` entry keeps the adapter rule in force for every product package, whatever its own `allow` list says:

```ts
dependencyConstraints: [
  { packages: '-application-context$', allow: ['-contract$', { group: 'features' }, { group: 'verticals' }], reason: 'the application context composes contracts, features and verticals' },
  { packages: { group: 'product' }, deny: [{ group: 'core', namePattern: '-adapter-' }], reason: 'product code reaches backend adapters only through a runtime package' },
],
```

Only product `runtime-*` packages may import core adapters. Selectors pick sources, so "only these may" is written as a deny for every other package: a negative lookahead selects each package whose name contains no `runtime-`. A `runtime-` package outside `product` would need an entry of its own naming its group (`{ group: 'features', namePattern: 'runtime-' }`), since a selector cannot negate a group:

```ts
dependencyConstraints: [
  { packages: { namePattern: '^(?!.*runtime-)' }, deny: [{ group: 'core', namePattern: '-adapter-' }], reason: 'only runtime packages wire backend adapters' },
],
```

### Required files

`requiredFiles` makes `package-has-files` report every matching package whose directory lacks a listed path. Paths are relative to the package directory and may be globs (braces, `*`, `?`, `[...]`, `**`; a wildcard never matches a dot-prefixed name, and `node_modules` is never searched). A literal path must exist; a glob must match at least one existing path. The diagnostic is anchored on the package's `package.json` and lists the missing entries in declaration order, across every requirement that selects the package. Pair it with a rule that checks a file's exports to cover a whole convention (file exists, then file exports the right names).

```ts
requiredFiles: [
  { packages: '-contract$', files: ['src/errors.ts', 'src/fake.ts', 'src/**/*.conformance.ts'] },
],
```

### Dev-only packages

`devOnly` lists selectors for packages that exist to support tests (fixtures, fakes, a conformance kit). `dev-dependency-only` reports any workspace package that lists a matching package under `dependencies`, `peerDependencies` or `optionalDependencies`, at the offending entry; `devDependencies` is the only permitted place. It reads those three fields regardless of `dependencyFields`, which narrows what the rank checks read and must not hide a field this rule forbids. Only workspace members are restricted, so a third-party package whose name happens to match is ignored.

```ts
devOnly: ['-testkit$', { group: 'test' }],
```

### Required scripts

`requiredScripts` makes `required-scripts` report each matching package that lacks a listed key under `scripts`, naming every missing script in one diagnostic on the `scripts` entry (or on the manifest when it has none). A script may be a bare name, which checks presence only, or an object that also constrains the command as written (never what running it does):

- `equals`: the command must be exactly this string.
- `includes`: each entry must appear in the command.
- `excludes`: no entry may appear in the command.

`includes` and `excludes` compare tokens, not substrings. The command is split on whitespace, one layer of surrounding quotes is removed, and a `--flag=value` option is split so it equals `--flag value`. An entry matches when its tokens appear as a contiguous run anywhere in the command, so `--max-warnings 0` is found in a chained command and in `--max-warnings=0`, while `--passWithNoTests` never matches `--passWithNoTestsFoo`. Shell operators are ordinary tokens and are not interpreted.

```ts
requiredScripts: [
  { match: { group: 'features' }, scripts: ['typecheck', 'test'] },
  { match: '-schema$', scripts: ['generate', 'verify-generated'] },
  {
    match: { group: 'features' },
    scripts: [
      { name: 'boundaries', equals: 'turbo boundaries' },
      { name: 'lint', includes: ['--max-warnings 0'] },
      { name: 'test', excludes: ['--passWithNoTests'] },
    ],
  },
],
```

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

### Reading the shared layout from @exadev/config

A repository that describes its workspace once in [`@exadev/config`](https://github.com/ExaDev/config)'s `layout` section can feed the same description to these rules. The `layout` section's type is checked equal to `WorkspaceArchitectureOptions`, so the value `loadSection(layoutSection)` returns is passed to `workspaceArchitecture` as it is. In an ESM `eslint.config.ts`, read it with top-level `await`:

```ts
// eslint.config.ts
import { layoutSection, loadSection } from '@exadev/config';
import { exadevConfig } from '@exadev/eslint-config';
import { defineConfig } from 'eslint/config';

const layout = await loadSection(layoutSection, { cwd: import.meta.dirname });
if (layout === undefined) throw new Error('exadev.config.ts defines no layout section');

export default defineConfig(
  {
    languageOptions: {
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
  },
  ...exadevConfig({ workspaceArchitecture: layout }),
);
```

`loadSection` resolves to `undefined` when no `layout` section is defined, hence the check. `cwd` is the directory holding `exadev.config.ts` (or `exadev.layout.config.ts`). A layout that fails the section's schema throws when the config loads, with the path and the rule that failed.

The layout carries structure only: groups, ranks, slices, naming and isolated pairs. Policy stays here, so `allow`, `exemptTargetGroups`, `dependencyConstraints`, `requiredFiles`, `devOnly` and `requiredScripts` are not part of it; add them with a spread (`workspaceArchitecture: { ...layout, allow: [...] }`).

The ESLint config itself stays in `eslint.config.*`. Only the layout moves into `exadev.config.ts`: ESLint loads its own config file, and the unified file has no section for rules or plugins. Neither package depends on the other: install `@exadev/config` (and its `cosmiconfig` peer) in the repository, and `@exadev/eslint-config` takes the value structurally. This repository keeps `@exadev/config` as a dev dependency only, for the test that fails when either side's types drift apart.

## Turbo

These rules keep a repository that uses [turbo](https://turborepo.dev) honest about what turbo actually runs. Turbo skips a task silently when no package has a script of that name, restores only a task's log when `outputs` is missing, and caches a task under a hash taken before the task runs; none of that shows up as an error. They share one options object, `TurboOptions`, and all are off unless the `turbo` option is given, since only a repository can say it uses turbo. Enable them through `exadevConfig({ turbo })` or the standalone `turboConfig(options)`, which returns the blocks to spread into `defineConfig(...)`:

```ts
// eslint.config.ts
import { defineConfig } from 'eslint/config';
import { turboConfig } from '@exadev/eslint-config';

export default defineConfig(
  // ...your own config...
  ...turboConfig(),
);
```

A `turbo.json` value of the wrong type (a `dependsOn` that is not a list of strings, a `tasks` that is not an object) throws an error naming the file and the value, since reading it as absent would misreport the task with no hint of the cause.

Both need `@eslint/json` resolvable, the same optional peer the other JSON rules use. `turbo.json` is linted as JSONC because turbo accepts comments there. Every rule does nothing in a `package.json` that belongs to no turbo repository, that is, one with no `turbo.json` that does not `extends` another at or above it (the nearest one in a workspace root wins, so a package configuration that forgot `extends` is not mistaken for the root).

### Options

| Field | Meaning |
| --- | --- |
| `root` | The repository root. Defaults to the nearest ancestor holding a root `turbo.json`. |
| `packages` | Workspace package globs, in the dialect of the [workspace architecture](#workspace-architecture) `packages` option. Defaults to `pnpm-workspace.yaml`'s `packages`, then `package.json`'s `workspaces`. A repository declaring neither is a single package. An empty `packages: []` in `pnpm-workspace.yaml`, the usual way to give turbo a root in a single-package repository, is read as no members. |
| `prefix` | What marks a script as the implementation of a task. Defaults to `_`. |
| `delegate` | The command a public script uses: `'turbo run'` (default) or `'turbo'`. |
| `exemptTasks` | Task names the checks skip, applied to script names as well as task keys, so it also exempts a script from `turbo-script-convention`, `turbo-script-has-task` and `no-fix-in-cached-task-script`. A name exempts the task in every form: `lint` covers `lint`, `//#lint` and `web#lint`. |
| `requireEmptyOutputs` | Also require `outputs` on graph-only and uncached tasks. |
| `fixFlags` | The flags `no-fix-in-cached-task-script` looks for, compared as whole words. Defaults to `--fix` and `--write`; a short form such as `-w` is not included by default, since it also means `--watch` or `--workspace-root` in other tools, so add it here where it means write. |
| `toolConfigs` | Tool command word to the config file globs it reads, for [`turbo-task-config-inputs`](#cached-tasks-include-their-tool-configs). Defaults to `eslint` with `eslint.config.*`, `tsc` with `tsconfig*.json` and `vitest` with `vitest.config.*`. A tool you give replaces its default; an empty list stops checking that tool. |
| `taskGraph` | `{ task, dependsOn }[]`. The [`dependsOn` edges](#required-dependson-edges) each named task must have. Nothing is required by default. |
| `hygiene` | `{ schemaHosts?, requireCiPassThrough?, aggregateTask? }`. See [turbo.json hygiene](#turbojson-hygiene). |
| `boundaries` | `{ aggregateScript?, groups?, allowIgnore? }`. Giving it at all enables the [`turbo boundaries`](#turbo-boundaries) rules. |

### Scripts delegate to underscore tasks

Repositories that use turbo tend to keep the real commands in underscore-prefixed scripts (`_lint`, `_typecheck`, `_test`, `_build`) and expose thin public scripts that delegate (`"lint": "turbo run _lint"`). `turbo-script-convention` checks that the convention holds. In the root package every prefixed script needs a public script of the same name without the prefix, and that script must be the delegating command followed by nothing but flags (`turbo run _lint --force` passes; `eslint .`, `tsc --noEmit && turbo run _typecheck`, `turbo run _lint && tsc` and `turbo run _lint _typecheck` do not). A word after the task must start with a dash or directly follow a word that does, since the command line does not say which flags take a value, so a flag's value passes and a second task or other positional word does not; a multi-task public script belongs in a junction task that `dependsOn` the others. In any other package a prefixed script needs no public counterpart, and a bare script named after a task the root orchestrates (`lint` when the root has `_lint`) is reported, since the public name belongs to the root. The rule reads the command line as written and never what running it does.

`turbo-script-has-task` is the other direction for scripts: a prefixed script must be configured as a task, either in the root `turbo.json` (under its own name, as `//#name` in the root package, or as `package#name` in a member) or in the member's own `turbo.json`. A prefixed script that no task names is never run by turbo.

### Tasks and scripts match

`turbo-task-has-script` lints the root `turbo.json`. A task that no package implements is reported on its key, with these shapes exempt because turbo treats them differently. A junction task, one with `dependsOn` and no script anywhere, only groups other tasks. A `//#name` task is implemented by the root package's script `name`, whatever the script holds (a `":"` no-op or an unprefixed name such as `test:coverage` both count). A `package#name` task is implemented by the package of that name. Any other task is implemented by a workspace member's script, or by the root package's when the repository has no members, since turbo runs the root package for a task only then.

It also reports dead configuration: a `//#name` task or an aggregate (a task with `dependsOn`) that no other task lists in `dependsOn` or `with`, and that no root script invokes through turbo (`turbo run x`, `turbo x`, behind `pnpm` or by path), never runs. A root task that is only reachable from a CI workflow is not seen, because ESLint cannot read workflow files; give it a root script or list it in `exemptTasks`. A package's `turbo.json`, which extends the root, is not checked here.

### Cached tasks declare outputs

A task with no `outputs` key, or with `"outputs": null` (which turbo's schema allows), caches its log only, the same as `outputs: []` ([turbo configuration reference](https://turborepo.dev/docs/reference/configuration#outputs), [latest archived copy](https://web.archive.org/web/https://turborepo.dev/docs/reference/configuration)). A build task that forgot the key looks configured but restores nothing on a cache hit, and nothing separates it from a lint task that legitimately produces no files. `turbo-task-outputs` requires every cached task to declare `outputs`, using `[]` where there are none, so the absence is always a stated choice, and reports on the task key. A task that sets `cache: false`, or that only wires other tasks together (nothing but `dependsOn` and `description`), is exempt unless `requireEmptyOutputs` is set. A persistent task never completes, so it must set `cache: false`; that is reported instead of the outputs problem.

In a package's `turbo.json` a task is judged as merged over the root task of the same name, so a partial override that inherits `outputs` passes, and a problem the root already has is reported at the root only.

### Cached tasks include their tool configs

A cached task is stored under a key hashed from its `inputs`, which default to the files of its own package that are checked into source control ([`inputs` reference](https://turborepo.dev/docs/reference/configuration#inputs), [latest archived copy](https://web.archive.org/web/https://turborepo.dev/docs/reference/configuration)); the sources of the internal packages it depends on reach the key only through the `dependsOn` edges that run their tasks first. A shared config at the repository root (`eslint.config.ts`, `tsconfig.base.json`, `vitest.config.ts`) is not among them unless `globalDependencies` or an `$TURBO_ROOT$/` input lists it, so changing the root ESLint config can restore the previous lint result. A task with explicit `inputs` and no `$TURBO_DEFAULT$` replaces the default, so its own package's config files must be listed too.

`turbo-task-config-inputs` checks this for every task in the root `turbo.json`. It finds the packages whose script implements the task (the same way `turbo-task-has-script` does), reads the script's command for the tools in `toolConfigs`, and for each tool looks for the files its globs match directly inside the package and, for a package other than the root package, at the repository root. Each such file must be in the cache key: through `globalDependencies`, through the package's own files (unset `inputs`, or `$TURBO_DEFAULT$`), or through an `inputs` glob (relative to the package, or to the root behind `$TURBO_ROOT$/`), and not removed by a `!` glob. A file that a `!` glob drops is reported on its own, naming the glob, because the fix differs: an exclusion wins over `$TURBO_DEFAULT$` and over a glob that lists the file, so only narrowing or removing the `!` glob restores it. A package's own `turbo.json` is laid over the task first, so an override that replaces `inputs` is caught, and reported on the task's key in the root file with the packages named. Uncached tasks are skipped, and so is a script that names none of the tools (`pnpm run lint`, `tsdown`): the rule reads the command line as written and does not guess. A root file counts whenever its name matches the globs, whether or not the tool actually loads it, so narrow the globs (`tsconfig.base.json` rather than `tsconfig*.json`) where a root file is not an input of the package tasks.

Two failure modes need a filesystem walk or an execution and stay guidance: a task whose input globs match no file in its package hashes as unchanging and replays its first green result, and a task that reads an environment variable to select a backend must list it in `env`, since a hash over files cannot see it (the [environment variable check](#environment-variables-read-in-source) covers the variables read in source). A single-package repository needs no `packages:` glob: its root package is checked against its own files.

### Required dependsOn edges

Repositories disagree on how tasks depend on each other. Some make `_build` depend on `_typecheck` so a type error stops the build, some make `_typecheck` depend on `^_build` so it checks against built dependencies, and a workspace whose packages resolve each other's source directly needs `_typecheck` to depend on `^_typecheck`, since that edge brings a dependency's sources into the consumer's cache key. Which is right is a policy, so nothing is required unless the `taskGraph` option states it:

```ts
turboConfig({
  taskGraph: [
    { task: '_typecheck', dependsOn: ['^_typecheck'] },
    { task: '_build', dependsOn: ['_typecheck', '^_build'] },
  ],
});
```

`turbo-task-graph` reports each edge a named task lacks, on the task's key, comparing entries as written. A requirement for `_build` also applies to each `package#_build` entry of the root `turbo.json`, because turbo does not merge such an entry with the generic task: checked against turbo 2.10.8 with `turbo run --dry=json`, a `web#_build` entry that lists only `inputs` and `outputs` resolves with no `dependsOn` and no `env` at all, dropping what the generic `_build` declared. That is the case the option exists to catch, and it holds for `dependsOn` in any entry, so a package entry has to repeat every edge. A requirement never applies to the root package's own `//#_build` task unless written with that key. In a package's `turbo.json`, which does merge with the root ([package configurations](https://turborepo.dev/docs/reference/package-configurations), [latest archived copy](https://web.archive.org/web/https://turborepo.dev/docs/reference/package-configurations)), a key the package sets replaces the root's array unless it lists `$TURBO_EXTENDS$` to keep the root entries; the rule judges the merged task and reports an override that drops an edge the inherited task had. An edge the inherited task already lacks is reported at the root only. A requirement whose task matches no entry of the root `turbo.json` (a name written `_buidl`, or a `web#_build` for a package with no such entry) could never apply, so it is reported on the `tasks` key rather than passing silently; a generic name such as `_build` is met by the generic entry or any `package#_build` entry, but not by `//#_build` alone. `exemptTasks` skips a task here too, including its unmatched requirement.

### turbo.json hygiene

`turbo-json-hygiene` is a set of presence checks on `turbo.json`. Every `turbo.json` needs a `$schema`, so editors validate the file. The accepted forms are `https://<host>/schema.json`; the same URL on a versioned subdomain such as `https://v2-10-8.turborepo.dev/schema.json`; and a relative path to the schema the `turbo` package ships, such as `./node_modules/turbo/schema.json` or `../../node_modules/turbo/schema.json` in a package ([editor integration](https://turborepo.dev/docs/getting-started/editor-integration), [latest archived copy](https://web.archive.org/web/https://turborepo.dev/docs/getting-started/editor-integration)). The hosts default to the three turbo has published the URL under (`turborepo.com`, `turborepo.dev` and `turbo.build`), and `hygiene.schemaHosts` narrows them, so one host makes it canonical and the other hosts, with or without a version, are reported. The local path names no host, so it is accepted whatever `schemaHosts` holds. Two checks apply to the root `turbo.json` only and are off unless asked for:

- `hygiene.requireCiPassThrough: true` requires `CI` in `globalPassThroughEnv`, so tasks that read it see it without it entering their cache key.
- `hygiene.aggregateTask: { name, includes }` requires a task called `name` (for example `_prepush`) whose `dependsOn` lists every task in `includes`. Its name varies between repositories, hence the option. A graph-only task and one kept invocable with a `":"` root script and `cache: false` both pass, since the check reads the task entry and not the scripts. The name is matched against the task key exactly as written, so an aggregate kept invocable as a root script in a monorepo, which turbo knows as the root package's task, is given as `name: '//#_prepush'`.

```ts
turboConfig({
  hygiene: {
    requireCiPassThrough: true,
    aggregateTask: { name: '_prepush', includes: ['_lint', '_typecheck', '_test'] },
  },
});
```

### Environment variables read in source

Turbo's strict env mode strips variables a task has not declared, so a `process.env.X` read in source that no `turbo.json` lists in `env` or `globalEnv` fails at runtime or is missing from the cache key. Vercel's [`eslint-plugin-turbo`](https://github.com/vercel/turborepo/tree/main/packages/eslint-plugin-turbo) ([latest archived copy](https://web.archive.org/web/https://github.com/vercel/turborepo/tree/main/packages/eslint-plugin-turbo)) reports exactly that with `turbo/no-undeclared-env-vars`, and this package folds it in the way it does React and Next.js: `eslint-plugin-turbo` is an optional peer dependency, `exadevConfig()` uses it when it is resolvable, `exadevConfig({ turboEnv: true })` forces it on and throws when the plugin is missing, and `turboEnv: false` never loads it. It is a separate option from `turbo`, which configures this package's own rules and is off unless given.

Checked against the published package before adopting it: it ships `configs['flat/recommended']` and a flat-config usage section in its README, it declares peers `eslint >6.6.0` and `turbo >2.0.0`, and it is released alongside turbo itself. The peer range starts at 2.3.1, the first release whose published build exports `configs['flat/recommended']` (2.3.0 and every earlier release export only the legacy `recommended`, read from the published tarballs), so a repository on an older turbo 2 minor is not warned and none is held to a recent release. It finds the repository through ESLint's working directory: the root `turbo.json` and the `turbo.json` of every workspace package that extends it, so a variable declared in a package configuration counts for that package. Its config carries no `files`, so it is scoped here to JavaScript and TypeScript sources, and it is one block that is only added when the plugin resolves.

### Check and fix are separate tasks

Turbo hashes a task's inputs before the task runs. A task that then rewrites those inputs is stored under a key that no longer describes the files. This was confirmed against the installed turbo with a cached task whose script rewrites one of its inputs: the first run misses and rewrites, the second run misses again because the rewritten file hashes differently, the third hits; and restoring the file to its earlier content hits the first run's entry, replaying its log while leaving the file unfixed. So a cached check that passes `--fix` reports success on a cache hit without applying the fix its log describes, and rewrites files during CI.

`no-fix-in-cached-task-script` reports a script that turbo.json configures as a cached task (any script with a task entry that is not `cache: false`, found the way `turbo-script-has-task` finds it) and that passes one of `fixFlags`. The fix is an uncached task beside a fix-free check:

```json
{
  "scripts": {
    "_lint": "eslint . --cache --max-warnings 0",
    "_lint:fix": "eslint . --fix --cache --max-warnings 0",
    "lint": "turbo run _lint",
    "lint:fix": "turbo run _lint:fix"
  }
}
```

with `"_lint:fix": { "cache": false }` in `turbo.json`.

### Turbo boundaries

[`turbo boundaries`](https://turborepo.dev/docs/reference/boundaries) (experimental) checks source imports against package directories, declared dependencies and per-package tag rules. It only applies tag rules once the root `turbo.json` has a `boundaries` key and packages carry `tags`. These rules check that a repository has opted in; they do not check that the command passes. Trialled on a workspace with a large number of packages, `turbo boundaries` failed on every package whose `eslint.config.ts` or `stryker.config.ts` imported a shared file from the workspace root, reporting each as an import leaving the package. The command is therefore unusable on a workspace that shares configuration through root imports unless it uses `@boundaries-ignore` comments or another way of sharing configuration, and a passing rule set here does not imply a passing `turbo boundaries`. Never run `turbo boundaries --ignore=all`: on a copy it rewrote an import into a comment followed by an orphaned string literal, and the rerun passed only because the import had gone.

Tags cover allow and deny relations but not rank, rank skipping or cycles, so `no-uphill-dependency` and `no-dependency-cycle` remain useful alongside them.

- `turbo-boundaries-config` requires the root `turbo.json` to have a `boundaries` key; `"boundaries": {}` is enough to opt in.
- `turbo-package-tags` requires every workspace package to have its own `turbo.json` with `"extends": ["//"]` and a non-empty top-level `tags` list (the shape the [package configuration reference](https://turborepo.dev/docs/reference/package-configurations) documents). With `boundaries.groups` (`{ name, path? }`, `path` defaulting to `name`, relative to the repository root), the tags must also include the name of the group the package's directory falls under, the longest matching path, so the layout is declared once and the tags cannot drift from it: `exadevConfig({ workspaceArchitecture, turbo })` takes `boundaries.groups` from `workspaceArchitecture.groups` (and throws if `boundaries.groups` is given as well), while the standalone `turboConfig()` needs `boundaries.groups` and `workspaceArchitectureConfig()` needs `groups` passed from one shared array, since neither can see the other. A workspace package under no group throws rather than being skipped. Diagnostics land on the package's `package.json`, the one file every package has.
- `turbo-boundaries-script` requires the root package's `boundaries` script to be exactly `turbo boundaries`, and, with `boundaries.aggregateScript`, that script (the one run before pushing) to invoke it, directly or as `pnpm boundaries`, `npm run boundaries` or `pnpm run -s boundaries`. Package manager flags that take no value (`-s`, `--silent`, `-q`, `--quiet`, `--if-present`, `-w`, `--workspace-root`) may sit before the script name; a flag that takes a value cannot be told from a script name in a command line, so an aggregate that uses one (`pnpm --filter x boundaries`) is not recognised.
- `no-boundaries-ignore` bans the `@boundaries-ignore` comment, the same stance `noInlineConfig` takes on `eslint-disable`. A comment counts the way turbo reads it: its text, trimmed, starts with the directive. `turbo boundaries --ignore=all` inserts one above every import it reports, so the check could otherwise be silenced wholesale without anyone deciding to. Where a few reasoned exceptions are wanted, `boundaries.allowIgnore` lists `{ files, reason }` entries; `files` are globs relative to ESLint's working directory and `reason` is required.

```ts
const groups = [{ name: 'core' }, { name: 'features' }, { name: 'targets' }];

// Standalone: one shared array. exadevConfig({ workspaceArchitecture: { groups }, turbo }) derives it.
workspaceArchitectureConfig({ groups });
turboConfig({
  boundaries: {
    aggregateScript: 'check',
    groups,
    allowIgnore: [{ files: ['scripts/**'], reason: 'build scripts import the workspace root config' }],
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
- The `lint`/`typecheck`/`test`/`build` npm scripts wrap [turbo](https://turborepo.dev) tasks named `_lint`/`_typecheck`/`_test`/`_build` — run `pnpm build`, not `turbo run build`. `pnpm lint:fix` runs the uncached `_lint:fix` task, which is the only one that rewrites files; this repo lints its own scripts with the [Turbo](#turbo) rules.
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
  - `buildOptionalPluginConfig` is the builder shared by the presets that fold in a single plugin's flat config ([`src/nextjs.ts`](src/nextjs.ts), [`src/turbo-env.ts`](src/turbo-env.ts)): the package, the config path, the feature name for the error and an optional `files` scope go in, and the tri-state `enabled` behaviour comes out the same for each.
- [`src/react.ts`](src/react.ts)/[`src/nextjs.ts`](src/nextjs.ts) each export a `build*Config(options)` function: resolve the relevant optional peer(s) via `tryRequire`, extract their real flat config via `readFlatConfig`, and return an array of 0-or-more config blocks.
  - `[]` if unresolvable and not explicitly forced on; a thrown `Error` if explicitly forced on (`enabled: true`) and still unresolvable.
  - `react.ts`'s blocks are scoped to `files: ['**/*.jsx', '**/*.tsx']`; `nextjs.ts`'s upstream block is not (see [Optional React and Next.js support](#optional-react-and-nextjs-support) for why). `buildNextjsConfig` also takes this package's own plugin and adds the [server component boundary](#server-component-boundary) rule block after the upstream config, only when that resolves; the plugin is a parameter because `plugin.ts` builds `plugin.configs.nextjs` from `nextjs.ts`, and importing it back would make the two modules import each other.
- [`src/json-language-config.ts`](src/json-language-config.ts) is the shared groundwork for every rule that lints JSON files through `@eslint/json`, an optional peer.
  - `tryResolveJsonPlugin` and `requireJsonPlugin` are the silent and the throwing resolution paths, the second naming the feature that needs the peer and the install command.
  - `buildJsonLanguageBlock` assembles the `exadev` and `json` plugin registration for a `files` list under `json/json` or `json/jsonc`; the `json/jsonc` form also admits trailing commas, matching the JSONC config in [`src/json-canonical.ts`](src/json-canonical.ts). `JSONC_FILE_GLOBS` (`tsconfig*.json`, `turbo.json`, `*.jsonc`) lists the files that carry comments, so a rule targeting them must be wired under `json/jsonc`, and a rule meant for both languages declares both in `meta.languages`.
  - `buildPackageJsonKeyOrderConfig` and `buildWorkspaceArchitectureConfig` are built on it; a new JSON rule family follows the same shape, taking its tri-state `enabled` option from `exadevConfig` and choosing `requireJsonPlugin` (forced on) or `tryResolveJsonPlugin` (auto-detected).
- [`src/rules/file-scope.ts`](src/rules/file-scope.ts) lets a rule scope itself by filename, so it still behaves when a consumer wires it onto a wider `files` list.
  - `createFileScope(globs)` returns a `(filename, cwd) => boolean` matching the file relative to `cwd` in the same glob dialect as the workspace `packages` globs (braces, `*`, `?`, `[...]`, `**`, `!` excludes, wildcards never matching dot-prefixed names). A file outside `cwd` (its relative path starts with `..`) is never in scope, whatever the patterns. Build it once per `create()`.
  - `fileGlobsSchema` and `readFileGlobs` are the option schema and runtime validator for a glob list; a list needs at least one include and may not repeat a glob.
- [`src/rules/file-entry.ts`](src/rules/file-entry.ts) is the shared option handling for the per-file rules (`required-exports`, `required-imports`, `import-policy`, `filename-pattern`): `createEntryScope` widens a glob without a `/` to any depth on top of `createFileScope`, and the `read*` helpers validate entries and reject unknown keys.
- [`src/rules/specifier-match.ts`](src/rules/specifier-match.ts) matches import specifiers against patterns for `required-imports` and `import-policy`, reusing the path matcher `createPathMatcher` in `file-scope.ts`.
- [`src/import-policy.ts`](src/import-policy.ts) builds the `importPolicyConfig` block from the validated policies in [`src/rules/import-policy-options.ts`](src/rules/import-policy-options.ts), which the rule reads with the same reader.
- [`src/pure-modules.ts`](src/pure-modules.ts) builds the `pureModulesConfig` block: `files` becomes the block's `files` and `ignores`, and the rule options are read by [`src/rules/pure-module-options.ts`](src/rules/pure-module-options.ts), which also holds the ban lists. [`src/rules/pure-module.ts`](src/rules/pure-module.ts) reuses `moduleReferenceOf` from `import-policy.ts` so every import syntax is recognised the same way.
- [`src/test-hygiene.ts`](src/test-hygiene.ts) builds the `testHygieneConfig` blocks: it resolves the optional `@vitest/eslint-plugin` through `tryRequire`, checks the three rules it relies on exist, and emits the vitest rules and `exadev/injected-test-hygiene` per list of globs, plus `exadev/non-vacuous-guard` for guard files. Tests supply a plugin through `assembleTestHygieneConfig`, so the public options carry no resolver seam. [`src/config-globs.ts`](src/config-globs.ts) turns a validated glob list into a block's `files` and `ignores`, shared with the pure-module builder.
- [`src/markdown-headings.ts`](src/markdown-headings.ts) builds the `markdownHeadingsConfig` block. It resolves the optional `@eslint/markdown` through [`src/markdown-plugin.ts`](src/markdown-plugin.ts), which unwraps the ES module namespace `require()` returns the way `json-plugin.ts` does for `@eslint/json`, and fixes the language and the frontmatter option the rule depends on. [`src/rules/markdown-required-heading.ts`](src/rules/markdown-required-heading.ts) is typed against `@eslint/markdown`'s own rule definition, like the JSON rules.
- [`src/rules/file-reference.ts`](src/rules/file-reference.ts) is the option shape for a rule that reads another file: `{ path, relativeTo? }`, resolved against the linted file's directory (`file`, the default) or the workspace root (`root`, found the way the workspace architecture rules find it).
  - `readReferencedJson` parses the target as JSONC through [`src/rules/jsonc.ts`](src/rules/jsonc.ts) (comments, trailing commas and a leading byte order mark), returning `undefined` for a missing file and throwing, naming the path, for one that does not parse.
- [`src/turbo-config.ts`](src/turbo-config.ts) builds the turbo blocks (`buildTurboConfig` internally, `turboConfig` publicly) from the one shared options object in [`src/rules/turbo-options.ts`](src/rules/turbo-options.ts).
  - The pure decisions live in [`src/rules/turbo-checks.ts`](src/rules/turbo-checks.ts), independent of ESLint, so they are tested against plain maps; the rules are thin visitors over them. [`src/rules/turbo-json.ts`](src/rules/turbo-json.ts) reads the parts of a `turbo.json` the rules need and finds the root one, [`src/rules/turbo-workspace.ts`](src/rules/turbo-workspace.ts) lists the packages and their scripts, and [`src/rules/turbo-commands.ts`](src/rules/turbo-commands.ts) reads a script command for a delegation, the tasks it invokes, or a boundaries run.
  - Rules that read sibling and ancestor files take a `WorkspaceFs` through their factory, and their tests use [`src/rules/memory-fs.ts`](src/rules/memory-fs.ts), an in-memory implementation, rather than fixture trees on disk.
- [`src/tooling-wiring.ts`](src/tooling-wiring.ts) builds the `toolingWiringConfig` blocks: it turns the `publish`, `root` and `hooks` sections into the requirements of one `exadev/package-requirements` entry and the `toolConfigs` section into one block of the tool config rules over the union of their file scopes, each glob paired with the script extensions in a nested `files` array (flat config reads that as "both must match"). [`src/rules/package-requirements.ts`](src/rules/package-requirements.ts) reads the manifest facts, [`src/rules/package-requirements-checks.ts`](src/rules/package-requirements-checks.ts) holds the pure decisions and [`src/rules/package-requirements-options.ts`](src/rules/package-requirements-options.ts) the option schema and reader. Script requirements go through `checkScriptRequirements` in [`src/rules/workspace-requirements.ts`](src/rules/workspace-requirements.ts), shared with `required-scripts`.
- [`src/verify-eslint.ts`](src/verify-eslint.ts) is the out-of-band verifier. It loads `eslint` with a dynamic `import()` on first use, since the module is re-exported from the entry point every `eslint.config.ts` imports and only a verification run needs the Node API.
- [`src/rules/static-config.ts`](src/rules/static-config.ts) is the shared reader for the tool config rules. `createStaticConfig(program)` answers only what a config file's source states: which object literals the default export reaches, whether a key is `present`, `absent` or `opaque` (a later spread or non-literal computed key could supply it), and the literal a value stands for. [`src/rules/tool-config-options.ts`](src/rules/tool-config-options.ts) holds the option handling they share, and [`src/rules/vitest-test-objects.ts`](src/rules/vitest-test-objects.ts) finds the `test` objects of a Vitest config, projects included. `stryker-break-threshold` parses its `base` file with `@typescript-eslint/typescript-estree` and reads it through the same `createStaticConfig`.
- [`src/rules/compiler-option-values.ts`](src/rules/compiler-option-values.ts) is where `require-compiler-options` agrees with `tsc`. `tsconfigPathOf` finds the tsconfig a program was created from, and `readTsconfig` re-reads it, with the files it lists, because typescript-eslint overrides some options in its programs. TypeScript exports `computedOptions` (how it derives an effective option from the others) and `optionDeclarations` (every option with its documented default) at run time but not in its typings; this module reads them through `Reflect.get` and narrows with guards, converts a required value with the compiler's own `convertCompilerOptionsFromJson`, and throws when the installed compiler does not export them.
- [`src/rules/run-tracker.ts`](src/rules/run-tracker.ts) decides which lint carries a finding that belongs to a set of files rather than to one, so `require-compiler-options` reports once per run; it reads run boundaries from the order of the lints, as [Compiler options](#compiler-options) describes.
- [`src/rules/tsconfig-attribution.ts`](src/rules/tsconfig-attribution.ts) works out which tsconfig governs a linted file, attributing a program with no tsconfig to the one the file was last linted under while that tsconfig still lists it.
- [`src/create-config.ts`](src/create-config.ts) is config assembly's single source of truth.
  - `exadevConfig(options, ...userConfigs)` concatenates, in order: `buildGitignoreConfig`, `recommendedTypeChecked`, `jsdocAndTsdoc`, `jsonCanonicalConfig`, `stylisticCommentsConfig`, `buildReactConfig`, `buildNextjsConfig`, `buildPackageJsonKeyOrderConfig` (each tri-state builder fed its matching option), `buildWorkspaceArchitectureConfig` (only when `workspaceArchitecture` is given; there is no auto-detected default), `buildTurboConfig` (only when `turbo` is given, likewise), `buildImportPolicyConfig` (only when `importPolicies` is given, likewise), `buildPureModulesConfig` (only when `pureModules` is given, likewise), `buildTestHygieneConfig` (only when `testHygiene` is given, likewise), `buildMarkdownHeadingsConfig` (only when `markdownHeadings` is given, likewise), `buildToolingWiringConfig` (only when `toolingWiring` is given, likewise), and any trailing user configs.
  - `defaultConfig` is `exadevConfig()` evaluated once, eagerly, at module load.
- [`src/robustness-rules.ts`](src/robustness-rules.ts) holds `UNTYPED_ROBUSTNESS_RULES`, the core ESLint rules that need no type information, spread into both `plugin.configs.recommended` and the type-checked block so the two cannot drift apart.
- [`src/stylistic-comments.ts`](src/stylistic-comments.ts) builds `stylisticCommentsConfig`: the hand-picked `@stylistic/eslint-plugin` rules plus this package's own `exadev/prefer-doc-comment`, in two blocks (one scoped to every JS/TS file, one scoped to JSX files only for the three JSX-specific rules). See [Stylistic comment, class-member and JSX rules](#stylistic-comment-class-member-and-jsx-rules).
- [`src/index.ts`](src/index.ts) is the entry point, still a pure re-export barrel:
  ```ts
  export { defaultConfig as default, exadevConfig } from './create-config';
  export { importPolicyConfig } from './import-policy';
  export { markdownHeadingsConfig } from './markdown-headings';
  export { publicPlugin as plugin } from './plugin';
  export { pureModulesConfig } from './pure-modules';
  export { testHygieneConfig } from './test-hygiene';
  export { toolingWiringConfig } from './tooling-wiring';
  export { turboConfig } from './turbo-config';
  export { assertEslintConfig, verifyEslintConfig } from './verify-eslint';
  export { workspaceArchitectureConfig } from './workspace-architecture';
  export type { MarkdownFrontmatter, MarkdownHeadingsOptions } from './markdown-headings';
  export type { PureModulesOptions } from './pure-modules';
  export type { TestHygieneOptions } from './test-hygiene';
  export type { ImportConfine, ImportDeny, ImportExceptEdge, ImportPolicy } from './rules/import-policy-options';
  export type { FilenamePatternEntry } from './rules/filename-pattern';
  export type { RequiredHeading } from './rules/markdown-required-heading';
  export type { RequiredExportsEntry } from './rules/required-exports';
  export type { RequiredImportsEntry } from './rules/required-imports';
  export type { GroupSpec, NamingOptions, RankRule, RankSkipOptions, SliceSpec, WorkspaceArchitectureOptions } from './rules/workspace-options';
  export type {
    AllowedEdge,
    DependencyConstraint,
    ExemptTargetGroup,
    PackageSelector,
    PackageSelectorFields,
    RequiredFiles,
    RequiredScripts,
    ScriptContent,
    ScriptRequirement,
  } from './rules/workspace-constraint-options';
  export type { AggregateTaskOptions, AllowedBoundariesIgnore, BoundaryGroup, TaskGraphRequirement, TurboBoundariesOptions, TurboHygieneOptions, TurboOptions } from './rules/turbo-options';
  export type { TurboDelegate } from './rules/turbo-commands';
  ```
  - The named export is `publicPlugin`, not `plugin`'s own internal default export: `plugin` (src/plugin.ts) is typed against `@typescript-eslint/utils`' `TSESLint.FlatConfig.Plugin` for full rule-option checking while this package assembles it, then cast once, at the very end of that same file, to `PublicPlugin` (see `src/to-public-plugin.ts`) before re-export, mirroring how `defaultConfig` is built against the internal `ConfigArrayValue` and cast to `PublicConfigArray` at `exadevConfig`'s own boundary.
  - Required by `no-side-effects-in-index`/`no-non-barrel-reexport`, both of which assume this file contains nothing but `export ... from ...`.
  - All exports share one root module, so importing `{ plugin }` alone still resolves `typescript-eslint` via the sibling re-export — an accepted trade-off (an earlier separate-subpath split proved more awkward in practice).
  - React/Next.js support never adds to this cost: none of the four optional packages are ever statically imported, only passed as a runtime string to `createRequire`'s resolver, so their absence never affects module evaluation for a consumer who doesn't use them.
- [`pnpm-workspace.yaml`](pnpm-workspace.yaml) declares an empty `packages: []` — not a real workspace, just giving turbo a root for local task caching.

</details>

### Conventions

- [`eslint.config.ts`](eslint.config.ts) dogfoods this package's own factory export on itself (`import { exadevConfig } from './src/index'`), spreading `exadevConfig({ react: false, nextjs: false, ... })`, with the [tooling wiring](#tooling-wiring) preset on for the sections it uses. React and Next.js are forced off explicitly, not left to the plain auto-detecting default, since `eslint-plugin-react`/`@next/eslint-plugin-next` are real devDependencies of *this* repo (needed to test [`src/react.ts`](src/react.ts)/[`src/nextjs.ts`](src/nextjs.ts)'s own "package is resolvable" branch) even though this repo is neither a React nor a Next.js project. `no-side-effects-in-index` and `no-non-barrel-reexport` self-scope to [`src/index.ts`](src/index.ts) internally, so no `files`/`ignores` wiring is needed here. Plugin construction lives in [`src/plugin.ts`](src/plugin.ts) specifically so `src/index.ts` stays a pure re-export point.
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

Conventional commits drive [semantic-release](https://semantic-release.gitbook.io/semantic-release) on every push to `main`: version bump, `CHANGELOG.md`, GitHub Release, and npm publish via [OIDC trusted publishing](https://docs.npmjs.com/trusted-publishers) (no stored token). The release commit and tag are pushed over SSH with a repository deploy key that bypasses the `main` ruleset; the key is written to the runner's temporary directory only by the step directly before semantic-release (checkout does not receive it and persists no credentials) and removed afterwards, and the job's actions are pinned to commit SHAs. This narrows the key's exposure without isolating it: code run by an earlier step, or by semantic-release and its plugins from `node_modules`, can still reach it, so a credential that does not outlive the job (a short-lived GitHub App installation token) remains the complete fix. A second CI job republishes the identical build under the unscoped alias `exadev-eslint-config`.

## License

MIT
