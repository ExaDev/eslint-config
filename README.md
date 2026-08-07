# @exadev/eslint-config

[![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white)](https://github.com/ExaDev/eslint-config) [![npm](https://img.shields.io/badge/npm-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@exadev/eslint-config) [![Release](https://img.shields.io/github/v/release/ExaDev/eslint-config)](https://github.com/ExaDev/eslint-config/releases/latest) [![CI](https://img.shields.io/github/actions/workflow/status/ExaDev/eslint-config/ci.yml?branch=main)](https://github.com/ExaDev/eslint-config/actions)

> A real ESLint plugin (not a shareable config) exposing custom rules shared across ExaDev projects. Also published under the unscoped alias `exadev-eslint-config`.

## Why

Multiple ExaDev repos independently carried identical copies of a handful of custom ESLint rules (barrel/index discipline, re-export placement, pointless-alias detection). Keeping them as per-repo copies meant a bug fix in one rule had to be found, fixed, and re-verified separately in every repo it was copied into. This package is the single source of truth for those rules instead.

Only the *rules* are centralized here, not a consumer's whole `eslint.config.ts`. A repo's own file-scoping (`files`/`ignores`), tsconfig wiring, and any runtime-isomorphism import bans are genuinely project-specific -- forcing those into one shared config would mean either losing real per-project distinctions or building a heavily-parameterised config just to route around them. Each consumer keeps its own `eslint.config.ts`, importing rule implementations from here instead of a local copy.

## Getting started

Consumers need `eslint >=10.0.0` and `typescript-eslint >=8.0.0` as peer dependencies -- both required, not optional. Importing anything from this package, including the lighter `plugin` export described below, resolves `typescript-eslint`: the package's default export (the full type-checked bundle) and the `plugin` named export live in the same root module, and ESM/CJS module evaluation runs a module's entire top-level import graph regardless of which specific export the caller reads. See [Architecture](#architecture) for why that's an accepted trade-off rather than an oversight.

```sh
pnpm add -D @exadev/eslint-config typescript-eslint eslint
```

The default export is the full, type-checked ruleset: typescript-eslint's own `recommendedTypeChecked` + `stylisticTypeChecked` presets, the `exadev/barrel-policy` umbrella rule at its recommended `mode: 'banned'` (no index files at all -- see [Barrel policy](#barrel-policy)), `exadev/no-pointless-reassignment`, `linterOptions.noInlineConfig`, `@typescript-eslint/consistent-type-assertions` banning all type assertions, and `@typescript-eslint/ban-ts-comment` banning `@ts-expect-error` outright alongside the preset's own existing `@ts-ignore`/`@ts-nocheck` bans -- the last two relaxed automatically in `*.test.ts`/`*.spec.ts` files (see below). Spread it directly into `tseslint.config(...)`:

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

**A published package whose `src/index.ts` is its package entry point overrides the default `banned` policy to `single` in one line** (flat-config later blocks override earlier rule settings), since deleting its barrel would break every downstream importer:

```ts
  ...exadev,
  { rules: { 'exadev/barrel-policy': ['error', { mode: 'single' }] } }, // this package keeps its barrel
```



`recommendedTypeChecked` already subsumes typescript-eslint's own plain `recommended` outright -- every one of its 46 rules is a strict subset of `recommendedTypeChecked`'s 73, confirmed by inspecting the actual rule maps. This is a real bundling, not a rule reference that assumes you already have typescript-eslint registered: `recommendedTypeChecked`'s own base config registers the `@typescript-eslint` plugin and sets `languageOptions.parser` itself. That is exactly why **you must remove your own `...tseslint.configs.recommended`/`recommendedTypeChecked`/`stylisticTypeChecked` spreads** rather than keep them alongside this -- ESLint flat config rejects two different plugin object instances registered under the same namespace. What you still supply yourself is `languageOptions.parserOptions.project`/`projectService` pointing at your own tsconfig(s); this bundle's base config never sets that, since it's genuinely project-specific.

**Test files (`**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`) get two narrow relaxations of this package's own additions above, and only those two.** A compile-time-only `@ts-expect-error` proving a construct genuinely fails to type-check is a well-established, legitimate test pattern -- TypeScript's own "unused `@ts-expect-error` directive" diagnostic already catches one that stops being needed, independent of this rule -- so a test file reverts to the rule's own pre-ban default, `allow-with-description`, rather than the outright ban. `@ts-ignore`/`@ts-nocheck` stay banned even in test files: `@ts-expect-error` is strictly better for both, so there's no legitimate test-specific reason to reach for either. `consistent-type-assertions` relaxes to `assertionStyle: 'as'` in test files -- letting a test construct a partial/stub value with a real `as` assertion where the full type wouldn't otherwise accept it -- while the legacy angle-bracket `<Type>value` form stays banned everywhere, tests included. Nothing inherited from `recommendedTypeChecked`/`stylisticTypeChecked` itself is relaxed in test files; only this package's own two additions are.

### The lighter option: the `plugin` named export

For a project that wants only this package's own rules -- without the full type-checked bundle, e.g. one already running its own separate type-aware setup -- import the named `plugin` export instead and wire the rules individually:

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
    extends: ['exadev/recommended'], // this plugin's own four rules, plus linterOptions.noInlineConfig -- no type-checked rules at all
    // or: extends: ['exadev/barrel'], // just the barrel-discipline trio (no-non-barrel-index, no-non-barrel-reexport, no-side-effects-in-index)
  },
]);
```

`typescript-eslint`'s own `tseslint.config()` helper (rather than ESLint's `defineConfig()`) does **not** accept the string form of `extends` at all -- it throws `has an 'extends' array that contains a string ... This is a feature of eslint's defineConfig() helper and is not supported by typescript-eslint`. A `tseslint.config()`-based project passes the config value directly instead:

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

