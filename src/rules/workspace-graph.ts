import { dirname, join, resolve } from 'node:path';
import { realWorkspaceFs, type WorkspaceFs } from './workspace-fs';
import { resolveWorkspacePackageDirs } from './workspace-glob';
import { readWorkspacePackages } from './workspace-yaml';
import { resolveDependencyFields, type GroupSpec, type WorkspaceArchitectureOptions } from './workspace-options';

/**
 * One workspace package's structural facts: its declared manifest name (never assumed to equal its own directory name, the assumption that made the monorepo-template original's graph silently key packages by folder name instead), which declared group it structurally belongs to, its resolved rank, and its resolved slice (undefined for a group with no slice configuration at all, such as a cross-cutting core group).
 */
export interface WorkspacePackageInfo {
  readonly name: string;
  readonly relativeDir: string;
  readonly group: string;
  readonly rank: number;
  readonly slice: string | undefined;
}

export interface WorkspaceGraph {
  readonly root: string;
  readonly packagesByName: ReadonlyMap<string, WorkspacePackageInfo>;
  // Workspace-internal dependency edges only (a package's declared dependencies filtered down to names that are themselves workspace members), which is exactly what dependencyPathExists (workspace-checks.ts) needs to walk for cycle detection.
  readonly dependencyNamesByName: ReadonlyMap<string, readonly string[]>;
}

function splitSegments(relativeDir: string): readonly string[] {
  return relativeDir.split('/').filter((segment) => segment.length > 0);
}

function groupPrefixSegments(group: GroupSpec): readonly string[] {
  return splitSegments(group.path ?? group.name);
}

/**
 * The group whose own root path is the longest matching prefix of a package's relative directory. Longest-prefix rather than first-match: a group's own `path` can nest under another group's own path in principle (unusual, but nothing in the options shape forbids it), and the more specific match is always the intended owner.
 */
export function findOwningGroup(relativeDir: string, groups: readonly GroupSpec[]): GroupSpec | undefined {
  const dirSegments = splitSegments(relativeDir);
  let best: GroupSpec | undefined;
  let bestLength = -1;

  for (const group of groups) {
    const prefixSegments = groupPrefixSegments(group);
    const matches = prefixSegments.length <= dirSegments.length && prefixSegments.every((segment, index) => dirSegments[index] === segment);
    if (matches && prefixSegments.length > bestLength) {
      best = group;
      bestLength = prefixSegments.length;
    }
  }

  return best;
}

/**
 * The name-role model's own rank classification: nameRanks (first pattern match, checked in declaration order) takes priority over the package's structural group.rank, which itself takes priority over defaultRank. Throws when none of the three resolves anything at all, since an unranked package is a genuine configuration gap, not a package this rule can silently skip (skipping it would silently stop checking every one of its dependency edges).
 */
export function deriveRank(declaredName: string, group: GroupSpec, options: WorkspaceArchitectureOptions): number {
  for (const rule of options.nameRanks ?? []) {
    if (new RegExp(rule.pattern, 'u').test(declaredName)) return rule.rank;
  }
  if (group.rank !== undefined) return group.rank;
  if (options.defaultRank !== undefined) return options.defaultRank;
  throw new Error(
    `@exadev/eslint-config: no rank could be resolved for workspace package "${declaredName}" (group "${group.name}"). Give the group a "rank", add a matching "nameRanks" pattern, or set "defaultRank".`,
  );
}

/**
 * The slice value a 'segment' group derives directly from its own package's path: the Nth path segment counting from the group's own root, not from the workspace root, so a group's own internal restructure never shifts every other group's slice numbering.
 */
function sliceBySegment(relativeDir: string, group: GroupSpec, segmentIndex: number): string | undefined {
  const rest = splitSegments(relativeDir).slice(groupPrefixSegments(group).length);
  return rest[segmentIndex];
}

/**
 * The slice value a 'namePrefix' group derives from whichever OTHER group's already-observed ('segment'-sliced) value prefixes this package's own declared name, mirroring the monorepo-template original's own flat-target-infers-vertical-from-name-prefix convention: `knownSlices` is the pool of every slice value any 'segment' group in this same workspace has produced.
 */
