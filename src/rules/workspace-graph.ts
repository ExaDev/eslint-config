import { dirname, join, relative, resolve, sep } from 'node:path';
import { realWorkspaceFs, type WorkspaceFs } from './workspace-fs';
import { resolveWorkspacePackageDirs } from './workspace-glob';
import { splitPathSegments } from './workspace-path';
import { readWorkspacePackages } from './workspace-yaml';
import { resolveDependencyFields, type GroupSpec, type WorkspaceArchitectureOptions } from './workspace-options';
import { assertIsError, jsonParseContext } from './workspace-errors';

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

function groupPrefixSegments(group: GroupSpec): readonly string[] {
  return splitPathSegments(group.path ?? group.name);
}

/**
 * The group whose own root path is the longest matching prefix of a package's relative directory. Longest-prefix rather than first-match: a group's own `path` can nest under another group's own path in principle (unusual, but nothing in the options shape forbids it), and the more specific match is always the intended owner. Ties (two groups whose own paths resolve to the identical length) keep whichever was declared first, matching `Array.prototype.find`-style "first wins" precedent elsewhere in this package.
 *
 * `matches` deliberately has no separate `prefixSegments.length <= dirSegments.length` guard of its own: `.every()` already reads `dirSegments[index]` for every index in `prefixSegments`, and comparing a real segment string against `undefined` (what an out-of-bounds index reads) can never be `true`, so an over-long prefix already fails `.every()` on its own terms. A guard here would only ever agree with what `.every()` already decides.
 */
export function findOwningGroup(relativeDir: string, groups: readonly GroupSpec[]): GroupSpec | undefined {
  const dirSegments = splitPathSegments(relativeDir);
  let best: GroupSpec | undefined;
  let bestLength = -1;

  for (const group of groups) {
    const prefixSegments = groupPrefixSegments(group);
    const matches = prefixSegments.every((segment, index) => dirSegments[index] === segment);
    if (matches && prefixSegments.length > bestLength) {
      best = group;
      bestLength = prefixSegments.length;
    }
  }

  return best;
}

/**
 * The name-role model's own rank classification: nameRanks (first pattern match, checked in declaration order) takes priority over the package's structural group.rank, which itself takes priority over defaultRank. `declaredName` is the package's own genuine `package.json` "name", never a directory-derived stand-in: pnpm allows a workspace package to declare no name at all, and such a package has nothing for a nameRanks pattern to match (the README states nameRanks checks "a package's declared name", not its directory), so a nameless package skips nameRanks entirely and falls straight through to its group's rank or defaultRank, the same as a package whose name simply matched no pattern. Throws when none of the three resolves anything at all, since an unranked package is a genuine configuration gap, not a package this rule can silently skip (skipping it would silently stop checking every one of its dependency edges).
 */
export function deriveRank(declaredName: string | undefined, group: GroupSpec, options: WorkspaceArchitectureOptions): number {
  // An explicit undefined check rather than a `?? []` fallback: "nameRanks omitted" and "nameRanks configured but nothing in it matches this name" are the same real answer (fall through to group.rank/defaultRank), so this states that directly instead of manufacturing an empty array purely to make the loop below have something to iterate zero times over.
  if (declaredName !== undefined && options.nameRanks !== undefined) {
    for (const rule of options.nameRanks) {
      if (new RegExp(rule.pattern, 'u').test(declaredName)) return rule.rank;
    }
  }
  if (group.rank !== undefined) return group.rank;
  if (options.defaultRank !== undefined) return options.defaultRank;
  throw new Error(
    `@exadev/eslint-config: no rank could be resolved for workspace package "${declaredName ?? '(no declared name)'}" (group "${group.name}"). Give the group a "rank", add a matching "nameRanks" pattern, or set "defaultRank".`,
  );
}

/**
 * The slice value a 'segment' group derives directly from its own package's path: the Nth path segment counting from the group's own root, not from the workspace root, so a group's own internal restructure never shifts every other group's slice numbering.
 */
function sliceBySegment(relativeDir: string, group: GroupSpec, segmentIndex: number): string | undefined {
  const rest = splitPathSegments(relativeDir).slice(groupPrefixSegments(group).length);
  return rest[segmentIndex];
}

