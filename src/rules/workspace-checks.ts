import type { WorkspacePackageInfo } from './workspace-graph';
import type { AllowedEdge, DependencyConstraint, ExemptTargetGroup, PackageSelector } from './workspace-constraint-options';
import type { GroupSpec, NamingOptions, NamingStrategy, RankSkipOptions } from './workspace-options';
import { splitPathSegments } from './workspace-path';

// The pure decisions every workspace-architecture rule reports, kept independent of ESLint/momoa so each can be unit-tested directly against fabricated graph data, matching the split the monorepo-template and hive originals already used (their own checkDependencies, dependencyPathExists, expectedPackageName).

export type WorkspaceViolationMessageId = 'uphillRank' | 'rankSkip' | 'crossSlice' | 'isolatedGroup' | ConstraintViolationMessageId;

export type ConstraintViolationMessageId = 'constraintNotAllowed' | 'constraintDenied';

export interface WorkspaceViolation {
  readonly dependencyName: string;
  readonly messageId: WorkspaceViolationMessageId;
  readonly data: Readonly<Record<string, string>>;
}

/**
 * The dependency graph plus the two configurable checks bundled into one parameter (rather than four separate ones), keeping checkDependencies below at four parameters total under this package's own max-params limit.
 */
export interface CheckDependenciesContext {
  readonly graph: ReadonlyMap<string, WorkspacePackageInfo>;
  readonly rankSkip?: RankSkipOptions;
  readonly isolatedGroups?: readonly (readonly [string, string])[];
  // Dependency names exempt from every check below, as decided by exemptDependencyNames.
  readonly exemptTargets?: ReadonlySet<string>;
}

// Absence handled here, at the one place that actually decides isolation, rather than a `?? []` fallback at the call site: "no isolatedGroups configured" and "isolatedGroups configured but this particular pair is not in it" are the same real answer (never isolated), so the explicit undefined check states that directly instead of manufacturing an empty array purely to make .some() have something to iterate over.
function isIsolatedPair(groupA: string, groupB: string, isolatedGroups: readonly (readonly [string, string])[] | undefined): boolean {
  if (isolatedGroups === undefined) return false;

  return isolatedGroups.some(([first, second]) => (first === groupA && second === groupB) || (first === groupB && second === groupA));
}

/**
 * Every illegal dependency edge `self` declares, checked in a fixed order, at most one violation per dependency (the first check it fails is the one reported):
 *
 * - **isolatedGroup**: self's and the dependency's own groups are one of the configured forbidden pairs, in either direction. Checked first since it is an absolute structural boundary independent of rank or slice, two groups can share a rank and still be meant to stay fully separate (features and verticals in the exchange-platform config, say).
 * - **uphillRank**: the dependency's rank is strictly above self's own. Dependencies run downhill only.
 * - **rankSkip**: only checked when `rankSkip` is configured (the name-role model's own tighter adjacency requirement; the group-rank model typically leaves it unset). The dependency's rank sits more than `maxDistance` ranks below self's own, and its rank is not in `exemptRanks` (a foundational, dependency-light layer meant to be reachable from anywhere, most often rank 0).
 * - **crossSlice**: self and the dependency both have a resolved slice (undefined for a group with no slice configuration, such as a cross-cutting core group) and those slices differ, two feature verticals depending on each other directly, say.
 *
 * An unknown (non-workspace, third-party) dependency name is silently ignored: this graph only knows about workspace members.
 */
