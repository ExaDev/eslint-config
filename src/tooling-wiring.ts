import type { TSESLint } from '@typescript-eslint/utils';
import type { ConfigArrayValue, PublicConfigArray } from './config-types';
import { isRecord } from './is-record';
import { buildJsonLanguageBlock, requireJsonPlugin } from './json-language-config';
import type { RequireFn } from './optional-plugin';
import plugin from './plugin';
import { assertOnlyKeys, readRequiredStrings } from './rules/file-entry';
import { readFileGlobs } from './rules/file-scope';
import { readFileReference, type FileReference } from './rules/file-reference';
import type { PackageRequirement } from './rules/package-requirements-options';
import { PLAYWRIGHT_FILE_GLOBS } from './rules/playwright-config';
import { STRYKER_FILE_GLOBS } from './rules/stryker-thresholds';
import { VITEST_FILE_GLOBS } from './rules/vitest-test-objects';
import { toPublicConfigArray } from './to-public-config-array';

const OPTION_NAME = 'toolingWiring';

/**
 * The commands a publishable package's `prepublishOnly` must run when `publish.tools` is not given.
 */
export const DEFAULT_PUBLISH_TOOLS: readonly string[] = ['publint', 'attw'];

/**
 * The tools whose configuration and script the repository root is held to, in the order they are reported.
 */
export const ROOT_TOOLS = ['knip', 'syncpack'] as const;

export type RootTool = (typeof ROOT_TOOLS)[number];

// The extensions a JavaScript or TypeScript tool config can carry. A tool config rule is wired only onto files with one of them, since the same names (`vitest.workspace.json`) can exist in a format the rules do not parse.
const SCRIPT_EXTENSIONS = '**/*.{ts,mts,cts,js,mjs,cjs}';

// Where each root tool reads its configuration from, taken from the tool's own source: knip's KNIP_CONFIG_LOCATIONS, and the file names the syncpack binary searches for. Either also reads a `knip` or `syncpack` property of package.json.
const ROOT_TOOL_CONFIG: Readonly<Record<RootTool, { readonly glob: string; readonly orField: string }>> = {
  knip: { glob: '{knip.json,knip.jsonc,.knip.json,.knip.jsonc,knip.ts,knip.js,knip.config.ts,knip.config.js}', orField: 'knip' },
  syncpack: {
    glob: '{.syncpackrc,.syncpackrc.json,.syncpackrc.yaml,.syncpackrc.yml,.syncpackrc.js,.syncpackrc.ts,.syncpackrc.mjs,.syncpackrc.cjs,syncpack.config.js,syncpack.config.ts,syncpack.config.mjs,syncpack.config.cjs}',
    orField: 'syncpack',
  },
};

/**
 * What the publishable packages (those that do not set `"private": true`) are held to.
 */
export interface PublishWiringOptions {
  // Commands `prepublishOnly` must run, found as whole tokens of the command so `pnpm run publint` and `publint && attw --pack` both count. Defaults to `publint` and `attw`.
  readonly tools?: readonly string[];
  // A directory (relative to the package) holding a smoke project that imports the built entry points; it must exist. Off unless given.
  readonly smokeProject?: string;
}

/**
 * What the repository root (the `package.json` in the directory ESLint runs from) is held to.
 */
export interface RootWiringOptions {
  // The tools that must have a configuration (a file, or a property of package.json) and a script of the same name. Defaults to every tool in `ROOT_TOOLS`.
  readonly tools?: readonly RootTool[];
}

export interface VitestWiringOptions {
  // Also report a numeric `test.maxWorkers`. See `vitest-config`.
  readonly forbidNumericMaxWorkers?: boolean;
  // Globs of the shared base configs that must spell out a complete coverage block. Off unless given. See `vitest-coverage-config`.
  readonly coverageFiles?: readonly string[];
}

export interface StrykerWiringOptions {
  // A floor for `thresholds.break`, from 0 to 100. See `stryker-break-threshold`.
  readonly min?: number;
  // The shared Stryker config whose `thresholds.break` is a second floor. See `stryker-break-threshold`.
  readonly base?: FileReference;
}

export interface PlaywrightWiringOptions {
  // Require `fullyParallel` to be set. See `playwright-config`.
  readonly fullyParallel?: boolean;
  // Require `workers` to be set. See `playwright-config`.
  readonly workers?: boolean;
}

/**
 * The tool config rules to wire. Each tool is on unless it is given as `false`; the rules scope themselves by file name, so wiring one for a tool the repository does not use does nothing.
 */
