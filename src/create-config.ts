import type { TSESLint } from '@typescript-eslint/utils';
import { buildAgentSkillsConfig, type AgentSkillsOptions } from './agent-skills';
import type { ConfigArrayValue, PublicConfigArray } from './config-types';
import { buildGitignoreConfig } from './gitignore';
import { buildImportPolicyConfig } from './import-policy';
import jsdocAndTsdoc from './jsdoc';
import jsonCanonicalConfig from './json-canonical';
import { buildMarkdownHeadingsConfig, type MarkdownHeadingsOptions } from './markdown-headings';
import { buildNextjsConfig } from './nextjs';
import { buildPackageJsonKeyOrderConfig } from './package-json-key-order';
import plugin from './plugin';
import { buildPureModulesConfig, type PureModulesOptions } from './pure-modules';
import { buildReactConfig } from './react';
import recommendedTypeChecked from './recommended-type-checked';
import stylisticCommentsConfig from './stylistic-comments';
import { toPublicConfigArray } from './to-public-config-array';
import { buildTestHygieneConfig, type TestHygieneOptions } from './test-hygiene';
import { buildToolingWiringConfig, type ToolingWiringOptions } from './tooling-wiring';
import { buildTurboConfig } from './turbo-config';
import { buildTurboEnvConfig } from './turbo-env';
import type { ImportPolicy } from './rules/import-policy-options';
import type { TurboOptions } from './rules/turbo-options';
import { buildWorkspaceArchitectureConfig } from './workspace-architecture';
import type { WorkspaceArchitectureOptions } from './rules/workspace-options';

export interface ExadevConfigOptions {
  readonly react?: boolean;
  readonly nextjs?: boolean;
  // true: report environment variables read in source that no turbo.json declares (eslint-plugin-turbo's no-undeclared-env-vars), throwing if eslint-plugin-turbo isn't resolvable. false: never. undefined (the default): auto-detect, on if eslint-plugin-turbo is installed. Separate from `turbo`, which configures this package's own turbo rules and is off unless given. See src/turbo-env.ts.
  readonly turboEnv?: boolean;
  // true: enforce package.json key order (see src/rules/package-json-key-order.ts) regardless of syncpack. false: never enforce it. undefined (the default): auto-detect -- enabled unless the consumer's own project already has syncpack configured, since syncpack already produces this exact order for free.
  readonly packageJsonKeyOrder?: boolean;
  // true or an options object: lint agent SKILL.md files and Claude Code plugin manifests (see src/agent-skills.ts), throwing if @eslint/markdown or @eslint/json isn't resolvable; an options object also overrides the globs the rules apply to. false: never. undefined (the default): auto-detect, on if the working directory holds a marketplace, a skills/<name>/SKILL.md or a plugins/<plugin>/skills/<name>/SKILL.md, using whichever of the two optional peers resolves.
  readonly agentSkills?: boolean | AgentSkillsOptions;
  // true: derive ESLint's ignores from .gitignore, throwing if no .gitignore exists. false: never derive it. undefined (the default): auto-detect -- on if the consumer's project has a .gitignore, silently off if it doesn't (a project with no .gitignore at all -- no version control set up yet -- has nothing for this to read).
  readonly gitignore?: boolean;
  // Off unless given (unlike every tri-state option above): workspace architecture rules require real per-repo configuration (a "groups" list has no sensible default), so there is no auto-detected middle state. See workspaceArchitectureConfig in src/workspace-architecture.ts.
  readonly workspaceArchitecture?: WorkspaceArchitectureOptions;
  // Off unless given, like workspaceArchitecture: turbo rules check a repository that uses turbo, which only its own configuration can say. An empty object enables the conventions with every default. See turboConfig in src/turbo-config.ts.
  readonly turbo?: TurboOptions;
  // Off unless given, like workspaceArchitecture and turbo: import policies name the specifiers and files of one repository. See importPolicyConfig in src/import-policy.ts.
  readonly importPolicies?: readonly ImportPolicy[];
  // Off unless given, like importPolicies: which modules are a functional core is a per-repository decision. See pureModulesConfig in src/pure-modules.ts.
  readonly pureModules?: PureModulesOptions;
  // Off unless given, like pureModules: which tests are guards and conformance suites is a per-repository decision. Giving it (an empty object enables the defaults) throws when the optional peer @vitest/eslint-plugin is not installed. See testHygieneConfig in src/test-hygiene.ts.
  readonly testHygiene?: TestHygieneOptions;
  // Off unless given, like testHygiene: which Markdown files must contain which headings is a per-repository decision. Giving it throws when the optional peer @eslint/markdown is not installed. See markdownHeadingsConfig in src/markdown-headings.ts.
  readonly markdownHeadings?: MarkdownHeadingsOptions;
  // Off unless given, like markdownHeadings: whether a repository wants its publish checks, root tooling and hook wiring enforced is a per-repository decision. An empty object enables every section with its defaults. Giving a package.json section (publish, root or hooks) throws when the optional peer @eslint/json is not installed. See toolingWiringConfig in src/tooling-wiring.ts.
  readonly toolingWiring?: ToolingWiringOptions;
}

