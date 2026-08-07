# @exadev/eslint-config

[![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white)](https://github.com/ExaDev/eslint-config) [![npm](https://img.shields.io/badge/npm-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@exadev/eslint-config) [![Release](https://img.shields.io/github/v/release/ExaDev/eslint-config)](https://github.com/ExaDev/eslint-config/releases/latest) [![CI](https://img.shields.io/github/actions/workflow/status/ExaDev/eslint-config/ci.yml?branch=main)](https://github.com/ExaDev/eslint-config/actions)

> A real ESLint plugin (not a shareable config) exposing custom rules shared across ExaDev projects. Also published under the unscoped alias `exadev-eslint-config`.

## Why

Multiple ExaDev repos independently carried identical copies of a handful of custom ESLint rules (barrel/index discipline, re-export placement, pointless-alias detection). Keeping them as per-repo copies meant a bug fix in one rule had to be found, fixed, and re-verified separately in every repo it was copied into. This package is the single source of truth for those rules instead.

Only the *rules* are centralized here, not a consumer's whole `eslint.config.ts`. A repo's own file-scoping (`files`/`ignores`), tsconfig wiring, and any runtime-isomorphism import bans are genuinely project-specific -- forcing those into one shared config would mean either losing real per-project distinctions or building a heavily-parameterised config just to route around them. Each consumer keeps its own `eslint.config.ts`, importing rule implementations from here instead of a local copy.

## Getting started

Consumers need `eslint >=10.0.0` as a peer dependency. `typescript-eslint >=8.0.0` is also a peer dependency, but an *optional* one (`peerDependenciesMeta`) -- it's only needed by the `recommended-type-checked` entry point described below, not by the package as a whole. A plain-JS project with no TypeScript at all can install and use this package with nothing else added.

```sh
pnpm add -D @exadev/eslint-config
```

```ts
// eslint.config.ts
import exadev from '@exadev/eslint-config';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // ...your own config...
  {
    files: ['src/**/*.ts'],
    ignores: ['src/index.ts'],
    plugins: { exadev },
    rules: {
      'exadev/no-non-barrel-reexport': 'error',
    },
  },
);
```

Or use one of the bundled configs to enable a whole set at once:

```ts
import exadev from '@exadev/eslint-config';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    files: ['**/*.ts'],
    plugins: { exadev },
    extends: ['exadev/recommended'], // this plugin's own four rules, plus linterOptions.noInlineConfig -- no TypeScript involvement at all
    // or: extends: ['exadev/barrel'], // just the barrel-discipline trio (no-non-barrel-index, no-non-barrel-reexport, no-side-effects-in-index)
  },
]);
```

`typescript-eslint`'s own `tseslint.config()` helper (rather than ESLint's `defineConfig()`) does **not** accept the string form of `extends` at all -- it throws `has an 'extends' array that contains a string ... This is a feature of eslint's defineConfig() helper and is not supported by typescript-eslint`. A `tseslint.config()`-based project passes the config value directly instead:

```ts
import exadev from '@exadev/eslint-config';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // ...your own config...
  {
    files: ['**/*.ts'],
    plugins: { exadev },
    extends: [exadev.configs.recommended], // or exadev.configs.barrel
  },
);
```

**`recommended`/`barrel` carry no `files`/`ignores` of their own, and are safe to apply unscoped anyway -- the two rules that care which file they're looking at (`no-side-effects-in-index`, `no-non-barrel-reexport`) each check `context.filename` themselves, the same self-scoping pattern `no-non-barrel-index` already used.** `no-side-effects-in-index` no-ops on every file except `src/index.ts`, since it has no legitimate target anywhere else; `no-non-barrel-reexport` no-ops specifically on `src/index.ts`, since a real single-statement re-export there is the intended, normal shape. An earlier version of this package lacked that self-scoping and genuinely misfired when `recommended`/`barrel` were applied without an external `files: ['src/index.ts']`/`ignores: ['src/index.ts']` wrapper -- 88 false-positive errors on a single real source file in a repo that tried it, since `no-side-effects-in-index` flagged every ordinary `export function`/`export const`/`export interface` declaration it saw. That's fixed at the rule level now, not documented around.

