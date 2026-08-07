# @exadev/eslint-config

[![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white)](https://github.com/ExaDev/eslint-config) [![npm](https://img.shields.io/badge/npm-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@exadev/eslint-config) [![Release](https://img.shields.io/github/v/release/ExaDev/eslint-config)](https://github.com/ExaDev/eslint-config/releases/latest) [![CI](https://img.shields.io/github/actions/workflow/status/ExaDev/eslint-config/ci.yml?branch=main)](https://github.com/ExaDev/eslint-config/actions)

> A real ESLint plugin (not a shareable config) exposing custom rules shared across ExaDev projects. Also published under the unscoped alias `exadev-eslint-config`.

## Why

Multiple ExaDev repos independently carried identical copies of a handful of custom ESLint rules (barrel/index discipline, re-export placement, pointless-alias detection). Keeping them as per-repo copies meant a bug fix in one rule had to be found, fixed, and re-verified separately in every repo it was copied into. This package is the single source of truth for those rules instead.

Only the *rules* are centralized here, not a consumer's whole `eslint.config.ts`. A repo's own file-scoping (`files`/`ignores`), tsconfig wiring, and any runtime-isomorphism import bans are genuinely project-specific -- forcing those into one shared config would mean either losing real per-project distinctions or building a heavily-parameterised config just to route around them. Each consumer keeps its own `eslint.config.ts`, importing rule implementations from here instead of a local copy.

## Getting started

Consumers need `eslint >=10.0.0` as a peer dependency.

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
    extends: ['exadev/recommended'], // every rule this plugin defines, plus no-inline-config and no-type-assertions
    // or: extends: ['exadev/barrel'], // just the barrel-discipline trio (no-non-barrel-index, no-non-barrel-reexport, no-side-effects-in-index)
  },
]);
```

`recommended` also turns on two general code-quality settings every current consumer already wires independently: `linterOptions.noInlineConfig` (no `eslint-disable` comments anywhere -- an exception belongs in the config, scoped to where it applies, not hidden inline in the source it's disabling a rule for) and `@typescript-eslint/consistent-type-assertions` set to `never` (no `as`/angle-bracket type assertions -- narrow with a guard or parse with Zod instead). The type-assertions rule is `@typescript-eslint`'s own, not one this plugin defines, so `recommended` assumes the consumer already has `typescript-eslint` registered under the `@typescript-eslint` namespace -- true for every consumer this plugin currently has. A consumer with no typescript-eslint at all should use `barrel`, or wire the four `exadev/*` rules directly, instead of taking `recommended` wholesale.

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
pnpm build
```

No test suite exists for these rules currently -- each is verified by real-world usage against the repos it was extracted from, the same way it was verified before being centralized here.

The `lint`/`typecheck`/`build` npm scripts are thin wrappers around turbo tasks whose own names carry a leading underscore (`_lint`/`_typecheck`/`_build`, declared in `turbo.json`) -- run `pnpm build`, not `turbo run build` directly, since turbo's task names don't match the npm script names.

`pnpm build` runs `tsdown`, emitting ESM and CJS output plus declaration files from `src/**/*.ts` (platform-neutral, `src/**/*.test.ts` excluded). Before any publish -- local or the CI alias job -- `prepublishOnly` re-runs lint, typecheck, `tsdown`, `publint`, and `attw --pack`, so a broken export shape fails at publish time even outside the main CI pipeline.

## Architecture

`src/plugin.ts` builds an `ESLint.Plugin` object (ESLint's own `ESLint.Plugin` type, not a hand-written interface) combining the four rule modules under `src/rules/` into a flat `rules` map. The two bundled configs (`recommended`, `barrel`) are attached via `Object.assign` after the plugin object is constructed, rather than inline in the object literal, so each config's own `plugins: { exadev }` can reference the already-built plugin object -- the same self-reference pattern ESLint's plugin-authoring guide uses. `src/index.ts` is the public entry point and is nothing but `export { default } from './plugin';` -- a genuine pure re-export barrel.

`pnpm-workspace.yaml` deliberately declares an empty `packages: []`. This is not a real multi-package pnpm workspace; its only purpose is giving turbo a workspace root to anchor local task caching against, matching the same single-package-workspace pattern used across this repo family.

## Conventions

`eslint.config.ts` dogfoods this package's own rules on itself, importing `./src/index` by relative path rather than as an installed dependency. All four rules apply to this repo's own source: `no-non-barrel-reexport` is scoped to `src/**/*.ts` excluding `src/index.ts` (the barrel is where re-exports are meant to live), and `no-side-effects-in-index` is scoped to `src/index.ts` alone -- the plugin-construction logic lives in `src/plugin.ts` specifically so `src/index.ts` can stay a pure re-export point both rules assume.

`tsconfig.json` enables `verbatimModuleSyntax` (type-only imports/exports must use `import type`/`export type` explicitly -- enforced too by the `consistent-type-imports` eslint rule) and `noUncheckedIndexedAccess` (indexed access returns `T | undefined`, narrow before use rather than asserting).

Conventional commits are enforced by commitlint, restricted to the type-enum defined once in `release.config.ts`'s `commitTypes` -- both commitlint's allowed types and semantic-release's commit-analyzer release rules derive from that single list, so a commit type can't trigger a release without also being accepted by commit-msg validation, or the reverse.

## Gotchas and quirks

- `.attw.json` ignores the `false-export-default` rule: tsdown/rolldown's CJS output for this plugin's sole default export doesn't emit the `export =` form `arethetypeswrong`'s check wants under legacy `node10` resolution. The resolution modes an ESLint flat config actually uses (`node16`, `bundler`) are unaffected, so the rule is suppressed rather than moving the plugin away from ESLint's own documented default-export shape.
- Husky hooks: `pre-commit` runs lint-staged (`eslint --fix` on staged `*.ts`), `commit-msg` runs commitlint against the message, `pre-push` runs `typecheck` and `build` -- pushing here rebuilds the whole package first.
- The CI release job sets `HUSKY=0` (so the commit-msg hook never fires against the automated release commit) and blanks `NPM_TOKEN`/`NODE_AUTH_TOKEN` explicitly rather than omitting them, so an inherited token can't win over npm's OIDC trusted-publishing exchange.

## Contributing

Conventional commits are enforced by commitlint via a husky `commit-msg` hook, and re-checked in CI. CI runs commitlint, lint, and typecheck+build+attw on every push and pull request; the release job only runs on a push to `main`, after all three pass.

## Release

Conventional commits drive [semantic-release](https://semantic-release.gitbook.io/semantic-release) on every push to `main`: version bump, `CHANGELOG.md`, GitHub Release, and an npm publish via OIDC trusted publishing (no stored token). A second CI job then republishes the identical build under the unscoped alias `exadev-eslint-config`.

## License

MIT