export function checkDependencies(
  selfName: string,
  self: WorkspacePackageInfo,
  dependencyNames: readonly string[],
  context: CheckDependenciesContext,
): readonly WorkspaceViolation[] {
  const violations: WorkspaceViolation[] = [];

  for (const dependencyName of dependencyNames) {
    const dependency = context.graph.get(dependencyName);
    if (dependency === undefined || context.exemptTargets?.has(dependencyName) === true) continue;

    if (isIsolatedPair(self.group, dependency.group, context.isolatedGroups)) {
      violations.push({
        dependencyName,
        messageId: 'isolatedGroup',
        data: { self: selfName, selfGroup: self.group, dependency: dependencyName, dependencyGroup: dependency.group },
      });
      continue;
    }

    if (dependency.rank > self.rank) {
      violations.push({
        dependencyName,
        messageId: 'uphillRank',
        data: { self: selfName, selfRank: String(self.rank), dependency: dependencyName, dependencyRank: String(dependency.rank) },
      });
      continue;
    }

    const { rankSkip } = context;
    if (rankSkip !== undefined && !rankSkip.exemptRanks.includes(dependency.rank) && self.rank - dependency.rank > rankSkip.maxDistance) {
      violations.push({
        dependencyName,
        messageId: 'rankSkip',
        data: { self: selfName, selfRank: String(self.rank), dependency: dependencyName, dependencyRank: String(dependency.rank) },
      });
      continue;
    }

    if (self.slice !== undefined && dependency.slice !== undefined && dependency.slice !== self.slice) {
      violations.push({
        dependencyName,
        messageId: 'crossSlice',
        data: { self: selfName, selfSlice: self.slice, dependency: dependencyName, dependencySlice: dependency.slice },
      });
    }
  }

  return violations;
}

export interface DependencyConstraintContext {
  readonly graph: ReadonlyMap<string, WorkspacePackageInfo>;
  // Undefined when the option is not configured, which rules nothing out.
  readonly constraints: readonly DependencyConstraint[] | undefined;
  // Dependency names exempt from the constraints, as decided by exemptDependencyNames, the same set checkDependencies skips.
  readonly exemptTargets?: ReadonlySet<string>;
}

/** The linted package as the constraint check sees it: the name its diagnostics use, plus the group and declared name (undefined for a package that declares none) its selectors are matched against. */
export interface ConstraintSource {
  readonly displayName: string;
  readonly group: string;
  readonly name: string | undefined;
}

function constraintVerdict(constraint: DependencyConstraint, target: { readonly group: string; readonly name: string }): ConstraintViolationMessageId | undefined {
  if (constraint.allow !== undefined && !constraint.allow.some((selector) => matchesSelector(selector, target))) return 'constraintNotAllowed';
  if (constraint.deny?.some((selector) => matchesSelector(selector, target)) === true) return 'constraintDenied';

  return undefined;
}

/**
 * Every workspace dependency of `self` that a `dependencyConstraints` entry selecting `self` rules out: `constraintNotAllowed` when the entry has an `allow` list and the dependency matches none of it, otherwise `constraintDenied` when it matches a `deny` selector. Each constraint is judged on its own, so a dependency two constraints rule out yields two violations, each carrying its own constraint's reason. A non-workspace dependency and an exempt target are skipped, as checkDependencies skips them.
 */
export function checkDependencyConstraints(self: ConstraintSource, dependencyNames: readonly string[], context: DependencyConstraintContext): readonly WorkspaceViolation[] {
  if (context.constraints === undefined) return [];
  const applicable = context.constraints.filter((constraint) => matchesSelector(constraint.packages, self));

  return dependencyNames.flatMap((dependencyName) => {
    const dependency = context.graph.get(dependencyName);
    if (dependency === undefined || context.exemptTargets?.has(dependencyName) === true) return [];
    const target = { group: dependency.group, name: dependencyName };

    return applicable.flatMap((constraint): readonly WorkspaceViolation[] => {
      const messageId = constraintVerdict(constraint, target);
      if (messageId === undefined) return [];

      return [{ dependencyName, messageId, data: { self: self.displayName, dependency: dependencyName, dependencyGroup: dependency.group, reason: constraint.reason } }];
    });
  });
}

/**
 * The dependency names whose edges an `exemptTargetGroups` entry exempts: a workspace package in an exempt group, every occurrence of which is declared under one of that group's exempt fields. A name that also appears under any other configured field is not exempt, so a package cannot hide a runtime edge behind a devDependencies entry of the same name.
 */