The one thing self-scoping can't know on your behalf is a barrel that lives somewhere other than `src/index.ts`, or a project-specific exception beyond the barrel (an extra file you want exempt from the re-export ban). For either of those, layer an additional override on top of `recommended`/`barrel` -- e.g. `{ files: ['lib/other-legacy-reexport.ts'], rules: { 'exadev/no-non-barrel-reexport': 'off' } }` -- rather than falling back to wiring all four rules individually, which is still fine but no longer required for the common case.

Both `recommended` and `barrel` are usable in a plain JavaScript project with no TypeScript and no `typescript-eslint` installed: this plugin's own four rules operate on plain ESTree import/export/declaration nodes, nothing TypeScript-specific, and neither config references `typescript-eslint` at all.

### The typed-linting bundle: `@exadev/eslint-config/recommended-type-checked`

For a TypeScript project that wants the full typed-linting baseline bundled in, import the separate `recommended-type-checked` entry point instead of using `configs.recommended`:

```ts
// eslint.config.ts
import exadevRecommendedTypeChecked from '@exadev/eslint-config/recommended-type-checked';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    languageOptions: {
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
  },
  ...exadevRecommendedTypeChecked,
  // ...your own config on top...
);
```

This bundles `typescript-eslint`'s own `recommendedTypeChecked` and `stylisticTypeChecked` presets (`recommendedTypeChecked` already subsumes plain `recommended` outright -- every one of its 46 rules is a strict subset of `recommendedTypeChecked`'s 73, confirmed by inspecting the actual rule maps) alongside this plugin's own four rules, `linterOptions.noInlineConfig`, `@typescript-eslint/consistent-type-assertions` set to `never` (no `as`/angle-bracket type assertions -- narrow with a guard or parse with Zod instead), and `@typescript-eslint/ban-ts-comment` raised to ban `@ts-expect-error` outright alongside the preset's own existing `@ts-ignore`/`@ts-nocheck` bans -- with `noInlineConfig` already removing `eslint-disable` as an escape hatch, this leaves no way to suppress a type error inline anywhere in a consuming project.

It's a real bundling, not a rule reference that assumes the consumer already has `typescript-eslint` set up: `recommendedTypeChecked`'s own base config registers the `@typescript-eslint` plugin and sets `languageOptions.parser` itself. **A consumer adopting this bundle must remove its own `...tseslint.configs.recommended`/`recommendedTypeChecked`/`stylisticTypeChecked` spreads** rather than keep them alongside it -- ESLint flat config rejects two different plugin object instances registered under the same namespace. What a consumer still supplies itself is `languageOptions.parserOptions.project`/`projectService` pointing at its own tsconfig(s); `recommendedTypeChecked`'s base config never sets that, since it's genuinely project-specific.

**Test files (`**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`) get two narrow relaxations of this package's own additions above, and only those two.** A compile-time-only `@ts-expect-error` proving a construct genuinely fails to type-check is a well-established, legitimate test pattern -- TypeScript's own "unused `@ts-expect-error` directive" diagnostic already catches one that stops being needed, independent of this rule -- so a test file reverts to the rule's own pre-ban default, `allow-with-description`, rather than the outright ban. `@ts-ignore`/`@ts-nocheck` stay banned even in test files: `@ts-expect-error` is strictly better for both, so there's no legitimate test-specific reason to reach for either. `consistent-type-assertions` relaxes to `assertionStyle: 'as'` in test files -- letting a test construct a partial/stub value with a real `as` assertion where the full type wouldn't otherwise accept it -- while the legacy angle-bracket `<Type>value` form stays banned everywhere, tests included. Nothing inherited from `recommendedTypeChecked`/`stylisticTypeChecked` itself is relaxed in test files; only this package's own two additions are.