export interface ToolConfigsWiringOptions {
  readonly vitest?: false | VitestWiringOptions;
  readonly stryker?: false | StrykerWiringOptions;
  readonly playwright?: false | PlaywrightWiringOptions;
}

/**
 * The `toolingWiring` option of `exadevConfig`, and the argument of `toolingWiringConfig`. Every section is on unless given as `false`, so `{}` enables the whole preset with its defaults.
 */
export interface ToolingWiringOptions {
  // Publishable packages run their package-shape checks before publishing and declare the Node versions they support.
  readonly publish?: false | PublishWiringOptions;
  // The repository root configures and runs its dead-code and version-consistency tools and pins its package manager.
  readonly root?: false | RootWiringOptions;
  // A package that declares `husky` runs it from `prepare` and has the `.husky` hook directory.
  readonly hooks?: boolean;
  // The test runner, mutation and browser test configs are held to their tool config rules.
  readonly toolConfigs?: false | ToolConfigsWiringOptions;
}

export interface ToolingWiringConfigOptions extends ToolingWiringOptions {
  // Test seam only, never exposed through exadevConfig()'s own public options; defaults to the real resolver, mirroring buildWorkspaceArchitectureConfig's identical seam.
  readonly requireFn?: RequireFn;
}

type Section = Readonly<Record<string, unknown>>;

interface ToolRules {
  readonly rules: Record<string, TSESLint.FlatConfig.RuleEntry>;
  readonly files: readonly string[];
}

function fail(path: string, detail: string): never {
  throw new Error(`@exadev/eslint-config: "${OPTION_NAME}.${path}" ${detail}`);
}

// A section is `false` (off), absent (the defaults, an empty object) or an object whose keys are all in `allowed`.
function readSection(value: unknown, path: string, allowed: readonly string[]): false | Section {
  if (value === undefined) return {};
  if (value === false) return false;
  if (!isRecord(value)) fail(path, 'must be false or an object.');
  assertOnlyKeys(value, allowed, `${OPTION_NAME}.${path}`);

  return value;
}

function readBoolean(value: unknown, path: string): boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') fail(path, 'must be a boolean.');

  return value;
}

function isRootTool(value: string): value is RootTool {
  return ROOT_TOOLS.some((tool) => tool === value);
}

function readRootTools(section: Section): readonly RootTool[] {
  if (section['tools'] === undefined) return ROOT_TOOLS;
  const names = readRequiredStrings(section, 'tools', `${OPTION_NAME}.root`);
  const unknown = names.find((name) => !isRootTool(name));
  if (unknown !== undefined) fail('root.tools', `names "${unknown}", which is not one of ${ROOT_TOOLS.join(', ')}.`);

  return names.filter(isRootTool);
}

function publishRequirement(section: Section): PackageRequirement {
  const tools = section['tools'] === undefined ? DEFAULT_PUBLISH_TOOLS : readRequiredStrings(section, 'tools', `${OPTION_NAME}.publish`);
  const { smokeProject } = section;
  if (smokeProject !== undefined && (typeof smokeProject !== 'string' || smokeProject.length === 0)) fail('publish.smokeProject', 'must be a non-empty string.');

  return {
    when: { private: false },
    scripts: [{ name: 'prepublishOnly', includes: [...tools] }],
    fields: ['engines'],
    ...(smokeProject !== undefined && { files: [smokeProject] }),
  };
}

function rootRequirement(section: Section): PackageRequirement {
  const tools = readRootTools(section);

  return { when: { root: true }, scripts: [...tools], files: tools.map((tool) => ROOT_TOOL_CONFIG[tool]), fields: ['packageManager'] };
}

/**
 * The requirement groups the `publish`, `root` and `hooks` sections stand for, validated. Each is one entry of the `package-requirements` rule's `requirements` option, so its diagnostics and semantics are that rule's.
 */
export function toolingRequirements(options: ToolingWiringOptions): readonly PackageRequirement[] {
  const publish = readSection(options.publish, 'publish', ['tools', 'smokeProject']);
  const root = readSection(options.root, 'root', ['tools']);
  const hooks = readBoolean(options.hooks, 'hooks');

  return [
    ...(publish === false ? [] : [publishRequirement(publish)]),
    ...(root === false ? [] : [rootRequirement(root)]),
    ...(hooks === false ? [] : [{ when: { declares: ['husky'] }, scripts: [{ name: 'prepare', includes: ['husky'] }], files: ['.husky'] }]),
  ];
}

function withOptions(options: Section): TSESLint.FlatConfig.RuleEntry {
  return Object.keys(options).length === 0 ? 'error' : ['error', options];
}

