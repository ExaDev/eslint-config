import { containsTokenRun, tokenizeCommand } from './command-tokens';
import type { RequiredFiles, RequiredScripts, ScriptContent } from './workspace-constraint-options';
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

function contentProblems(content: ScriptContent, actual: string): readonly ScriptProblem[] {
  const tokens = tokenizeCommand(actual);
  const base = { script: content.name, actual };

  return [
    ...(content.equals !== undefined && content.equals !== actual ? [{ ...base, kind: 'notEqual' as const, expected: content.equals }] : []),
    ...(content.includes ?? []).filter((flag) => !containsTokenRun(tokens, tokenizeCommand(flag))).map((flag) => ({ ...base, kind: 'missingFlag' as const, expected: flag })),
    ...(content.excludes ?? []).filter((flag) => containsTokenRun(tokens, tokenizeCommand(flag))).map((flag) => ({ ...base, kind: 'forbiddenFlag' as const, expected: flag })),
  ];
}

/**
 * Checks a package's `scripts` against every requirement whose selector matches `target`. `scripts` maps each declared script name to its command, or to undefined when the value is not a string (which counts as present, with an empty command for content checks). Missing names are listed once each, in declaration order.
 */
export function checkScripts(scripts: ReadonlyMap<string, string | undefined>, requirements: readonly RequiredScripts[], target: SelectorTarget): ScriptCheckResult {
  const wanted = requirements.filter((requirement) => matchesSelector(requirement.match, target)).flatMap((requirement) => requirement.scripts.map(asContent));
  const missing = new Set<string>();
  const problems: ScriptProblem[] = [];

  for (const content of wanted) {
    if (!scripts.has(content.name)) {
      missing.add(content.name);
      continue;
    }
    problems.push(...contentProblems(content, scripts.get(content.name) ?? ''));
  }

  return { missing: [...missing], problems };
}