function sliceByNamePrefix(declaredName: string, knownSlices: ReadonlySet<string>): string | undefined {
  for (const candidate of knownSlices) {
    if (declaredName === candidate || declaredName.startsWith(`${candidate}-`)) return candidate;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface DeclaredManifest {
  readonly name: string;
  readonly dependencyNames: readonly string[];
}

/**
 * Reads a candidate package directory's own package.json directly (plain JSON.parse, not momoa): this is data collection for the graph, not a file being linted, so no AST/location information is needed. No existsSync guard here: every relativeDir this is called with came from resolveWorkspacePackageDirs, which already only returns directories that own a real package.json, so its absence here would mean that guarantee broke, not a case to handle quietly. A manifest with no usable string "name" is treated the same way regardless: nothing this graph can identify a package by.
 */
function readDeclaredManifest(fs: WorkspaceFs, absoluteDir: string, dependencyFields: readonly string[]): DeclaredManifest | undefined {
  const manifestPath = join(absoluteDir, 'package.json');
  const parsed: unknown = JSON.parse(fs.readFileSync(manifestPath));
  if (!isRecord(parsed)) return undefined;
  const name = parsed['name'];
  if (typeof name !== 'string') return undefined;

  const dependencyNames: string[] = [];
  for (const field of dependencyFields) {
    const value = parsed[field];
    if (isRecord(value)) dependencyNames.push(...Object.keys(value));
  }

  return { name, dependencyNames };
}

/**
 * Resolves the workspace root: the given `root` option verbatim (resolved against the current working directory the same way every other path in this package is), or, when omitted, the nearest ancestor of the linted file that owns a pnpm-workspace.yaml. Throws when neither resolves anything, since there is then no tree at all for this rule to scan.
 */
export function resolveWorkspaceRoot(fs: WorkspaceFs, filename: string, rootOption: string | undefined): string {
  if (rootOption !== undefined) return resolve(rootOption);

  let dir = dirname(resolve(filename));
  for (;;) {
    if (fs.existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `@exadev/eslint-config: no ancestor "pnpm-workspace.yaml" found above "${filename}", and no "root" option was given.`,
      );
    }
    dir = parent;
  }
}

/**
 * Resolves the workspace's own package glob patterns: the given `packages` option verbatim, or, when omitted, pnpm-workspace.yaml's own top-level "packages:" block sequence read from the resolved root.
 */
export function resolveWorkspacePackagePatterns(fs: WorkspaceFs, root: string, packagesOption: readonly string[] | undefined): readonly string[] {
  if (packagesOption !== undefined) return packagesOption;

  const yamlPath = join(root, 'pnpm-workspace.yaml');
  if (!fs.existsSync(yamlPath)) {
    throw new Error(`@exadev/eslint-config: no "pnpm-workspace.yaml" found at workspace root "${root}", and no "packages" option was given.`);
  }
  return readWorkspacePackages(fs.readFileSync(yamlPath));
}

interface Candidate {
  readonly relativeDir: string;
  readonly group: GroupSpec;
  readonly declaredName: string;
  readonly dependencyNames: readonly string[];
}

function collectCandidates(fs: WorkspaceFs, root: string, options: WorkspaceArchitectureOptions): readonly Candidate[] {
  const patterns = resolveWorkspacePackagePatterns(fs, root, options.packages);
  const relativeDirs = resolveWorkspacePackageDirs(fs, root, patterns);

  const candidates: Candidate[] = [];
  for (const relativeDir of relativeDirs) {
    const group = findOwningGroup(relativeDir, options.groups);
    if (group === undefined) continue;
    const manifest = readDeclaredManifest(fs, join(root, relativeDir), resolveDependencyFields(options));
    if (manifest === undefined) continue;
    candidates.push({ relativeDir, group, declaredName: manifest.name, dependencyNames: manifest.dependencyNames });
  }
  return candidates;
}

function collectKnownSlices(candidates: readonly Candidate[]): ReadonlySet<string> {
  const knownSlices = new Set<string>();
  for (const candidate of candidates) {
    const { slice } = candidate.group;
    if (slice === undefined || !('segment' in slice)) continue;
    const value = sliceBySegment(candidate.relativeDir, candidate.group, slice.segment);
    if (value !== undefined) knownSlices.add(value);
  }
  return knownSlices;
}

function deriveSlice(candidate: Candidate, knownSlices: ReadonlySet<string>): string | undefined {
  const { slice } = candidate.group;
  if (slice === undefined) return undefined;
  return 'segment' in slice ? sliceBySegment(candidate.relativeDir, candidate.group, slice.segment) : sliceByNamePrefix(candidate.declaredName, knownSlices);
}

/**
 * Builds the whole-workspace graph from scratch: every declared package's group/rank/slice, and every workspace-internal dependency edge. Scans the real tree once per call; getWorkspaceGraph below is the memoized entry point every rule actually calls.
 */
export function buildWorkspaceGraph(fs: WorkspaceFs, root: string, options: WorkspaceArchitectureOptions): WorkspaceGraph {
  const candidates = collectCandidates(fs, root, options);
  const knownSlices = collectKnownSlices(candidates);

  const packagesByName = new Map<string, WorkspacePackageInfo>();
  const dependencyNamesByCandidate = new Map<string, readonly string[]>();

  for (const candidate of candidates) {
    const existing = packagesByName.get(candidate.declaredName);
    if (existing !== undefined) {
      throw new Error(
        `@exadev/eslint-config: two workspace packages both declare the name "${candidate.declaredName}" ("${existing.relativeDir}" and "${candidate.relativeDir}").`,
      );
    }

    const rank = deriveRank(candidate.declaredName, candidate.group, options);
    const slice = deriveSlice(candidate, knownSlices);
    packagesByName.set(candidate.declaredName, { name: candidate.declaredName, relativeDir: candidate.relativeDir, group: candidate.group.name, rank, slice });
    dependencyNamesByCandidate.set(candidate.declaredName, candidate.dependencyNames);
  }

  const dependencyNamesByName = new Map<string, readonly string[]>();
  for (const [name, dependencyNames] of dependencyNamesByCandidate) {
    dependencyNamesByName.set(
      name,
      dependencyNames.filter((dependencyName) => packagesByName.has(dependencyName)),
    );
  }

  return { root, packagesByName, dependencyNamesByName };
}

// Keyed by root plus the resolved options themselves, not a single module-level variable: the monorepo-template original's own cache ignored which root it was first built from, so a second, genuinely different workspace scanned in the same process (a monorepo with more than one pnpm-workspace.yaml, or a test suite exercising several fixture trees) silently kept serving the first tree's graph. JSON.stringify is not a canonical serialisation (key order could in principle differ between two logically-identical option objects built by different code paths), but that only costs a cache miss, never a wrong answer: a miss just rebuilds the graph.
const graphCache = new Map<string, WorkspaceGraph>();

function cacheKey(root: string, options: WorkspaceArchitectureOptions): string {
  return `${root}\u0000${JSON.stringify(options)}`;
}

export function getWorkspaceGraph(fs: WorkspaceFs, root: string, options: WorkspaceArchitectureOptions): WorkspaceGraph {
  const key = cacheKey(root, options);
  const cached = graphCache.get(key);
  if (cached !== undefined) return cached;

  const graph = buildWorkspaceGraph(fs, root, options);
  graphCache.set(key, graph);
  return graph;
}

/** Test-only: forces the next getWorkspaceGraph() call for any root/options to rebuild rather than serve a memoized result. */
export function resetWorkspaceGraphCache(): void {
  graphCache.clear();
}

export type LoadWorkspaceGraphFn = (filename: string, options: WorkspaceArchitectureOptions) => WorkspaceGraph;

/** The production default LoadWorkspaceGraphFn: resolves the root and package globs from the real filesystem, then loads (or builds) the graph through the shared cache above. Rule tests inject a stub returning a fabricated graph directly instead, so a rule's own reporting logic is exercised with zero real filesystem I/O. */
export function loadWorkspaceGraph(filename: string, options: WorkspaceArchitectureOptions): WorkspaceGraph {
  const root = resolveWorkspaceRoot(realWorkspaceFs, filename, options.root);
  return getWorkspaceGraph(realWorkspaceFs, root, options);
}