This lives in its own module, separate from the main `@exadev/eslint-config` entry point, specifically so importing the main package never attempts to resolve `typescript-eslint`. A plain object property (or a lazy getter) on the base plugin's own `configs` map can't achieve that: ESLint's `extends` resolution is synchronous, so a dynamic `import()` doesn't help either -- it just hides the same requirement behind an unawaited promise. Splitting into a genuinely separate module sidesteps the problem at the right layer: Node's own module resolution only loads a module when something actually imports it.

## Rules

| Rule | Fixable | Description |
| --- | --- | --- |
| `no-non-barrel-index` | | Only `src/index.ts` may be named `index.*` -- any other module named `index.ts`/`.js`/etc would be silently selected by a consumer's bare directory import. |
| `no-non-barrel-reexport` | ✓ | Re-exports belong only in the public barrel. Catches both the single-statement form (`export { x } from './y'`, already caught by a plain `no-restricted-syntax` rule) and the split form across two statements (`import { x } from './y'; export { x };` or `export default x;`), which no AST selector alone can match. The autofix deletes the offending export, and the now-pointless import alongside it whenever that export was the import's only use anywhere in the file. |
| `no-pointless-reassignment` | ✓ | `const foo = bar` where both sides are plain identifiers and the alias adds no transformation. |
| `no-side-effects-in-index` | | The public barrel may contain only re-export statements -- nothing that could execute at import time. |

## Build, test, and lint