// Strips a leading npm scope ("@scope/") from a declared package name before name-prefix slice matching: a scoped workspace's own declared names ("@x/store-cli") carry a prefix that is never part of any slice value, so matching the full declared name would never find a prefix at all under a scoped naming convention. Exported for direct testing of the anchor (a scope must start the name, not merely appear somewhere inside it) and the "one or more" scope-name length (a real scope is rarely a single character) independently of sliceByNamePrefix's own longest-match behaviour.
export function stripScope(declaredName: string): string {
  const scopeMatch = /^@[^/]+\//u.exec(declaredName);
  return scopeMatch === null ? declaredName : declaredName.slice(scopeMatch[0].length);
}

/**
 * The slice value a 'namePrefix' group derives from whichever OTHER group's already-observed ('segment'-sliced) value prefixes this package's own declared name (its npm scope, if any, stripped first), mirroring the monorepo-template original's own flat-target-infers-vertical-from-name-prefix convention: `knownSlices` is the pool of every slice value any 'segment' group in this same workspace has produced. Chooses the LONGEST matching candidate, not merely the first found in Set-iteration (insertion/readdir) order: a shorter candidate that is itself a prefix of a longer one ("store" against "store-admin") would otherwise win arbitrarily by insertion order alone and silently under-slice a name that the longer, more specific candidate actually identifies. Sorted by length rather than tracked via a running "best so far" comparison: two knownSlices entries can never be equal-length AND both match the same declaredName (a Set already forbids two entries with the identical string value, and two DIFFERENT same-length strings can never both be a startsWith-before-a-hyphen prefix of the same string at position 0), so a running max would carry a genuinely unreachable, unkillable tie-breaking branch; sorting instead exercises the real, always-reachable relative-order comparison for every pair of candidates, matched or not.
 */
