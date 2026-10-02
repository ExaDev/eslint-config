# [2.34.0](https://github.com/ExaDev/eslint-config/compare/v2.33.1...v2.34.0) (2026-10-02)


### Features

* add multiline-comment-style wrapper that keeps directives standalone ([f48ba38](https://github.com/ExaDev/eslint-config/commit/f48ba3810be601c17e64d03ae5ffb433d6048b1a)), closes [eslint-stylistic/eslint-stylistic#1287](https://github.com/eslint-stylistic/eslint-stylistic/issues/1287) [#region](https://github.com/ExaDev/eslint-config/issues/region) [#45](https://github.com/ExaDev/eslint-config/issues/45)
* enable multiline-comment-style at bare-block through the wrapper ([966a97c](https://github.com/ExaDev/eslint-config/commit/966a97cc636c5c0eaf80f6226ba027fd0b779353)), closes [#region](https://github.com/ExaDev/eslint-config/issues/region) [eslint-stylistic/eslint-stylistic#1287](https://github.com/eslint-stylistic/eslint-stylistic/issues/1287) [#45](https://github.com/ExaDev/eslint-config/issues/45)

## [2.33.1](https://github.com/ExaDev/eslint-config/compare/v2.33.0...v2.33.1) (2026-10-02)


### Bug Fixes

* **deps:** upgrade @stylistic/eslint-plugin to 6.0.0-beta.6 ([3fffbc7](https://github.com/ExaDev/eslint-config/commit/3fffbc7e0ef6c7f138a900ee5cbc6958cb786ad2))

# [2.33.0](https://github.com/ExaDev/eslint-config/compare/v2.32.1...v2.33.0) (2026-10-02)


### Features

* **import-policy:** optionally report computed import specifiers ([efdcf29](https://github.com/ExaDev/eslint-config/commit/efdcf2913ddf8cd61c8fda4e326c316c39bc40d4)), closes [#88](https://github.com/ExaDev/eslint-config/issues/88)

## [2.32.1](https://github.com/ExaDev/eslint-config/compare/v2.32.0...v2.32.1) (2026-10-02)


### Bug Fixes

* **jsdoc:** validate doc comment tags against TSDoc's vocabulary ([34f5f00](https://github.com/ExaDev/eslint-config/commit/34f5f0072ac494847d94b7e62d52c906f2f536a6)), closes [#49](https://github.com/ExaDev/eslint-config/issues/49)

# [2.32.0](https://github.com/ExaDev/eslint-config/compare/v2.31.2...v2.32.0) (2026-10-02)


### Features

* **workspace:** add selector-based dependency constraints ([1ed6664](https://github.com/ExaDev/eslint-config/commit/1ed6664ec9a24ca360277f0b743ed6f9ca17b7f2)), closes [#36](https://github.com/ExaDev/eslint-config/issues/36)

## [2.31.2](https://github.com/ExaDev/eslint-config/compare/v2.31.1...v2.31.2) (2026-10-02)

## [2.31.1](https://github.com/ExaDev/eslint-config/compare/v2.31.0...v2.31.1) (2026-10-02)

# [2.31.0](https://github.com/ExaDev/eslint-config/compare/v2.30.0...v2.31.0) (2026-10-02)


### Bug Fixes

* accept syncpack configured under config.syncpack in package.json ([c5c96b0](https://github.com/ExaDev/eslint-config/commit/c5c96b008a8eef51ddcf1070c43e1b991c0955fb))
* find the repository root structurally instead of from the ESLint working directory ([9b19059](https://github.com/ExaDev/eslint-config/commit/9b1905908f9fe0abb3b2b3bed0e0f0d7e57fa96d))
* list a file requirement once however many equal objects state it ([a08b6e9](https://github.com/ExaDev/eslint-config/commit/a08b6e9f723856c1f4d639465f2b48bf477b058a))
* name every accepted spelling of a file requirement that allows a manifest field ([4e244f5](https://github.com/ExaDev/eslint-config/commit/4e244f5c9e6412b483edf06d002f1c301c2a8243))
* require the root tool scripts to run the tool, not merely exist ([4053223](https://github.com/ExaDev/eslint-config/commit/40532237a2d443fbf289cc1ab07d292e611db832))


### Features

* add package-requirements rule for conditional manifest fields, files and scripts ([2213c41](https://github.com/ExaDev/eslint-config/commit/2213c41db3abf51ac2ec73e36fc2f67c73245a8c))
* add the tooling wiring preset for publish checks, root tooling, hooks and tool configs ([022b4f6](https://github.com/ExaDev/eslint-config/commit/022b4f60243ab4739610d60fa86bb66c490ba031))
* verify through ESLint's Node API that the config is applied to sample files ([e28562b](https://github.com/ExaDev/eslint-config/commit/e28562b91da9aaae428dd6f1d6d3fedf9c12f26c))

# [2.30.0](https://github.com/ExaDev/eslint-config/compare/v2.29.0...v2.30.0) (2026-10-01)


### Bug Fixes

* accept a root file name as a vitest coverage threshold key ([798e0b5](https://github.com/ExaDev/eslint-config/commit/798e0b5252644173483b5915be8ef361d0a570cb))
* judge the merged configuration of a playwright defineConfig call ([f782623](https://github.com/ExaDev/eslint-config/commit/f782623b505af45297c5d60a344829882f343b3a))
* name TypeScript 5.4 as the minimum for require-compiler-options ([922f3ff](https://github.com/ExaDev/eslint-config/commit/922f3ffa04f1d96e0885ebeff864755781b756db))
* read compiler options from the tsconfig, not the typescript-eslint program ([5285c58](https://github.com/ExaDev/eslint-config/commit/5285c588fd082bf5d4baafd07567ae020b9107f9))
* report require-compiler-options again in each run of a long-lived ESLint instance ([14c4e7f](https://github.com/ExaDev/eslint-config/commit/14c4e7fb269d2f33d5f1cd8c65c44a43d5b6e2db))
* stop reporting a bare node_modules in vitest coverage.exclude ([ba58cd0](https://github.com/ExaDev/eslint-config/commit/ba58cd0ed59c3551570f6550bda222f864919ce7))
* tell require-compiler-options runs apart by tsconfig and lint order ([3e6380e](https://github.com/ExaDev/eslint-config/commit/3e6380e9e2381a9b7ee110a55a2525c7629a9fe6))


### Features

* add playwright-config rule ([625d287](https://github.com/ExaDev/eslint-config/commit/625d28788b3078959e7c6dc6c325c1eb630b1174))
* add require-compiler-options rule ([5849719](https://github.com/ExaDev/eslint-config/commit/5849719e3a0fca31638e03ac58ea76252a000126))
* add stryker-break-threshold and stryker-thresholds-order rules ([e3c82cd](https://github.com/ExaDev/eslint-config/commit/e3c82cdf490c0f7719db4a94d053cb5dfc085d0a))
* add vitest-config and vitest-coverage-config rules ([e60fc1d](https://github.com/ExaDev/eslint-config/commit/e60fc1d61ce68b5825ea5590bb5347c01ee94e92))
* read the literal structure of a tool config file ([cb450e7](https://github.com/ExaDev/eslint-config/commit/cb450e74e48a9b2b4574be6ed82e6bd0143f9c5d))
* register the tool config rules in the plugin ([78f3710](https://github.com/ExaDev/eslint-config/commit/78f3710c4936ae964dabc67b0fd25dd73de8fac3))

# [2.29.0](https://github.com/ExaDev/eslint-config/compare/v2.28.0...v2.29.0) (2026-10-01)


### Bug Fixes

* match a bare allow filename at any depth in no-defensive-fallback ([6efefae](https://github.com/ExaDev/eslint-config/commit/6efefae3a0f32429ed7d3a0a075cf07e48c48249))
* report a swallowing rejection handler passed as the second argument of then ([2c68d5a](https://github.com/ExaDev/eslint-config/commit/2c68d5aceac3838c1327fd0ae29b0b9912d3b763))
* report void, 0n and continue swallows in no-defensive-fallback ([72dcd42](https://github.com/ExaDev/eslint-config/commit/72dcd427560b2f0b8a9f43684c2ebc13b1bb0f16))


### Features

* add no-defensive-fallback rule ([1cee130](https://github.com/ExaDev/eslint-config/commit/1cee13002e69e662eabe6cdc443b62453808456b))
* enable core robustness rules and stricter switch exhaustiveness ([758c55a](https://github.com/ExaDev/eslint-config/commit/758c55a19a6868c9e63441d4b6bc57685bb706ad))

# [2.28.0](https://github.com/ExaDev/eslint-config/compare/v2.27.0...v2.28.0) (2026-09-30)


### Bug Fixes

* accept any unary expression as data and word the prop rule as data, not literal ([ae28306](https://github.com/ExaDev/eslint-config/commit/ae2830649c2a5a017b97c69eb7bd5be5199356d3))
* decline the no-multiline-template-literal fix where the literal type is required ([cb218b1](https://github.com/ExaDev/eslint-config/commit/cb218b1b0a969ad50ae45a768a89d79652f7c9e8))
* require the catch guard to test that the controller has aborted, not its negation ([1dc5dcf](https://github.com/ExaDev/eslint-config/commit/1dc5dcfa7dbef96bb76d63205f7d6c40bf175af2))
* require the race to be awaited inside the try for its finally and catch to count ([db078e5](https://github.com/ExaDev/eslint-config/commit/db078e5a2154e2e83bd8b665d93eaa2080f24880))
* require the timeout race to use the controller its timer aborts ([011cb45](https://github.com/ExaDev/eslint-config/commit/011cb45c9205629493a9508fdbc8800d417d4828))
* treat only dot-slash paths as relative in no-external-member-jsx-tag ([e8eb328](https://github.com/ExaDev/eslint-config/commit/e8eb328990f367d9719765af8680db5eb2cec125))


### Features

* add markdown-required-heading rule and markdownHeadingsConfig preset ([c290ed9](https://github.com/ExaDev/eslint-config/commit/c290ed95b2758e8c3011acc8c119400ed6dbd877)), closes [#80](https://github.com/ExaDev/eslint-config/issues/80)
* add no-multiline-template-literal rule with a string-preserving fix ([3c459ba](https://github.com/ExaDev/eslint-config/commit/3c459badaa80bb16e56815e7de7f88fd339287a9)), closes [#79](https://github.com/ExaDev/eslint-config/issues/79)
* add server component boundary rules to the Next.js preset ([095ebb0](https://github.com/ExaDev/eslint-config/commit/095ebb08195dbe8263e2754b4379ce7c8fa0c6cb)), closes [#82](https://github.com/ExaDev/eslint-config/issues/82)
* add timeout-aborts-request rule for Promise.race timeouts ([9e7b163](https://github.com/ExaDev/eslint-config/commit/9e7b1636c98ec6a96a8973a897c029fc99bd1a77)), closes [#81](https://github.com/ExaDev/eslint-config/issues/81)

# [2.27.0](https://github.com/ExaDev/eslint-config/compare/v2.26.0...v2.27.0) (2026-09-30)


### Bug Fixes

* ban console, worker and sqlite in pure modules and see through globalThis ([b9131ca](https://github.com/ExaDev/eslint-config/commit/b9131caf96a3bac03be0c4c4e00f6a05a1b290a1))
* mirror the README test hygiene example without a duplicate block set ([7d818c8](https://github.com/ExaDev/eslint-config/commit/7d818c8c7de2db2f4ece14b6d69bc253cf3231d1))
* name the configured option in pure-module option errors ([6dbc915](https://github.com/ExaDev/eslint-config/commit/6dbc91542fe8659122158f2ec6dbc55d17f4dfec))
* report Node crypto randomness and key generation in pure modules ([199d219](https://github.com/ExaDev/eslint-config/commit/199d21977e59ae735e00387d019deec25eccf31c))
* resolve the scope parameter's declared name through aliases in scoped-first-parameter ([bf017b3](https://github.com/ExaDev/eslint-config/commit/bf017b3c2ebb537b3c8f7366015bb03c56ff8e80))
* stop counting a discovery assertion as evidence about the pattern in non-vacuous-guard ([077bee8](https://github.com/ExaDev/eslint-config/commit/077bee8ed6895c32494b7cf90ff0425b23c61666))
* treat a possibly empty each table callback as conditional in non-vacuous-guard ([621e307](https://github.com/ExaDev/eslint-config/commit/621e307d5d41eb9cd4b79196237b3eeaa16c4ef7))
* treat the Array.from mapper as running per element in non-vacuous-guard ([856615f](https://github.com/ExaDev/eslint-config/commit/856615f5e63ae91e7df679ccd746d6134a16556d))


### Features

* add non-vacuous-guard rule requiring guard tests to show they can fail ([5d412b1](https://github.com/ExaDev/eslint-config/commit/5d412b12ba7e3272f7b8e7254161d9d66a36f1f3))
* add pure-module rule banning I/O, ambient state and async in configured files ([1d3b4a9](https://github.com/ExaDev/eslint-config/commit/1d3b4a9948133a4bc0f8381846b9acf831c2a19d))
* add pureModules option and pureModulesConfig for functional-core files ([5d5b715](https://github.com/ExaDev/eslint-config/commit/5d5b7156475c6bf7f3f52943ca7f8b6f381097d7))
* add scoped-first-parameter rule for repository interface methods ([e7ac227](https://github.com/ExaDev/eslint-config/commit/e7ac227c0e6dbcb13ed64bbce820075cc244d868))
* add testHygiene option for guard and conformance test files ([fc6d707](https://github.com/ExaDev/eslint-config/commit/fc6d70787824164550d05a886bcc48be70689a35))
* check test functions a conformance kit receives as parameters ([459607e](https://github.com/ExaDev/eslint-config/commit/459607e6cd1e39a3ab7b656bb8c07a516b096249))

# [2.26.0](https://github.com/ExaDev/eslint-config/compare/v2.25.0...v2.26.0) (2026-09-30)


### Bug Fixes

* count constructions, non-null callees and tagged templates in required-imports call ([1880afe](https://github.com/ExaDev/eslint-config/commit/1880afef5be4bc3edf25c0f7b908eaccac20ae4f))
* name the pattern field when a filename-pattern regex is invalid ([bead7a3](https://github.com/ExaDev/eslint-config/commit/bead7a384295b70a3730cc8fc20eb1f1a98db421))
* normalise the file of an import-policy exception edge ([5c3970c](https://github.com/ExaDev/eslint-config/commit/5c3970cadd6e1a13a11ec7fb3f75d8a294c5b807))
* reject an import-policy exception edge in a file a confine entry allows ([53152e3](https://github.com/ExaDev/eslint-config/commit/53152e3a31010e974e6cfe3c4e4af66bd5481c24))
* reject duplicate and misspelt filename-pattern sibling templates ([25abb79](https://github.com/ExaDev/eslint-config/commit/25abb79c3f2d788f00b5b5e4e5d68233696200c5))


### Features

* add filename-pattern rule ([0ca0f2a](https://github.com/ExaDev/eslint-config/commit/0ca0f2a4d736b0084e93ea927f2a38a75bebc84a))
* add import-policy rule and options ([dbca4dc](https://github.com/ExaDev/eslint-config/commit/dbca4dc7abb0d114fec84ef88551db4f31d731d1))
* add required-exports rule ([95889a3](https://github.com/ExaDev/eslint-config/commit/95889a388c725cbdc149f0164c8a1fc926fe4e3d))
* add required-imports rule ([c498316](https://github.com/ExaDev/eslint-config/commit/c49831646277a863981916b81edf1566790b3463))
* add shared entry-option helpers and a specifier pattern matcher ([eedfb1f](https://github.com/ExaDev/eslint-config/commit/eedfb1f9f51aeccd4f6dc2136c5f2ed27a856769))
* register the file-level rules and wire importPolicyConfig ([de7a614](https://github.com/ExaDev/eslint-config/commit/de7a614feccf4a4c3bfd88c08f6d93711eb118e8))

# [2.25.0](https://github.com/ExaDev/eslint-config/compare/v2.24.0...v2.25.0) (2026-09-30)


### Bug Fixes

* accept eslint-plugin-turbo from the first release with a flat recommended config ([9037761](https://github.com/ExaDev/eslint-config/commit/90377614b216f0f2d02127ce23453854d3671f1c))
* accept the local and versioned turbo $schema forms turbo documents ([58b7f01](https://github.com/ExaDev/eslint-config/commit/58b7f01932c8bb8d85ca2f3c797a19548c5e2a6a))
* develop against an eslint-plugin-turbo release that passes the minimum release age ([f940ced](https://github.com/ExaDev/eslint-config/commit/f940cedd474a2b16242573eb4b0b71b0c51d821b))
* name the excluding inputs glob when a tool config is dropped from a task cache key ([6e013b9](https://github.com/ExaDev/eslint-config/commit/6e013b9c1675c23c32e2dd28850861a5434834fe))
* reject an empty tool name in the toolConfigs option ([cae7df3](https://github.com/ExaDev/eslint-config/commit/cae7df3027d64d74e96bc012d1beb95a34ce0d0a))


### Features

* add eslint-plugin-turbo as an optional turboEnv preset ([23dbb33](https://github.com/ExaDev/eslint-config/commit/23dbb3320c0baf04861d55915abd9fbb369c4de4))
* add turbo-task-config-inputs and the toolConfigs, taskGraph and hygiene options ([2e75c88](https://github.com/ExaDev/eslint-config/commit/2e75c887c1562c984e4945416a807771d27dd49c))
* add turbo-task-graph and turbo-json-hygiene and wire the new turbo rules ([cbeb81f](https://github.com/ExaDev/eslint-config/commit/cbeb81f467ecde9500edb2b184216407aeac0cb4))
* export the taskGraph, hygiene and aggregate task option types ([1ece091](https://github.com/ExaDev/eslint-config/commit/1ece0919f26635d05bf60f75711137f94684c872))
* read inputs, globalDependencies, $schema and pass-through env from turbo.json ([03c1bc0](https://github.com/ExaDev/eslint-config/commit/03c1bc01f7a233ad2a9a3f1173239c063f4f83f1))
* report a taskGraph requirement that matches no task entry ([c4dcc52](https://github.com/ExaDev/eslint-config/commit/c4dcc527c28c800d1bd6ec238885dde9cffe418d))

# [2.24.0](https://github.com/ExaDev/eslint-config/compare/v2.23.3...v2.24.0) (2026-09-30)


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

## [2.23.3](https://github.com/ExaDev/eslint-config/compare/v2.23.2...v2.23.3) (2026-09-29)

## [2.23.2](https://github.com/ExaDev/eslint-config/compare/v2.23.1...v2.23.2) (2026-09-29)

## [2.23.1](https://github.com/ExaDev/eslint-config/compare/v2.23.0...v2.23.1) (2026-09-29)


### Bug Fixes

* declare @eslint/json as an optional peer dependency ([5a776ff](https://github.com/ExaDev/eslint-config/commit/5a776ff8151447a49b3e925543f80dcd6a6890a9))

# [2.23.0](https://github.com/ExaDev/eslint-config/compare/v2.22.2...v2.23.0) (2026-09-28)


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


### Features

* add prefer-doc-comment rule ([aa3d937](https://github.com/ExaDev/eslint-config/commit/aa3d9370c8a60b7028880342cd2c14727955db12))
* **deps:** add @stylistic/eslint-plugin ([37e38de](https://github.com/ExaDev/eslint-config/commit/37e38de72afadcb1a9f853429b808f1054e8dcfa))
* **prefer-doc-comment:** cover exported enums, namespaces, value consts, default expressions ([3f658d5](https://github.com/ExaDev/eslint-config/commit/3f658d5f14d29d7ca46042ef64c533c65f11d447))
* **prefer-doc-comment:** cover public abstract methods and function-valued class properties ([349d96a](https://github.com/ExaDev/eslint-config/commit/349d96a26b3a2d6758c442b5bd2b22669f624f5d))
* **prefer-doc-comment:** report an exported function's own overload signature ([cb4be1e](https://github.com/ExaDev/eslint-config/commit/cb4be1e603d41c91830e6d58ad17e06d67919da1))
* wire stylistic comment, class-member and JSX rules into config ([950de79](https://github.com/ExaDev/eslint-config/commit/950de796de61f0304454a5f3ea002a7344cbe475))

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

## [2.22.1](https://github.com/ExaDev/eslint-config/compare/v2.22.0...v2.22.1) (2026-09-27)


### Bug Fixes

* **workspace-checks:** keep-group uses the group's own name, not its path ([68df33c](https://github.com/ExaDev/eslint-config/commit/68df33c73b50bff845ab5c94320781474b8da043))
* **workspace-yaml:** prefix packages: parse errors like the other workspace-architecture modules ([0820a56](https://github.com/ExaDev/eslint-config/commit/0820a56ee14f0b35c4a3534ef390422b8e914205))

# [2.22.0](https://github.com/ExaDev/eslint-config/compare/v2.21.1...v2.22.0) (2026-09-26)


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


### Features

* **workspace:** add assertIsError, a shared non-Error-throw guard ([1ec4277](https://github.com/ExaDev/eslint-config/commit/1ec427773b4bc99f14854d8347c15cb62105b286))

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

# [2.21.0](https://github.com/ExaDev/eslint-config/compare/v2.20.2...v2.21.0) (2026-09-26)


### Bug Fixes

* **workspace:** accept zero-indent pnpm-workspace.yaml sequence items ([800483c](https://github.com/ExaDev/eslint-config/commit/800483cf9ae6d1f6643a1586c9cdde5d224a4ebe))
* **workspace:** de-duplicate dependency names before checking uphill rules ([50f752d](https://github.com/ExaDev/eslint-config/commit/50f752d1e08ae07f1b33349576ac49d5ee0dd283))
* **workspace:** namePrefix slice picks the longest match and strips scope ([d20ee82](https://github.com/ExaDev/eslint-config/commit/d20ee82a5ffe099962c4e4e29d9acdec3ef2c83d))
* **workspace:** reject unknown option keys and validate isolatedGroups ([73deb85](https://github.com/ExaDev/eslint-config/commit/73deb850684d700b84395debed310ff0ab1713c0))
* **workspace:** support in-segment glob wildcards and skip node_modules ([456e77f](https://github.com/ExaDev/eslint-config/commit/456e77fa2e72a05e7ae2b02eedbd7c718191a1ae))


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

## [2.20.2](https://github.com/ExaDev/eslint-config/compare/v2.20.1...v2.20.2) (2026-09-25)


### Bug Fixes

* **rules:** skip no-pointless-reassignment for exported aliases ([3b20413](https://github.com/ExaDev/eslint-config/commit/3b20413868caa1392159bb466bf03082de307065))

## [2.20.1](https://github.com/ExaDev/eslint-config/compare/v2.20.0...v2.20.1) (2026-09-19)


### Bug Fixes

* **plugin:** register prefer-options-object-param in the lighter bundle too ([4994124](https://github.com/ExaDev/eslint-config/commit/4994124fdd4719e945a536c31eab45035a05826b))

# [2.20.0](https://github.com/ExaDev/eslint-config/compare/v2.19.4...v2.20.0) (2026-09-19)


### Bug Fixes

* **no-non-barrel-reexport:** bundle fixer and sourceCode into one context param ([727b223](https://github.com/ExaDev/eslint-config/commit/727b22380c892ef9ff747742ba2ab6879aeb7db2))


### Features

* **config:** register prefer-options-object-param and max-params ([2fbaf46](https://github.com/ExaDev/eslint-config/commit/2fbaf467f002e500fe354e1838868cd83fab4b70))
* **rules:** add prefer-options-object-param rule ([112bccf](https://github.com/ExaDev/eslint-config/commit/112bccf7b4d79aea9419213d12efd42a97d0f2c7))

## [2.19.4](https://github.com/ExaDev/eslint-config/compare/v2.19.3...v2.19.4) (2026-09-18)

## [2.19.3](https://github.com/ExaDev/eslint-config/compare/v2.19.2...v2.19.3) (2026-09-18)

## [2.19.2](https://github.com/ExaDev/eslint-config/compare/v2.19.1...v2.19.2) (2026-09-18)

## [2.19.1](https://github.com/ExaDev/eslint-config/compare/v2.19.0...v2.19.1) (2026-09-18)

# [2.19.0](https://github.com/ExaDev/eslint-config/compare/v2.18.1...v2.19.0) (2026-09-18)


### Features

* **barrel-policy:** add auto mode that detects single vs banned from package.json ([c829516](https://github.com/ExaDev/eslint-config/commit/c829516ddfb1d399698e3742024a4302aef475c2))

## [2.18.1](https://github.com/ExaDev/eslint-config/compare/v2.18.0...v2.18.1) (2026-09-17)

# [2.18.0](https://github.com/ExaDev/eslint-config/compare/v2.17.2...v2.18.0) (2026-09-15)


### Features

* add exadev/test-file-kind rule requiring a kind suffix ([2d64ec5](https://github.com/ExaDev/eslint-config/commit/2d64ec5a5c70bf05cf435eeeacd51547e9cc2749))

## [2.17.2](https://github.com/ExaDev/eslint-config/compare/v2.17.1...v2.17.2) (2026-09-15)

## [2.17.1](https://github.com/ExaDev/eslint-config/compare/v2.17.0...v2.17.1) (2026-09-15)

# [2.17.0](https://github.com/ExaDev/eslint-config/compare/v2.16.1...v2.17.0) (2026-09-15)


### Features

* derive ESLint ignores from the consumer's own .gitignore ([2000077](https://github.com/ExaDev/eslint-config/commit/20000771d311750e8d78e11efce05e99608bfa46))

## [2.16.1](https://github.com/ExaDev/eslint-config/compare/v2.16.0...v2.16.1) (2026-09-15)


### Bug Fixes

* exempt numeric literal types from no-magic-numbers ([0259947](https://github.com/ExaDev/eslint-config/commit/025994725e1e5556487c29dbf1330a328fdc150f))

# [2.16.0](https://github.com/ExaDev/eslint-config/compare/v2.15.0...v2.16.0) (2026-09-15)


### Features

* bump eslint-plugin-json-canonical to v2 for pretty-printing and JSONC ([a77cec1](https://github.com/ExaDev/eslint-config/commit/a77cec1f5529003d9f95f0f02406cf1f372db9c1))

# [2.15.0](https://github.com/ExaDev/eslint-config/compare/v2.14.0...v2.15.0) (2026-09-15)


### Bug Fixes

* **eslint.config:** scope js.configs.recommended and type-imports rules to JS/TS files ([3c9e555](https://github.com/ExaDev/eslint-config/commit/3c9e5554dafaf8ab934edd4066e61efef4de4ee4))


### Features

* add package-json-key-order rule for syncpack-compatible ordering ([7598ac3](https://github.com/ExaDev/eslint-config/commit/7598ac301012633c3e5009c358956fb1c98ed320))

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

## [2.12.1](https://github.com/ExaDev/eslint-config/compare/v2.12.0...v2.12.1) (2026-09-14)


### Bug Fixes

* pin eslint-plugin-jsdoc to an exact, already-mature version ([81c6f76](https://github.com/ExaDev/eslint-config/commit/81c6f767dd331b24621b8ba2b1d28ee17d4940cf))

# [2.12.0](https://github.com/ExaDev/eslint-config/compare/v2.11.0...v2.12.0) (2026-09-14)


### Features

* ban Stryker suppression comments and enforce an 800-line file limit ([a09c74f](https://github.com/ExaDev/eslint-config/commit/a09c74f9c536af4e77b8658aae14f3233aec2b7b))

# [2.11.0](https://github.com/ExaDev/eslint-config/compare/v2.10.6...v2.11.0) (2026-09-12)


### Bug Fixes

* **ci:** push release commits over SSH using a deploy key ([7f3beb0](https://github.com/ExaDev/eslint-config/commit/7f3beb0b8aab12cff9fbbd4139da228f821fc784))
* **ci:** rewrite release pushes to SSH so the deploy key actually authenticates ([ab43046](https://github.com/ExaDev/eslint-config/commit/ab43046543f5cdbf1c79df0b28bc8eb59d2e741e))
* **release:** push over SSH via repositoryUrl, not a git config rewrite ([a402b71](https://github.com/ExaDev/eslint-config/commit/a402b71656335637250874701bb81040bc448815))


### Features

* validate JSDoc/TSDoc quality on existing doc comments ([fb17d2a](https://github.com/ExaDev/eslint-config/commit/fb17d2a677057b049c236b67a004c797944f3902))

## [2.10.6](https://github.com/ExaDev/eslint-config/compare/v2.10.5...v2.10.6) (2026-09-06)

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

## [2.10.1](https://github.com/ExaDev/eslint-config/compare/v2.10.0...v2.10.1) (2026-08-31)


### Bug Fixes

* compose js.configs.recommended inside recommendedTypeChecked ([ca23de1](https://github.com/ExaDev/eslint-config/commit/ca23de1816efcc083f4642661329fe52df9eaa89))

# [2.10.0](https://github.com/ExaDev/eslint-config/compare/v2.9.1...v2.10.0) (2026-08-27)


### Features

* add optional, auto-detected React and Next.js support ([2611ece](https://github.com/ExaDev/eslint-config/commit/2611ece1c6f6d3f3d15633d16b158fe986cb7ca3))

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
