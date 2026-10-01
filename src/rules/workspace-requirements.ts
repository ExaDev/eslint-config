import { containsTokenRun, tokenizeCommand } from './command-tokens';
import type { RequiredFiles, RequiredScripts, ScriptContent, ScriptRequirement } from './workspace-constraint-options';
import type { WorkspaceFs } from './workspace-fs';
import { anyPathMatchesGlob } from './workspace-glob';
import { matchesSelector } from './workspace-checks';

// The pure decisions behind package-has-files and required-scripts, independent of ESLint and momoa so each can be unit-tested against a fabricated tree or script map.

/** The identity a selector is matched against: the owning group, and the declared name (undefined for a package that declares none). */
export interface SelectorTarget {
  readonly group: string;
  readonly name: string | undefined;
}

/**
 * The required paths the package directory `packageDir` lacks, across every requirement whose selector matches `target`, in declaration order without repeats.
 */
export function missingRequiredFiles(fs: WorkspaceFs, packageDir: string, requirements: readonly RequiredFiles[], target: SelectorTarget): readonly string[] {
  const wanted = requirements.filter((requirement) => matchesSelector(requirement.packages, target)).flatMap((requirement) => requirement.files);

  return [...new Set(wanted)].filter((pattern) => !anyPathMatchesGlob(fs, packageDir, pattern));
}

export type ScriptProblemKind = 'notEqual' | 'missingFlag' | 'forbiddenFlag';

export interface ScriptProblem {
  readonly script: string;
  readonly kind: ScriptProblemKind;
  // The exact command demanded (notEqual) or the flag required or forbidden.
  readonly expected: string;
  // The script's actual command, empty when its value is not a string.
  readonly actual: string;
}

export interface ScriptCheckResult {
  readonly missing: readonly string[];
  readonly problems: readonly ScriptProblem[];
}

function asContent(requirement: string | ScriptContent): ScriptContent {
  return typeof requirement === 'string' ? { name: requirement } : requirement;
}

// The problems for one flag list: with `kind` 'missingFlag' a flag absent from the command is a problem, with 'forbiddenFlag' a flag present in it is.
function flagProblems(input: Readonly<{ kind: 'missingFlag' | 'forbiddenFlag'; flags: readonly string[] | undefined; tokens: readonly string[]; script: string; actual: string }>): readonly ScriptProblem[] {
  const { kind, flags, tokens, script, actual } = input;
  if (flags === undefined) return [];

  return flags.filter((flag) => containsTokenRun(tokens, tokenizeCommand(flag)) === (kind === 'forbiddenFlag')).map((flag) => ({ script, kind, expected: flag, actual }));
}

function contentProblems(content: ScriptContent, actual: string): readonly ScriptProblem[] {
  const tokens = tokenizeCommand(actual);
  const { name: script, equals } = content;

  return [
    ...(equals !== undefined && equals !== actual ? [{ script, kind: 'notEqual' as const, expected: equals, actual }] : []),
    ...flagProblems({ kind: 'missingFlag', flags: content.includes, tokens, script, actual }),
    ...flagProblems({ kind: 'forbiddenFlag', flags: content.excludes, tokens, script, actual }),
  ];
}

/**
 * Checks a package's `scripts` against the script requirements themselves, whatever selected them. `scripts` maps each declared script name to its command, or to undefined when the value is not a string (which counts as present, with an empty command for content checks). Missing names are listed once each, in declaration order.
 */
export function checkScriptRequirements(scripts: ReadonlyMap<string, string | undefined>, wanted: readonly ScriptRequirement[]): ScriptCheckResult {
  const missing = new Set<string>();
  const problems: ScriptProblem[] = [];

  for (const content of wanted.map(asContent)) {
    if (!scripts.has(content.name)) {
      missing.add(content.name);
      continue;
    }
    problems.push(...contentProblems(content, scripts.get(content.name) ?? ''));
  }

  return { missing: [...missing], problems };
}

/**
 * Checks a package's `scripts` against every requirement whose selector matches `target`. See `checkScriptRequirements` for the shape of `scripts` and the result.
 */
export function checkScripts(scripts: ReadonlyMap<string, string | undefined>, requirements: readonly RequiredScripts[], target: SelectorTarget): ScriptCheckResult {
  return checkScriptRequirements(
    scripts,
    requirements.filter((requirement) => matchesSelector(requirement.match, target)).flatMap((requirement) => requirement.scripts),
  );
}
