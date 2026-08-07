# @exadev/eslint-config

> A real ESLint plugin (not a shareable config) exposing custom rules shared across ExaDev projects. Also published under the unscoped alias `exadev-eslint-config`.

## Why

Multiple ExaDev repos independently carried identical copies of a handful of custom ESLint rules (barrel/index discipline, re-export placement, pointless-alias detection). Keeping them as per-repo copies meant a bug fix in one rule had to be found, fixed, and re-verified separately in every repo it was copied into. This package is the single source of truth for those rules instead.

Only the *rules* are centralized here, not a consumer's whole `eslint.config.ts`. A repo's own file-scoping (`files`/`ignores`), tsconfig wiring, and any runtime-isomorphism import bans are genuinely project-specific -- forcing those into one shared config would mean either losing real per-project distinctions or building a heavily-parameterised config just to route around them. Each consumer keeps its own `eslint.config.ts`, importing rule implementations from here instead of a local copy.

## Usage

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

## Development

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm build
```

No test suite exists for these rules currently -- each is verified by real-world usage against the repos it was extracted from, the same way it was verified before being centralized here.

## Release

Conventional commits (enforced by commitlint) drive [semantic-release](https://semantic-release.gitbook.io/semantic-release) on every push to `main`: version bump, `CHANGELOG.md`, GitHub Release, and an npm publish via OIDC trusted publishing (no stored token). A second CI job republishes the identical build under the unscoped alias `exadev-eslint-config`.

## License

MIT
