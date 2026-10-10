## [3.0.1](https://github.com/ExaDev/eslint-config/compare/v3.0.0...v3.0.1) (2026-10-10)


### Bug Fixes

* resolve exadev rules set by a block with no files after the shared config ([16b579c](https://github.com/ExaDev/eslint-config/commit/16b579ce1e3e3f534a63d04833a47ed4d888ae08))


### Documentation

* state that rules of other plugins need files in a block of your own ([de15519](https://github.com/ExaDev/eslint-config/commit/de15519565c1d7d5e038abd6d05e438d85d6c84d))


### Tests

* pin that another plugin's rule in a block of your own needs files ([a00a922](https://github.com/ExaDev/eslint-config/commit/a00a922dc02e3a53e98db171a37948af407a6e37))

# [3.0.0](https://github.com/ExaDev/eslint-config/compare/v2.36.5...v3.0.0) (2026-10-10)


### Features

* make exadevConfig take the options object alone ([a08def3](https://github.com/ExaDev/eslint-config/commit/a08def31f682469160c4532d63cfd5a1fc138a56))
* report an optional parameter directly before a rest parameter ([198b011](https://github.com/ExaDev/eslint-config/commit/198b0111f51e94cc0f5f7b062e74978be6a9ec48))


### BREAKING CHANGES

* `exadevConfig` no longer accepts config blocks after the options argument.
Spread its result inside `defineConfig` and put your own blocks after it.

## [2.36.5](https://github.com/ExaDev/eslint-config/compare/v2.36.4...v2.36.5) (2026-10-10)


### Bug Fixes

* list every commit type in the release notes and CHANGELOG.md ([f3545e0](https://github.com/ExaDev/eslint-config/commit/f3545e0ba2066c09b830f9a0e99d7ea4c0f08b05))


### Documentation

* regenerate CHANGELOG.md with every commit of each release ([3ee647f](https://github.com/ExaDev/eslint-config/commit/3ee647f218333edcd9398622e08c850ccc573a04))


### Tests

* run the real release-notes generator over every commit type ([9b90e22](https://github.com/ExaDev/eslint-config/commit/9b90e226db8eeadf3a69ade2e77fbb2bb70cdee1))

## [2.36.4](https://github.com/ExaDev/eslint-config/compare/v2.36.3...v2.36.4) (2026-10-10)


### Code Refactoring

* validate patterns with a RegExp call instead of voiding a construction ([6ef84c1](https://github.com/ExaDev/eslint-config/commit/6ef84c1f55d7544cc398aa97b3dab8011fccf314))


### Tests

* assert what the plugin configs getters return instead of voiding them ([fcb9c89](https://github.com/ExaDev/eslint-config/commit/fcb9c8934efc98b9dddd93f3c172e97fad9752f6))


### Chores

* **deps:** bump the minor-and-patch group across 1 directory with 16 updates ([5f0bb78](https://github.com/ExaDev/eslint-config/commit/5f0bb78e986403c07cc4bc27d48eabec0e0cc217))

## [2.36.3](https://github.com/ExaDev/eslint-config/compare/v2.36.2...v2.36.3) (2026-10-10)


### Documentation

* read the shared layout from the value of loadSection's result ([f9f3ecc](https://github.com/ExaDev/eslint-config/commit/f9f3ecc509ddb41860e31805e80e7d6fa4253487))


### Chores

* **deps-dev:** bump @exadev/config from 1.1.3 to 2.1.2 ([ca8db42](https://github.com/ExaDev/eslint-config/commit/ca8db42a0b01257ed88b4adcf50b8dd0c4006db4))

## [2.36.2](https://github.com/ExaDev/eslint-config/compare/v2.36.1...v2.36.2) (2026-10-09)


### Bug Fixes

* scope explicit-module-boundary-types to TypeScript files ([9d57ea1](https://github.com/ExaDev/eslint-config/commit/9d57ea15752c20d0345911f7bc9b0fddeff1e8b6))
* scope tsdoc/syntax and jsdoc/no-types to TypeScript files ([dc107a4](https://github.com/ExaDev/eslint-config/commit/dc107a41aba0722ddfae9b5c76245faba3038673))
* strip trailing whitespace from comment-style fixes and keep content markers standalone ([f67807b](https://github.com/ExaDev/eslint-config/commit/f67807b76e5f4485d0fa1c38fc96f60402592f20))


### Tests

* write every fixture before ESLint reads the TypeScript project ([fdc30f7](https://github.com/ExaDev/eslint-config/commit/fdc30f764981eefc894521c219ed5d87f2ac7495))

## [2.36.1](https://github.com/ExaDev/eslint-config/compare/v2.36.0...v2.36.1) (2026-10-09)


### Chores

* **deps-dev:** bump @types/node from 24.13.3 to 26.6.4 ([8a69550](https://github.com/ExaDev/eslint-config/commit/8a695507de8da26d274b44de1fc5b12c5ba9bf2e))

# [2.36.0](https://github.com/ExaDev/eslint-config/compare/v2.35.4...v2.36.0) (2026-10-09)


### Features

* add rules for agent SKILL.md files and Claude Code plugin manifests ([b9aba88](https://github.com/ExaDev/eslint-config/commit/b9aba88c7a4fddfd346830c9046ad7afb782d01b))
* add the agentSkills option and agentSkillsConfig preset ([31f25fd](https://github.com/ExaDev/eslint-config/commit/31f25fd491c2c29a239fae4ceb55f92c9b308b24))


### Bug Fixes

* accept skill names the specification's reference validator accepts ([b8a3d60](https://github.com/ExaDev/eslint-config/commit/b8a3d6050a99562c865459b1d9a0138f60e6ae4e))
* apply the glob shape checks to file globs only, not specifier patterns ([10aa74f](https://github.com/ExaDev/eslint-config/commit/10aa74f2c32cac3c0e9177f86a42052d873e1949))
* compare skill names trimmed in skill-name-unique ([a4f279e](https://github.com/ExaDev/eslint-config/commit/a4f279eb9ea70842eb0991a391351a2923394097))
* decide directory ignores the way ESLint's config array does ([422ef3c](https://github.com/ExaDev/eslint-config/commit/422ef3ca7e59573ded7ba89197e9a3aafa75e09c))
* do not report a skill reached through a link as a duplicate of its target ([59f82dc](https://github.com/ExaDev/eslint-config/commit/59f82dcdf4c241934d9dffa1279f11cc4b9a9817))
* do not require a root plugin to be named after its checkout directory ([d2c84f1](https://github.com/ExaDev/eslint-config/commit/d2c84f1d1076f60af134a1cd95aaf29218f52320))
* do not throw for a cached skill path that no longer exists ([4c60408](https://github.com/ExaDev/eslint-config/commit/4c60408d8c2ae949becdced34bbf0726aa6956d4))
* exempt a plugin at any marketplace root from the directory-name match ([9cf0077](https://github.com/ExaDev/eslint-config/commit/9cf0077477315eec3b019966e1aa1e9f72d7d243))
* keep a backslash-escaped ] literal inside a glob character class ([5053f79](https://github.com/ExaDev/eslint-config/commit/5053f79e0d84ead3cea5342b67725c3e6992f8fb))
* keep SKILL.md frontmatter YAML when markdownHeadings uses another format ([5015aee](https://github.com/ExaDev/eslint-config/commit/5015aee6c52764fe1e2941488129ac56c196fea3))
* leave ESLint-ignored directories out of the skill-name-unique scan ([bb26e27](https://github.com/ExaDev/eslint-config/commit/bb26e27e133ec1d64ad2ca77df2b9a285fd4eb5b))
* match dot-prefixed directories in the skill-name-unique scan as ESLint does ([21d8b92](https://github.com/ExaDev/eslint-config/commit/21d8b92ff22731013871775026bd142de2be4c20))
* match nothing for an ignores entry with a leading slash ([beabe51](https://github.com/ExaDev/eslint-config/commit/beabe5190a71c8912b39821acac65c22c1727528))
* name the file when a sibling JSON file cannot be read ([7541e14](https://github.com/ExaDev/eslint-config/commit/7541e14797bcc74899404dc365e4eb7ad9ae231e))
* quote the duplicate marketplace entry name once ([e555fd9](https://github.com/ExaDev/eslint-config/commit/e555fd96b5a9a8ef83e8cc6ea177c6826a53116e))
* read a glob class like minimatch and reject the forms it cannot share ([557b133](https://github.com/ExaDev/eslint-config/commit/557b133fe8459018f5e05f2ebd6f3123a41c9650))
* read a negated ignore entry whole, as ESLint's config array does ([dbd1ad3](https://github.com/ExaDev/eslint-config/commit/dbd1ad348ea46e5f3a930d458f7b74e9be24abbc))
* read sibling plugin JSON tolerantly and report it when it is invalid ([d84ee31](https://github.com/ExaDev/eslint-config/commit/d84ee319e8cd52a50e60d062d0777761ef861425))
* recognise extglob by position instead of by a pattern ([16c9490](https://github.com/ExaDev/eslint-config/commit/16c9490c4bb6e14f7d3f5551f9fcf4da8330ce50))
* reject a brace group right after a dollar sign in a file glob ([e2281cd](https://github.com/ExaDev/eslint-config/commit/e2281cd768eedcccfd1c65417d38b48426b67a7c))
* reject a file glob that starts or ends with a slash ([4bf8a33](https://github.com/ExaDev/eslint-config/commit/4bf8a33056fb1c03ffbee4e364535dfd7b6b3b0b))
* reject a glob class opening with an escaped caret instead of guessing ([3da5084](https://github.com/ExaDev/eslint-config/commit/3da5084a56427aaecb3d6378554cab36dad7a6d2))
* reject brace forms that minimatch and the glob dialect read differently ([da1912d](https://github.com/ExaDev/eslint-config/commit/da1912df4e1d31d63983d81ecf6761eab78817c5))
* reject extglob in import specifier pattern lists ([41a0d1b](https://github.com/ExaDev/eslint-config/commit/41a0d1b1e7b6cd8c057b000572f9fe9c338f9364))
* reject extglob in the skill-name-unique files option ([d85da8a](https://github.com/ExaDev/eslint-config/commit/d85da8af1cd0860e7f2708366a132a7d41c52922))
* reject extglob syntax in file glob options ([af3b367](https://github.com/ExaDev/eslint-config/commit/af3b367d43b5436557cf54452b83ab456b89d8a9))
* reject glob forms that minimatch reads as something else ([cb62534](https://github.com/ExaDev/eslint-config/commit/cb6253483c5bfdde8aa0efada6db0b2ca6182efd))
* report a whitespace-only skill description as empty ([ab415d3](https://github.com/ExaDev/eslint-config/commit/ab415d3a6711abd246b39a65beb8a3933b61ebae))
* report a YAML alias that cannot be resolved as invalid frontmatter ([e06d979](https://github.com/ExaDev/eslint-config/commit/e06d97976496d7a6266a5848abf0bc26bc896f98))
* report unlisted plugins in name order ([253cd9e](https://github.com/ExaDev/eslint-config/commit/253cd9e7c5a2fd7bd52ca8d167ca5e25e360616e))
* see plugin and skill directories that are symbolic links ([3b39e4f](https://github.com/ExaDev/eslint-config/commit/3b39e4f5e4ad678c398653868a714249ea3df05b))
* select the subpaths of a specifier pattern that ends in a wildcard ([e05bd85](https://github.com/ExaDev/eslint-config/commit/e05bd8521db8b2460ac55573d957defc2fca76f0))
* skip directories the skill-name-unique scan may not list ([7d0d2b5](https://github.com/ExaDev/eslint-config/commit/7d0d2b5b82d55abc9cca693d50f8ff5d35122996))
* strip surrounding whitespace from a skill name before judging it ([a2a16d2](https://github.com/ExaDev/eslint-config/commit/a2a16d23cbf3caea7a7de06737be9731145fbc52))
* treat a path that cannot be listed as empty during layout detection ([82feed5](https://github.com/ExaDev/eslint-config/commit/82feed540367baa0f496befed44d34e7ab183b2b))
* validate the skill-name-unique files option once, not per linted file ([9f521f7](https://github.com/ExaDev/eslint-config/commit/9f521f7fac53a1cb79de5e7cbf54dbc1199a37a5))


### Code Refactoring

* drop the outside-the-directory guard from the ignore matcher ([daf1685](https://github.com/ExaDev/eslint-config/commit/daf1685b0673bbc918be2844f5e1664ae590167b))
* keep hasExtglob private to the glob scope module ([3ef0c5d](https://github.com/ExaDev/eslint-config/commit/3ef0c5df357acd82920d6a3edc3b722d46aba956))
* match every file glob with minimatch, as ESLint does ([f94f37f](https://github.com/ExaDev/eslint-config/commit/f94f37f369a8c21466a82d0084e66f8a42bfa076))
* restore the pnpm packages glob reader to its own rules ([699fa24](https://github.com/ExaDev/eslint-config/commit/699fa249e8f08b87a8a4731e3861a5f4df486b77))


### Documentation

* carry the agent skills option descriptions in the published declarations ([8a732a3](https://github.com/ExaDev/eslint-config/commit/8a732a30a272252234c9c2c705b29e022645a42e))
* describe agent skills auto-detection and the scan cache as they behave ([3989b63](https://github.com/ExaDev/eslint-config/commit/3989b631f9e79924cb1a8e04f22e2f69a2cea74e))
* describe agentSkills auto-detection in its option comment without a dash ([d1eaf99](https://github.com/ExaDev/eslint-config/commit/d1eaf99568f54ab019500c7166ae66fdedfebec1))
* describe the agent skills defaults in words the published types can use ([f248975](https://github.com/ExaDev/eslint-config/commit/f2489758e7be4574f9247eb51c5196ad7b6db328))
* document agent skills and plugin marketplace linting ([7c2188e](https://github.com/ExaDev/eslint-config/commit/7c2188e36a28aee35caf5ac5e911f3331bf3d784))
* list the file glob forms that follow minimatch and the ones rejected on read ([feeb436](https://github.com/ExaDev/eslint-config/commit/feeb436e228744437885089724454674ccdc9bac))
* say that a skill linked into a plugin is not a duplicate of its target ([0776d6e](https://github.com/ExaDev/eslint-config/commit/0776d6ec0bd8b3922f84610cbdb85ecb82d49d61))
* say that ESLint's --cache hides changes to the set of skills ([ae524ec](https://github.com/ExaDev/eslint-config/commit/ae524ec099d943ef5bad0fecd70f82905cbfceea))
* scope the ignore matcher contract to paths below the working directory ([a6e1846](https://github.com/ExaDev/eslint-config/commit/a6e18467e2c349fad7c9f259d3098415e55db648))
* state that the skill-name-unique scan cache is shared by every ESLint instance ([9ab4a00](https://github.com/ExaDev/eslint-config/commit/9ab4a007b9baa8f8ef936a04fdbbaffac2b0fcbc))
* stop describing a glob dialect that file globs no longer have ([e1da8d5](https://github.com/ExaDev/eslint-config/commit/e1da8d5b8301a059ca8a0f6de8fc30d76e27e462))
* turn off agentSkills detection in the standalone agent skills example ([8cb6f8d](https://github.com/ExaDev/eslint-config/commit/8cb6f8dab859a2216e3e174b58b4b7bb7442393d))
* word the plugin-manifest rule row as it behaves ([993dcf2](https://github.com/ExaDev/eslint-config/commit/993dcf281a859081fcb675a47894360b8acd4d37))


### Tests

* accept the readonly config arrays of the README example builders ([67a8cc4](https://github.com/ExaDev/eslint-config/commit/67a8cc4d8d0b7893ff4478e4913a6be10b87f177))
* assert the rendered duplicate marketplace entry message again ([e852c4f](https://github.com/ExaDev/eslint-config/commit/e852c4f759a1c8b379055006018dcafea7d56ae5))
* lint a root plugin through ESLint without tying its name to the checkout folder ([3b49dae](https://github.com/ExaDev/eslint-config/commit/3b49dae9b4a12caf457fd053717d4b6968f738d1))
* lint the text of a skill that is not on disk against the ones that are ([c152e97](https://github.com/ExaDev/eslint-config/commit/c152e97cea3ed3e40ecddd116a01f684360561af))
* pin escaped backslashes inside a glob class against minimatch ([c2395b1](https://github.com/ExaDev/eslint-config/commit/c2395b143d46aa1239fd54b3593c12ee30ac0ef0))
* pin that skill-name-unique validates each distinct files list ([1dadb9d](https://github.com/ExaDev/eslint-config/commit/1dadb9d53f9d8ac9bc63d57224afccf72b23c9ff))
* pin that the ignore matcher matches a path outside the working directory ([59c93a1](https://github.com/ExaDev/eslint-config/commit/59c93a1b82e885ebacae494ef65e74f1858d56d0))
* pin the extglob and permission checks on every entry and error code ([20e2c52](https://github.com/ExaDev/eslint-config/commit/20e2c52c18266ac48ba0a52788b2943d62ec66e3))
* pin the extglob error text and the location of an empty entry name ([c044f79](https://github.com/ExaDev/eslint-config/commit/c044f79d395290eeaaa4fe9fb9bb68ab2d9d96ae))
* pin the rejection of a glob that has no valid form in minimatch ([467a3da](https://github.com/ExaDev/eslint-config/commit/467a3dae983401204a2e37bc5491113ca4bd8ea6))

## [2.35.4](https://github.com/ExaDev/eslint-config/compare/v2.35.3...v2.35.4) (2026-10-09)


### Bug Fixes

* keep a leftover Stryker sandbox out of the test run ([404a53b](https://github.com/ExaDev/eslint-config/commit/404a53bd7f98bd4604ac5a3bb57bfb2876656741))

## [2.35.3](https://github.com/ExaDev/eslint-config/compare/v2.35.2...v2.35.3) (2026-10-09)


### Bug Fixes

* keep agentGuidance in turbo.json in the key order json/sort-keys requires ([5bde537](https://github.com/ExaDev/eslint-config/commit/5bde53763bffe51990bc62d184dccf305f0b1da6))


### Documentation

* describe the commit and push hooks as they now run ([b532070](https://github.com/ExaDev/eslint-config/commit/b5320700a0d5cc3b9a23ebfc7570987098926929))


### Continuous Integration

* lint JSON on commit and run the full lint on push ([de1723e](https://github.com/ExaDev/eslint-config/commit/de1723e520a349d2eec59de9a5933dbeb27f30d1))
* lint Markdown with @eslint/markdown and fix the table it flagged ([648d65b](https://github.com/ExaDev/eslint-config/commit/648d65b8aa1101e8559e7082b70b904444bed01c))


### Chores

* upgrade turbo to 2.11.5 and disable agentGuidance ([d9954ed](https://github.com/ExaDev/eslint-config/commit/d9954edf49e988f55da93cfc5c5fe054e8dd51fa))

## [2.35.2](https://github.com/ExaDev/eslint-config/compare/v2.35.1...v2.35.2) (2026-10-03)


### Continuous Integration

* let Dependabot propose npm updates after a week's cooldown ([f495875](https://github.com/ExaDev/eslint-config/commit/f49587552707a8a3ede2996d1000db4361548c74))
* lint workflows with actionlint and zizmor ([7a72767](https://github.com/ExaDev/eslint-config/commit/7a727677fafa120c47cf10f0d3c3a3f7708cb763))
* stop persisting checkout credentials and expanding needs into shell ([5f6cfe7](https://github.com/ExaDev/eslint-config/commit/5f6cfe71f5644451335a302586c397b23f3441d9))

## [2.35.1](https://github.com/ExaDev/eslint-config/compare/v2.35.0...v2.35.1) (2026-10-03)


### Continuous Integration

* pin third-party actions by commit SHA ([9994c75](https://github.com/ExaDev/eslint-config/commit/9994c75fe9b0cbb9d6d6a4f2743ca839c3d6fe90))

# [2.35.0](https://github.com/ExaDev/eslint-config/compare/v2.34.1...v2.35.0) (2026-10-02)


### Features

* **import-policy:** allow-list of import names on a deny entry ([bc388cf](https://github.com/ExaDev/eslint-config/commit/bc388cf82152ed51a39e61ae8caca297b82ab4e2))


### Documentation

* **import-policy:** tested recipes for repository conventions ([a6d77a5](https://github.com/ExaDev/eslint-config/commit/a6d77a576f7edd724266594e1f693a923cdd1cd5))

## [2.34.1](https://github.com/ExaDev/eslint-config/compare/v2.34.0...v2.34.1) (2026-10-02)


### Documentation

* add live usage charts to the readme ([04fd7d0](https://github.com/ExaDev/eslint-config/commit/04fd7d0bd55a720f133c5db3ad1b95fb77fa7b1f))

# [2.34.0](https://github.com/ExaDev/eslint-config/compare/v2.33.1...v2.34.0) (2026-10-02)


### Features

* add multiline-comment-style wrapper that keeps directives standalone ([f48ba38](https://github.com/ExaDev/eslint-config/commit/f48ba3810be601c17e64d03ae5ffb433d6048b1a)), closes [eslint-stylistic/eslint-stylistic#1287](https://github.com/eslint-stylistic/eslint-stylistic/issues/1287) [#region](https://github.com/ExaDev/eslint-config/issues/region) [#45](https://github.com/ExaDev/eslint-config/issues/45)
* enable multiline-comment-style at bare-block through the wrapper ([966a97c](https://github.com/ExaDev/eslint-config/commit/966a97cc636c5c0eaf80f6226ba027fd0b779353)), closes [#region](https://github.com/ExaDev/eslint-config/issues/region) [eslint-stylistic/eslint-stylistic#1287](https://github.com/eslint-stylistic/eslint-stylistic/issues/1287) [#45](https://github.com/ExaDev/eslint-config/issues/45)


### Styles

* apply multiline-comment-style bare-block fixes to own source ([07f40cd](https://github.com/ExaDev/eslint-config/commit/07f40cde9e56919498de82d2372291c377dfc40d)), closes [#45](https://github.com/ExaDev/eslint-config/issues/45)

## [2.33.1](https://github.com/ExaDev/eslint-config/compare/v2.33.0...v2.33.1) (2026-10-02)


### Bug Fixes

* **deps:** upgrade @stylistic/eslint-plugin to 6.0.0-beta.6 ([3fffbc7](https://github.com/ExaDev/eslint-config/commit/3fffbc7e0ef6c7f138a900ee5cbc6958cb786ad2))


### Tests

* pin multiline-comment-style bare-block behaviour on the bundled config ([cd7a8ea](https://github.com/ExaDev/eslint-config/commit/cd7a8ea667353b2cea9d828622d4fa7a9f4dec78))

# [2.33.0](https://github.com/ExaDev/eslint-config/compare/v2.32.1...v2.33.0) (2026-10-02)


### Features

* **import-policy:** optionally report computed import specifiers ([efdcf29](https://github.com/ExaDev/eslint-config/commit/efdcf2913ddf8cd61c8fda4e326c316c39bc40d4)), closes [#88](https://github.com/ExaDev/eslint-config/issues/88)


### Documentation

* **react:** allow eslint-plugin-react in ban-dependencies ([37cc2c2](https://github.com/ExaDev/eslint-config/commit/37cc2c2ad8f0c57ec17752ce6f879fae151236c9)), closes [#30](https://github.com/ExaDev/eslint-config/issues/30)

## [2.32.1](https://github.com/ExaDev/eslint-config/compare/v2.32.0...v2.32.1) (2026-10-02)


### Bug Fixes

* **jsdoc:** validate doc comment tags against TSDoc's vocabulary ([34f5f00](https://github.com/ExaDev/eslint-config/commit/34f5f0072ac494847d94b7e62d52c906f2f536a6)), closes [#49](https://github.com/ExaDev/eslint-config/issues/49)


### Documentation

* **prefer-doc-comment:** update tag-line withholding rationale ([808946b](https://github.com/ExaDev/eslint-config/commit/808946bb7d691bf3fa0b313f4eb6426ee510b911)), closes [#49](https://github.com/ExaDev/eslint-config/issues/49)

# [2.32.0](https://github.com/ExaDev/eslint-config/compare/v2.31.2...v2.32.0) (2026-10-02)


### Features

* **workspace:** add selector-based dependency constraints ([1ed6664](https://github.com/ExaDev/eslint-config/commit/1ed6664ec9a24ca360277f0b743ed6f9ca17b7f2)), closes [#36](https://github.com/ExaDev/eslint-config/issues/36)


### Documentation

* **readme:** document dependency constraints ([2913aec](https://github.com/ExaDev/eslint-config/commit/2913aec4268564d8fd5baec4293d2fdaab0f4158)), closes [#36](https://github.com/ExaDev/eslint-config/issues/36)
* **readme:** list every src/index.ts export in the architecture notes ([c37ca5a](https://github.com/ExaDev/eslint-config/commit/c37ca5ac656bef0316221f32fd21ed28a775223e))

## [2.31.2](https://github.com/ExaDev/eslint-config/compare/v2.31.1...v2.31.2) (2026-10-02)


### Documentation

* document reading the shared layout into workspaceArchitecture ([f21b81f](https://github.com/ExaDev/eslint-config/commit/f21b81f68c6f4442a8ec9061fce5b29a4c696b78))


### Tests

* cover policy options added beside a spread shared layout ([8fbdd7b](https://github.com/ExaDev/eslint-config/commit/8fbdd7b2048d42e0529661db3c040fa3ecac7b14))
* prove a layout loaded from @exadev/config maps into workspaceArchitecture ([eb7e6dd](https://github.com/ExaDev/eslint-config/commit/eb7e6dd2e3d54d01b223c9530f7835cfd51b829a))


### Chores

* add @exadev/config and cosmiconfig as dev dependencies ([e80d802](https://github.com/ExaDev/eslint-config/commit/e80d802f48864602a58b724971642f667649e1c9))

## [2.31.1](https://github.com/ExaDev/eslint-config/compare/v2.31.0...v2.31.1) (2026-10-02)


### Continuous Integration

* correct the checkout persist-credentials comment ([c2643f1](https://github.com/ExaDev/eslint-config/commit/c2643f1a1f1fabdbdd470c36b9b5d1df861e296c))
* correct the host-key rotation comment on the provision step ([0a7d8c1](https://github.com/ExaDev/eslint-config/commit/0a7d8c13bba0acb15e72678c737ebbede07cdea2))
* correct the release preflight comment on push ordering ([713009e](https://github.com/ExaDev/eslint-config/commit/713009e8a8a32dc67ba294b8c8547d91afe748ba))
* drop the chmod that umask already makes redundant ([0ced514](https://github.com/ExaDev/eslint-config/commit/0ced514a6c16f426a4703701bc38eeb2b65c4f40))
* fail the release push at once when the deploy key is unusable ([ff5a564](https://github.com/ExaDev/eslint-config/commit/ff5a5644ac385ee1ee8ec828fd418cea1e55c622))
* note that key cleanup relies on an ephemeral runner ([b2b9da8](https://github.com/ExaDev/eslint-config/commit/b2b9da8a05ce91083b9703e7f15b4c0567ee8784))
* pin release job actions to commit SHAs and blank shell startup hooks ([a04bad7](https://github.com/ExaDev/eslint-config/commit/a04bad70b122503064e684968ff74c2c0bdb363e))
* pin the release job to the newest week-old npm 12.x ([901926b](https://github.com/ExaDev/eslint-config/commit/901926b21f27332705709b05d773a3d35162f954))
* provision the release deploy key only for the semantic-release step ([52653db](https://github.com/ExaDev/eslint-config/commit/52653db25186cf189b618c253673850896a4be94))

# [2.31.0](https://github.com/ExaDev/eslint-config/compare/v2.30.0...v2.31.0) (2026-10-02)


### Features

* add package-requirements rule for conditional manifest fields, files and scripts ([2213c41](https://github.com/ExaDev/eslint-config/commit/2213c41db3abf51ac2ec73e36fc2f67c73245a8c))
* add the tooling wiring preset for publish checks, root tooling, hooks and tool configs ([022b4f6](https://github.com/ExaDev/eslint-config/commit/022b4f60243ab4739610d60fa86bb66c490ba031))
* verify through ESLint's Node API that the config is applied to sample files ([e28562b](https://github.com/ExaDev/eslint-config/commit/e28562b91da9aaae428dd6f1d6d3fedf9c12f26c))


### Bug Fixes

* accept syncpack configured under config.syncpack in package.json ([c5c96b0](https://github.com/ExaDev/eslint-config/commit/c5c96b008a8eef51ddcf1070c43e1b991c0955fb))
* find the repository root structurally instead of from the ESLint working directory ([9b19059](https://github.com/ExaDev/eslint-config/commit/9b1905908f9fe0abb3b2b3bed0e0f0d7e57fa96d))
* list a file requirement once however many equal objects state it ([a08b6e9](https://github.com/ExaDev/eslint-config/commit/a08b6e9f723856c1f4d639465f2b48bf477b058a))
* name every accepted spelling of a file requirement that allows a manifest field ([4e244f5](https://github.com/ExaDev/eslint-config/commit/4e244f5c9e6412b483edf06d002f1c301c2a8243))
* require the root tool scripts to run the tool, not merely exist ([4053223](https://github.com/ExaDev/eslint-config/commit/40532237a2d443fbf289cc1ab07d292e611db832))


### Code Refactoring

* share script requirement reading and checking beyond workspace selectors ([bd15e6d](https://github.com/ExaDev/eslint-config/commit/bd15e6d52bc08e314ac45a5cf97e7a3c150ddf81))


### Documentation

* document the tooling wiring preset and the ESLint verifier and export them ([36272d5](https://github.com/ExaDev/eslint-config/commit/36272d5a93efea662137af50e29d64366b8f45aa))
* fix the punctuation of the fixture ignore comment ([45997fa](https://github.com/ExaDev/eslint-config/commit/45997fa1bb2037d63bcb1957269a57ba1df5a1dc))
* state that the smoke project check covers presence only ([81a462e](https://github.com/ExaDev/eslint-config/commit/81a462e2423565bb76fe9125b300521ca856c141))


### Tests

* exercise every dependency field the declares condition reads ([bc70b57](https://github.com/ExaDev/eslint-config/commit/bc70b57c6128faf04dba35493e71c2616ab4f68d))

# [2.30.0](https://github.com/ExaDev/eslint-config/compare/v2.29.0...v2.30.0) (2026-10-01)


### Features

* add playwright-config rule ([625d287](https://github.com/ExaDev/eslint-config/commit/625d28788b3078959e7c6dc6c325c1eb630b1174))
* add require-compiler-options rule ([5849719](https://github.com/ExaDev/eslint-config/commit/5849719e3a0fca31638e03ac58ea76252a000126))
* add stryker-break-threshold and stryker-thresholds-order rules ([e3c82cd](https://github.com/ExaDev/eslint-config/commit/e3c82cdf490c0f7719db4a94d053cb5dfc085d0a))
* add vitest-config and vitest-coverage-config rules ([e60fc1d](https://github.com/ExaDev/eslint-config/commit/e60fc1d61ce68b5825ea5590bb5347c01ee94e92))
* read the literal structure of a tool config file ([cb450e7](https://github.com/ExaDev/eslint-config/commit/cb450e74e48a9b2b4574be6ed82e6bd0143f9c5d))
* register the tool config rules in the plugin ([78f3710](https://github.com/ExaDev/eslint-config/commit/78f3710c4936ae964dabc67b0fd25dd73de8fac3))


### Bug Fixes

* accept a root file name as a vitest coverage threshold key ([798e0b5](https://github.com/ExaDev/eslint-config/commit/798e0b5252644173483b5915be8ef361d0a570cb))
* judge the merged configuration of a playwright defineConfig call ([f782623](https://github.com/ExaDev/eslint-config/commit/f782623b505af45297c5d60a344829882f343b3a))
* name TypeScript 5.4 as the minimum for require-compiler-options ([922f3ff](https://github.com/ExaDev/eslint-config/commit/922f3ffa04f1d96e0885ebeff864755781b756db))
* read compiler options from the tsconfig, not the typescript-eslint program ([5285c58](https://github.com/ExaDev/eslint-config/commit/5285c588fd082bf5d4baafd07567ae020b9107f9))
* report require-compiler-options again in each run of a long-lived ESLint instance ([14c4e7f](https://github.com/ExaDev/eslint-config/commit/14c4e7fb269d2f33d5f1cd8c65c44a43d5b6e2db))
* stop reporting a bare node_modules in vitest coverage.exclude ([ba58cd0](https://github.com/ExaDev/eslint-config/commit/ba58cd0ed59c3551570f6550bda222f864919ce7))
* tell require-compiler-options runs apart by tsconfig and lint order ([3e6380e](https://github.com/ExaDev/eslint-config/commit/3e6380e9e2381a9b7ee110a55a2525c7629a9fe6))


### Code Refactoring

* read a tsconfig by path, apart from finding a program's tsconfig ([f5892b1](https://github.com/ExaDev/eslint-config/commit/f5892b13b023830bfea737b40d7afac2c0775a7b))
* share one property key name reader between static-config and vitest-config ([48ae4ba](https://github.com/ExaDev/eslint-config/commit/48ae4baabd97d33c561ec96ba3f198ce9357012c))
* share one scalar compiler option value guard ([0c02e33](https://github.com/ExaDev/eslint-config/commit/0c02e3384b98d52cb4620e0b4fc40e3e0122905f))


### Documentation

* document the compiler option and tool config rules ([d8099f2](https://github.com/ExaDev/eslint-config/commit/d8099f2817b1b43b0443d6bba828890986c052a4))


### Styles

* split the joined config blocks in eslint.config.ts ([547ecbb](https://github.com/ExaDev/eslint-config/commit/547ecbb80c102bd1409ad5560b73f2bd5a8885e1))


### Tests

* run the long-lived require-compiler-options tests with persistent programs ([4665a54](https://github.com/ExaDev/eslint-config/commit/4665a5439003ae6a6b60d87e339ad4e269565a1d))


### Build System

* depend on typescript-estree and type the file reference schema ([b441f54](https://github.com/ExaDev/eslint-config/commit/b441f54ad4cb8fd10389a9d996f319bfd681a8ba))


### Chores

* hold this repo's own configs to the new rules ([d35a8d8](https://github.com/ExaDev/eslint-config/commit/d35a8d80d8066937a94471320180b3eb258b8642))

# [2.29.0](https://github.com/ExaDev/eslint-config/compare/v2.28.0...v2.29.0) (2026-10-01)


### Features

* add no-defensive-fallback rule ([1cee130](https://github.com/ExaDev/eslint-config/commit/1cee13002e69e662eabe6cdc443b62453808456b))
* enable core robustness rules and stricter switch exhaustiveness ([758c55a](https://github.com/ExaDev/eslint-config/commit/758c55a19a6868c9e63441d4b6bc57685bb706ad))


### Bug Fixes

* match a bare allow filename at any depth in no-defensive-fallback ([6efefae](https://github.com/ExaDev/eslint-config/commit/6efefae3a0f32429ed7d3a0a075cf07e48c48249))
* report a swallowing rejection handler passed as the second argument of then ([2c68d5a](https://github.com/ExaDev/eslint-config/commit/2c68d5aceac3838c1327fd0ae29b0b9912d3b763))
* report void, 0n and continue swallows in no-defensive-fallback ([72dcd42](https://github.com/ExaDev/eslint-config/commit/72dcd427560b2f0b8a9f43684c2ebc13b1bb0f16))


### Code Refactoring

* reuse entryFilesSchema for the no-defensive-fallback allow files ([746ee5b](https://github.com/ExaDev/eslint-config/commit/746ee5b1fa6effac28bf157590dbd24e0e4b7154))
* share the type-only wrapper check across rules ([606f433](https://github.com/ExaDev/eslint-config/commit/606f4332523b363cfdbbdfb9c107a01664c28f08))
* write out exported return types and compare to null strictly ([83f528e](https://github.com/ExaDev/eslint-config/commit/83f528ec803ce0a0dd5b2dd0f440c5852fb4085d))


### Documentation

* describe the shared robustness rule set in the architecture notes ([fb9d083](https://github.com/ExaDev/eslint-config/commit/fb9d083ee8830f6a6327ea68269f1dc211ca5926))
* document no-defensive-fallback and the sequential await override ([7b8b1e3](https://github.com/ExaDev/eslint-config/commit/7b8b1e3458f05a5d2b068c49a26c9f8cca4acd21))
* drop em-dashes from the new rule-tuning bullets ([f7b58d9](https://github.com/ExaDev/eslint-config/commit/f7b58d947265f1501cc1efdee08ee9c9489b3d6b))
* keep the rule-tuning bullets in one list ([5feb645](https://github.com/ExaDev/eslint-config/commit/5feb6457f69f0f1668540f9db1e36208dca5f554))
* name the predicate and schema false positives and the bare-filename allow depth ([1cc33fe](https://github.com/ExaDev/eslint-config/commit/1cc33fe8e56f6c12d1d0bb9afbe60c074eb0c93d))


### Tests

* cover hole and unreachable-statement returns in no-defensive-fallback ([003e8b9](https://github.com/ExaDev/eslint-config/commit/003e8b97bc6e6dcafc663d89147271e3dd9c53e6))

# [2.28.0](https://github.com/ExaDev/eslint-config/compare/v2.27.0...v2.28.0) (2026-09-30)


### Features

* add markdown-required-heading rule and markdownHeadingsConfig preset ([c290ed9](https://github.com/ExaDev/eslint-config/commit/c290ed95b2758e8c3011acc8c119400ed6dbd877)), closes [#80](https://github.com/ExaDev/eslint-config/issues/80)
* add no-multiline-template-literal rule with a string-preserving fix ([3c459ba](https://github.com/ExaDev/eslint-config/commit/3c459badaa80bb16e56815e7de7f88fd339287a9)), closes [#79](https://github.com/ExaDev/eslint-config/issues/79)
* add server component boundary rules to the Next.js preset ([095ebb0](https://github.com/ExaDev/eslint-config/commit/095ebb08195dbe8263e2754b4379ce7c8fa0c6cb)), closes [#82](https://github.com/ExaDev/eslint-config/issues/82)
* add timeout-aborts-request rule for Promise.race timeouts ([9e7b163](https://github.com/ExaDev/eslint-config/commit/9e7b1636c98ec6a96a8973a897c029fc99bd1a77)), closes [#81](https://github.com/ExaDev/eslint-config/issues/81)


### Bug Fixes

* accept any unary expression as data and word the prop rule as data, not literal ([ae28306](https://github.com/ExaDev/eslint-config/commit/ae2830649c2a5a017b97c69eb7bd5be5199356d3))
* decline the no-multiline-template-literal fix where the literal type is required ([cb218b1](https://github.com/ExaDev/eslint-config/commit/cb218b1b0a969ad50ae45a768a89d79652f7c9e8))
* require the catch guard to test that the controller has aborted, not its negation ([1dc5dcf](https://github.com/ExaDev/eslint-config/commit/1dc5dcfa7dbef96bb76d63205f7d6c40bf175af2))
* require the race to be awaited inside the try for its finally and catch to count ([db078e5](https://github.com/ExaDev/eslint-config/commit/db078e5a2154e2e83bd8b665d93eaa2080f24880))
* require the timeout race to use the controller its timer aborts ([011cb45](https://github.com/ExaDev/eslint-config/commit/011cb45c9205629493a9508fdbc8800d417d4828))
* treat only dot-slash paths as relative in no-external-member-jsx-tag ([e8eb328](https://github.com/ExaDev/eslint-config/commit/e8eb328990f367d9719765af8680db5eb2cec125))


### Code Refactoring

* let the cooked line-feed count alone refuse escapes spelling a line feed ([f3fd74d](https://github.com/ExaDev/eslint-config/commit/f3fd74d1db8d7899dd4fcc507edb459374d9ba02))
* throw on a missing source line in the template indentation lookup ([bbae429](https://github.com/ExaDev/eslint-config/commit/bbae429baf89e180e5e80903ff30d7c11d1edf6d))
* throw on missing visitor keys in the timeout-aborts-request traversal ([f0fc449](https://github.com/ExaDev/eslint-config/commit/f0fc4498d03f92d0708b534f537756e56d9bd32c))


### Documentation

* describe the awaited-race, abort-test and controller checks of timeout-aborts-request ([ba415e5](https://github.com/ExaDev/eslint-config/commit/ba415e53236aae7ccf2aaae515bd28f62e712a8a))


### Chores

* add @eslint/markdown as an optional peer and dev dependency ([7bc3da0](https://github.com/ExaDev/eslint-config/commit/7bc3da00521c29286d27c7d72e7d38d94f7f46f7))

# [2.27.0](https://github.com/ExaDev/eslint-config/compare/v2.26.0...v2.27.0) (2026-09-30)


### Features

* add non-vacuous-guard rule requiring guard tests to show they can fail ([5d412b1](https://github.com/ExaDev/eslint-config/commit/5d412b12ba7e3272f7b8e7254161d9d66a36f1f3))
* add pure-module rule banning I/O, ambient state and async in configured files ([1d3b4a9](https://github.com/ExaDev/eslint-config/commit/1d3b4a9948133a4bc0f8381846b9acf831c2a19d))
* add pureModules option and pureModulesConfig for functional-core files ([5d5b715](https://github.com/ExaDev/eslint-config/commit/5d5b7156475c6bf7f3f52943ca7f8b6f381097d7))
* add scoped-first-parameter rule for repository interface methods ([e7ac227](https://github.com/ExaDev/eslint-config/commit/e7ac227c0e6dbcb13ed64bbce820075cc244d868))
* add testHygiene option for guard and conformance test files ([fc6d707](https://github.com/ExaDev/eslint-config/commit/fc6d70787824164550d05a886bcc48be70689a35))
* check test functions a conformance kit receives as parameters ([459607e](https://github.com/ExaDev/eslint-config/commit/459607e6cd1e39a3ab7b656bb8c07a516b096249))


### Bug Fixes

* ban console, worker and sqlite in pure modules and see through globalThis ([b9131ca](https://github.com/ExaDev/eslint-config/commit/b9131caf96a3bac03be0c4c4e00f6a05a1b290a1))
* mirror the README test hygiene example without a duplicate block set ([7d818c8](https://github.com/ExaDev/eslint-config/commit/7d818c8c7de2db2f4ece14b6d69bc253cf3231d1))
* name the configured option in pure-module option errors ([6dbc915](https://github.com/ExaDev/eslint-config/commit/6dbc91542fe8659122158f2ec6dbc55d17f4dfec))
* report Node crypto randomness and key generation in pure modules ([199d219](https://github.com/ExaDev/eslint-config/commit/199d21977e59ae735e00387d019deec25eccf31c))
* resolve the scope parameter's declared name through aliases in scoped-first-parameter ([bf017b3](https://github.com/ExaDev/eslint-config/commit/bf017b3c2ebb537b3c8f7366015bb03c56ff8e80))
* stop counting a discovery assertion as evidence about the pattern in non-vacuous-guard ([077bee8](https://github.com/ExaDev/eslint-config/commit/077bee8ed6895c32494b7cf90ff0425b23c61666))
* treat a possibly empty each table callback as conditional in non-vacuous-guard ([621e307](https://github.com/ExaDev/eslint-config/commit/621e307d5d41eb9cd4b79196237b3eeaa16c4ef7))
* treat the Array.from mapper as running per element in non-vacuous-guard ([856615f](https://github.com/ExaDev/eslint-config/commit/856615f5e63ae91e7df679ccd746d6134a16556d))


### Documentation

* document a scoped complexity ceiling for logic-free modules ([3b4279a](https://github.com/ExaDev/eslint-config/commit/3b4279a18ef00096d6a43ea08cb3522b355adddb))


### Tests

* type the directly configured pure-module rule in the option-name test ([0027cf3](https://github.com/ExaDev/eslint-config/commit/0027cf32e40b61e750cd174af467363c7eb13811))


### Chores

* range the @vitest/eslint-plugin devDependency like the others ([0271660](https://github.com/ExaDev/eslint-config/commit/027166053d1961bacc757f8cae4a8b5b2cda7421))

# [2.26.0](https://github.com/ExaDev/eslint-config/compare/v2.25.0...v2.26.0) (2026-09-30)


### Features

* add filename-pattern rule ([0ca0f2a](https://github.com/ExaDev/eslint-config/commit/0ca0f2a4d736b0084e93ea927f2a38a75bebc84a))
* add import-policy rule and options ([dbca4dc](https://github.com/ExaDev/eslint-config/commit/dbca4dc7abb0d114fec84ef88551db4f31d731d1))
* add required-exports rule ([95889a3](https://github.com/ExaDev/eslint-config/commit/95889a388c725cbdc149f0164c8a1fc926fe4e3d))
* add required-imports rule ([c498316](https://github.com/ExaDev/eslint-config/commit/c49831646277a863981916b81edf1566790b3463))
* add shared entry-option helpers and a specifier pattern matcher ([eedfb1f](https://github.com/ExaDev/eslint-config/commit/eedfb1f9f51aeccd4f6dc2136c5f2ed27a856769))
* register the file-level rules and wire importPolicyConfig ([de7a614](https://github.com/ExaDev/eslint-config/commit/de7a614feccf4a4c3bfd88c08f6d93711eb118e8))


### Bug Fixes

* count constructions, non-null callees and tagged templates in required-imports call ([1880afe](https://github.com/ExaDev/eslint-config/commit/1880afef5be4bc3edf25c0f7b908eaccac20ae4f))
* name the pattern field when a filename-pattern regex is invalid ([bead7a3](https://github.com/ExaDev/eslint-config/commit/bead7a384295b70a3730cc8fc20eb1f1a98db421))
* normalise the file of an import-policy exception edge ([5c3970c](https://github.com/ExaDev/eslint-config/commit/5c3970cadd6e1a13a11ec7fb3f75d8a294c5b807))
* reject an import-policy exception edge in a file a confine entry allows ([53152e3](https://github.com/ExaDev/eslint-config/commit/53152e3a31010e974e6cfe3c4e4af66bd5481c24))
* reject duplicate and misspelt filename-pattern sibling templates ([25abb79](https://github.com/ExaDev/eslint-config/commit/25abb79c3f2d788f00b5b5e4e5d68233696200c5))


### Code Refactoring

* expose the glob path matcher and relative-path spelling behind createFileScope ([876a74f](https://github.com/ExaDev/eslint-config/commit/876a74f539026c2f0c2ca7e87120d816361ab34f))


### Documentation

* document exception edge normalisation and confine liveness ([f79cbeb](https://github.com/ExaDev/eslint-config/commit/f79cbeb862cf51f09bd32db94adc3f30478b3f70))
* document filename-pattern regex and sibling template validation ([ba70b4e](https://github.com/ExaDev/eslint-config/commit/ba70b4e635e20e25a545b9e82fe168dd49053d49))
* document the file-level rules, import policy and filename patterns ([0cd3ea8](https://github.com/ExaDev/eslint-config/commit/0cd3ea80724b9d775f499da3a462d90af6ae9579))
* list importPolicies and the new exports in the README ([a529bb3](https://github.com/ExaDev/eslint-config/commit/a529bb3e9d1efa7309c07fd3526758570955a839))
* note that export = contributes no name to required-exports ([b344379](https://github.com/ExaDev/eslint-config/commit/b344379b3795d36f8c59ca83b59394263d300b37))
* state that export = contributes no name in collectExportedNames ([5f5e536](https://github.com/ExaDev/eslint-config/commit/5f5e53605b8f0c3e1199966c46b04fd761d2ffed))

# [2.25.0](https://github.com/ExaDev/eslint-config/compare/v2.24.0...v2.25.0) (2026-09-30)


### Features

* add eslint-plugin-turbo as an optional turboEnv preset ([23dbb33](https://github.com/ExaDev/eslint-config/commit/23dbb3320c0baf04861d55915abd9fbb369c4de4))
* add turbo-task-config-inputs and the toolConfigs, taskGraph and hygiene options ([2e75c88](https://github.com/ExaDev/eslint-config/commit/2e75c887c1562c984e4945416a807771d27dd49c))
* add turbo-task-graph and turbo-json-hygiene and wire the new turbo rules ([cbeb81f](https://github.com/ExaDev/eslint-config/commit/cbeb81f467ecde9500edb2b184216407aeac0cb4))
* export the taskGraph, hygiene and aggregate task option types ([1ece091](https://github.com/ExaDev/eslint-config/commit/1ece0919f26635d05bf60f75711137f94684c872))
* read inputs, globalDependencies, $schema and pass-through env from turbo.json ([03c1bc0](https://github.com/ExaDev/eslint-config/commit/03c1bc01f7a233ad2a9a3f1173239c063f4f83f1))
* report a taskGraph requirement that matches no task entry ([c4dcc52](https://github.com/ExaDev/eslint-config/commit/c4dcc527c28c800d1bd6ec238885dde9cffe418d))


### Bug Fixes

* accept eslint-plugin-turbo from the first release with a flat recommended config ([9037761](https://github.com/ExaDev/eslint-config/commit/90377614b216f0f2d02127ce23453854d3671f1c))
* accept the local and versioned turbo $schema forms turbo documents ([58b7f01](https://github.com/ExaDev/eslint-config/commit/58b7f01932c8bb8d85ca2f3c797a19548c5e2a6a))
* develop against an eslint-plugin-turbo release that passes the minimum release age ([f940ced](https://github.com/ExaDev/eslint-config/commit/f940cedd474a2b16242573eb4b0b71b0c51d821b))
* name the excluding inputs glob when a tool config is dropped from a task cache key ([6e013b9](https://github.com/ExaDev/eslint-config/commit/6e013b9c1675c23c32e2dd28850861a5434834fe))
* reject an empty tool name in the toolConfigs option ([cae7df3](https://github.com/ExaDev/eslint-config/commit/cae7df3027d64d74e96bc012d1beb95a34ce0d0a))


### Code Refactoring

* reuse the package qualifier when grouping config input problems ([7467fb5](https://github.com/ExaDev/eslint-config/commit/7467fb52a9e74e0db0c452d1beea47e5f142951a))
* share the single-plugin preset builder between nextjs and turboEnv ([e62a8e5](https://github.com/ExaDev/eslint-config/commit/e62a8e59f680243e459aa03becd4ac510dc13669))


### Documentation

* describe the config inputs, task graph, hygiene and turboEnv options ([f846ea1](https://github.com/ExaDev/eslint-config/commit/f846ea1c5308f7441fc14781dc4fb7ddc553fb17))
* describe turbo default inputs as the package's source-controlled files ([550f14f](https://github.com/ExaDev/eslint-config/commit/550f14f08321584369f1d74cbb4df5bd394e470b))
* name the root task key for an aggregate task backed by a root script ([3ec788a](https://github.com/ExaDev/eslint-config/commit/3ec788a9ae13e4059cbb153624e0afea458f809a))
* replace spaced double hyphens in the turboEnv option comments ([6750930](https://github.com/ExaDev/eslint-config/commit/67509300f6c1e3f572010ed2cd1687fa6c12c012))
* state the eslint-plugin-turbo checks without dating them ([6fcfc04](https://github.com/ExaDev/eslint-config/commit/6fcfc04462fa598e65724623f2a4cc96e55ac3bd))


### Tests

* pin option list validation, package name handling and joined package names in the turbo rules ([15dc965](https://github.com/ExaDev/eslint-config/commit/15dc9652bfaf01d3e3c07ece5e4a40687e2f5201))

# [2.24.0](https://github.com/ExaDev/eslint-config/compare/v2.23.3...v2.24.0) (2026-09-30)


### Features

* add a file-reference option for reading a sibling or root file ([9d26018](https://github.com/ExaDev/eslint-config/commit/9d26018b01a37a517186566d08755a7c3c3b0402))
* add filename glob scoping and a JSONC parser for JSON rules ([e37e761](https://github.com/ExaDev/eslint-config/commit/e37e7618d52e8de6944bb23823456adf9c26181f))
* add package-has-files, dev-dependency-only and required-scripts workspace rules ([5fa720b](https://github.com/ExaDev/eslint-config/commit/5fa720bb8a2f64aa86318a034c641f3b04d70457))
* add turbo boundaries opt-in, package tag, script and ignore-comment rules ([8f11ed9](https://github.com/ExaDev/eslint-config/commit/8f11ed93f861e1923e9b80ee935590890b2b3bf1))
* add turbo script convention, task and script cross-check, outputs and no-fix rules ([3f94c75](https://github.com/ExaDev/eslint-config/commit/3f94c75bc7d762776700e5b3852179ebecaa3699))
* let no-uphill-dependency allow documented edges and exempt whole target groups ([e41fb8a](https://github.com/ExaDev/eslint-config/commit/e41fb8a7867b1fecbc67074b5b8ae5ee148cf72b))
* match a glob against files as well as directories inside a package directory ([381ac23](https://github.com/ExaDev/eslint-config/commit/381ac23f40ce1fdf81505ff532b7de4a6b115ca8))
* read allow, exemptTargetGroups, requiredFiles, devOnly and requiredScripts workspace options ([da54d26](https://github.com/ExaDev/eslint-config/commit/da54d263e594b3276f77c761224a6785dc29ad14))
* share the JSON language block builder and json/jsonc file globs ([73d66e0](https://github.com/ExaDev/eslint-config/commit/73d66e01dd5534d1e09e15e5e21b15a3c4502288))
* wire the turbo rules through turboConfig and exadevConfig ([71d943e](https://github.com/ExaDev/eslint-config/commit/71d943ea362de8c0261031a84b91a3df10993509))


### Bug Fixes

* build the surrounding-quote pattern per call so a mutation of it is testable ([fd2c92e](https://github.com/ExaDev/eslint-config/commit/fd2c92e74d532d0960f13a1c08a4dfa9303131e3))
* derive turbo boundary tag groups from the workspace architecture groups ([4d62519](https://github.com/ExaDev/eslint-config/commit/4d625197cf09868c7a607db3fd4b26cbbb405148))
* ignore a leading byte order mark when parsing a referenced JSONC file ([60a8232](https://github.com/ExaDev/eslint-config/commit/60a8232331eb26c01ebbdfcc5b7f1db8ea00b164))
* keep files outside the working directory out of every file scope ([007dad8](https://github.com/ExaDev/eslint-config/commit/007dad82cbcd67cc01e5e358eb3c3cc28c45b272))
* read an empty flow sequence in pnpm-workspace.yaml as no packages ([916b808](https://github.com/ExaDev/eslint-config/commit/916b808dc7f54ef14a45cc5fd3b3c343be0afed1))
* recognise a boundaries script run with valueless package manager flags ([f4d42dc](https://github.com/ExaDev/eslint-config/commit/f4d42dcaf3c37b928a05b8443cea71ea0b4db883))
* reject duplicate file globs and name the specific glob-list failure ([1a9cb04](https://github.com/ExaDev/eslint-config/commit/1a9cb04297d581393996cc7888c8c29371974aeb))
* reject JSONC with a value-less comma and keep tokens apart across a block comment ([39b1f53](https://github.com/ExaDev/eslint-config/commit/39b1f53cf8e562c2783ebc5bb32ea1ab1b223b97))
* reject positional words after the delegated task in a public script ([3b3222f](https://github.com/ExaDev/eslint-config/commit/3b3222f9217cb306e795341b8add7de07f7e03dd))
* throw on malformed turbo.json values and read outputs null as undeclared ([04d5444](https://github.com/ExaDev/eslint-config/commit/04d5444172cd52ecda170aa7060c905a0a8e1b0c))
* treat a // task run or depended on by its bare name as reachable ([620f0e1](https://github.com/ExaDev/eslint-config/commit/620f0e1d580aefc9f91ca0eac52fa2135337cabd))


### Code Refactoring

* build the JSONC string-literal pattern per call so mutants attribute to tests ([9d54cec](https://github.com/ExaDev/eslint-config/commit/9d54cec88077db863d91508f7c91ea5e340dc8cd))
* scan JSONC escapes without a whitespace-equivalent character class ([6f13040](https://github.com/ExaDev/eslint-config/commit/6f130404c9eaf38b6731949b25c5e5c65bdd6d86))
* scan JSONC string literals with a sticky pattern and pin edge cases in tests ([4bc5647](https://github.com/ExaDev/eslint-config/commit/4bc56472baa5ad59012d07d61903cbbe372756a4))
* share script reading between the script rules ([2f520fe](https://github.com/ExaDev/eslint-config/commit/2f520fe5ad06a158400a5b75eb68a984dd4947b8))


### Documentation

* describe file scope outside cwd, glob uniqueness and BOM handling ([187599f](https://github.com/ExaDev/eslint-config/commit/187599fae1521a10caa11f394b3423f76cd31b97))
* describe the allow list, exempt groups and the three opt-in workspace rules ([be19f7d](https://github.com/ExaDev/eslint-config/commit/be19f7d6c2650066e702f1bdab0356d74063452e))
* describe the turbo rules without counting them ([60b6c7c](https://github.com/ExaDev/eslint-config/commit/60b6c7c02fd3a3b8a1e393b20bf70bc6bd41453e))
* describe the turbo rules, their options and the boundaries limits ([26ef076](https://github.com/ExaDev/eslint-config/commit/26ef076a9fcf3976be28ff81e116ebe727665f91))
* **readme:** describe the shared JSON-language, file-scope and file-reference helpers ([0dc1059](https://github.com/ExaDev/eslint-config/commit/0dc1059d49cf770a9ae4c1e27bf5c97df07f4933))
* state which scripts exemptTasks covers and why fixFlags omits short forms ([94d2a99](https://github.com/ExaDev/eslint-config/commit/94d2a99a8298cd14c5d5fbb7a3df1751caed32f0))


### Tests

* add an in-memory workspace filesystem for rules that read sibling files ([6388b16](https://github.com/ExaDev/eslint-config/commit/6388b16b08a0b6a1dc954fa3df5ad8998794f5b5))
* build the valueless flag list per call so its entries are mutable ([840d6ab](https://github.com/ExaDev/eslint-config/commit/840d6abc86af9261cee14bab1c115dd3336550b2))
* cover a comma at the very start of JSONC text ([22da6d7](https://github.com/ExaDev/eslint-config/commit/22da6d71d7370d56a23f56630189ccc7a06baad7))
* cover a root turbo configuration at the filesystem root ([695aa5c](https://github.com/ExaDev/eslint-config/commit/695aa5c925b83bd193cd24ec25bec3e63ea67718))
* pin JSONC dangling escapes, escaped whitespace and leading whitespace ([27470d8](https://github.com/ExaDev/eslint-config/commit/27470d80009781da3331f55052721819a79d56b3))
* pin option names, nested-object guards and file glob edge cases in the workspace rules ([e4c351d](https://github.com/ExaDev/eslint-config/commit/e4c351d252a79dd8805e92b88614641b4fe07984))
* pin the bare-name and valueless-flag cases of the turbo command readers ([474558b](https://github.com/ExaDev/eslint-config/commit/474558b94c628bb7581e94acb5ecf3242b542d21))


### Chores

* lint this repo's scripts with the turbo rules and split the fixing lint task ([e8b267b](https://github.com/ExaDev/eslint-config/commit/e8b267bbc617bdb7f0a7cac7a33122d1170934e7))

## [2.23.3](https://github.com/ExaDev/eslint-config/compare/v2.23.2...v2.23.3) (2026-09-29)


### Continuous Integration

* run mutation testing on manual dispatch only ([8ad4019](https://github.com/ExaDev/eslint-config/commit/8ad401933a75fcc6ccb7141604af24a0b7400be5))

## [2.23.2](https://github.com/ExaDev/eslint-config/compare/v2.23.1...v2.23.2) (2026-09-29)


### Continuous Integration

* lint commits with the repo's own commitlint instead of a Docker action ([3c9852a](https://github.com/ExaDev/eslint-config/commit/3c9852a0378790445e5206831e0bd62701767edb))
* resolve the runner once and prefer the self-hosted fleet ([d1c6955](https://github.com/ExaDev/eslint-config/commit/d1c6955eacbac652232913bdeb851c7b5747099d))
* run the mutation job on a 4-vCPU Blacksmith runner ([b059468](https://github.com/ExaDev/eslint-config/commit/b059468a230ba8c2b01cbd9f86f296201d803953))

## [2.23.1](https://github.com/ExaDev/eslint-config/compare/v2.23.0...v2.23.1) (2026-09-29)


### Bug Fixes

* declare @eslint/json as an optional peer dependency ([5a776ff](https://github.com/ExaDev/eslint-config/commit/5a776ff8151447a49b3e925543f80dcd6a6890a9))

# [2.23.0](https://github.com/ExaDev/eslint-config/compare/v2.22.2...v2.23.0) (2026-09-28)


### Features

* add prefer-doc-comment rule ([aa3d937](https://github.com/ExaDev/eslint-config/commit/aa3d9370c8a60b7028880342cd2c14727955db12))
* **deps:** add @stylistic/eslint-plugin ([37e38de](https://github.com/ExaDev/eslint-config/commit/37e38de72afadcb1a9f853429b808f1054e8dcfa))
* **prefer-doc-comment:** cover exported enums, namespaces, value consts, default expressions ([3f658d5](https://github.com/ExaDev/eslint-config/commit/3f658d5f14d29d7ca46042ef64c533c65f11d447))
* **prefer-doc-comment:** cover public abstract methods and function-valued class properties ([349d96a](https://github.com/ExaDev/eslint-config/commit/349d96a26b3a2d6758c442b5bd2b22669f624f5d))
* **prefer-doc-comment:** report an exported function's own overload signature ([cb4be1e](https://github.com/ExaDev/eslint-config/commit/cb4be1e603d41c91830e6d58ad17e06d67919da1))
* wire stylistic comment, class-member and JSX rules into config ([950de79](https://github.com/ExaDev/eslint-config/commit/950de796de61f0304454a5f3ea002a7344cbe475))


### Bug Fixes

* exempt a /*! license or banner block from both comment rules ([7758fa8](https://github.com/ExaDev/eslint-config/commit/7758fa83ee06b78eecdbb3800ed55b05e6e7f973))
* **prefer-doc-comment:** correct the PropertyDefinition null-guard comment ([8b051f6](https://github.com/ExaDev/eslint-config/commit/8b051f65ad4d7d4a09943a2f3cb1882245cd587f))
* **prefer-doc-comment:** cover a genuinely ambient function signature ([b53de1d](https://github.com/ExaDev/eslint-config/commit/b53de1d13e2fd677926adad433bfcf37e4a36e81))
* **prefer-doc-comment:** drop the redundant isLineRun guard in directiveIndex ([9feebbb](https://github.com/ExaDev/eslint-config/commit/9feebbbcf26f13528a4cb90b836f296ce0217c38))
* **prefer-doc-comment:** exempt overload implementation signatures ([96d8edb](https://github.com/ExaDev/eslint-config/commit/96d8edbf3834c2808315cbdf2430f0438f7a9483))
* **prefer-doc-comment:** judge the segment adjacent to the anchor, not the first directive ([335f2be](https://github.com/ExaDev/eslint-config/commit/335f2be5ae7f93fad037c8691e137834e2d38ad7)), closes [#region](https://github.com/ExaDev/eslint-config/issues/region)
* **prefer-doc-comment:** match ESLint's own directive rules exactly ([2b76c29](https://github.com/ExaDev/eslint-config/commit/2b76c29c7c629a0bfe46cdb9d232006131bc13c9))
* **prefer-doc-comment:** never merge a directive line into the fixed doc comment ([e82af51](https://github.com/ExaDev/eslint-config/commit/e82af518db396e55ec1349fcb64ad8ac2fe96e80))
* **prefer-doc-comment:** never merge a directive line into the fixed doc comment ([6f0373b](https://github.com/ExaDev/eslint-config/commit/6f0373b94764b0caa5dd3b00a5bf9579c0f3bc02))
* **prefer-doc-comment:** preserve comment indentation and unwrap starred blocks ([3cb5088](https://github.com/ExaDev/eslint-config/commit/3cb5088601fccc354675184aa22149e6fadb55a2))
* **prefer-doc-comment:** read the CRLF terminator from real source, not a rewritten comment ([1d03f9e](https://github.com/ExaDev/eslint-config/commit/1d03f9e3dd36e5da9e684dfa8a3322bedba99aaa))
* **prefer-doc-comment:** recognise #region/#endregion editor folding markers ([b620e04](https://github.com/ExaDev/eslint-config/commit/b620e0490d139b826d08192e15f99f6013431b28)), closes [region/#endregion](https://github.com/ExaDev/eslint-config/issues/endregion) [#region](https://github.com/ExaDev/eslint-config/issues/region) [#endregion](https://github.com/ExaDev/eslint-config/issues/endregion)
* **prefer-doc-comment:** recognise a real @-prefixed TypeScript directive ([bc6ad31](https://github.com/ExaDev/eslint-config/commit/bc6ad31a021e0e0a2e26af9609fd5938a1974dc1))
* **prefer-doc-comment:** recognise directives despite extra leading whitespace ([f198f72](https://github.com/ExaDev/eslint-config/commit/f198f72ea151476717eabdd199431acd73e08970))
* **prefer-doc-comment:** recognise eslint-enable in the directive pattern ([b6e9cae](https://github.com/ExaDev/eslint-config/commit/b6e9caee88a9e077c30dc543d775b8caff3a1fe1))
* **prefer-doc-comment:** recognise node:coverage, cspell and biome-ignore directives ([d2da2be](https://github.com/ExaDev/eslint-config/commit/d2da2beb97790a1d77d81d046d6481188cdf7698))
* **prefer-doc-comment:** recognise prettier-ignore and coverage-tool ignore directives ([d43028b](https://github.com/ExaDev/eslint-config/commit/d43028b0ba49df0d983b839e002fdb0fa53c64ee))
* **prefer-doc-comment:** report a multi-declarator export exactly once ([87c71e0](https://github.com/ExaDev/eslint-config/commit/87c71e08837b6a6f8a58e8b705d8caafd7215695))
* **prefer-doc-comment:** require ordering and static-match for a method's own overload signature ([cfa3fb0](https://github.com/ExaDev/eslint-config/commit/cfa3fb0d46472016444f0ad2066c461bdc71db5f))
* **prefer-doc-comment:** require the export wrapper to reach the public surface ([df97ee9](https://github.com/ExaDev/eslint-config/commit/df97ee94e5e91563fdbb962afcf4d7d039745000))
* **prefer-doc-comment:** restrict the VariableDeclaration check to export const ([0dd0e84](https://github.com/ExaDev/eslint-config/commit/0dd0e849bc0ec04160b66cf37fd6957b095b52fe))
* **prefer-doc-comment:** stop absorbing a trailing comment into the next leading group ([a081eae](https://github.com/ExaDev/eslint-config/commit/a081eaea96b2301dade124c09039181f69ecc762))
* **prefer-doc-comment:** stop folding triple-slash directives into doc comments ([1074346](https://github.com/ExaDev/eslint-config/commit/10743469fe9aa156ff97a2ff4e45a23e3b726e83))
* **prefer-doc-comment:** stop the fixer splicing real text into every line as indent ([bf9185c](https://github.com/ExaDev/eslint-config/commit/bf9185c3c0d136033e6a9d08f5401b2ec9c4fe2b))
* **prefer-doc-comment:** take the fixer's line break from the source ([a4e4bb9](https://github.com/ExaDev/eslint-config/commit/a4e4bb9512f0cefa712137ebfad3b6a9d24a6ddf))
* **prefer-doc-comment:** validate the unsafe-content gate against real TSDoc ([cce1303](https://github.com/ExaDev/eslint-config/commit/cce130358a637dc6a7516772ae779db181260bb7))
* **prefer-doc-comment:** withhold autofix for any TSDoc tag line, not just a blank line before one ([b97fb2c](https://github.com/ExaDev/eslint-config/commit/b97fb2c36b5f45dd51bd0b46ec329088330607d4))
* **prefer-doc-comment:** withhold autofix when a line would collide with jsdoc/no-multi-asterisks ([36561e9](https://github.com/ExaDev/eslint-config/commit/36561e9906fd70d43d8f8c5b22d0521c381ea434))
* **prefer-doc-comment:** withhold autofix when a line would collide with jsdoc/tag-lines ([0c86926](https://github.com/ExaDev/eslint-config/commit/0c869269bbb51ed52591f208e81c3ad2c4e42aff))
* **release:** arm the deploy-key push by persisting checkout credentials ([456c22f](https://github.com/ExaDev/eslint-config/commit/456c22f0d17f2b564beb840b7b3676dd730539a5))
* satisfy prefer-doc-comment across the repo's own source ([0c4a288](https://github.com/ExaDev/eslint-config/commit/0c4a28859f9905e9a06a9d1b4c5759671fc1a031))
* **stylistic-comments:** exempt cspell:disable-line from line-comment-position ([5983a46](https://github.com/ExaDev/eslint-config/commit/5983a46ac74e9b4e2a5b3c6467778cd1fdee08e9))
* **stylistic-comments:** stop enabling multiline-comment-style ([1b4e5bd](https://github.com/ExaDev/eslint-config/commit/1b4e5bd946ff56497e0fa6e629d163caaac2f56b))
* **stylistic-comments:** stop forcing a blank line between consecutive imports and directives ([674bfe6](https://github.com/ExaDev/eslint-config/commit/674bfe6f658df456a7a8275ea23438899601bb37))
* **stylistic-comments:** stop multiline-comment-style breaking triple-slash directives ([0b7d45b](https://github.com/ExaDev/eslint-config/commit/0b7d45bb7865b4b01bf8c79e481fadff407f8d62)), closes [eslint-stylistic/eslint-stylistic#1285](https://github.com/eslint-stylistic/eslint-stylistic/issues/1285)
* **stylistic-comments:** stop spaced-comment breaking source-map and #region markers ([a511051](https://github.com/ExaDev/eslint-config/commit/a511051d7c50348d41d3b6e261fe4b8d429a5fc6)), closes [#region](https://github.com/ExaDev/eslint-config/issues/region) [region/#endregion](https://github.com/ExaDev/eslint-config/issues/endregion)


### Code Refactoring

* **prefer-doc-comment:** drop the redundant -1 branch from the segment slice ([e480610](https://github.com/ExaDev/eslint-config/commit/e480610311def4d42c702af6b26de833dcb7c5a0))
* **prefer-doc-comment:** remove defensive fallbacks for unreachable cases ([e583048](https://github.com/ExaDev/eslint-config/commit/e58304840438dac2ee2784649878276121d45ee1))
* **stylistic-comments:** share the real-Linter test config across describe blocks ([7093d5e](https://github.com/ExaDev/eslint-config/commit/7093d5e0593ebf2d20049fffbc5398f331ac54b2))


### Documentation

* correct the triple-slash issue wording to a plain upstream link ([f54606f](https://github.com/ExaDev/eslint-config/commit/f54606f41eb29ae8f0cc36102d84230d1617b557))
* document prefer-doc-comment and the new stylistic rules ([30882e9](https://github.com/ExaDev/eslint-config/commit/30882e928aa551d21b8f4d8a243ad988b290896b))
* make version and process references evergreen ([9c4812e](https://github.com/ExaDev/eslint-config/commit/9c4812ecd339f2b63a1708fb9e6f44c15f232128))
* **prefer-doc-comment:** correct the indent comment's column-zero claim ([499d8ef](https://github.com/ExaDev/eslint-config/commit/499d8efe605183b2f9a8064b5c8991d037fe6d5b))
* **prefer-doc-comment:** fix a garbled sentence in the rules table ([0e08fa4](https://github.com/ExaDev/eslint-config/commit/0e08fa4a1aafc1c537343a88f73f478efafa6f38))
* **prefer-doc-comment:** sync the README directive list with the widened pattern ([9abd9f0](https://github.com/ExaDev/eslint-config/commit/9abd9f09fd837b62f671e5a51c826a89982f7caa)), closes [region/#endregion](https://github.com/ExaDev/eslint-config/issues/endregion)
* **readme:** cover a directive seated directly above the declaration ([2581b55](https://github.com/ExaDev/eslint-config/commit/2581b558b7f384f39411489a566a0ead0d899ad7))
* **readme:** describe prefer-doc-comment's generalised tag-line withholding ([a6609e6](https://github.com/ExaDev/eslint-config/commit/a6609e62c87a383fe704c49706a5c738dccb66bf))
* **readme:** document the [@stylistic](https://github.com/stylistic) plugin registration migration ([6b39472](https://github.com/ExaDev/eslint-config/commit/6b39472e101c2a21bcac2df1b4485bf11f132209))
* **readme:** fix the dangling clause in the prefer-doc-comment row ([e01aa20](https://github.com/ExaDev/eslint-config/commit/e01aa2027912cc5bbeee75d30445a0048dea130b))
* **readme:** state which config wires prefer-doc-comment, correct its stale mechanism note ([7fb4526](https://github.com/ExaDev/eslint-config/commit/7fb45267e276188f8d3b49d41b79f87bc8b19041))
* **stylistic-comments:** correct jsx-pascal-case comment on what it enforces ([827e21d](https://github.com/ExaDev/eslint-config/commit/827e21dd4f84cf247fe53fd0823ecd218a989946))
* **stylistic-comments:** correct the block.markers explanation for spaced-comment ([d0260ba](https://github.com/ExaDev/eslint-config/commit/d0260baf01c01fdd6de53812b0f54f9e349b35d6))
* **stylistic-comments:** document the no-space triple-slash spaced-comment gap ([18950cb](https://github.com/ExaDev/eslint-config/commit/18950cb60e0bb452637d39dbea0aed79baaa6917)), closes [ExaDev/eslint-config#47](https://github.com/ExaDev/eslint-config/issues/47)
* **stylistic-comments:** remove variant rule counts from header comment ([b489c19](https://github.com/ExaDev/eslint-config/commit/b489c19fa60db015d5c752811fa409b845f70fd3))
* track the multiline-comment-style re-enable with a real issue ([c860ff9](https://github.com/ExaDev/eslint-config/commit/c860ff9c7089f72fed1a8ded61f561d6f1aeb9db))


### Styles

* apply stylistic comment and class-member rules across the codebase ([4ceb1c0](https://github.com/ExaDev/eslint-config/commit/4ceb1c0f72e3a4b96c792b0cf4d1739dd7f589be))
* finish reverting bare-block churn left behind by 7966e15 ([8930f4a](https://github.com/ExaDev/eslint-config/commit/8930f4addea5756aca81dc9f99ac1ad4023d63c0))
* revert bare-block churn from the disabled multiline-comment-style rule ([8238223](https://github.com/ExaDev/eslint-config/commit/8238223c7091e0d7a2242bafd55bfa48c3974130))
* trim whitespace-only paragraph-separator lines in bare comment blocks ([0b20cf8](https://github.com/ExaDev/eslint-config/commit/0b20cf86a27c6515c4b3774f36059fc7732852c9))


### Tests

* close remaining mutation gaps in prefer-doc-comment and stylistic-comments ([baeb627](https://github.com/ExaDev/eslint-config/commit/baeb627ae30965c8faa4b6b9bf6a51a3c53c4824))
* cover explicit public modifier and non-function const init ([625532a](https://github.com/ExaDev/eslint-config/commit/625532ae2eb467141635c6829248b4973d425675))
* **prefer-doc-comment:** close mutation gaps found by the full Stryker gate ([8e6bd37](https://github.com/ExaDev/eslint-config/commit/8e6bd37b6df53497dc288bb5121f80655c6f2935))
* **prefer-doc-comment:** close mutation gaps the full Stryker gate found ([5bd2a65](https://github.com/ExaDev/eslint-config/commit/5bd2a655922bf0f6dadde60617e744b775aa0f22))
* **prefer-doc-comment:** close mutation gaps the full Stryker gate found ([49b7003](https://github.com/ExaDev/eslint-config/commit/49b700308f8172c7bcc2cdea1535dc83a1d94678))
* **prefer-doc-comment:** close the mutation gaps in isDirectiveComment ([f7b11a3](https://github.com/ExaDev/eslint-config/commit/f7b11a3e054369c0249370951d3e2d9f3569fffe))
* **prefer-doc-comment:** cover both decorator placements around export ([802084a](https://github.com/ExaDev/eslint-config/commit/802084a5c8055ce67884a516c3b00b97cfda7850))
* **prefer-doc-comment:** cover multi-line ESLint config Block comments ([5e4e9ba](https://github.com/ExaDev/eslint-config/commit/5e4e9babc22e9cb207692590f9e7228e1b6bb95b))
* **prefer-doc-comment:** kill the same-key-regardless-of-name mutant ([0d6b3bf](https://github.com/ExaDev/eslint-config/commit/0d6b3bf7c6020d9d9d42a81e640cee52f0dc5671))
* **prefer-doc-comment:** kill the sibling-value-type mutant on isOverloadImplementationMethod ([bbdd330](https://github.com/ExaDev/eslint-config/commit/bbdd330809be5b6550da37596de01236e6340981))


### Continuous Integration

* cache Stryker's incremental result file across mutation runs ([5d93825](https://github.com/ExaDev/eslint-config/commit/5d9382520295492e3ddbb2f1431670f725a728aa))
* cancel a branch's superseded runs instead of letting them finish ([81a53c0](https://github.com/ExaDev/eslint-config/commit/81a53c038a1dbe4b3996223c08bd00cbc52eb89b))

## [2.22.2](https://github.com/ExaDev/eslint-config/compare/v2.22.1...v2.22.2) (2026-09-27)


### Bug Fixes

* **barrel-auto-detect:** document and pin the array-manifest collapse ([17de93a](https://github.com/ExaDev/eslint-config/commit/17de93a45066b8c202a18340963b729dd99c3192))
* **comments:** state each invariant directly, not its prior history ([716dfd2](https://github.com/ExaDev/eslint-config/commit/716dfd26952212ec841ba8361b4e29147e16d755))
* **eslint.config:** remove a spaced double hyphen used as a dash ([10f73e0](https://github.com/ExaDev/eslint-config/commit/10f73e03dda48a90d15d9ff235bcba318d58206b))
* **is-record:** include the typeof check in the guard's invariant ([e29d700](https://github.com/ExaDev/eslint-config/commit/e29d7003d2a6754e4b39dc26add849f2fbaf8fc8))
* **is-record:** state the guard's invariant, not its history ([9631de8](https://github.com/ExaDev/eslint-config/commit/9631de89c717b02c76c9bc1a4347c5829c923167))
* **no-dependency-cycle:** correct the indirect-cycle comment's direction ([8581a45](https://github.com/ExaDev/eslint-config/commit/8581a45c694c978218c5b12572c2de91985b64d7))
* **no-dependency-cycle:** reword the message for an indirect cycle ([f4b78bc](https://github.com/ExaDev/eslint-config/commit/f4b78bc8cd435ffd3ed1b359c29de0f431e0133b))
* **no-dependency-cycle:** state the indirect-cycle fixture's invariant ([338533b](https://github.com/ExaDev/eslint-config/commit/338533bf70172ff3ecaf686e91eab69562b851bf))
* **package-name-mirrors-path:** fall back to the group's own name at its own root ([00c7559](https://github.com/ExaDev/eslint-config/commit/00c755951950a14fad99844a1cccf5bf69ad3901))
* **plugin:** type PublicPlugin.configs with the four literal keys it actually has ([8cbace3](https://github.com/ExaDev/eslint-config/commit/8cbace32175a0393e845942e8f04f76f8a44ac25))
* **plugin:** type the public plugin export as @eslint/core's own Plugin ([4f5ee73](https://github.com/ExaDev/eslint-config/commit/4f5ee73d4e1a26658e23595a8ae37d80eecad625)), closes [#39](https://github.com/ExaDev/eslint-config/issues/39)
* **prefer-options-object-param:** correct a mutation-killing claim that never held ([84ed427](https://github.com/ExaDev/eslint-config/commit/84ed427853bf1e49b147f96ab2578a2d6d7f339f))
* **prefer-options-object-param:** correct isOptionalParam's own comment ([96ae9fe](https://github.com/ExaDev/eslint-config/commit/96ae9fe11da9c216c199f720baac142cd94463d3))
* **prefer-options-object-param:** correct resolveFixableParam's own fallback comment ([b9387ed](https://github.com/ExaDev/eslint-config/commit/b9387ed656831fc6486cea8f51aff59bda8c1132))
* **prefer-options-object-param:** fix contradictory fallback comment ([498a224](https://github.com/ExaDev/eslint-config/commit/498a2244a72f1f4b25ca482bae55798a1d8ef126))
* **prefer-options-object-param:** recognise optional destructured patterns ([4c31c2c](https://github.com/ExaDev/eslint-config/commit/4c31c2c6d368f6dce9322259eb7ebc6a6c5afdc2))
* **prefer-options-object-param:** remove dead guards, cover remaining branches ([669bbc1](https://github.com/ExaDev/eslint-config/commit/669bbc1237ef19a11ce16e2aa4af107d4732d99f))
* **readme:** call each README example builder inside its own test ([e382875](https://github.com/ExaDev/eslint-config/commit/e3828755497dd7a6811db854f931498ec990da40))
* **to-public-config-array:** drop the unnecessary unknown escape hatch ([c61279a](https://github.com/ExaDev/eslint-config/commit/c61279a4375a3f1cda308a4ed6ccc2ff1c452450))
* **workspace-architecture:** drop the requireFn test seam from the public parameter type ([ecd1f14](https://github.com/ExaDev/eslint-config/commit/ecd1f14871582ebf2ff19047c111706b65cb4d8a))
* **workspace-architecture:** keep the public doc comment to the contract ([6b910e8](https://github.com/ExaDev/eslint-config/commit/6b910e8f44802f327c359f5841b2adc823de8544))
* **workspace-architecture:** return ESLint core's own Config[] from workspaceArchitectureConfig ([44839cf](https://github.com/ExaDev/eslint-config/commit/44839cf8be11dab31d80e6d95aa89f8442f813ca)), closes [ExaDev/eslint-config#39](https://github.com/ExaDev/eslint-config/issues/39)
* **workspace-checks:** keep-group always uses the group's own name ([8101fc9](https://github.com/ExaDev/eslint-config/commit/8101fc9f99f35d3932a8d5198eb820dc0f5eea1a))
* **workspace-graph:** drop a "." workspace-root packages entry ([fd5a5f2](https://github.com/ExaDev/eslint-config/commit/fd5a5f235a927df938b6b3e8fa41da98b35999a4))
* **workspace-json-helpers:** throw on a non-String member name ([2e1e70c](https://github.com/ExaDev/eslint-config/commit/2e1e70c2ee3b82ddf3cdd6a57ccf5c4bb338b1c9))
* **workspace-path:** credit the right helper for the doc comment shape ([c0a0092](https://github.com/ExaDev/eslint-config/commit/c0a0092a8a57abbee3b5c7544d29156554203ac2))
* **workspace-path:** drop history narration from doc comments ([82935ec](https://github.com/ExaDev/eslint-config/commit/82935ec6d24f415d8dc26fc06615d09412146aad))


### Code Refactoring

* **rules:** extract the duplicated getMemberKeyName into json-member-key ([8927f83](https://github.com/ExaDev/eslint-config/commit/8927f833897c6b5763ae61002d7d2a7bbcf0b78e))
* **workspace:** extract shared isRecord and requireChar helpers ([44b9f77](https://github.com/ExaDev/eslint-config/commit/44b9f772d2009f1a52432ca08df5ffe4053ec4f8))


### Documentation

* **cast-boundary:** drop the leftover compile-verification claim ([fed8468](https://github.com/ExaDev/eslint-config/commit/fed8468cb2f7334fb375743de4102579f9ff4fe4))
* **readme:** correct CI trigger and job-casing description in Contributing ([7b85a02](https://github.com/ExaDev/eslint-config/commit/7b85a026d329b5cd5297740b324902a96bb24b8a))
* **readme:** drop the redundant plugin registration from the group-ranked example ([00bea28](https://github.com/ExaDev/eslint-config/commit/00bea288266028d856c2013a01a93f2cc407ecbf))
* **readme:** fix keep-group example text to match the Options table ([540fcb1](https://github.com/ExaDev/eslint-config/commit/540fcb141d67aaa4ac0bf3dff512a5ca0373e60a))
* **readme:** mention the Mutation CI job and pnpm test:mutation ([81014f2](https://github.com/ExaDev/eslint-config/commit/81014f2ea2015d09ceaebfb19b81a66c6ed2694b))
* **readme:** quote src/index.ts's real barrel line and name the PublicPlugin boundary ([506352f](https://github.com/ExaDev/eslint-config/commit/506352fcf21b2147187744d59e3c2c3ece416814))
* **readme:** quote the barrel in full and list every concatenated builder ([0a5bf4e](https://github.com/ExaDev/eslint-config/commit/0a5bf4e220a57e81656222152bdd36766c43ef7a))
* **readme:** use a keep-group example where name and path segment differ ([acebe92](https://github.com/ExaDev/eslint-config/commit/acebe927b52552fa304afab8d25a506dcc70f8ce))
* **workspace-architecture:** correct the cast-boundary comment ([485d555](https://github.com/ExaDev/eslint-config/commit/485d555ac8ccdf9e6f048eb96dc22c32b306586e))


### Tests

* **barrel-auto-detect:** cover caching and the filesystem-root walk ([1bd6cb6](https://github.com/ExaDev/eslint-config/commit/1bd6cb60ea8541eefc5f07ce735d77c6f18dcea9))
* kill the three remaining mutation survivors ([225523f](https://github.com/ExaDev/eslint-config/commit/225523f9bf1def4f404f9d0d18c157b36bc90fde))
* **prefer-options-object-param:** cover describeFunctionKind's abstract-method branch ([b90a93b](https://github.com/ExaDev/eslint-config/commit/b90a93b174eceaa82f01919e61b32c14f4ef5617))
* **readme:** assert each flattened extends entry's own fields, not just aggregate plugin keys ([a5b962f](https://github.com/ExaDev/eslint-config/commit/a5b962f2652a09a135496a3f63456e2607f563f0))
* **readme:** typecheck and verify defineConfig examples that wire plugin directly ([059dbf9](https://github.com/ExaDev/eslint-config/commit/059dbf9744e65a94fb19e6056fea03106746d7a2))
* **recommended-type-checked:** cover the max-params boundary ([c9bdb1e](https://github.com/ExaDev/eslint-config/commit/c9bdb1ed249101978d51c3da3ff743842349e4c2))
* **test-file-kind:** cover the rule's own schema and message metadata ([2517c64](https://github.com/ExaDev/eslint-config/commit/2517c640a29ed922b2f05dbfd8167ff222801bbb))
* **workspace-graph:** cover array and null manifests in readDeclaredManifest ([f8fd137](https://github.com/ExaDev/eslint-config/commit/f8fd1372a6d34eacb439d724c9fb7421629c8ab1))
* **workspace-yaml:** assert the "@exadev/eslint-config: " error prefix ([3791a70](https://github.com/ExaDev/eslint-config/commit/3791a70ffd8e5e1f7a32cdaf5871dcf3aea06d80))


### Continuous Integration

* raise the Mutation job's timeout to 60 minutes ([314ca48](https://github.com/ExaDev/eslint-config/commit/314ca48c2e157cf6eeb1e9eb1d56b0737825fd3f))
* run the mutation gate in CI ([9aa15b4](https://github.com/ExaDev/eslint-config/commit/9aa15b44dd55cb819f99c54f9ec91056acd8b68d))

## [2.22.1](https://github.com/ExaDev/eslint-config/compare/v2.22.0...v2.22.1) (2026-09-27)


### Bug Fixes

* **workspace-checks:** keep-group uses the group's own name, not its path ([68df33c](https://github.com/ExaDev/eslint-config/commit/68df33c73b50bff845ab5c94320781474b8da043))
* **workspace-yaml:** prefix packages: parse errors like the other workspace-architecture modules ([0820a56](https://github.com/ExaDev/eslint-config/commit/0820a56ee14f0b35c4a3534ef390422b8e914205))


### Documentation

* **readme:** stop naming a specific pnpm version in the install line ([0d7d82b](https://github.com/ExaDev/eslint-config/commit/0d7d82b7400be8f6e4a41a08f7116b2621907026))

# [2.22.0](https://github.com/ExaDev/eslint-config/compare/v2.21.1...v2.22.0) (2026-09-26)


### Features

* **workspace:** add assertIsError, a shared non-Error-throw guard ([1ec4277](https://github.com/ExaDev/eslint-config/commit/1ec427773b4bc99f14854d8347c15cb62105b286))


### Bug Fixes

* **workspace rules:** report a nameless package under package-name-mirrors-path ([e47ea1c](https://github.com/ExaDev/eslint-config/commit/e47ea1c9aac60fc61354da86f394cfbdb2b17693))
* **workspace-architecture:** confirm the linted manifest against its graph entry ([e44215f](https://github.com/ExaDev/eslint-config/commit/e44215f435af216e3aa93d6e926daa192e535115))
* **workspace-checks:** derive keep-group naming from the group's own segment ([8719c2d](https://github.com/ExaDev/eslint-config/commit/8719c2d43707bff4ce08f2b25a833a01022a4ef7))
* **workspace-glob:** normalise dot segments and honour glob escapes ([21729f1](https://github.com/ExaDev/eslint-config/commit/21729f11c9957952fef29ea432a1becfcc1ae98b))
* **workspace-glob:** stop throwing on a packages glob matching no directory ([79dd51b](https://github.com/ExaDev/eslint-config/commit/79dd51b6a9ebd2a49c972d5f765669e192211af3))
* **workspace-graph:** key a nameless package by its directory ([e8c052f](https://github.com/ExaDev/eslint-config/commit/e8c052fe915d057979e63b128576571f6a446856))
* **workspace-graph:** resolve manifest paths via realpath; fix nameless-package matching ([4b8c138](https://github.com/ExaDev/eslint-config/commit/4b8c13841923fbd3d6430826b8fa531dad933df0))
* **workspace-options:** narrow RegExp errors via assertIsError; test 'u' flag and cause ([6aed813](https://github.com/ExaDev/eslint-config/commit/6aed8131b74fa001238e1356651542b9b56692f4))
* **workspace-options:** validate rankSkip, isolatedGroups and nameRanks ([8b24419](https://github.com/ExaDev/eslint-config/commit/8b24419a3df792e4c2079a7773232ad9342267b2))
* **workspace:** make the two assertIsError call-site contexts directly testable ([20f4af7](https://github.com/ExaDev/eslint-config/commit/20f4af7cd90dbc66260c1d077a1aa020c5ab52e9))


### Documentation

* **readme:** document keep-group derivation and nameless-package handling ([2bea512](https://github.com/ExaDev/eslint-config/commit/2bea512115332bc27a4329303070c330e1caaded))

## [2.21.1](https://github.com/ExaDev/eslint-config/compare/v2.21.0...v2.21.1) (2026-09-26)


### Bug Fixes

* **package-name-mirrors-path:** throw instead of silently skipping an unresolvable group ([71b4c17](https://github.com/ExaDev/eslint-config/commit/71b4c172af963224475a3f35cdbeb19171459b9c))
* **workspace-checks:** resolve isolatedGroups explicitly; drop an unused parameter ([162a5c2](https://github.com/ExaDev/eslint-config/commit/162a5c23b3448d767923978bbce4e4d677685e7d))
* **workspace-glob:** escape a literal "]" and eliminate equivalent boundary mutants ([774037c](https://github.com/ExaDev/eslint-config/commit/774037c6360e45e6d73269d1fd3ded8cc257c861))
* **workspace-glob:** honour pnpm's brace expansion, character classes and dot-exclusion ([8540d45](https://github.com/ExaDev/eslint-config/commit/8540d45edabbd189e877ea3a02d1d96bc5d51233))
* **workspace-graph:** throw on an empty resolved packages list; resolve nameRanks explicitly ([9e739b2](https://github.com/ExaDev/eslint-config/commit/9e739b2d609b3474529910bd39d422eea9eb7549))
* **workspace-options:** reject duplicate group names and a malformed slice ([47fb724](https://github.com/ExaDev/eslint-config/commit/47fb724ffb99e17564476ba76d0549b131b4f6b4))
* **workspace-yaml:** accept a quoted "packages" key and protect a quoted glob's own "#" ([a519843](https://github.com/ExaDev/eslint-config/commit/a519843e981081f1eb64d337491557ce326afafa))
* **workspace-yaml:** correct the double-quote doubling-escape test's own input ([101e318](https://github.com/ExaDev/eslint-config/commit/101e318be80b44271fdc580a4a05fe2766ce4af5))
* **workspace-yaml:** eliminate equivalent boundary mutants; export helpers for direct testing ([cd50839](https://github.com/ExaDev/eslint-config/commit/cd508394cfe71b7c362d9e64a81fd4c161648de7))


### Code Refactoring

* **workspace-options:** remove isSliceSpec's dead "namePrefix" guard ([4b03e6a](https://github.com/ExaDev/eslint-config/commit/4b03e6ad4c6bab150ad45ca9f52080c34cf16d1c))


### Documentation

* **workspace-options:** list "slice" among the levels this reader validates ([7b9d7ba](https://github.com/ExaDev/eslint-config/commit/7b9d7ba4f298612165793494d271e3a13de29bb9))


### Tests

* **workspace-checks:** distinguish isIsolatedPair's .some from .every ([12df113](https://github.com/ExaDev/eslint-config/commit/12df113a51608f68688904997fe17cb758d0a8b5))
* **workspace-glob:** distinguish a real depth counter from an inverted or dead one ([1148a78](https://github.com/ExaDev/eslint-config/commit/1148a782507d45bc6c492c6d9ed70a1665fbbfa8))
* **workspace-yaml:** assert the doubling escape never applies to a double-quoted scalar ([8846566](https://github.com/ExaDev/eslint-config/commit/8846566de545a4a0576130f79eedf3af13ffc978))

# [2.21.0](https://github.com/ExaDev/eslint-config/compare/v2.20.2...v2.21.0) (2026-09-26)


### Features

* **config:** add workspaceArchitectureConfig and wire it into the plugin ([6f66981](https://github.com/ExaDev/eslint-config/commit/6f66981199d61dc3427cccc5cbc5daef232f8199))
* **rules:** add no-dependency-cycle ([c52c83c](https://github.com/ExaDev/eslint-config/commit/c52c83c8e662de892a1c062f5f47ee610b6afe6d))
* **rules:** add no-uphill-dependency ([6308ada](https://github.com/ExaDev/eslint-config/commit/6308ada433f43e1aa9c8b4a1c2df1853f01aa729))
* **rules:** add package-name-mirrors-path ([ce038f8](https://github.com/ExaDev/eslint-config/commit/ce038f86aeb90201baee1c4f310b8d06c6bd085a))
* **workspace:** add dependency checks and manifest-reading helpers ([16ddb04](https://github.com/ExaDev/eslint-config/commit/16ddb0450113e5009d4d4f6019792e9210041528))
* **workspace:** add injectable fs seam and pnpm-workspace.yaml packages reader ([965468a](https://github.com/ExaDev/eslint-config/commit/965468a3f5b7f6c41cec96b5aea5ed8336da493c))
* **workspace:** add own directory glob matcher for package discovery ([b2f0658](https://github.com/ExaDev/eslint-config/commit/b2f0658036845e43373e8292d0d4e02b1a9ddb7f))
* **workspace:** add shared workspace architecture options schema and reader ([9db2cc2](https://github.com/ExaDev/eslint-config/commit/9db2cc2659d70067e44a306f651701bf53dd28b3))
* **workspace:** add workspace dependency graph construction ([67b7d30](https://github.com/ExaDev/eslint-config/commit/67b7d30f931fc947bfacdfe980ecaaf786a19c79))


### Bug Fixes

* **workspace:** accept zero-indent pnpm-workspace.yaml sequence items ([800483c](https://github.com/ExaDev/eslint-config/commit/800483cf9ae6d1f6643a1586c9cdde5d224a4ebe))
* **workspace:** de-duplicate dependency names before checking uphill rules ([50f752d](https://github.com/ExaDev/eslint-config/commit/50f752d1e08ae07f1b33349576ac49d5ee0dd283))
* **workspace:** namePrefix slice picks the longest match and strips scope ([d20ee82](https://github.com/ExaDev/eslint-config/commit/d20ee82a5ffe099962c4e4e29d9acdec3ef2c83d))
* **workspace:** reject unknown option keys and validate isolatedGroups ([73deb85](https://github.com/ExaDev/eslint-config/commit/73deb850684d700b84395debed310ff0ab1713c0))
* **workspace:** support in-segment glob wildcards and skip node_modules ([456e77f](https://github.com/ExaDev/eslint-config/commit/456e77fa2e72a05e7ae2b02eedbd7c718191a1ae))


### Code Refactoring

* **workspace:** close mutation-testing survivors in the workspace rules ([41cd8d9](https://github.com/ExaDev/eslint-config/commit/41cd8d9761ffa5eb769899b81034dc663548ec72))
* **workspace:** pick the longest namePrefix slice by sorting, not a running max ([5020761](https://github.com/ExaDev/eslint-config/commit/50207615e2dadfd34daa8541a8acafa7b64299aa))


### Documentation

* document the workspace architecture rules ([09f1fd7](https://github.com/ExaDev/eslint-config/commit/09f1fd7515b7bbedaa3331bb6c4d583099c31c6a))
* **workspace:** correct the three workspace-architecture examples ([1f15718](https://github.com/ExaDev/eslint-config/commit/1f15718c99ab14bd1b158b82390f835420db7550))


### Tests

* **workspace:** assert segmentToRegExp carries the unicode regex flag ([76b33e1](https://github.com/ExaDev/eslint-config/commit/76b33e1e84e7a0af4fd80462511f4729a4ec4fa4))
* **workspace:** assert the block-sequence error trims its own line content ([2aaaf84](https://github.com/ExaDev/eslint-config/commit/2aaaf84523c53c4e118aaeb3777be351a7345376))
* **workspace:** close remaining mutation-testing survivors ([98bc538](https://github.com/ExaDev/eslint-config/commit/98bc5383c83d17009e6609b0e03a078171e7ec43))
* **workspace:** distinguish OR from AND in the isolatedGroups group-check ([ae5e0df](https://github.com/ExaDev/eslint-config/commit/ae5e0df73082e5e599a9fd9f0b8031746f114b38))

## [2.20.2](https://github.com/ExaDev/eslint-config/compare/v2.20.1...v2.20.2) (2026-09-25)


### Bug Fixes

* **rules:** skip no-pointless-reassignment for exported aliases ([3b20413](https://github.com/ExaDev/eslint-config/commit/3b20413868caa1392159bb466bf03082de307065))

## [2.20.1](https://github.com/ExaDev/eslint-config/compare/v2.20.0...v2.20.1) (2026-09-19)


### Bug Fixes

* **plugin:** register prefer-options-object-param in the lighter bundle too ([4994124](https://github.com/ExaDev/eslint-config/commit/4994124fdd4719e945a536c31eab45035a05826b))

# [2.20.0](https://github.com/ExaDev/eslint-config/compare/v2.19.4...v2.20.0) (2026-09-19)


### Features

* **config:** register prefer-options-object-param and max-params ([2fbaf46](https://github.com/ExaDev/eslint-config/commit/2fbaf467f002e500fe354e1838868cd83fab4b70))
* **rules:** add prefer-options-object-param rule ([112bccf](https://github.com/ExaDev/eslint-config/commit/112bccf7b4d79aea9419213d12efd42a97d0f2c7))


### Bug Fixes

* **no-non-barrel-reexport:** bundle fixer and sourceCode into one context param ([727b223](https://github.com/ExaDev/eslint-config/commit/727b22380c892ef9ff747742ba2ab6879aeb7db2))


### Code Refactoring

* **ts-node-guards:** add firstTokenOrThrow ([4fe7d28](https://github.com/ExaDev/eslint-config/commit/4fe7d28aaa177c5aa6cb82cda02a108d8b89f0e1))

## [2.19.4](https://github.com/ExaDev/eslint-config/compare/v2.19.3...v2.19.4) (2026-09-18)


### Documentation

* link external resources and update config examples in README ([04801cc](https://github.com/ExaDev/eslint-config/commit/04801cca270883b7eb9a129c339902f9301f0efb))

## [2.19.3](https://github.com/ExaDev/eslint-config/compare/v2.19.2...v2.19.3) (2026-09-18)


### Documentation

* make rule names in README clickable ([64801b7](https://github.com/ExaDev/eslint-config/commit/64801b792ceac1ec77d1512f0e9667686dec03d1))

## [2.19.2](https://github.com/ExaDev/eslint-config/compare/v2.19.1...v2.19.2) (2026-09-18)


### Documentation

* improve rule documentation formatting and clarity ([ae47821](https://github.com/ExaDev/eslint-config/commit/ae47821c301122bd08cefa3dada9c0ab14956bf0))
* indent rule rationales in README ([8bf2dbc](https://github.com/ExaDev/eslint-config/commit/8bf2dbcaf3d76f604376f8b13afb03c2f1beac70))

## [2.19.1](https://github.com/ExaDev/eslint-config/compare/v2.19.0...v2.19.1) (2026-09-18)


### Documentation

* clarify minimumReleaseAgeExclude comment for unscoped packages ([c0e6820](https://github.com/ExaDev/eslint-config/commit/c0e68206537c2233e9127b8300988667a7d21e9d))
* make file paths in README clickable ([d374eb3](https://github.com/ExaDev/eslint-config/commit/d374eb38a7e172545ac05b568f5948dfba9ee8da))
* refine README content and structure ([a388628](https://github.com/ExaDev/eslint-config/commit/a3886289fb87df5b68a574640387d50741e7ceb4))

# [2.19.0](https://github.com/ExaDev/eslint-config/compare/v2.18.1...v2.19.0) (2026-09-18)


### Features

* **barrel-policy:** add auto mode that detects single vs banned from package.json ([c829516](https://github.com/ExaDev/eslint-config/commit/c829516ddfb1d399698e3742024a4302aef475c2))


### Documentation

* document barrel-policy auto mode and the auto-detecting default ([2f7411f](https://github.com/ExaDev/eslint-config/commit/2f7411f78870206f5facb379c04af7443503c0b3))

## [2.18.1](https://github.com/ExaDev/eslint-config/compare/v2.18.0...v2.18.1) (2026-09-17)


### Documentation

* record the autofixer pair interactions and their stable escapes ([c6e1ce0](https://github.com/ExaDev/eslint-config/commit/c6e1ce0f209ae5e25ca4462a1ad3096c10815e71))

# [2.18.0](https://github.com/ExaDev/eslint-config/compare/v2.17.2...v2.18.0) (2026-09-15)


### Features

* add exadev/test-file-kind rule requiring a kind suffix ([2d64ec5](https://github.com/ExaDev/eslint-config/commit/2d64ec5a5c70bf05cf435eeeacd51547e9cc2749))


### Documentation

* document test-file-kind and the kind-suffix test naming convention ([f795757](https://github.com/ExaDev/eslint-config/commit/f795757aff0d79fe8fbf935dda86bf620215e70f))

## [2.17.2](https://github.com/ExaDev/eslint-config/compare/v2.17.1...v2.17.2) (2026-09-15)


### Code Refactoring

* extract shared scope/type-node guard helpers ([c84e27c](https://github.com/ExaDev/eslint-config/commit/c84e27ccb17867d7d4675429d317c839be6636c3))
* remove a dead guard and share the identifier-name invariant ([0745889](https://github.com/ExaDev/eslint-config/commit/0745889bceb96cfb458a0e35d4eec442c7046832))
* remove provably-dead guards in the mutation-detection trio ([3482945](https://github.com/ExaDev/eslint-config/commit/34829453f0c8afc44cac27c180718fb4d0c07e31))
* remove three provably-dead guard checks in the type-aware rules ([917ba94](https://github.com/ExaDev/eslint-config/commit/917ba9448b1d24a6b7685b45b6f8df982ca27acd))
* remove two provably-dead constructs in package-json-key-order ([ab12eda](https://github.com/ExaDev/eslint-config/commit/ab12eda84ace7acde0287652ac3cf7fee31c9c75))


### Tests

* kill remaining Stryker survivors from module-level literals ([b107f75](https://github.com/ExaDev/eslint-config/commit/b107f75b7e3e748235f83533aae8a83eada1984b))
* kill remaining survivors in no-pointless-reassignment ([2380c7c](https://github.com/ExaDev/eslint-config/commit/2380c7c8af53502f1ff7bcd0900f13a411cc390c))
* kill Stryker survivors in package-json-key-order ([fe9c200](https://github.com/ExaDev/eslint-config/commit/fe9c200371001d534b21916e021fb5464575ec96))
* kill Stryker survivors in the barrel-discipline rule family ([4739b67](https://github.com/ExaDev/eslint-config/commit/4739b67cf66d57f5dca78c99b5a86ba75c2d90ef))
* kill Stryker survivors in the isArray/instanceof mutation rules ([1a1fb7a](https://github.com/ExaDev/eslint-config/commit/1a1fb7a1cb741e9367799fc6f27052d80ca0b07c))
* kill Stryker survivors in the readonly-param and sort-compare rules ([3dd10e1](https://github.com/ExaDev/eslint-config/commit/3dd10e178bf6cc943c0efc83406185992a8ce1f7))
* kill Stryker survivors in the reassignment/assign/enum rules ([ae46661](https://github.com/ExaDev/eslint-config/commit/ae466616c151a0fcc45c5d99b1a0637b1681d193))
* kill Stryker survivors in the top-level config-builder files ([0f5ab14](https://github.com/ExaDev/eslint-config/commit/0f5ab14888a2d7ab186d0190ff88f512200de86e))
* perform each json-canonical import inside its own test body ([b55dbb4](https://github.com/ExaDev/eslint-config/commit/b55dbb471b6d8c05b758d867e8cc2e77ccf3387c))
* prove legacy consumer-compatibility patterns resolve at runtime ([83f7eae](https://github.com/ExaDev/eslint-config/commit/83f7eae8eacc23210a6641c8b1ace4fda042be29))
* verify barrel-policy schema rejection through a plain Linter ([d1cce74](https://github.com/ExaDev/eslint-config/commit/d1cce742f8024814e4460365b46815a82f6a60d5)), closes [Linter#verify](https://github.com/Linter/issues/verify)


### Chores

* wire up Stryker mutation testing ([a7e5eca](https://github.com/ExaDev/eslint-config/commit/a7e5eca0d47db5959c324a084d62ccfdbe83b7dd))

## [2.17.1](https://github.com/ExaDev/eslint-config/compare/v2.17.0...v2.17.1) (2026-09-15)


### Chores

* bump eslint-plugin-json-canonical to 2.1.0 ([12b24d7](https://github.com/ExaDev/eslint-config/commit/12b24d7ac50ea249ff8aada4eeb15a594eed0f5a))

# [2.17.0](https://github.com/ExaDev/eslint-config/compare/v2.16.1...v2.17.0) (2026-09-15)


### Features

* derive ESLint ignores from the consumer's own .gitignore ([2000077](https://github.com/ExaDev/eslint-config/commit/20000771d311750e8d78e11efce05e99608bfa46))

## [2.16.1](https://github.com/ExaDev/eslint-config/compare/v2.16.0...v2.16.1) (2026-09-15)


### Bug Fixes

* exempt numeric literal types from no-magic-numbers ([0259947](https://github.com/ExaDev/eslint-config/commit/025994725e1e5556487c29dbf1330a328fdc150f))

# [2.16.0](https://github.com/ExaDev/eslint-config/compare/v2.15.0...v2.16.0) (2026-09-15)


### Features

* bump eslint-plugin-json-canonical to v2 for pretty-printing and JSONC ([a77cec1](https://github.com/ExaDev/eslint-config/commit/a77cec1f5529003d9f95f0f02406cf1f372db9c1))


### Documentation

* update RFC 8785 section for eslint-plugin-json-canonical v2 ([2db10a5](https://github.com/ExaDev/eslint-config/commit/2db10a52b169ae985a254f63c601fd9527140dd9))


### Styles

* pretty-print and canonically order this repo's own JSON files ([d483cc9](https://github.com/ExaDev/eslint-config/commit/d483cc93ac7208b91ce0f8abde51c64a99cc34f7))

# [2.15.0](https://github.com/ExaDev/eslint-config/compare/v2.14.0...v2.15.0) (2026-09-15)


### Features

* add package-json-key-order rule for syncpack-compatible ordering ([7598ac3](https://github.com/ExaDev/eslint-config/commit/7598ac301012633c3e5009c358956fb1c98ed320))


### Bug Fixes

* **eslint.config:** scope js.configs.recommended and type-imports rules to JS/TS files ([3c9e555](https://github.com/ExaDev/eslint-config/commit/3c9e5554dafaf8ab934edd4066e61efef4de4ee4))

# [2.14.0](https://github.com/ExaDev/eslint-config/compare/v2.13.0...v2.14.0) (2026-09-15)


### Features

* bundle RFC 8785 canonical JSON formatting by default ([fc22740](https://github.com/ExaDev/eslint-config/commit/fc227401b715de85f7330a543cea7d45b089cff6))

# [2.13.0](https://github.com/ExaDev/eslint-config/compare/v2.12.3...v2.13.0) (2026-09-15)


### Features

* add no-control-flow rule ([6c37f08](https://github.com/ExaDev/eslint-config/commit/6c37f08dbf7aa1ebc1b8f535f8c4e8c525296a9f))

## [2.12.3](https://github.com/ExaDev/eslint-config/compare/v2.12.2...v2.12.3) (2026-09-14)


### Bug Fixes

* scope every unscoped rule block to JS/TS files ([8bc2222](https://github.com/ExaDev/eslint-config/commit/8bc2222c99cfc60ae19ede43a042199187fbffc3))

## [2.12.2](https://github.com/ExaDev/eslint-config/compare/v2.12.1...v2.12.2) (2026-09-14)


### Chores

* bump pinned package manager to pnpm 12.4.1 ([e80286f](https://github.com/ExaDev/eslint-config/commit/e80286f452810b03eb584051867311fd94975c1a))

## [2.12.1](https://github.com/ExaDev/eslint-config/compare/v2.12.0...v2.12.1) (2026-09-14)


### Bug Fixes

* pin eslint-plugin-jsdoc to an exact, already-mature version ([81c6f76](https://github.com/ExaDev/eslint-config/commit/81c6f767dd331b24621b8ba2b1d28ee17d4940cf))


### Chores

* write exact dependency versions instead of caret ranges ([919c305](https://github.com/ExaDev/eslint-config/commit/919c3059d4cc8dbe9fdacb749cd1133ec4705a4a))

# [2.12.0](https://github.com/ExaDev/eslint-config/compare/v2.11.0...v2.12.0) (2026-09-14)


### Features

* ban Stryker suppression comments and enforce an 800-line file limit ([a09c74f](https://github.com/ExaDev/eslint-config/commit/a09c74f9c536af4e77b8658aae14f3233aec2b7b))

# [2.11.0](https://github.com/ExaDev/eslint-config/compare/v2.10.6...v2.11.0) (2026-09-12)


### Features

* validate JSDoc/TSDoc quality on existing doc comments ([fb17d2a](https://github.com/ExaDev/eslint-config/commit/fb17d2a677057b049c236b67a004c797944f3902))


### Bug Fixes

* **ci:** push release commits over SSH using a deploy key ([7f3beb0](https://github.com/ExaDev/eslint-config/commit/7f3beb0b8aab12cff9fbbd4139da228f821fc784))
* **ci:** rewrite release pushes to SSH so the deploy key actually authenticates ([ab43046](https://github.com/ExaDev/eslint-config/commit/ab43046543f5cdbf1c79df0b28bc8eb59d2e741e))
* **release:** push over SSH via repositoryUrl, not a git config rewrite ([a402b71](https://github.com/ExaDev/eslint-config/commit/a402b71656335637250874701bb81040bc448815))


### Tests

* raise the suite timeout for typescript-eslint's rule-tester cases ([9c5cf64](https://github.com/ExaDev/eslint-config/commit/9c5cf64c4fadaefcf306cba51b13892d0fcc27b0))


### Continuous Integration

* add a Required Checks job aggregating commitlint, lint, and typecheck ([683b41e](https://github.com/ExaDev/eslint-config/commit/683b41eb90b9ebe3c6785ed2c31afddc9aaea014))

## [2.10.6](https://github.com/ExaDev/eslint-config/compare/v2.10.5...v2.10.6) (2026-09-06)


### Chores

* dogfood defineConfig() now that exadevConfig() satisfies it ([011505a](https://github.com/ExaDev/eslint-config/commit/011505a152cac4cb10623f6fd646935ef54dd5ed))

## [2.10.5](https://github.com/ExaDev/eslint-config/compare/v2.10.4...v2.10.5) (2026-09-06)


### Bug Fixes

* retype the exported config array against @eslint/core, not typescript-eslint ([13d767e](https://github.com/ExaDev/eslint-config/commit/13d767e3a171b80b205409ceaf2ecc99cc0ca96f))

## [2.10.4](https://github.com/ExaDev/eslint-config/compare/v2.10.3...v2.10.4) (2026-09-03)


### Bug Fixes

* **barrel-policy:** skip export statements inside ambient module declarations ([8047629](https://github.com/ExaDev/eslint-config/commit/80476292a55b01954b2f944581455a2ddd31b967))

## [2.10.3](https://github.com/ExaDev/eslint-config/compare/v2.10.2...v2.10.3) (2026-09-03)


### Bug Fixes

* **react:** pair flat/recommended with flat/jsx-runtime to support the automatic JSX runtime ([78dd6f8](https://github.com/ExaDev/eslint-config/commit/78dd6f898bd7f41494f6fe675e94b2e0f226d089))

## [2.10.2](https://github.com/ExaDev/eslint-config/compare/v2.10.1...v2.10.2) (2026-08-31)


### Bug Fixes

* reject unknown/any/never/primitive aliases in prefer-readonly-object-param ([48862cc](https://github.com/ExaDev/eslint-config/commit/48862cc94d79aa17c40818e1eeedffe9a5f99edf))


### Documentation

* record that Readonly<any> narrows a parameter, not just wraps it redundantly ([14a05f8](https://github.com/ExaDev/eslint-config/commit/14a05f8f4899a2a7aa9c331bba91db39e14d3e26))


### Tests

* pin prefer-readonly-object-param's object-type gate in both directions ([5912a97](https://github.com/ExaDev/eslint-config/commit/5912a972d63439c2a1d71edafaab6f2f780a5a70))

## [2.10.1](https://github.com/ExaDev/eslint-config/compare/v2.10.0...v2.10.1) (2026-08-31)


### Bug Fixes

* compose js.configs.recommended inside recommendedTypeChecked ([ca23de1](https://github.com/ExaDev/eslint-config/commit/ca23de1816efcc083f4642661329fe52df9eaa89))

# [2.10.0](https://github.com/ExaDev/eslint-config/compare/v2.9.1...v2.10.0) (2026-08-27)


### Features

* add optional, auto-detected React and Next.js support ([2611ece](https://github.com/ExaDev/eslint-config/commit/2611ece1c6f6d3f3d15633d16b158fe986cb7ca3))

## [2.9.1](https://github.com/ExaDev/eslint-config/compare/v2.9.0...v2.9.1) (2026-08-26)


### Tests

* give the test-file-relaxation test a real project service ([0fb9303](https://github.com/ExaDev/eslint-config/commit/0fb9303fdcb681b109d7d308148dac980d112c57))

# [2.9.0](https://github.com/ExaDev/eslint-config/compare/v2.8.0...v2.9.0) (2026-08-26)


### Features

* enable no-shadow, no-redeclare, no-use-before-define, consistent-return ([f569f7c](https://github.com/ExaDev/eslint-config/commit/f569f7cf475a00e5ea4526ae46e0787a9edd1300))

# [2.8.0](https://github.com/ExaDev/eslint-config/compare/v2.7.0...v2.8.0) (2026-08-26)


### Features

* enable @typescript-eslint/strict-void-return ([61f4cb8](https://github.com/ExaDev/eslint-config/commit/61f4cb8eb838b65cc99d351b7222464de9382a65))


### Continuous Integration

* allow the release job to run on workflow_dispatch too ([4e99a69](https://github.com/ExaDev/eslint-config/commit/4e99a6991d7fc62177665962c86e8a645d09bcec))

# [2.7.0](https://github.com/ExaDev/eslint-config/compare/v2.6.2...v2.7.0) (2026-08-26)


### Features

* switch default config from recommendedTypeChecked to strictTypeChecked ([a92f1b5](https://github.com/ExaDev/eslint-config/commit/a92f1b5f0859aa2ccc0ac28d3b20340c237c18ab))

## [2.6.2](https://github.com/ExaDev/eslint-config/compare/v2.6.1...v2.6.2) (2026-08-26)


### Chores

* enable noUncheckedSideEffectImports and strictBuiltinIteratorReturn ([3c8d464](https://github.com/ExaDev/eslint-config/commit/3c8d46438568fb337f18f17116345fa235f840db))

## [2.6.1](https://github.com/ExaDev/eslint-config/compare/v2.6.0...v2.6.1) (2026-08-26)


### Build System

* enable every remaining TypeScript strictness flag ([1ded5a8](https://github.com/ExaDev/eslint-config/commit/1ded5a8b6d264f415ae414cf0d72d37e704c0d79))

# [2.6.0](https://github.com/ExaDev/eslint-config/compare/v2.5.0...v2.6.0) (2026-08-26)


### Features

* add prefer-readonly-object-param rule with real autofix ([6b768bd](https://github.com/ExaDev/eslint-config/commit/6b768bdf9b4b7babe257434b44dbf45cf9263819))
* register prefer-readonly-object-param in the type-checked bundle ([458d2bc](https://github.com/ExaDev/eslint-config/commit/458d2bcf1eef343a20ba4504ab858023ef199ec6))


### Bug Fixes

* catch a local variable, not just a parameter, in three rules ([b3ecfd8](https://github.com/ExaDev/eslint-config/commit/b3ecfd81a799e2eb24f067499601258e741d6e5f))


### Documentation

* document prefer-readonly-object-param and the widened scope ([36c64bf](https://github.com/ExaDev/eslint-config/commit/36c64bfe3cb33a7476144c465cc64339ab7d112f))

# [2.5.0](https://github.com/ExaDev/eslint-config/compare/v2.4.0...v2.5.0) (2026-08-26)


### Features

* add no-map-instanceof-mutation rule for Map's readonly gap ([16582a8](https://github.com/ExaDev/eslint-config/commit/16582a80e4e0f0ce6a31a79ad5e19b49a262541a))
* add no-set-instanceof-mutation rule for Set's readonly gap ([e5b4c33](https://github.com/ExaDev/eslint-config/commit/e5b4c33dd0673a3b68c60641cc538599c8279852))
* add prefer-numeric-sort-compare rule with a suggestion fix ([1c13d4d](https://github.com/ExaDev/eslint-config/commit/1c13d4d6ad068e836480896cac3a4f1b2a3de802))
* add prefer-readonly-array-param rule with real autofix ([c8429d3](https://github.com/ExaDev/eslint-config/commit/c8429d3e9eb71d90af4f6e74422dd7c2cad144a9))
* enable 3 native rules, register the four new rules ([aafb702](https://github.com/ExaDev/eslint-config/commit/aafb70290f4d612999736a095bc97a3695da4ed3))


### Documentation

* document the four new rules and three native rule additions ([7faa9d0](https://github.com/ExaDev/eslint-config/commit/7faa9d0c5557a750117eab6f2af0c0e0fa0a4614))

# [2.4.0](https://github.com/ExaDev/eslint-config/compare/v2.3.0...v2.4.0) (2026-08-26)


### Features

* add no-array-isarray-mutation rule for Array.isArray's readonly gap ([efb3a6c](https://github.com/ExaDev/eslint-config/commit/efb3a6cca516115f9f69873d4cc956d2c10a730a))
* add no-enum-reverse-lookup-widening rule for unchecked enum reverse lookups ([b45dfe0](https://github.com/ExaDev/eslint-config/commit/b45dfe0e8bf4e9fe62be4c80a3019d542d6d95a0))
* enable 10 native typescript-eslint rules, register the two new rules ([61315d6](https://github.com/ExaDev/eslint-config/commit/61315d66737e749effbf53e4d75e33de2e49f44d))


### Documentation

* document the two new rules and the ten native rule additions ([ae0a2d6](https://github.com/ExaDev/eslint-config/commit/ae0a2d6e1398f2392af06d2020f2c8438645a6c2))

# [2.3.0](https://github.com/ExaDev/eslint-config/compare/v2.2.0...v2.3.0) (2026-08-26)


### Features

* ban the non-null assertion operator in the type-checked bundle ([fa9e3c5](https://github.com/ExaDev/eslint-config/commit/fa9e3c554304b423970f605e85d5831ae0e10a14))

# [2.2.0](https://github.com/ExaDev/eslint-config/compare/v2.1.2...v2.2.0) (2026-08-26)


### Features

* add no-enum-number-widening rule for unchecked numeric enum slots ([0c65c25](https://github.com/ExaDev/eslint-config/commit/0c65c2595e62e379f1113f4441fbf358d1346009))
* add no-mutable-union-array-param rule for covariant array writes ([76e497f](https://github.com/ExaDev/eslint-config/commit/76e497f6bb2b5f9046cbd9200d7b7f7f16298eb4))
* add no-object-assign rule for its unchecked source-property types ([d336498](https://github.com/ExaDev/eslint-config/commit/d3364981eb9d1154b9b37787eacf252d4d3668d2))
* register the three new rules, enable method-signature-style ([936af64](https://github.com/ExaDev/eslint-config/commit/936af64561bef31d0a6afe3e89ac99c55ad42c09))


### Documentation

* document the three new rules and method-signature-style ([02b1b0d](https://github.com/ExaDev/eslint-config/commit/02b1b0d82c29679d1924c8b36ebbfbf8091eb842))

## [2.1.2](https://github.com/ExaDev/eslint-config/compare/v2.1.1...v2.1.2) (2026-08-24)


### Bug Fixes

* stop no-pointless-reassignment producing broken or meaning-changing autofixes ([c0227f9](https://github.com/ExaDev/eslint-config/commit/c0227f94f18ca9d813e350f951556fe4a87b25fa))


### Documentation

* record when no-pointless-reassignment withholds its autofix ([e551f10](https://github.com/ExaDev/eslint-config/commit/e551f1021ee2ef3453ccf9be596eba4b011a55b1))

## [2.1.1](https://github.com/ExaDev/eslint-config/compare/v2.1.0...v2.1.1) (2026-08-08)


### Documentation

* condense README ([b037724](https://github.com/ExaDev/eslint-config/commit/b0377246c5551ff7202590e00b056110cf4ed11f))

# [2.1.0](https://github.com/ExaDev/eslint-config/compare/v2.0.0...v2.1.0) (2026-08-07)


### Features

* add a configurable barrel-policy rule with three index-file modes ([71c5d26](https://github.com/ExaDev/eslint-config/commit/71c5d26f5250f8319be054a8b69cbdf794e3ed8b))

# [2.0.0](https://github.com/ExaDev/eslint-config/compare/v1.4.1...v2.0.0) (2026-08-07)


### Features

* make the type-checked bundle the default export, drop the separate subpath ([aed49bb](https://github.com/ExaDev/eslint-config/commit/aed49bb40b8c1a9b062f3681364b679f80d95ce9))


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


### Continuous Integration

* bump actions/cache to v6 ([7b4a9a0](https://github.com/ExaDev/eslint-config/commit/7b4a9a07d9f9c0688fb7211d27c88cb0a3bfcc31))

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


### Documentation

* document the tseslint.config() extends incompatibility and the unscoped-recommended misfire ([24f6c7b](https://github.com/ExaDev/eslint-config/commit/24f6c7bddb43ae8b4a2c614b9e541e74dedfbe04))

## [1.2.1](https://github.com/ExaDev/eslint-config/compare/v1.2.0...v1.2.1) (2026-08-07)


### Documentation

* document the vitest test setup and coverage reporting ([edfa960](https://github.com/ExaDev/eslint-config/commit/edfa96042ab7310115eb4163fc8ece75e0d7b831))


### Tests

* add RuleTester coverage for the four plugin rules ([3a9a561](https://github.com/ExaDev/eslint-config/commit/3a9a5618896d06cf723172f0bf7041569e80de84))
* add vitest test runner with RuleTester wiring ([8296d19](https://github.com/ExaDev/eslint-config/commit/8296d196dc0bbc3f6b142c02671c8e3615fb6d7c))
* measure and report coverage via @vitest/coverage-v8 ([f78b8e8](https://github.com/ExaDev/eslint-config/commit/f78b8e8538035c296851ea683fb5bb5d3b28b401))


### Continuous Integration

* cache .eslintcache across CI runs ([f4c5e13](https://github.com/ExaDev/eslint-config/commit/f4c5e136103f3c589642522d5a4b5e3d7d1e58d5))
* run the test suite in CI and the pre-push hook ([221c16c](https://github.com/ExaDev/eslint-config/commit/221c16ca04c033f46e2592333cc48a48604e51dc))

# [1.2.0](https://github.com/ExaDev/eslint-config/compare/v1.1.2...v1.2.0) (2026-08-07)


### Features

* bundle typescript-eslint's typed-linting baseline into recommended ([86397dc](https://github.com/ExaDev/eslint-config/commit/86397dc047ed917f70276f2e776721d823748445))


### Code Refactoring

* isolate the typed-linting bundle into its own module ([2665aaf](https://github.com/ExaDev/eslint-config/commit/2665aafbbcc4b8268ba68c4fa02cb32806516b7b))

## [1.1.2](https://github.com/ExaDev/eslint-config/compare/v1.1.1...v1.1.2) (2026-08-07)


### Documentation

* add GitHub/npm/Release/CI badges to the README ([b2f70af](https://github.com/ExaDev/eslint-config/commit/b2f70af4d69a56bc1140ccca4fe9bf4f6fef2715))
* rewrite README as a unified project guide with symlinked agent instructions ([6efd3d2](https://github.com/ExaDev/eslint-config/commit/6efd3d29988215192c0a54f0e1c4465ec85aceaa))

## [1.1.1](https://github.com/ExaDev/eslint-config/compare/v1.1.0...v1.1.1) (2026-08-07)


### Code Refactoring

* split plugin construction out of src/index.ts ([a3660f1](https://github.com/ExaDev/eslint-config/commit/a3660f1da7d1cf89655208ef92b2e65879c7f990))

# [1.1.0](https://github.com/ExaDev/eslint-config/compare/v1.0.1...v1.1.0) (2026-08-07)


### Features

* turn on no-inline-config and no-type-assertions in the recommended config ([9706eec](https://github.com/ExaDev/eslint-config/commit/9706eec1682f79019538b0e63c372b214182ce4c))

## [1.0.1](https://github.com/ExaDev/eslint-config/compare/v1.0.0...v1.0.1) (2026-08-07)


### Documentation

* decouple package description from the documents.js family ([a44d8c0](https://github.com/ExaDev/eslint-config/commit/a44d8c0b4c2db887cafbf302bcf557db17568fb1))

# 1.0.0 (2026-08-07)


### Features

* initial ESLint plugin combining the shared custom rules ([29b86ff](https://github.com/ExaDev/eslint-config/commit/29b86ff64d321c401be3ebf9c578b6eb69dff8bc))


### Bug Fixes

* ignore the false-export-default attw rule ([667b7e7](https://github.com/ExaDev/eslint-config/commit/667b7e78e9183714ea1e53575fc6e5d973945692))
