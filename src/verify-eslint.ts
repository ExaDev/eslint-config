import type { PublicConfigArray } from './config-types';
import { defaultConfig } from './create-config';
import { isRecord } from './is-record';

/**
 * The severities a rule can be required at. `warn` is satisfied by `warn` or `error`; `error` only by `error`.
 */
export type RequiredSeverity = 'warn' | 'error';

export type EffectiveSeverity = 'off' | RequiredSeverity;

/**
 * One file whose resolved configuration is checked, optionally with rules required for it alone.
 */
export interface EslintSample {
  // The file ESLint would lint, relative to `cwd`. It need not exist: ESLint resolves its configuration from the path alone.
  readonly path: string;
  // Rules required for this file on top of the shared ones.
  readonly rules?: Readonly<Record<string, RequiredSeverity>>;
  // Baseline rules not required for this file.
  readonly except?: readonly string[];
}

export interface VerifyEslintOptions {
  // The directory ESLint resolves its config file and the sample paths from. Defaults to the current working directory.
  readonly cwd?: string;
  // The config file under test. Defaults to the one ESLint finds from `cwd`.
  readonly configFile?: string;
  // A file per kind of source the repository lints (`src/index.ts`, `package.json`, `eslint.config.ts`). A bare string is `{ path }`.
  readonly samples: readonly (string | EslintSample)[];
  // Rules required for every sample, with the severity each must have at least.
  readonly rules?: Readonly<Record<string, RequiredSeverity>>;
  // Baseline rules not required for any sample.
  readonly except?: readonly string[];
  // The configuration whose enabled rules every sample must also have enabled, at least at the severity it gives them. Defaults to this package's default export, so a repository lists only its exceptions. `false` requires nothing beyond `rules`.
  readonly baseline?: false | PublicConfigArray;
}

export type EslintViolationKind = 'not-linted' | 'missing' | 'off' | 'too-weak';

/**
 * A sample ESLint does not lint at all: it is ignored, or no configuration block matches it.
 */
export interface FileViolation {
  readonly kind: 'not-linted';
  readonly file: string;
  readonly message: string;
}

/**
 * A required rule that is not configured (`missing`), is `off`, or is configured weaker than required (`too-weak`) for a sample. `actual` is the severity found, absent when the rule is not configured.
 */
export interface RuleViolation {
  readonly kind: 'missing' | 'off' | 'too-weak';
  readonly file: string;
  readonly rule: string;
  readonly required: RequiredSeverity;
  readonly actual?: EffectiveSeverity;
  readonly message: string;
}

export type EslintViolation = FileViolation | RuleViolation;

const SEVERITY_RANK: Readonly<Record<EffectiveSeverity, number>> = { off: 0, warn: 1, error: 2 };

/**
 * The severity a rule entry resolves to. An entry is a severity or an array whose first element is one; a severity is `0`, `1`, `2` or `'off'`, `'warn'`, `'error'`, all of which ESLint accepts in a config and which `calculateConfigForFile` can hand back in either form. Throws for anything else, since ESLint has already rejected an invalid entry by the time it resolves a configuration.
 */
export function normaliseSeverity(entry: unknown): EffectiveSeverity {
  const severity: unknown = Array.isArray(entry) ? entry[0] : entry;
  if (severity === 0 || severity === 'off') return 'off';
  if (severity === 1 || severity === 'warn') return 'warn';
  if (severity === 2 || severity === 'error') return 'error';

  throw new Error(`@exadev/eslint-config: cannot read ${JSON.stringify(entry)} as a rule severity.`);
}

/**
 * The rules a resolved configuration enables, with each one's severity. `undefined` stands for a file ESLint does not lint (ignored, or matched by no configuration block).
 */
function resolvedSeverities(config: unknown): ReadonlyMap<string, EffectiveSeverity> | undefined {
  if (config === undefined) return undefined;
  if (!isRecord(config)) throw new Error('@exadev/eslint-config: ESLint resolved a configuration that is not an object.');
  const { rules } = config;
  if (rules !== undefined && !isRecord(rules)) throw new Error('@exadev/eslint-config: ESLint resolved a configuration whose "rules" is not an object.');

  return new Map(Object.entries(rules ?? {}).map(([rule, entry]) => [rule, normaliseSeverity(entry)]));
}

function notLinted(file: string): FileViolation {
  return { kind: 'not-linted', file, message: `"${file}" is not linted: it is ignored, or no configuration block matches it.` };
}

function missingRule(file: string, rule: string, required: RequiredSeverity): RuleViolation {
  return { kind: 'missing', file, rule, required, message: `Rule "${rule}" is not configured for "${file}" (required: ${required}).` };
}