**`plugin.configs.recommended`/`plugin.configs.barrel` carry no `files`/`ignores` of their own, and are safe to apply unscoped anyway -- the two rules that care which file they're looking at (`no-side-effects-in-index`, `no-non-barrel-reexport`) each check `context.filename` themselves, the same self-scoping pattern `no-non-barrel-index` already used.** `no-side-effects-in-index` no-ops on every file except `src/index.ts`, since it has no legitimate target anywhere else; `no-non-barrel-reexport` no-ops specifically on `src/index.ts`, since a real single-statement re-export there is the intended, normal shape. An earlier version of this package lacked that self-scoping and genuinely misfired when `recommended`/`barrel` were applied without an external `files: ['src/index.ts']`/`ignores: ['src/index.ts']` wrapper -- 88 false-positive errors on a single real source file in a repo that tried it, since `no-side-effects-in-index` flagged every ordinary `export function`/`export const`/`export interface` declaration it saw. That's fixed at the rule level now, not documented around.

The one thing self-scoping can't know on your behalf is a barrel that lives somewhere other than `src/index.ts`, or a project-specific exception beyond the barrel (an extra file you want exempt from the re-export ban). For either of those, layer an additional override on top of `recommended`/`barrel` -- e.g. `{ files: ['lib/other-legacy-reexport.ts'], rules: { 'exadev/no-non-barrel-reexport': 'off' } }` -- rather than falling back to wiring all four rules individually, which is still fine but no longer required for the common case.