/**
 * The turbo options with `boundaries.groups` taken from `workspaceArchitecture.groups`, so a repository using both declares its layout once: the tags `turbo-package-tags` requires then cannot drift from the groups the workspace rules check. Options are returned unchanged when either feature is absent or `boundaries` is not enabled. Giving `boundaries.groups` as well is a second declaration of the same layout and throws.
 */
function withWorkspaceGroups(turbo: TurboOptions, workspaceArchitecture: WorkspaceArchitectureOptions | undefined): TurboOptions {
  if (workspaceArchitecture === undefined || turbo.boundaries === undefined) return turbo;
  if (turbo.boundaries.groups !== undefined) {
    throw new Error('@exadev/eslint-config: "turbo.boundaries.groups" duplicates "workspaceArchitecture.groups". Omit it: exadevConfig() derives the tag groups from the workspace architecture groups so the layout is declared once.');
  }
  const groups = workspaceArchitecture.groups.map(({ name, path }) => ({ name, ...(path !== undefined && { path }) }));

  return { ...turbo, boundaries: { ...turbo.boundaries, groups } };
}

/**
 * jsdocAndTsdoc, jsonCanonicalConfig, and stylisticCommentsConfig are all bundled unconditionally, the same way recommendedTypeChecked itself is. Unlike react/nextjs below, none of the three is a consumer framework choice with its own optional peer dependency to resolve: eslint-plugin-jsdoc, eslint-plugin-tsdoc, eslint-plugin-json-canonical, and the stylistic comment/JSX plugin stylistic-comments.ts wires in are all plain dependencies of this package (see package.json), so every consumer already has them the moment they depend on this package at all.
 *
 * The tri-state per feature threads straight into each builder's own `enabled` option: true forces on (throwing if the underlying peer isn't resolvable), false forces off (skipping resolution entirely), undefined auto-detects (silently empty if unresolvable, or if an equivalent tool, syncpack for packageJsonKeyOrder, or a project's own .gitignore for gitignore, already does the job). One resolution pass per feature; no separate pre-check gate that would resolve twice.
 */
export function exadevConfig(options: ExadevConfigOptions = {}, ...userConfigs: readonly TSESLint.FlatConfig.Config[]): PublicConfigArray {
  const gitignore = buildGitignoreConfig({ enabled: options.gitignore });
  const built: ConfigArrayValue = [
    ...gitignore,
    ...recommendedTypeChecked,
    ...jsdocAndTsdoc,
    ...jsonCanonicalConfig,
    ...stylisticCommentsConfig,
    ...buildReactConfig({ enabled: options.react }),
    ...buildNextjsConfig({ enabled: options.nextjs, plugin }),
    ...buildTurboEnvConfig({ enabled: options.turboEnv }),
    ...buildPackageJsonKeyOrderConfig({ enabled: options.packageJsonKeyOrder }),
    ...(options.workspaceArchitecture !== undefined ? buildWorkspaceArchitectureConfig(options.workspaceArchitecture) : []),
    ...(options.turbo !== undefined ? buildTurboConfig(withWorkspaceGroups(options.turbo, options.workspaceArchitecture)) : []),
    ...(options.importPolicies !== undefined ? buildImportPolicyConfig(options.importPolicies) : []),
    ...(options.pureModules !== undefined ? buildPureModulesConfig(options.pureModules) : []),
    ...(options.testHygiene !== undefined ? buildTestHygieneConfig(options.testHygiene) : []),
    ...(options.markdownHeadings !== undefined ? buildMarkdownHeadingsConfig(options.markdownHeadings) : []),
    // After markdownHeadings: both blocks set the frontmatter format of the Markdown they select, and a SKILL.md is always YAML, so the later block must be this one.
    ...buildAgentSkillsConfig(options.agentSkills, { ignores: gitignore.flatMap(({ ignores = [] }) => ignores) }),
    ...(options.toolingWiring !== undefined ? buildToolingWiringConfig(options.toolingWiring) : []),
    ...userConfigs,
  ];

  return toPublicConfigArray(built);
}

/**
 * Evaluated once, eagerly, at module load -- exactly matching how recommendedTypeChecked itself is already eagerly built today. This is what lets src/index.ts re-export a plain, already-computed array under the name `default`: every existing consumer's `...exadev` spread sees the identical shape and timing as before this file existed, whether or not React/Next.js support resolves in their own project.
 */
export const defaultConfig: PublicConfigArray = exadevConfig();