function sliceByNamePrefix(declaredName: string, knownSlices: ReadonlySet<string>): string | undefined {
  const unscoped = stripScope(declaredName);
  const matches = [...knownSlices].filter((candidate) => unscoped === candidate || unscoped.startsWith(`${candidate}-`));
  return matches.sort((a, b) => b.length - a.length)[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * A workspace package's own declared "name" ('undefined' for one pnpm allows to omit it entirely, never for a manifest that is not even a usable JSON object at all, which readDeclaredManifest below still reports as a wholly absent manifest).
 */
export interface DeclaredManifest {
  readonly name: string | undefined;
  readonly dependencyNames: readonly string[];
}

/**
 * Reads a candidate package directory's own package.json directly (plain JSON.parse, not momoa): this is data collection for the graph, not a file being linted, so no AST/location information is needed. No existsSync guard here: every relativeDir this is called with came from resolveWorkspacePackageDirs, which already only returns directories that own a real package.json, so its absence here would mean that guarantee broke, not a case to handle quietly. A manifest that is not a usable JSON object at all (parses to an array, a string, null) returns undefined: nothing this graph can identify a package by, regardless of any "name" field. A manifest that IS a usable object but declares no "name" (or a non-string one) is different: pnpm allows a workspace package with no declared name at all, so its own `name` comes back as undefined rather than dropping the whole manifest, letting collectCandidates below key such a package by its directory instead of silently skipping it (and every dependency it declares along with it).
 *
 * Exported so `dependencyNames`' own exact contents (never a stray extra entry) can be asserted directly: buildWorkspaceGraph's own public output filters dependencyNamesByName down to workspace-internal names only, which would silently absorb an unexpected non-package entry before any graph-level test could ever see it.
 */
export function readDeclaredManifest(fs: WorkspaceFs, absoluteDir: string, dependencyFields: readonly string[]): DeclaredManifest | undefined {
  const manifestPath = join(absoluteDir, 'package.json');
  const raw = fs.readFileSync(manifestPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // JSON.parse's own SyntaxError never names the file it was reading, only the byte offset inside whatever string it was given; wrapped here, at the one place that string comes from a real path, so a malformed manifest anywhere in a large workspace can actually be found rather than chased through a bare "Expected double-quoted property name... position 25". readFileSync above sits outside this try specifically so a read failure (EACCES, a race that removes the file after resolveWorkspacePackageDirs confirmed it) is never misreported as a JSON parse error.
    assertIsError(error, jsonParseContext(manifestPath));
    throw new Error(`@exadev/eslint-config: could not parse "${manifestPath}" as JSON: ${error.message}`, { cause: error });
  }
  if (!isRecord(parsed)) return undefined;
  const name = parsed['name'];

  const dependencyNames: string[] = [];
  for (const field of dependencyFields) {
    const value = parsed[field];
    if (isRecord(value)) dependencyNames.push(...Object.keys(value));
  }

  return { name: typeof name === 'string' ? name : undefined, dependencyNames };
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
 * The workspace-root-relative, forward-slash-joined directory the manifest at `filename` (context.filename, the file ESLint is currently linting) sits in: computed directly from the filesystem, never trusted from a declared "name" field. Every workspace-architecture rule uses this to confirm the manifest it is linting is genuinely the SAME package.json buildWorkspaceGraph resolved for whatever graph entry it is about to check, since a name is only ever unique within the graph's own build (buildWorkspaceGraph's own duplicate-name throw enforces that), never across a stale or duplicated copy of a manifest sitting elsewhere in the tree outside the workspace's own package globs (a build output directory that copies its source package's package.json verbatim, say). A rule that skipped this check would check that copy under the real package's own graph entry: reporting edges the real package never declared, or letting a single real violation double-report once per copy.
 *
 * Both `root` and `filename`'s own directory are resolved through `fs.realpathSync` before comparing: an explicit `root` option and ESLint's own `context.filename` can spell the identical real directory two different ways (a symlink anywhere on either path, a macOS /tmp vs /private/tmp cwd being the recurring real case), and a purely lexical `relative()` between the two spellings would compute a path nowhere near the graph entry's own relativeDir, silently making every workspace-architecture rule report nothing for a perfectly real, correctly-configured package. Comparing realpaths instead makes the two spellings agree while still catching a genuinely different directory (a stale or duplicated manifest copy) as genuinely different.
 */
export function manifestRelativeDir(fs: WorkspaceFs, root: string, filename: string): string {
  const realRoot = fs.realpathSync(resolve(root));
  const realManifestDir = fs.realpathSync(dirname(resolve(filename)));
  return relative(realRoot, realManifestDir).split(sep).join('/');
}

function readPackagesFromYaml(fs: WorkspaceFs, root: string): readonly string[] {
  const yamlPath = join(root, 'pnpm-workspace.yaml');
  if (!fs.existsSync(yamlPath)) {
    throw new Error(`@exadev/eslint-config: no "pnpm-workspace.yaml" found at workspace root "${root}", and no "packages" option was given.`);
  }
  return readWorkspacePackages(fs.readFileSync(yamlPath));
}

/**
 * Resolves the workspace's own package glob patterns: the given `packages` option verbatim, or, when omitted, pnpm-workspace.yaml's own top-level "packages:" block sequence read from the resolved root. Throws when that resolution comes back with genuinely zero patterns (an empty "packages" option array, or a "packages:" key with no key at all/an empty sequence and no override), since collectCandidates (below) would then scan nothing at all, quietly turning every workspace-architecture rule into a no-op that reports nothing rather than a real misconfiguration.
 */
export function resolveWorkspacePackagePatterns(fs: WorkspaceFs, root: string, packagesOption: readonly string[] | undefined): readonly string[] {
  const patterns = packagesOption ?? readPackagesFromYaml(fs, root);
  if (patterns.length === 0) {
    throw new Error(
      `@exadev/eslint-config: the resolved workspace "packages" glob list is empty (root "${root}"), which would make every workspace-architecture rule a silent no-op. Add a "packages:" block sequence to pnpm-workspace.yaml, or pass a non-empty "packages" rule option.`,
    );
  }
  return patterns;
}

interface Candidate {
  readonly relativeDir: string;
  readonly group: GroupSpec;
  // The graph's own identity key for this package: its genuine declared "name" when it has one, or its relativeDir when it does not (pnpm allows a workspace package to declare no name at all). Used for packagesByName/dependencyNamesByName lookups, where SOME stable, unique key is needed regardless of whether the package declares a name.
  readonly declaredName: string;
  // The package's genuinely declared "name" verbatim, undefined for one that declares none: kept separate from declaredName above because deriveRank's nameRanks and sliceByNamePrefix both match a pattern against an actual declared name (the README's own wording), never against a directory path standing in for one, so they must be able to tell "no name" apart from declaredName's own directory fallback.
  readonly name: string | undefined;
  readonly dependencyNames: readonly string[];
}

function collectCandidates(fs: WorkspaceFs, root: string, options: WorkspaceArchitectureOptions): readonly Candidate[] {
  const patterns = resolveWorkspacePackagePatterns(fs, root, options.packages);
  const relativeDirs = resolveWorkspacePackageDirs(fs, root, patterns);

  const candidates: Candidate[] = [];
  for (const relativeDir of relativeDirs) {
    const group = findOwningGroup(relativeDir, options.groups);
    if (group === undefined) {
      throw new Error(
        `@exadev/eslint-config: workspace package directory "${relativeDir}" (matched by the "packages" globs) is not covered by any configured group's own "path". Add a "groups" entry whose path prefixes it, or narrow "packages" to exclude it: an uncovered package would otherwise be silently skipped by every workspace-architecture check.`,
      );
    }
    const manifest = readDeclaredManifest(fs, join(root, relativeDir), resolveDependencyFields(options));
    if (manifest === undefined) continue;
    // pnpm allows a workspace package to declare no "name" at all; nothing else can then depend on it BY NAME, but its own outgoing dependency edges still need checking, so it is keyed by its own relativeDir instead of being dropped from the graph the way a genuinely unusable manifest (readDeclaredManifest returning undefined above) is.
    const declaredName = manifest.name ?? relativeDir;
    candidates.push({ relativeDir, group, declaredName, name: manifest.name, dependencyNames: manifest.dependencyNames });
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
  if ('segment' in slice) return sliceBySegment(candidate.relativeDir, candidate.group, slice.segment);
  // A 'namePrefix' slice matches a KNOWN slice value against the package's own declared name; a nameless package (candidate.name undefined, pnpm allows omitting it) has no name for that prefix match to run against at all, so it resolves to no slice, rather than matching against its declaredName's own relativeDir fallback the way deriveRank's nameRanks would otherwise be tempted to (the same inconsistency this candidate.name/declaredName split exists to prevent).
  return candidate.name === undefined ? undefined : sliceByNamePrefix(candidate.name, knownSlices);
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

    const rank = deriveRank(candidate.name, candidate.group, options);
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
//
// KNOWN LIMITATION, inherited unchanged from both prior local implementations this package supersedes (Novus hive's and the monorepo-template's own workspace rule sets): once built for a given root+options key, an entry is never invalidated for the rest of the process's life. A long-running ESLint process (an editor's language server, most notably) that edits a package.json's own declared name or dependencies after that root+options key's first lint keeps serving the STALE graph built before the edit; a rename in particular goes silently unnoticed (`graph.packagesByName.get(declared.name)` simply misses the new name), so every workspace-architecture rule quietly stops checking that package until the process restarts or resetWorkspaceGraphCache is called. A real fix needs more than a per-manifest mtime check: a NEW or REMOVED package directory changes which manifests exist at all, which only a fresh directory-glob rescan (resolveWorkspacePackageDirs) can detect, and the WorkspaceFs seam this module is built on has no stat/mtime operation of its own to build a narrower check on top of. Tracked here as a known limitation rather than solved by half a fix.
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

/**
 * The two test seams every workspace-architecture rule's own factory (createNoUphillDependencyRule, createNoDependencyCycleRule, createPackageNameMirrorsPathRule) accepts, bundled into one destructured `deps` parameter rather than two trailing optional positional ones (this package's own `prefer-options-object-param` rule): `loadGraph` lets a test inject a fabricated WorkspaceGraph with zero real filesystem I/O, and `fs` is the WorkspaceFs manifestRelativeDir's own realpath resolution runs through, needed only because that resolution would otherwise hit the real filesystem for a rule test's fabricated (non-existent) root and filenames.
 */
export interface WorkspaceRuleDeps {
  readonly loadGraph?: LoadWorkspaceGraphFn;
  readonly fs?: WorkspaceFs;
}
