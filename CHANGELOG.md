## [2.9.1](https://github.com/ExaDev/eslint-config/compare/v2.9.0...v2.9.1) (2026-08-26)

# [2.9.0](https://github.com/ExaDev/eslint-config/compare/v2.8.0...v2.9.0) (2026-08-26)


### Features

* enable no-shadow, no-redeclare, no-use-before-define, consistent-return ([f569f7c](https://github.com/ExaDev/eslint-config/commit/f569f7cf475a00e5ea4526ae46e0787a9edd1300))

# [2.8.0](https://github.com/ExaDev/eslint-config/compare/v2.7.0...v2.8.0) (2026-08-26)


### Features

* enable @typescript-eslint/strict-void-return ([61f4cb8](https://github.com/ExaDev/eslint-config/commit/61f4cb8eb838b65cc99d351b7222464de9382a65))

# [2.7.0](https://github.com/ExaDev/eslint-config/compare/v2.6.2...v2.7.0) (2026-08-26)


### Features

* switch default config from recommendedTypeChecked to strictTypeChecked ([a92f1b5](https://github.com/ExaDev/eslint-config/commit/a92f1b5f0859aa2ccc0ac28d3b20340c237c18ab))

## [2.6.2](https://github.com/ExaDev/eslint-config/compare/v2.6.1...v2.6.2) (2026-08-26)

## [2.6.1](https://github.com/ExaDev/eslint-config/compare/v2.6.0...v2.6.1) (2026-08-26)

# [2.6.0](https://github.com/ExaDev/eslint-config/compare/v2.5.0...v2.6.0) (2026-08-26)


### Bug Fixes

* catch a local variable, not just a parameter, in three rules ([b3ecfd8](https://github.com/ExaDev/eslint-config/commit/b3ecfd81a799e2eb24f067499601258e741d6e5f))


### Features

* add prefer-readonly-object-param rule with real autofix ([6b768bd](https://github.com/ExaDev/eslint-config/commit/6b768bdf9b4b7babe257434b44dbf45cf9263819))
* register prefer-readonly-object-param in the type-checked bundle ([458d2bc](https://github.com/ExaDev/eslint-config/commit/458d2bcf1eef343a20ba4504ab858023ef199ec6))

# [2.5.0](https://github.com/ExaDev/eslint-config/compare/v2.4.0...v2.5.0) (2026-08-26)


### Features

* add no-map-instanceof-mutation rule for Map's readonly gap ([16582a8](https://github.com/ExaDev/eslint-config/commit/16582a80e4e0f0ce6a31a79ad5e19b49a262541a))
* add no-set-instanceof-mutation rule for Set's readonly gap ([e5b4c33](https://github.com/ExaDev/eslint-config/commit/e5b4c33dd0673a3b68c60641cc538599c8279852))
* add prefer-numeric-sort-compare rule with a suggestion fix ([1c13d4d](https://github.com/ExaDev/eslint-config/commit/1c13d4d6ad068e836480896cac3a4f1b2a3de802))
* add prefer-readonly-array-param rule with real autofix ([c8429d3](https://github.com/ExaDev/eslint-config/commit/c8429d3e9eb71d90af4f6e74422dd7c2cad144a9))
* enable 3 native rules, register the four new rules ([aafb702](https://github.com/ExaDev/eslint-config/commit/aafb70290f4d612999736a095bc97a3695da4ed3))

# [2.4.0](https://github.com/ExaDev/eslint-config/compare/v2.3.0...v2.4.0) (2026-08-26)


### Features

* add no-array-isarray-mutation rule for Array.isArray's readonly gap ([efb3a6c](https://github.com/ExaDev/eslint-config/commit/efb3a6cca516115f9f69873d4cc956d2c10a730a))
* add no-enum-reverse-lookup-widening rule for unchecked enum reverse lookups ([b45dfe0](https://github.com/ExaDev/eslint-config/commit/b45dfe0e8bf4e9fe62be4c80a3019d542d6d95a0))
* enable 10 native typescript-eslint rules, register the two new rules ([61315d6](https://github.com/ExaDev/eslint-config/commit/61315d66737e749effbf53e4d75e33de2e49f44d))

# [2.3.0](https://github.com/ExaDev/eslint-config/compare/v2.2.0...v2.3.0) (2026-08-26)


### Features

* ban the non-null assertion operator in the type-checked bundle ([fa9e3c5](https://github.com/ExaDev/eslint-config/commit/fa9e3c554304b423970f605e85d5831ae0e10a14))

# [2.2.0](https://github.com/ExaDev/eslint-config/compare/v2.1.2...v2.2.0) (2026-08-26)


### Features

* add no-enum-number-widening rule for unchecked numeric enum slots ([0c65c25](https://github.com/ExaDev/eslint-config/commit/0c65c2595e62e379f1113f4441fbf358d1346009))
* add no-mutable-union-array-param rule for covariant array writes ([76e497f](https://github.com/ExaDev/eslint-config/commit/76e497f6bb2b5f9046cbd9200d7b7f7f16298eb4))
* add no-object-assign rule for its unchecked source-property types ([d336498](https://github.com/ExaDev/eslint-config/commit/d3364981eb9d1154b9b37787eacf252d4d3668d2))
* register the three new rules, enable method-signature-style ([936af64](https://github.com/ExaDev/eslint-config/commit/936af64561bef31d0a6afe3e89ac99c55ad42c09))

## [2.1.2](https://github.com/ExaDev/eslint-config/compare/v2.1.1...v2.1.2) (2026-08-24)


### Bug Fixes

* stop no-pointless-reassignment producing broken or meaning-changing autofixes ([c0227f9](https://github.com/ExaDev/eslint-config/commit/c0227f94f18ca9d813e350f951556fe4a87b25fa))

## [2.1.1](https://github.com/ExaDev/eslint-config/compare/v2.1.0...v2.1.1) (2026-08-08)

# [2.1.0](https://github.com/ExaDev/eslint-config/compare/v2.0.0...v2.1.0) (2026-08-07)


### Features

* add a configurable barrel-policy rule with three index-file modes ([71c5d26](https://github.com/ExaDev/eslint-config/commit/71c5d26f5250f8319be054a8b69cbdf794e3ed8b))

# [2.0.0](https://github.com/ExaDev/eslint-config/compare/v1.4.1...v2.0.0) (2026-08-07)


* feat!: make the type-checked bundle the default export, drop the separate subpath ([aed49bb](https://github.com/ExaDev/eslint-config/commit/aed49bb40b8c1a9b062f3681364b679f80d95ce9))


### BREAKING CHANGES

* the default export of '@exadev/eslint-config' is now
recommendedTypeChecked (an array, spread directly into tseslint.config(...)),
not the ESLint.Plugin object. The plugin object is now a named export,
'plugin'. The '@exadev/eslint-config/recommended-type-checked' subpath
no longer exists. 'typescript-eslint' is now a required peer dependency
of the whole package rather than an optional one -- importing anything
from '@exadev/eslint-config', including 'plugin', now resolves it.

Migration: replace
  import exadev from '@exadev/eslint-config';
  ... plugins: { exadev }, rules: { 'exadev/no-non-barrel-index': 'error' } ...
with either
  import exadev from '@exadev/eslint-config';
  ... ...exadev ...
for the full type-checked bundle, or
  import { plugin } from '@exadev/eslint-config';
  ... plugins: { exadev: plugin }, rules: { 'exadev/no-non-barrel-index': 'error' } ...
for the lighter, non-type-checked rules/configs.

## [1.4.1](https://github.com/ExaDev/eslint-config/compare/v1.4.0...v1.4.1) (2026-08-07)

# [1.4.0](https://github.com/ExaDev/eslint-config/compare/v1.3.0...v1.4.0) (2026-08-07)


### Features

* relax ban-ts-comment and consistent-type-assertions in test files ([1d43548](https://github.com/ExaDev/eslint-config/commit/1d43548e3f49cdafb63736d5dc37e5d2264f1fba))

# [1.3.0](https://github.com/ExaDev/eslint-config/compare/v1.2.3...v1.3.0) (2026-08-07)


### Features

* ban [@ts-expect-error](https://github.com/ts-expect-error) outright in the type-checked bundle ([439d226](https://github.com/ExaDev/eslint-config/commit/439d22603c855402a95575bd991f54f599f92bcf))

## [1.2.3](https://github.com/ExaDev/eslint-config/compare/v1.2.2...v1.2.3) (2026-08-07)


### Bug Fixes

* self-scope no-side-effects-in-index and no-non-barrel-reexport to the barrel file ([022e81c](https://github.com/ExaDev/eslint-config/commit/022e81c9559ed82cac33199cc812333208ba73ef))

## [1.2.2](https://github.com/ExaDev/eslint-config/compare/v1.2.1...v1.2.2) (2026-08-07)

## [1.2.1](https://github.com/ExaDev/eslint-config/compare/v1.2.0...v1.2.1) (2026-08-07)

# [1.2.0](https://github.com/ExaDev/eslint-config/compare/v1.1.2...v1.2.0) (2026-08-07)


### Features

* bundle typescript-eslint's typed-linting baseline into recommended ([86397dc](https://github.com/ExaDev/eslint-config/commit/86397dc047ed917f70276f2e776721d823748445))

## [1.1.2](https://github.com/ExaDev/eslint-config/compare/v1.1.1...v1.1.2) (2026-08-07)

## [1.1.1](https://github.com/ExaDev/eslint-config/compare/v1.1.0...v1.1.1) (2026-08-07)

# [1.1.0](https://github.com/ExaDev/eslint-config/compare/v1.0.1...v1.1.0) (2026-08-07)


### Features

* turn on no-inline-config and no-type-assertions in the recommended config ([9706eec](https://github.com/ExaDev/eslint-config/commit/9706eec1682f79019538b0e63c372b214182ce4c))

## [1.0.1](https://github.com/ExaDev/eslint-config/compare/v1.0.0...v1.0.1) (2026-08-07)

# 1.0.0 (2026-08-07)


### Bug Fixes

* ignore the false-export-default attw rule ([667b7e7](https://github.com/ExaDev/eslint-config/commit/667b7e78e9183714ea1e53575fc6e5d973945692))


### Features

* initial ESLint plugin combining the shared custom rules ([29b86ff](https://github.com/ExaDev/eslint-config/commit/29b86ff64d321c401be3ebf9c578b6eb69dff8bc))