```sh
pnpm install    # requires Node >=20 and pnpm 11.6.0 (pinned via packageManager)
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Each rule has a co-located `*.test.ts` file (`src/rules/no-non-barrel-index.test.ts` etc.) exercising it with ESLint's own `RuleTester`, run under Vitest. `vitest.setup.ts` wires `RuleTester.describe`/`RuleTester.it`/`RuleTester.itOnly` to Vitest's own `describe`/`it` explicitly, rather than turning on Vitest's `test.globals` project-wide, since `RuleTester.run()` only calls `describe`/`it` if something has supplied them. Each test file constructs its own `RuleTester` with `languageOptions.parser` set to `typescript-eslint`'s parser, since these rules' realistic test fixtures use TypeScript-only syntax (e.g. `export type { X } from './y'`) that the default `espree` parser can't read; none of the four rules need type information, so no `project`/`tsconfigRootDir` is configured.

`pnpm test` always measures coverage (`coverage.enabled: true` in `vitest.config.ts`, via `@vitest/coverage-v8`) rather than needing a separate `--coverage` flag -- scoped to `src/**/*.ts` excluding the `*.test.ts` files themselves. The text reporter summarises in the terminal; the `html`/`lcov` reporters land in `coverage/`, already gitignored alongside `.eslintcache` and `dist/`.

The `lint`/`typecheck`/`test`/`build` npm scripts are thin wrappers around turbo tasks whose own names carry a leading underscore (`_lint`/`_typecheck`/`_test`/`_build`, declared in `turbo.json`) -- run `pnpm build`, not `turbo run build` directly, since turbo's task names don't match the npm script names.

`pnpm build` runs `tsdown`, emitting ESM and CJS output plus declaration files from `src/**/*.ts` (platform-neutral, `src/**/*.test.ts` excluded). Before any publish -- local or the CI alias job -- `prepublishOnly` re-runs lint, typecheck, `test`, `tsdown`, `publint`, and `attw --pack`, so a broken export shape fails at publish time even outside the main CI pipeline.

## Architecture

`src/plugin.ts` builds an `ESLint.Plugin` object (ESLint's own `ESLint.Plugin` type, not a hand-written interface) combining the four rule modules under `src/rules/` into a flat `rules` map. `configs.recommended` and `configs.barrel` are defined as getters directly in the object literal, not attached after construction: each needs to reference the fully-built `plugin` object itself (`plugins: { exadev: plugin }`), which a plain property initializer can't do for its own binding while it's still being constructed. A getter closes over the `plugin` binding rather than its value, so it resolves correctly the moment a consumer actually reads the property, by which point construction has finished -- no `Object.assign`, no post-construction mutation, no null-checked destructure needed. `src/index.ts` is the public entry point and is nothing but `export { default } from './plugin';` -- a genuine pure re-export barrel.

`src/recommended-type-checked.ts` is a deliberately separate module, not a third property on the base plugin's own `configs`. It imports `typescript-eslint` to bundle `recommendedTypeChecked` + `stylisticTypeChecked` alongside this plugin's own rules -- see [The typed-linting bundle](#the-typed-linting-bundle-exadeveslint-configrecommended-type-checked) above for why that has to live in its own module rather than on the shared plugin object: importing the main entry point must never attempt to resolve `typescript-eslint`, and Node's own module resolution only loads a module when something actually imports it.

`pnpm-workspace.yaml` deliberately declares an empty `packages: []`. This is not a real multi-package pnpm workspace; its only purpose is giving turbo a workspace root to anchor local task caching against, matching the same single-package-workspace pattern used across this repo family.

## Conventions

`eslint.config.ts` dogfoods this package's own rules on itself, importing `./src/index` by relative path rather than as an installed dependency. All four rules are wired in one block with no `files`/`ignores` of its own -- `no-side-effects-in-index` and `no-non-barrel-reexport` each self-scope to `src/index.ts` internally, so applying them repo-wide here is both the simplest wiring and the live proof that doing so works. The plugin-construction logic lives in `src/plugin.ts` specifically so `src/index.ts` can stay a pure re-export point both rules assume.

`tsconfig.json` enables `verbatimModuleSyntax` (type-only imports/exports must use `import type`/`export type` explicitly -- enforced too by the `consistent-type-imports` eslint rule) and `noUncheckedIndexedAccess` (indexed access returns `T | undefined`, narrow before use rather than asserting).

Conventional commits are enforced by commitlint, restricted to the type-enum defined once in `release.config.ts`'s `commitTypes` -- both commitlint's allowed types and semantic-release's commit-analyzer release rules derive from that single list, so a commit type can't trigger a release without also being accepted by commit-msg validation, or the reverse.

## Gotchas and quirks

- `.attw.json` ignores the `false-export-default` rule: tsdown/rolldown's CJS output for this plugin's sole default export doesn't emit the `export =` form `arethetypeswrong`'s check wants under legacy `node10` resolution. The resolution modes an ESLint flat config actually uses (`node16`, `bundler`) are unaffected, so the rule is suppressed rather than moving the plugin away from ESLint's own documented default-export shape.
- Husky hooks: `pre-commit` runs lint-staged (`eslint --fix` on staged `*.ts`), `commit-msg` runs commitlint against the message, `pre-push` runs `typecheck`, `test`, and `build` -- pushing here re-runs the whole test suite and rebuilds the package first.
- The CI release job sets `HUSKY=0` (so the commit-msg hook never fires against the automated release commit) and blanks `NPM_TOKEN`/`NODE_AUTH_TOKEN` explicitly rather than omitting them, so an inherited token can't win over npm's OIDC trusted-publishing exchange.

## Contributing

Conventional commits are enforced by commitlint via a husky `commit-msg` hook, and re-checked in CI. CI runs commitlint, lint, and typecheck+test+build+attw on every push and pull request; the release job only runs on a push to `main`, after all three pass.

## Release

Conventional commits drive [semantic-release](https://semantic-release.gitbook.io/semantic-release) on every push to `main`: version bump, `CHANGELOG.md`, GitHub Release, and an npm publish via OIDC trusted publishing (no stored token). A second CI job then republishes the identical build under the unscoped alias `exadev-eslint-config`.

## License

MIT
