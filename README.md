# @exadev/eslint-config

[![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white)](https://github.com/ExaDev/eslint-config) [![npm](https://img.shields.io/badge/npm-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@exadev/eslint-config) [![Release](https://img.shields.io/github/v/release/ExaDev/eslint-config)](https://github.com/ExaDev/eslint-config/releases/latest) [![CI](https://img.shields.io/github/actions/workflow/status/ExaDev/eslint-config/ci.yml?branch=main)](https://github.com/ExaDev/eslint-config/actions)

> A real ESLint plugin (not a shareable config) exposing custom rules shared across ExaDev projects. Also published under the unscoped alias `exadev-eslint-config`.

## Why

Multiple ExaDev repos carried identical copies of a handful of custom ESLint rules (barrel/index discipline, re-export placement, pointless-alias detection). This package is the single source of truth for those rules. Only the *rules* are centralized -- not a consumer's whole `eslint.config.ts`, since file-scoping, tsconfig wiring, and runtime-isomorphism import bans are genuinely project-specific. Each consumer keeps its own `eslint.config.ts`, importing rule implementations from here.

## Getting started

Consumers need `eslint >=10.0.0` and `typescript-eslint >=8.0.0` as required peer dependencies. Importing anything from this package resolves `typescript-eslint`, since both the default export and `plugin` share the same root module -- ESM/CJS module evaluation runs a module's entire top-level import graph regardless of which export the caller reads (see [Architecture](#architecture)).

```sh
pnpm add -D @exadev/eslint-config typescript-eslint eslint
```

The default export is the full, type-checked ruleset: typescript-eslint's `recommendedTypeChecked` + `stylisticTypeChecked` presets, `exadev/barrel-policy` at `mode: 'banned'` (see [Barrel policy](#barrel-policy)), `exadev/no-object-assign`, `exadev/no-mutable-union-array-param`, `exadev/no-enum-number-widening`, `exadev/no-pointless-reassignment`, `linterOptions.noInlineConfig`, `@typescript-eslint/consistent-type-assertions` banning all type assertions, `@typescript-eslint/ban-ts-comment` banning `@ts-expect-error` outright, and `@typescript-eslint/method-signature-style` set to `'property'` (method-shorthand signatures are checked bivariantly under `strictFunctionTypes`, which is unsound) -- the type-assertion and ts-comment rules are relaxed in test files (see below). Spread it directly into `tseslint.config(...)`:

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

**A published package whose `src/index.ts` is its package entry point overrides `banned` to `single` in one line** (flat-config later blocks override earlier rule settings), since deleting its barrel would break every downstream importer:

```ts
  ...exadev,
  { rules: { 'exadev/barrel-policy': ['error', { mode: 'single' }] } }, // this package keeps its barrel
```

`recommendedTypeChecked` subsumes typescript-eslint's plain `recommended` outright (every rule in `recommended` is also present in `recommendedTypeChecked`), and its base config registers the `@typescript-eslint` plugin and sets `languageOptions.parser` itself. That is why **you must remove your own `...tseslint.configs.recommended`/`recommendedTypeChecked`/`stylisticTypeChecked` spreads** -- flat config rejects two different plugin object instances registered under the same namespace. You still supply `languageOptions.parserOptions.project`/`projectService` pointing at your own tsconfig(s).

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
    extends: ['exadev/recommended'], // this plugin's own non-type-aware rules, plus linterOptions.noInlineConfig -- no type-checked rules at all
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

**`plugin.configs.recommended`/`plugin.configs.barrel` carry no `files`/`ignores` and are safe unscoped** -- `no-side-effects-in-index` and `no-non-barrel-reexport` each check `context.filename` themselves (self-scoping). For a barrel not at `src/index.ts`, or a project-specific exception, layer an override on top (e.g. `{ files: ['lib/other.ts'], rules: { 'exadev/no-non-barrel-reexport': 'off' } }`) rather than wiring all four rules individually.

## Rules

| Rule | Fixable | Description |
| --- | --- | --- |
| `barrel-policy` | | Umbrella over the four barrel rules below: one `{ mode }` option selecting a whole index-file policy. See [Barrel policy](#barrel-policy). |
| `no-index-files` | | Bans any `index.*` file outright (mode 1). The strictest policy. |
| `no-non-barrel-index` | | Only `src/index.ts` may be named `index.*` -- any other `index.ts`/`.js`/etc would be silently selected by a consumer's bare directory import. |
| `no-non-barrel-reexport` | ✓ | Re-exports belong only in a barrel. Catches the split form across two statements (`import { x } from './y'; export { x };` or `export default x;`) which no AST selector alone can match. Autofix deletes the export and the now-pointless import when it was the import's only use. Self-scopes away from any index file. |
| `no-side-effects-in-index` | | A barrel file may contain only re-export statements -- nothing that could execute at import time. Self-scopes to any index file. |
| `barrel-direct-siblings-only` | | A barrel may re-export only from a direct sibling (`./module`), never a nested path, parent, or bare package specifier (mode 3). |
| `no-pointless-reassignment` | ✓ | `const foo = bar` where both sides are plain identifiers and the alias adds no transformation. Autofix rewrites every read to the original name and deletes the declaration (including its `export` keyword, when exported). Still reported but deliberately not auto-fixable where collapsing the alias would change meaning: an explicit type annotation (`const exhaustive: never = item` -- the annotation is the point), a read where the original name is shadowed, a read as a shorthand object property, more than one declarator in the statement, or a source that is written to anywhere. |
| `no-object-assign` | ✓/suggestion | `Object.assign` does not check a source object's properties against the target's declared types, unlike object spread. A fresh object-literal target autofixes to `{ ...target, ...source }`; mutating an existing reassignable binding offers a suggestion only (changes the object's identity); a `const` binding or a non-statement call site gets a plain report with no fix. |
| `no-mutable-union-array-param` | ✓ | A function parameter typed as an array of a union (`(string \| number)[]`) accepts a narrower caller array (`number[]`) by covariance; calling `push`/`unshift`/`splice`/`fill`/`copyWithin` on it can then insert a value the caller's own array was never declared to hold. Autofix marks the parameter `readonly`, turning the mutating call into a real compile error to resolve deliberately. Requires no type information. |
| `no-enum-number-widening` | | A bare (non-literal) `number` is accepted anywhere a numeric enum is expected, without checking it is actually one of the enum's members -- only a numeric *literal* gets range-checked by `tsc`. No autofix: the only provably safe fix is a genuine runtime membership check against the enum's own values, which is a behavioural choice a mechanical fix cannot responsibly make. Requires type information -- only in the default (type-checked) export, not `plugin.configs.recommended`. |

## Barrel policy

`exadev/barrel-policy` is the convenience layer: one rule id, one `{ mode }` option selecting a complete index-file policy. Use EITHER this umbrella OR the individual rules (not both -- they double-report).

| `mode` | Which files may be barrels | What a barrel may contain | Where re-exports may come from |
| --- | --- | --- | --- |
| `'banned'` (default/recommended) | none | — | — |
| `'single'` | exactly `src/index.ts` | only re-exports | anywhere |
| `'siblings'` | any `index.ts` | only re-exports | a direct sibling only (`./module`) |

In every mode, re-exports are banned outside a permitted barrel, and a permitted barrel may contain only re-export statements. The umbrella composes the identical predicates the standalone rules use (shared in `src/rules/barrel-helpers.ts`). It is non-fixable -- the autofix lives on `no-non-barrel-reexport`.

## Build, test, and lint

```sh
pnpm install    # requires Node >=20 and pnpm 11.6.0 (pinned via packageManager)
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Each rule has a co-located `*.test.ts` exercising it with ESLint's `RuleTester` under Vitest. `vitest.setup.ts` wires `RuleTester.describe`/`.it`/`.itOnly` to Vitest's `describe`/`it` explicitly (no `test.globals`). Each test uses typescript-eslint's parser for TypeScript-only fixtures; none need type information.

`pnpm test` always measures coverage (`@vitest/coverage-v8`), scoped to `src/**/*.ts` excluding `*.test.ts`. Text output in terminal; `html`/`lcov` in `coverage/` (gitignored alongside `.eslintcache` and `dist/`).

The `lint`/`typecheck`/`test`/`build` npm scripts wrap turbo tasks named `_lint`/`_typecheck`/`_test`/`_build` -- run `pnpm build`, not `turbo run build`.

`pnpm build` runs `tsdown` from `src/index.ts`, bundling the whole module graph into ESM + CJS + declarations. `prepublishOnly` re-runs lint, typecheck, `test`, `tsdown`, `publint`, and `attw --pack`.

## Architecture

`src/plugin.ts` builds an `ESLint.Plugin` (ESLint's own type) combining `src/rules/` into a flat `rules` map. `configs.recommended` and `configs.barrel` are getters in the object literal -- each references the fully-built `plugin` (`plugins: { exadev: plugin }`), which a plain property initializer can't do mid-construction. `recommended` ships `barrel-policy` at `mode: 'banned'`; `barrel` at `mode: 'single'`.

`src/recommended-type-checked.ts` bundles typescript-eslint's `recommendedTypeChecked` + `stylisticTypeChecked` alongside this plugin's rules into a flat config array. Its value is typed as `ConfigArrayValue = Extract<ConfigValue, unknown[]>` (the array-only member of ESLint's own config-value union), because annotating with the wider union broke `...exadev` with `TS2488`.

`src/index.ts` is the entry point: `export { default } from './recommended-type-checked'; export { default as plugin } from './plugin';`. Both exports share one root module, so importing `{ plugin }` alone still resolves `typescript-eslint` via the sibling re-export -- an accepted trade-off (an earlier separate-subpath split proved more awkward in practice).

`pnpm-workspace.yaml` declares an empty `packages: []` -- not a real workspace, just giving turbo a root for local task caching.

## Conventions

`eslint.config.ts` dogfoods the default export on itself (`import exadev from './src/index'`), spreading it exactly as a real consumer would. `no-side-effects-in-index` and `no-non-barrel-reexport` self-scope to `src/index.ts` internally, so no `files`/`ignores` wiring is needed here. Plugin construction lives in `src/plugin.ts` specifically so `src/index.ts` stays a pure re-export point.

`tsconfig.json` enables `verbatimModuleSyntax` (`import type`/`export type` required for type-only imports -- also enforced by `consistent-type-imports`) and `noUncheckedIndexedAccess` (narrow indexed access before use rather than asserting).

Conventional commits are enforced by commitlint, restricted to the type-enum defined once in `release.config.ts`'s `commitTypes` -- both commitlint and semantic-release derive from that single list.

## Gotchas and quirks

- `.attw.json` ignores `false-export-default`: tsdown/rolldown's CJS output for this plugin's sole default export doesn't emit the `export =` form `arethetypeswrong` wants under legacy `node10` resolution. The modes ESLint flat config uses (`node16`, `bundler`) are unaffected, so the rule is suppressed rather than changing the default-export shape.
- `src/index.ts` mixing a default export with a named one triggers rolldown's `MIXED_EXPORTS` warning: a raw CommonJS `require()` would see the raw exports object instead of the default. ESM `import` (the actual consumer path) resolves both correctly; `attw --pack` and `publint` report no problems, so the warning is accepted (see `tsdown.config.ts`).
- Husky hooks: `pre-commit` runs lint-staged (`eslint --fix` on staged `*.ts`), `commit-msg` runs commitlint, `pre-push` runs typecheck + test + build.
- The CI release job sets `HUSKY=0` (commit-msg hook skips the automated release commit) and blanks `NPM_TOKEN`/`NODE_AUTH_TOKEN` explicitly so an inherited token can't win over OIDC trusted publishing.

## Contributing

Conventional commits are enforced by a husky `commit-msg` hook and re-checked in CI. CI runs commitlint, lint, and typecheck+test+build+attw on every push and pull request; the release job runs only on push to `main`, after all pass.

## Release

Conventional commits drive [semantic-release](https://semantic-release.gitbook.io/semantic-release) on every push to `main`: version bump, `CHANGELOG.md`, GitHub Release, and npm publish via OIDC (no stored token). A second CI job republishes the identical build under the unscoped alias `exadev-eslint-config`.

## License

MIT