`plugin.configs.recommended`/`plugin.configs.barrel` are not usable without `typescript-eslint` installed, even though neither config itself references it: `plugin` is a named export sharing its root module with the default export, so `typescript-eslint` resolves the moment anything is imported from `@exadev/eslint-config` at all -- see [Architecture](#architecture) for the trade-off this reflects.

## Rules

| Rule | Fixable | Description |
| --- | --- | --- |
| `barrel-policy` | | The umbrella rule over the four barrel rules below: one `{ mode }` option selecting a whole index-file policy. See [Barrel policy](#barrel-policy). |
| `no-index-files` | | Bans any `index.*` file outright (mode 1). The strictest policy. |
| `no-non-barrel-index` | | Only `src/index.ts` may be named `index.*` -- any other module named `index.ts`/`.js`/etc would be silently selected by a consumer's bare directory import. |
| `no-non-barrel-reexport` | ✓ | Re-exports belong only in a barrel. Catches the split form across two statements (`import { x } from './y'; export { x };` or `export default x;`) which no AST selector alone can match. The autofix deletes the offending export, and the now-pointless import alongside it whenever that export was the import's only use anywhere in the file. Self-scopes away from any index file (not just `src/index.ts`). |
| `no-side-effects-in-index` | | A barrel (index) file may contain only re-export statements -- nothing that could execute at import time. Self-scopes to any index file. |
| `barrel-direct-siblings-only` | | A barrel may re-export only from a direct sibling file or folder (`./module`), never a nested path, a parent, or a bare package specifier (mode 3). |
| `no-pointless-reassignment` | ✓ | `const foo = bar` where both sides are plain identifiers and the alias adds no transformation. |

## Barrel policy

`exadev/barrel-policy` is the convenience layer over the four granular barrel rules: one rule id, one `{ mode }` option selecting one of three complete index-file policies, so a consumer writes a single config entry instead of wiring several rules together. A consumer uses EITHER this umbrella (one line, opinionated) OR the individual rules above (full control, e.g. `single` plus one extra cross-package re-export exception); not both, since they would double-report.

| `mode` | Which files may be barrels | What a barrel may contain | Where a barrel's re-exports may come from |
| --- | --- | --- | --- |
| `'banned'` (the default/recommended) | none | — | — |
| `'single'` | exactly `src/index.ts` | only re-exports | anywhere |
| `'siblings'` | any `index.ts` | only re-exports | a direct sibling only (`./module`) |

In every mode, re-exports are banned in any file that is not a permitted barrel, and a permitted barrel may contain only re-export statements (no functional code). `'banned'` is the default the bundled configs ship; a published package whose `src/index.ts` is its package entry point overrides to `'single'` (see [Getting started](#getting-started)). The umbrella composes the identical predicates the standalone rules use (shared in `src/rules/barrel-helpers.ts`), so the convenience rule and the granular ones never drift apart. It is non-fixable -- the autofix lives on `no-non-barrel-reexport` -- so consumers who want the autofix use that granular rule directly.

## Build, test, and lint

```sh
pnpm install    # requires Node >=20 and pnpm 11.6.0 (pinned via packageManager)
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Each rule has a co-located `*.test.ts` file (`src/rules/no-non-barrel-index.test.ts` etc.) exercising it with ESLint's own `RuleTester`, run under Vitest. `vitest.setup.ts` wires `RuleTester.describe`/`RuleTester.it`/`RuleTester.itOnly` to Vitest's own `describe`/`it` explicitly, rather than turning on Vitest's `test.globals` project-wide, since `RuleTester.run()` only calls `describe`/`it` if something has supplied them. Each test file constructs its own `RuleTester` with `languageOptions.parser` set to `typescript-eslint`'s parser, since these rules' realistic test fixtures use TypeScript-only syntax (e.g. `export type { X } from './y'`) that the default `espree` parser can't read; none of the rules need type information, so no `project`/`tsconfigRootDir` is configured. The barrel rules share their core predicates and the split-statement re-export detector via `src/rules/barrel-helpers.ts`, exercised both through each granular rule's own tests and through `barrel-policy.test.ts`'s per-mode coverage.

`pnpm test` always measures coverage (`coverage.enabled: true` in `vitest.config.ts`, via `@vitest/coverage-v8`) rather than needing a separate `--coverage` flag -- scoped to `src/**/*.ts` excluding the `*.test.ts` files themselves. The text reporter summarises in the terminal; the `html`/`lcov` reporters land in `coverage/`, already gitignored alongside `.eslintcache` and `dist/`.

The `lint`/`typecheck`/`test`/`build` npm scripts are thin wrappers around turbo tasks whose own names carry a leading underscore (`_lint`/`_typecheck`/`_test`/`_build`, declared in `turbo.json`) -- run `pnpm build`, not `turbo run build` directly, since turbo's task names don't match the npm script names.

`pnpm build` runs `tsdown` from the single `src/index.ts` entry, bundling the whole module graph (`plugin.ts`, `recommended-type-checked.ts`, and every rule under `src/rules/`) into one ESM output and one CJS output plus declaration files (platform-neutral). Before any publish -- local or the CI alias job -- `prepublishOnly` re-runs lint, typecheck, `test`, `tsdown`, `publint`, and `attw --pack`, so a broken export shape fails at publish time even outside the main CI pipeline.

## Architecture

`src/plugin.ts` builds an `ESLint.Plugin` object (ESLint's own `ESLint.Plugin` type, not a hand-written interface) combining the rule modules under `src/rules/` into a flat `rules` map. `configs.recommended` and `configs.barrel` are defined as getters directly in the object literal, not attached after construction: each needs to reference the fully-built `plugin` object itself (`plugins: { exadev: plugin }`), which a plain property initializer can't do for its own binding while it's still being constructed. A getter closes over the `plugin` binding rather than its value, so it resolves correctly the moment a consumer actually reads the property, by which point construction has finished -- no `Object.assign`, no post-construction mutation, no null-checked destructure needed. `recommended` ships the `barrel-policy` umbrella at `mode: 'banned'`; `barrel` ships it at `mode: 'single'`.

`src/recommended-type-checked.ts` bundles typescript-eslint's own `recommendedTypeChecked` + `stylisticTypeChecked` presets alongside this plugin's own rules into a flat config array. Its own value must specifically be typed as an array, not the wider `NonNullable<ESLint.Plugin['configs']>[string]` union (`LegacyConfigObject | ConfigObject | ConfigObject[]`) `plugin.ts`'s own `configs.recommended`/`configs.barrel` correctly use: that union isn't guaranteed to be an array, so annotating an always-array value with it broke `...exadev`, the way every real consumer spreads this default export, with `TS2488: Type '...' must have a '[Symbol.iterator]()' method`. `ConfigArrayValue = Extract<ConfigValue, unknown[]>` narrows to the array-only member of the identical union -- still derived from ESLint's own `Plugin` type (never typescript-eslint's own narrower internal element type, `CompatibleConfig`, which has no `plugins` field), per this codebase's "don't hand-type external libraries" convention.

`src/index.ts` is the public entry point: `export { default } from './recommended-type-checked'; export { default as plugin } from './plugin';` -- a genuine pure re-export barrel with a default export and one named export, not just a single re-export. An earlier version of this package kept `recommended-type-checked` as a genuinely separate npm subpath (`@exadev/eslint-config/recommended-type-checked`), specifically so importing the main entry point never resolved `typescript-eslint` at all for a plain-JS consumer. Two module specifiers for one package turned out more awkward in practice than the alternative: `typescript-eslint` is now a required (not optional) peer dependency of the whole package, and both `plugin` and the default export live in the same root module -- ESM/CJS module evaluation runs a module's entire top-level import graph regardless of which specific export the caller reads, so importing `{ plugin }` alone still resolves `typescript-eslint` via the *other* re-export statement in the same file. This is an accepted, deliberate trade-off (see [Getting started](#getting-started)), not something a future fix should try to undo without weighing the same two-entry-point cost that made the earlier split feel worse.

`pnpm-workspace.yaml` deliberately declares an empty `packages: []`. This is not a real multi-package pnpm workspace; its only purpose is giving turbo a workspace root to anchor local task caching against, matching the same single-package-workspace pattern used across this repo family.

## Conventions

`eslint.config.ts` dogfoods this package's own default export on itself, importing `./src/index` by relative path rather than as an installed dependency, and spreading it (`...exadevRecommendedTypeChecked`) exactly as a real consumer would -- the live proof that the spread typechecks and behaves correctly against this repo's own `src/index.ts` barrel and `src/plugin.ts` non-barrel module. `no-side-effects-in-index` and `no-non-barrel-reexport` (both bundled in) self-scope to `src/index.ts` internally, so no `files`/`ignores` wiring is needed for them here either. The plugin-construction logic lives in `src/plugin.ts` specifically so `src/index.ts` can stay a pure re-export point both rules assume.

`tsconfig.json` enables `verbatimModuleSyntax` (type-only imports/exports must use `import type`/`export type` explicitly -- enforced too by the `consistent-type-imports` eslint rule) and `noUncheckedIndexedAccess` (indexed access returns `T | undefined`, narrow before use rather than asserting).

Conventional commits are enforced by commitlint, restricted to the type-enum defined once in `release.config.ts`'s `commitTypes` -- both commitlint's allowed types and semantic-release's commit-analyzer release rules derive from that single list, so a commit type can't trigger a release without also being accepted by commit-msg validation, or the reverse.

## Gotchas and quirks

- `.attw.json` ignores the `false-export-default` rule: tsdown/rolldown's CJS output for this plugin's sole default export doesn't emit the `export =` form `arethetypeswrong`'s check wants under legacy `node10` resolution. The resolution modes an ESLint flat config actually uses (`node16`, `bundler`) are unaffected, so the rule is suppressed rather than moving the plugin away from ESLint's own documented default-export shape.
- `src/index.ts` mixing a default export with a named one (`plugin`) triggers rolldown's own `MIXED_EXPORTS` build warning: Node's *native* `import()` of the built `.cjs` file does not respect the `__esModule` marker TypeScript/bundler interop helpers use, so a raw `require('@exadev/eslint-config').default` differs from what a TS-compiled or bundler-mediated `import exadev from '@exadev/eslint-config'` resolves to. Confirmed empirically (packing the tarball and installing it as a real dependency in a `"type": "module"` project): the actual consumer path -- ESM `import` -- resolves both the default export and `plugin` correctly; only a hypothetical direct-`require()` CommonJS consumer would see the raw exports object instead. No current consumer of this package is CommonJS, and both `attw --pack` and `publint` report no problems, so the warning is accepted (see `tsdown.config.ts`'s own top-of-file comment) rather than restructuring the build for a consumer that doesn't exist.
- Husky hooks: `pre-commit` runs lint-staged (`eslint --fix` on staged `*.ts`), `commit-msg` runs commitlint against the message, `pre-push` runs `typecheck`, `test`, and `build` -- pushing here re-runs the whole test suite and rebuilds the package first.
- The CI release job sets `HUSKY=0` (so the commit-msg hook never fires against the automated release commit) and blanks `NPM_TOKEN`/`NODE_AUTH_TOKEN` explicitly rather than omitting them, so an inherited token can't win over npm's OIDC trusted-publishing exchange.

## Contributing

Conventional commits are enforced by commitlint via a husky `commit-msg` hook, and re-checked in CI. CI runs commitlint, lint, and typecheck+test+build+attw on every push and pull request; the release job only runs on a push to `main`, after all three pass.

## Release

Conventional commits drive [semantic-release](https://semantic-release.gitbook.io/semantic-release) on every push to `main`: version bump, `CHANGELOG.md`, GitHub Release, and an npm publish via OIDC trusted publishing (no stored token). A second CI job then republishes the identical build under the unscoped alias `exadev-eslint-config`.

## License

MIT