function vitestRules(section: Section): ToolRules {
  const forbidNumericMaxWorkers = readBoolean(section['forbidNumericMaxWorkers'], 'toolConfigs.vitest.forbidNumericMaxWorkers');
  const coverageFiles = section['coverageFiles'] === undefined ? [] : readFileGlobs(section['coverageFiles'], `${OPTION_NAME}.toolConfigs.vitest.coverageFiles`);

  return {
    rules: {
      'exadev/vitest-config': withOptions(forbidNumericMaxWorkers === undefined ? {} : { forbidNumericMaxWorkers }),
      ...(coverageFiles.length > 0 && { 'exadev/vitest-coverage-config': ['error', { files: [...coverageFiles] }] }),
    },
    files: [...VITEST_FILE_GLOBS, ...coverageFiles],
  };
}

function strykerRules(section: Section): ToolRules {
  const { min, base } = section;
  if (min !== undefined && typeof min !== 'number') fail('toolConfigs.stryker.min', 'must be a number.');

  return {
    rules: {
      'exadev/stryker-break-threshold': withOptions({
        ...(min !== undefined && { min }),
        ...(base !== undefined && { base: readFileReference(base, `${OPTION_NAME}.toolConfigs.stryker.base`) }),
      }),
      'exadev/stryker-thresholds-order': 'error',
    },
    files: STRYKER_FILE_GLOBS,
  };
}

function playwrightRules(section: Section): ToolRules {
  const fullyParallel = readBoolean(section['fullyParallel'], 'toolConfigs.playwright.fullyParallel');
  const workers = readBoolean(section['workers'], 'toolConfigs.playwright.workers');

  return {
    rules: { 'exadev/playwright-config': withOptions({ ...(fullyParallel !== undefined && { fullyParallel }), ...(workers !== undefined && { workers }) }) },
    files: PLAYWRIGHT_FILE_GLOBS,
  };
}

function toolConfigBlocks(value: unknown): ConfigArrayValue {
  const section = readSection(value, 'toolConfigs', ['vitest', 'stryker', 'playwright']);
  if (section === false) return [];
  const vitest = readSection(section['vitest'], 'toolConfigs.vitest', ['forbidNumericMaxWorkers', 'coverageFiles']);
  const stryker = readSection(section['stryker'], 'toolConfigs.stryker', ['min', 'base']);
  const playwright = readSection(section['playwright'], 'toolConfigs.playwright', ['fullyParallel', 'workers']);
  const wired = [vitest === false ? [] : [vitestRules(vitest)], stryker === false ? [] : [strykerRules(stryker)], playwright === false ? [] : [playwrightRules(playwright)]].flat();
  if (wired.length === 0) return [];

  return [
    {
      // Each glob is paired with the script extensions in a nested array, which flat config reads as "both must match".
      files: [...new Set(wired.flatMap((entry) => entry.files))].map((glob) => [glob, SCRIPT_EXTENSIONS]),
      plugins: { exadev: plugin },
      rules: wired.reduce<ToolRules['rules']>((all, entry) => ({ ...all, ...entry.rules }), {}),
    },
  ];
}

/**
 * Wires the tooling preset: one `exadev/package-requirements` entry on `**\/package.json` for the `publish`, `root` and `hooks` sections that are on, and the tool config rules on the JavaScript and TypeScript config files the `toolConfigs` section covers. Internal: consumed by create-config.ts as more `ConfigArrayValue` entries. The `@eslint/json` peer is required only when a package.json section is on.
 */
export function buildToolingWiringConfig(options: ToolingWiringConfigOptions = {}): ConfigArrayValue {
  const { requireFn, ...preset } = options;
  assertOnlyKeys(preset, ['publish', 'root', 'hooks', 'toolConfigs'], OPTION_NAME);
  const requirements = toolingRequirements(preset);
  const toolConfigs = toolConfigBlocks(preset.toolConfigs);
  if (requirements.length === 0) return toolConfigs;

  return [
    buildJsonLanguageBlock({
      jsonPlugin: requireJsonPlugin('tooling wiring', requireFn),
      language: 'json/json',
      files: ['**/package.json'],
      rules: { 'exadev/package-requirements': ['error', { requirements: [...requirements] }] },
    }),
    ...toolConfigs,
  ];
}

/**
 * Wires the tooling preset, returning ESLint core's own `Config[]` so the result spreads directly into `defineConfig(...)`. Throws at call time for a malformed option, and for a package.json section without the optional peer `@eslint/json`. See the README's "Tooling wiring" section.
 */
export function toolingWiringConfig(options: ToolingWiringOptions = {}): PublicConfigArray {
  return toPublicConfigArray(buildToolingWiringConfig(options));
}
