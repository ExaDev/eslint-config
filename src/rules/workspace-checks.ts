import type { WorkspacePackageInfo } from './workspace-graph';
import type { GroupSpec, NamingOptions, RankSkipOptions } from './workspace-options';

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

function isIsolatedPair(groupA: string, groupB: string, isolatedGroups: readonly (readonly [string, string])[]): boolean {
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
  const isolatedGroups = context.isolatedGroups ?? [];

  for (const dependencyName of dependencyNames) {
    const dependency = context.graph.get(dependencyName);
    if (dependency === undefined) continue;

    if (isIsolatedPair(self.group, dependency.group, isolatedGroups)) {
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
    pending.push(...(dependencyNamesByName.get(current) ?? []));
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
 * The package name package-name-mirrors-path expects a package at `relativeDir` (workspace-root-relative, forward-slash-joined) to declare, given its own matched group and the workspace's global naming options. Three per-group strategies:
 *
 * - **'drop-group'** (the default): drop the group's own root path segments, join what remains.
 * - **'keep-group'**: join every segment of `relativeDir` as-is, including the group's own root segments (a test group whose packages are named "test-<feature>", mirroring the feature they test, needs its own "test" segment kept).
 * - **'basename'**: use only `relativeDir`'s own final segment, ignoring every intermediate directory, for a group whose intermediate structure exists purely for filesystem organisation and carries no naming intent of its own.
 *
 * The joined segments are prefixed with `naming.scope` (when given) and joined to it with "/"; segments themselves join with `naming.separator` (default "-").
 */
export function expectedPackageName(relativeDir: string, group: GroupSpec, naming: NamingOptions): string {
  const separator = naming.separator ?? '-';
  const segments = relativeDir.split('/').filter((segment) => segment.length > 0);
  const groupPrefixLength = (group.path ?? group.name).split('/').filter((segment) => segment.length > 0).length;
  const rest = segments.slice(groupPrefixLength);

  const strategy = group.naming ?? 'drop-group';
  const nameSegments = strategy === 'basename' ? [last(segments)] : strategy === 'keep-group' ? segments : rest;

  const joined = nameSegments.join(separator);
  return naming.scope === undefined ? joined : `${naming.scope}/${joined}`;
}