export function exemptDependencyNames(
  dependencies: readonly { readonly name: string; readonly field: string }[],
  graph: ReadonlyMap<string, WorkspacePackageInfo>,
  exemptions: readonly ExemptTargetGroup[] | undefined,
): ReadonlySet<string> {
  const exempt = new Set<string>();
  if (exemptions === undefined) return exempt;

  for (const { name } of dependencies) {
    const target = graph.get(name);
    const exemption = exemptions.find((candidate) => candidate.group === target?.group);
    if (exemption === undefined) continue;
    if (dependencies.every((dependency) => dependency.name !== name || exemption.fields.includes(dependency.field))) exempt.add(name);
  }

  return exempt;
}

export interface StaleAllowedEdge {
  readonly entry: AllowedEdge;
  // 'undeclared': the package no longer declares the dependency at all. 'unneeded': it does, but no check would have reported the edge.
  readonly kind: 'undeclared' | 'unneeded';
}

export interface AllowListResult {
  readonly violations: readonly WorkspaceViolation[];
  readonly stale: readonly StaleAllowedEdge[];
}

/**
 * Applies the `allow` list to the violations `selfName` produced (the rank, slice and isolation violations and the dependency constraint violations alike): a violation on an edge from `selfName` to an allowed target is dropped, and every entry naming `selfName` as its source that suppressed nothing is returned as stale, either because the dependency is no longer declared or because the checks would have passed it anyway.
 */
export function applyAllowList(
  selfName: string,
  found: { readonly violations: readonly WorkspaceViolation[]; readonly dependencyNames: readonly string[] },
  allow: readonly AllowedEdge[],
): AllowListResult {
  const own = allow.filter((entry) => entry.from === selfName);
  const allowedTargets = new Set(own.map((entry) => entry.to));
  const violatingTargets = new Set(found.violations.map((violation) => violation.dependencyName));

  return {
    violations: found.violations.filter((violation) => !allowedTargets.has(violation.dependencyName)),
    stale: own.flatMap((entry): readonly StaleAllowedEdge[] => {
      if (!found.dependencyNames.includes(entry.to)) return [{ entry, kind: 'undeclared' }];

      return violatingTargets.has(entry.to) ? [] : [{ entry, kind: 'unneeded' }];
    }),
  };
}

/**
 * Whether a package with the given owning `group` and declared `name` (undefined for a nameless package, which no name pattern can match) satisfies `selector`. A string selector is a name pattern; an object selector requires every field it has.
 */
export function matchesSelector(selector: PackageSelector, target: { readonly group: string; readonly name: string | undefined }): boolean {
  const { group, namePattern } = typeof selector === 'string' ? { group: undefined, namePattern: selector } : selector;
  if (group !== undefined && group !== target.group) return false;

  return namePattern === undefined || (target.name !== undefined && new RegExp(namePattern, 'u').test(target.name));
}

/**
 * Whether `from` can reach `to` by following workspace-internal dependency edges: depth-first with a visited set, so a cycle elsewhere in the graph cannot send this into an infinite walk while a different edge is being checked. Used by no-dependency-cycle as `dependencyPathExists(dependencyName, ownName, ...)`: is there already a path BACK from this dependency to the package that is about to depend on it.
 */
export function dependencyPathExists(from: string, to: string, dependencyNamesByName: ReadonlyMap<string, readonly string[]>): boolean {
  const seen = new Set<string>();
  const pending = [from];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    if (current === to) return true;
    // A package with no workspace-internal dependencies of its own (never declared in the graph at all, or declared with an empty list) simply contributes no further edges to explore; modelled as an explicit absence check rather than a `?? []` fallback, so there is nothing for a stray edge to silently smuggle in.
    const edges = dependencyNamesByName.get(current);
    if (edges !== undefined) pending.push(...edges);
  }

  return false;
}

