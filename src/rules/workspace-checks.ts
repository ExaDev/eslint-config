import type { WorkspacePackageInfo } from './workspace-graph';
import type { GroupSpec, NamingOptions, NamingStrategy, RankSkipOptions } from './workspace-options';
import { splitPathSegments } from './workspace-path';

// The pure decisions every workspace-architecture rule reports, kept independent of ESLint/momoa so each can be unit-tested directly against fabricated graph data, matching the split the monorepo-template and hive originals already used (their own checkDependencies, dependencyPathExists, expectedPackageName).

export type WorkspaceViolationMessageId = 'uphillRank' | 'rankSkip' | 'crossSlice' | 'isolatedGroup';

export interface WorkspaceViolation {
  readonly dependencyName: string;
  readonly messageId: WorkspaceViolationMessageId;
  readonly data: Readonly<Record<string, string>>;
}

// The dependency graph plus the two configurable checks bundled into one parameter (rather than four separate ones), keeping checkDependencies below at four parameters total under this package's own max-params limit.
export interface CheckDependenciesContext {
  readonly graph: ReadonlyMap<string, WorkspacePackageInfo>;
  readonly rankSkip?: RankSkipOptions;
  readonly isolatedGroups?: readonly (readonly [string, string])[];
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
    if (dependency === undefined) continue;

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
 * - **'drop-group'**: drop the group's own root path segments, keep what remains.
 * - **'keep-group'**: keep every segment of `relativeDir` as-is, including the group's own root segments (a test group whose packages are named "test-<feature>", mirroring the feature they test, needs its own "test" segment kept).
 * - **'basename'**: use only `relativeDir`'s own final segment, ignoring every intermediate directory, for a group whose intermediate structure exists purely for filesystem organisation and carries no naming intent of its own.
 */
// A single { segments, rest } options object, not two positional parameters: 'drop-group' only ever needs `rest`, so a plain `(segments, rest)` signature would leave it with an unused `segments` parameter, prefixed `_segments` to silence that unused-parameter warning rather than actually removing it, exactly what this project's own no-unused-parameter convention (drop it from the signature) exists to catch instead of paper over. Each function destructures only the field its own strategy actually reads.
const NAME_SEGMENTS_BY_STRATEGY: Record<NamingStrategy, (parts: { readonly segments: readonly string[]; readonly rest: readonly string[] }) => readonly string[]> = {
  basename: ({ segments }) => [last(segments)],
  'keep-group': ({ segments }) => segments,
  'drop-group': ({ rest }) => rest,
};

/**
 * The package name package-name-mirrors-path expects a package at `relativeDir` (workspace-root-relative, forward-slash-joined) to declare, given its own matched group and the workspace's global naming options. See NAME_SEGMENTS_BY_STRATEGY above for the three per-group strategies' own segment selection. The joined segments are prefixed with `naming.scope` (when given) and joined to it with "/"; segments themselves join with `naming.separator` (default "-").
 */
export function expectedPackageName(relativeDir: string, group: GroupSpec, naming: NamingOptions): string {
  const separator = naming.separator ?? '-';
  const segments = splitPathSegments(relativeDir);
  const groupPrefixLength = splitPathSegments(group.path ?? group.name).length;
  const rest = segments.slice(groupPrefixLength);

  const nameSegments = NAME_SEGMENTS_BY_STRATEGY[group.naming ?? 'drop-group']({ segments, rest });

  const joined = nameSegments.join(separator);
  return naming.scope === undefined ? joined : `${naming.scope}/${joined}`;
}