function weakRule(file: string, rule: string, required: RequiredSeverity, actual: EffectiveSeverity): RuleViolation {
  const kind = actual === 'off' ? 'off' : 'too-weak';
  const found = actual === 'off' ? 'off' : `"${actual}"`;

  return { kind, file, rule, required, actual, message: `Rule "${rule}" is ${found} for "${file}" (required: ${required}).` };
}

function toSample(sample: string | EslintSample): EslintSample {
  return typeof sample === 'string' ? { path: sample } : sample;
}

/**
 * The rules a sample must have, with the severity each must at least have: the baseline's enabled rules that are not excepted, then the explicit ones, which win.
 */
function requiredRules(parts: {
  readonly baseline: ReadonlyMap<string, EffectiveSeverity> | undefined;
  readonly except: ReadonlySet<string>;
  readonly explicit: readonly Readonly<Record<string, RequiredSeverity>>[];
}): ReadonlyMap<string, RequiredSeverity> {
  const required = new Map<string, RequiredSeverity>();
  for (const [rule, severity] of parts.baseline ?? []) {
    if (severity !== 'off' && !parts.except.has(rule)) required.set(rule, severity);
  }
  for (const rules of parts.explicit) {
    for (const [rule, severity] of Object.entries(rules)) required.set(rule, severity);
  }

  return required;
}

function violationsFor(file: string, required: ReadonlyMap<string, RequiredSeverity>, actual: ReadonlyMap<string, EffectiveSeverity>): readonly RuleViolation[] {
  return [...required].flatMap(([rule, severity]): readonly RuleViolation[] => {
    const found = actual.get(rule);
    if (found === undefined) return [missingRule(file, rule, severity)];

    return SEVERITY_RANK[found] < SEVERITY_RANK[severity] ? [weakRule(file, rule, severity, found)] : [];
  });
}

/**
 * Checks, through ESLint's own Node API and independently of the configuration under test, that ESLint is actually applied: for each sample file it resolves the configuration with `calculateConfigForFile` (the object `--print-config` prints, with `files` and `ignores` applied), reports a file ESLint does not lint, and reports each required rule that is missing, off or weaker than required. Every check inside ESLint runs only on files ESLint lints with the rules it enables, so this is what notices a repository whose config dropped this package, switched its rules off or narrowed `ignores` until nothing was linted.
 *
 * The required rules default to those the baseline (this package's default export) enables for the same file, at the severity it gives them, so `rules` and `except` list only the differences. Returns every violation, none when the configuration holds; a violation names the file and the rule.
 */
export async function verifyEslintConfig(options: VerifyEslintOptions): Promise<readonly EslintViolation[]> {
  const { cwd = process.cwd(), configFile, rules = {}, except = [], baseline = defaultConfig } = options;
  if (options.samples.length === 0) throw new Error('@exadev/eslint-config: verifyEslintConfig needs at least one sample file.');
  // Loaded here, not at the top of the module: this module is re-exported from the package entry point, which every eslint.config.ts imports, and only a verification run needs the Node API.
  const { ESLint } = await import('eslint');
  const actualEslint = new ESLint({ cwd, ...(configFile !== undefined && { overrideConfigFile: configFile }) });
  const baselineEslint = baseline === false ? undefined : new ESLint({ cwd, overrideConfigFile: true, overrideConfig: baseline });

  async function verifySample(sample: EslintSample): Promise<readonly EslintViolation[]> {
    const actual = resolvedSeverities(await actualEslint.calculateConfigForFile(sample.path));
    if (actual === undefined) return [notLinted(sample.path)];
    const baselineSeverities = baselineEslint === undefined ? undefined : resolvedSeverities(await baselineEslint.calculateConfigForFile(sample.path));
    const required = requiredRules({
      baseline: baselineSeverities,
      except: new Set([...except, ...(sample.except ?? [])]),
      explicit: [rules, sample.rules ?? {}],
    });

    return violationsFor(sample.path, required, actual);
  }

  return (await Promise.all(options.samples.map(toSample).map(verifySample))).flat();
}

/**
 * Runs `verifyEslintConfig` and throws one error listing every violation, one per line, so a vitest test is `await assertEslintConfig({ samples: [...] })`.
 */
export async function assertEslintConfig(options: VerifyEslintOptions): Promise<void> {
  const violations = await verifyEslintConfig(options);
  if (violations.length === 0) return;

  throw new Error(`ESLint is not applied as required (${String(violations.length)} violation(s)):\n${violations.map((violation) => `  ${violation.message}`).join('\n')}`);
}