/** Exported so its own throw branch (a shape expectedPackageName's real call site, always a non-empty split relativeDir, cannot produce) can be tested directly, the same "Unreachable, tested directly rather than trusted on a comment" shape package-json-key-order.ts's own `at()` helper establishes. */
export function last<T>(array: readonly T[]): T {
  const value = array[array.length - 1];
  if (value === undefined) {
    throw new Error('Unreachable: expectedPackageName is only ever called with a real, non-empty package directory path.');
  }

  return value;
}

/**
 * The three per-group naming strategies' own segment selection, keyed by NamingStrategy's own three literal members rather than a chain of ternaries: `Record<NamingStrategy, ...>` requires every member to have its own entry, which is what makes 'drop-group' a genuine, independently-typed branch, not merely "whatever the ternary chain falls through to when nothing else matched". Stryker's own typescript checker rejects a mutant that replaces the `?? 'drop-group'` fallback with some other string, since indexing this record with a value outside NamingStrategy is a type error, caught before any test even runs.
 *
 * - **'drop-group'**: drop the group's own root path segments, keep what remains, falling back to the group's own `name` when nothing remains: a package sitting exactly at its group's own root (`relativeDir` equals the group's `path`, a group that IS a single package rather than a container of them, a standalone `docs` package under a `{ name: 'docs' }` group, say) has no path segments left of its own for `rest` to keep, so the group's declared identity stands in for them, exactly as it always does for 'keep-group'. Without this, such a group could never have a satisfiable expected name at all: every package in it would derive an empty (or bare-scope) name no real `package.json` can declare.
 * - **'keep-group'**: keep the group's OWN `name` ahead of `rest`, always, regardless of how deep its own `path` nests: a group declared `{ name: 'test', path: 'tests' }` derives "test-e2e" for `tests/e2e`, and one declared `{ name: 'test', path: 'packages/tests' }` derives "test-e2e" for `packages/tests/e2e` too, never "tests-e2e" (the group's declared identity, not whatever path segment sits above it). A test group whose packages are named "test-<feature>", mirroring the feature they test, needs its own "test" name kept, regardless of how many container directories its `path` nests under.
 * - **'basename'**: use only `relativeDir`'s own final segment, ignoring every intermediate directory, for a group whose intermediate structure exists purely for filesystem organisation and carries no naming intent of its own.
 */
// A single { segments, rest, group } options object, not three positional parameters: 'drop-group' only ever needs `rest`, 'basename' only ever needs `segments`, so a plain positional signature would leave each with unused parameters, prefixed `_x` to silence that unused-parameter warning rather than actually removing it, exactly what this project's own no-unused-parameter convention (drop it from the signature) exists to catch instead of paper over. Each function destructures only the field its own strategy actually reads.
const NAME_SEGMENTS_BY_STRATEGY: Record<
  NamingStrategy,
  (parts: { readonly segments: readonly string[]; readonly rest: readonly string[]; readonly group: GroupSpec }) => readonly string[]
> = {
  basename: ({ segments }) => [last(segments)],
  'keep-group': ({ rest, group }) => [group.name, ...rest],
  'drop-group': ({ rest, group }) => (rest.length === 0 ? [group.name] : rest),
};

/**
 * The package name package-name-mirrors-path expects a package at `relativeDir` (workspace-root-relative, forward-slash-joined) to declare, given its own matched group and the workspace's global naming options. See NAME_SEGMENTS_BY_STRATEGY above for the three per-group strategies' own segment selection. The joined segments are prefixed with `naming.scope` (when given) and joined to it with "/"; segments themselves join with `naming.separator` (default "-").
 */
export function expectedPackageName(relativeDir: string, group: GroupSpec, naming: NamingOptions): string {
  const separator = naming.separator ?? '-';
  const segments = splitPathSegments(relativeDir);
  const groupPathSegments = splitPathSegments(group.path ?? group.name);
  const rest = segments.slice(groupPathSegments.length);

  const nameSegments = NAME_SEGMENTS_BY_STRATEGY[group.naming ?? 'drop-group']({ segments, rest, group });

  const joined = nameSegments.join(separator);

  return naming.scope === undefined ? joined : `${naming.scope}/${joined}`;
}
