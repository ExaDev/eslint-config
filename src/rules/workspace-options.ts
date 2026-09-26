// The one options shape shared by all three workspace-architecture rules (no-uphill-dependency, no-dependency-cycle, package-name-mirrors-path), so a consumer configures the workspace once and passes the identical object to each rule (or once to workspaceArchitectureConfig(), which wires all three). See the package README's own workspace architecture section for the option-by-option reasoning; this file is the schema and the runtime reader, not the policy.

export interface SliceBySegment {
  readonly segment: number;
}

export interface SliceByNamePrefix {
  readonly namePrefix: true;
}

// A group's own sub-partition, used by the crossSlice check: two packages in the same or a differently-ranked group but different slices (two feature verticals, say) are still isolated from each other. 'segment' reads the slice value directly from the package's own path (the Nth path segment after the group's own root); 'namePrefix' is for a group with no such structure of its own (a flat targets/ directory) whose packages instead take their slice from whichever OTHER group's already-observed slice value prefixes their own declared name.
export type SliceSpec = SliceBySegment | SliceByNamePrefix;

export type NamingStrategy = 'drop-group' | 'keep-group' | 'basename';

export interface GroupSpec {
  readonly name: string;
  // The group's own root path relative to the workspace root, defaulting to `name` when omitted (the common case: a group named "core" rooted at "core/").
  readonly path?: string;
  // This group's rank in the group-rank model. Omitted entirely in a pure name-role model, where every package's rank instead comes from `nameRanks`/`defaultRank`.
  readonly rank?: number;
  readonly slice?: SliceSpec;
  // How package-name-mirrors-path derives this group's own expected package name from a package's path. Defaults to 'drop-group'. See expectedPackageName in workspace-checks.ts for the exact per-strategy derivation.
  readonly naming?: NamingStrategy;
}

export interface RankRule {
  // A regular expression's own source text, tested against a package's declared name. The name-role model's own rank-by-name-pattern classification (a package ending "-contract" is always rank 0, say), checked in array order with the first match winning.
  readonly pattern: string;
  readonly rank: number;
}

export interface RankSkipOptions {
  // A dependency's rank may sit at most this many ranks below the dependant's own rank (checked as `self.rank - dependency.rank > maxDistance`): 1 allows only the immediately lower rank, 0 allows only the same rank as the dependant. Exceeding it, when the dependency's rank is not in exemptRanks, is a rankSkip violation.
  readonly maxDistance: number;
  // Ranks that may always be depended on directly regardless of distance. A pure, dependency-light contract layer, most often rank 0, is the usual case: it is meant to be reachable from anywhere.
  readonly exemptRanks: readonly number[];
}

export interface NamingOptions {
  // The package name prefix (such as "@exacap"), joined to the derived path segments with "/". Omitted entirely, package-name-mirrors-path checks an unscoped name.
  readonly scope?: string;
  // Joins a group's own derived path segments together. Defaults to "-".
  readonly separator?: string;
}

export interface WorkspaceArchitectureOptions {
  // The workspace root directory. Defaults to the nearest ancestor of the linted file that owns a pnpm-workspace.yaml, resolved per lint run by workspace-graph.ts (not by this reader, which has no filename to search from).
  readonly root?: string;
  // Workspace package globs, pnpm-workspace.yaml dialect ('*', '**', '!'-prefixed excludes). Defaults to that file's own top-level "packages:" block sequence.
  readonly packages?: readonly string[];
  // package.json fields read as a package's declared dependencies. Defaults to ['dependencies'] (see DEFAULT_DEPENDENCY_FIELDS/resolveDependencyFields below): devDependencies are deliberately excluded by default, since nothing SHIPS depending on them and a test-only edge to a higher rank is an accepted carve-out (see the rankSkip/uphill checks' own reasoning).
  readonly dependencyFields?: readonly string[];
  readonly groups: readonly GroupSpec[];
  // The name-role model: first pattern match wins, checked before a package's group.rank. Omitted entirely in a pure group-rank model.
  readonly nameRanks?: readonly RankRule[];
  // The rank a package gets when neither nameRanks nor its own group declares one. Omitted, an unranked package is a genuine misconfiguration (see deriveRank in workspace-graph.ts).
  readonly defaultRank?: number;
  readonly rankSkip?: RankSkipOptions;
  // Group name pairs forbidden from depending on each other in EITHER direction, on top of (not instead of) the rank/slice checks above, for two groups whose ranks alone do not separate them (two groups sharing a rank, each meant to stay a self-contained module boundary, say).
  readonly isolatedGroups?: readonly (readonly [string, string])[];
  // Enables package-name-mirrors-path. Omitted entirely (the default), that rule is a no-op: an opt-in feature, not an always-on one, since a workspace with an established naming convention this rule cannot express should not be forced to adopt one that fits.
  readonly naming?: NamingOptions;
}

export const workspaceArchitectureOptionsSchema = {
  type: 'object',
  properties: {
    root: { type: 'string' },
    packages: { type: 'array', items: { type: 'string' } },
    dependencyFields: { type: 'array', items: { type: 'string' } },
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          path: { type: 'string' },
          rank: { type: 'number' },
          slice: {
            oneOf: [
              { type: 'object', properties: { segment: { type: 'integer', minimum: 0 } }, required: ['segment'], additionalProperties: false },
              { type: 'object', properties: { namePrefix: { const: true } }, required: ['namePrefix'], additionalProperties: false },
            ],
          },
          naming: { type: 'string', enum: ['drop-group', 'keep-group', 'basename'] },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
    nameRanks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { pattern: { type: 'string' }, rank: { type: 'number' } },
        required: ['pattern', 'rank'],
        additionalProperties: false,
      },
    },
    defaultRank: { type: 'number' },
    rankSkip: {
      type: 'object',
      properties: {
        maxDistance: { type: 'number' },
        exemptRanks: { type: 'array', items: { type: 'number' } },
      },
      required: ['maxDistance', 'exemptRanks'],
      additionalProperties: false,
    },
    isolatedGroups: {
      type: 'array',
      items: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
    },
    naming: {
      type: 'object',
      properties: { scope: { type: 'string' }, separator: { type: 'string' } },
      additionalProperties: false,
    },
  },
  required: ['groups'],
  additionalProperties: false,
} as const;

// Exported so a test can assert the EXACT message (not a loose substring pattern that a genuinely different, accidental crash elsewhere in this function could also satisfy, an unrelated "Cannot read properties of null" TypeError included, since both happen to mention a property named "groups").
export const MISCONFIGURATION_MESSAGE =
  'exadev workspace architecture rules require options: { groups: [{ name }, ...], ... }. See the @exadev/eslint-config README\'s "Workspace architecture" section.';

function fail(): never {
  throw new Error(MISCONFIGURATION_MESSAGE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Every key this reader recognises at each level it validates, checked against the object's own actual keys so an unknown or misspelled one (a typo'd "rankskip" alongside, or instead of, the real "rankSkip") fails loudly here rather than being silently dropped by the whitelisted reconstruction below and never reaching ESLint's own schema at all (workspaceArchitectureConfig builds its rule options by calling this reader on the caller's raw object BEFORE that validation ever sees it; see readWorkspaceArchitectureOptions' own doc comment).
const TOP_LEVEL_KEYS = ['root', 'packages', 'dependencyFields', 'groups', 'nameRanks', 'defaultRank', 'rankSkip', 'isolatedGroups', 'naming'] as const;
const GROUP_KEYS = ['name', 'path', 'rank', 'slice', 'naming'] as const;
const RANK_RULE_KEYS = ['pattern', 'rank'] as const;
const RANK_SKIP_KEYS = ['maxDistance', 'exemptRanks'] as const;
const NAMING_KEYS = ['scope', 'separator'] as const;

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') fail();
  return value;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number') fail();
  return value;
}

function asOptionalStringArray(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) fail();
  return value;
}

const SLICE_BY_SEGMENT_KEYS = ['segment'] as const;
const SLICE_BY_NAME_PREFIX_KEYS = ['namePrefix'] as const;

// A non-negative integer: SliceBySegment's own "segment" is always used as an array index (the Nth path segment after a group's own root, sliceBySegment in workspace-graph.ts), where a negative or fractional value can never be a real index at all. Both the schema above and this reader enforce the identical bound, so a malformed segment fails loudly here or through ESLint's own schema validation, whichever sees it first, rather than silently resolving to "no slice at all" (an index expression that can never match a real array position simply reads undefined, disabling crossSlice for that whole group without saying why).
function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isSliceSpec(value: unknown): value is SliceSpec {
  if (!isRecord(value)) return false;
  // Each branch's own hasOnlyKeys check is what rejects a slice carrying BOTH "segment" and "namePrefix", or either alongside some other unknown property: without it, `{ segment: 0, namePrefix: true }` reads as a valid SliceBySegment, silently dropping the extra key exactly as readWorkspaceArchitectureOptions' own module doc comment says this whole reader is meant never to do at any level it validates.
  if ('segment' in value) return hasOnlyKeys(value, SLICE_BY_SEGMENT_KEYS) && isNonNegativeInteger(value['segment']);
  if ('namePrefix' in value) return hasOnlyKeys(value, SLICE_BY_NAME_PREFIX_KEYS) && value['namePrefix'] === true;
  return false;
}

function isNamingStrategy(value: unknown): value is NamingStrategy {
  return value === 'drop-group' || value === 'keep-group' || value === 'basename';
}

function isGroupSpec(value: unknown): value is GroupSpec {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, GROUP_KEYS)) return false;
  if (typeof value['name'] !== 'string') return false;
  const { path, rank, slice, naming } = value;
  if (path !== undefined && typeof path !== 'string') return false;
  if (rank !== undefined && typeof rank !== 'number') return false;
  if (slice !== undefined && !isSliceSpec(slice)) return false;
  if (naming !== undefined && !isNamingStrategy(naming)) return false;
  return true;
}

function asGroupSpecArray(value: unknown): readonly GroupSpec[] {
  if (!Array.isArray(value) || !value.every(isGroupSpec)) fail();
  return value;
}

/**
 * The first group name declared more than once in `groups`, or undefined when every name is unique. Every one of this package's own by-name lookups (package-name-mirrors-path's own `options.groups.find`, isolatedGroups' own membership check just below, deriveRank's own `group.rank` read via findOwningGroup) assumes a group name identifies exactly one GroupSpec; a duplicate silently lets whichever entry `Array.prototype.find` happens to return first win, checking a package against the WRONG group's own path prefix or naming strategy without either group's author ever being told the name collided. Exported for direct testing independent of readWorkspaceArchitectureOptions' own full validation pipeline.
 */
export function findDuplicateGroupName(groups: readonly GroupSpec[]): string | undefined {
  const seen = new Set<string>();
  for (const group of groups) {
    if (seen.has(group.name)) return group.name;
    seen.add(group.name);
  }
  return undefined;
}

function isRankRule(value: unknown): value is RankRule {
  return isRecord(value) && hasOnlyKeys(value, RANK_RULE_KEYS) && typeof value['pattern'] === 'string' && typeof value['rank'] === 'number';
}

function asOptionalRankRuleArray(value: unknown): readonly RankRule[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every(isRankRule)) fail();
  return value;
}

function isRankSkipOptions(value: unknown): value is RankSkipOptions {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, RANK_SKIP_KEYS)) return false;
  if (typeof value['maxDistance'] !== 'number') return false;
  const { exemptRanks } = value;
  return Array.isArray(exemptRanks) && exemptRanks.every((rank) => typeof rank === 'number');
}

function asOptionalRankSkip(value: unknown): RankSkipOptions | undefined {
  if (value === undefined) return undefined;
  if (!isRankSkipOptions(value)) fail();
  return value;
}

function isIsolatedGroupPair(value: unknown): value is readonly [string, string] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'string';
}

function asOptionalIsolatedGroups(value: unknown): readonly (readonly [string, string])[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every(isIsolatedGroupPair)) fail();
  return value;
}

function isNamingOptions(value: unknown): value is NamingOptions {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, NAMING_KEYS)) return false;
  const { scope, separator } = value;
  if (scope !== undefined && typeof scope !== 'string') return false;
  return separator === undefined || typeof separator === 'string';
}

function asOptionalNaming(value: unknown): NamingOptions | undefined {
  if (value === undefined) return undefined;
  if (!isNamingOptions(value)) fail();
  return value;
}

/**
 * The runtime safety net behind workspaceArchitectureOptionsSchema above: ESLint's own schema validation does run whenever the config is used in a real lint (rejecting malformed rule options there too, the same division of labour barrel-policy.ts's readMode establishes for its own, much smaller options shape), but workspaceArchitectureConfig() (src/workspace-architecture.ts) builds its rule options by calling this reader on the caller's raw object BEFORE that validation ever inspects it, and previously reconstructed a whitelisted object that silently dropped any unknown or misspelled top-level key rather than rejecting it, leaving ESLint's own schema nothing left to catch. This reader now rejects an unknown key at every level it validates (top level, group, slice, rankSkip, naming, nameRanks entries) itself, so a genuinely malformed options object still fails loudly and specifically here, whichever entry point it arrives through, rather than crashing later with a confusing TypeError deep inside graph construction or being silently ignored.
 */
export function readWorkspaceArchitectureOptions(options: unknown): WorkspaceArchitectureOptions {
  if (!isRecord(options)) fail();
  if (!hasOnlyKeys(options, TOP_LEVEL_KEYS)) fail();

  const groups = asGroupSpecArray(options['groups']);
  const duplicateGroupName = findDuplicateGroupName(groups);
  if (duplicateGroupName !== undefined) {
    throw new Error(
      `@exadev/eslint-config: "groups" declares more than one group named "${duplicateGroupName}". Every group name must be unique: package-name-mirrors-path and isolatedGroups both resolve a group by name, and a duplicate would silently pick whichever entry is declared first.`,
    );
  }
  const root = asOptionalString(options['root']);
  const packages = asOptionalStringArray(options['packages']);
  const dependencyFields = asOptionalStringArray(options['dependencyFields']);
  const nameRanks = asOptionalRankRuleArray(options['nameRanks']);
  const defaultRank = asOptionalNumber(options['defaultRank']);
  const rankSkip = asOptionalRankSkip(options['rankSkip']);
  const isolatedGroups = asOptionalIsolatedGroups(options['isolatedGroups']);
  const naming = asOptionalNaming(options['naming']);

  if (isolatedGroups !== undefined) {
    const groupNames = new Set(groups.map((group) => group.name));
    for (const [first, second] of isolatedGroups) {
      if (!groupNames.has(first) || !groupNames.has(second)) {
        throw new Error(
          `@exadev/eslint-config: "isolatedGroups" names a group not declared in "groups" (["${first}", "${second}"]). Every isolatedGroups pair must name two of this workspace's own declared groups.`,
        );
      }
    }
  }

  return {
    ...(root !== undefined && { root }),
    ...(packages !== undefined && { packages }),
    ...(dependencyFields !== undefined && { dependencyFields }),
    groups,
    ...(nameRanks !== undefined && { nameRanks }),
    ...(defaultRank !== undefined && { defaultRank }),
    ...(rankSkip !== undefined && { rankSkip }),
    ...(isolatedGroups !== undefined && { isolatedGroups }),
    ...(naming !== undefined && { naming }),
  };
}

// The single source of truth for "dependencyFields omitted" everywhere this package reads a workspace package's own declared dependencies, so every call site (the graph builder, and each of the three rules' own collectTopLevelDependencies call) agrees on the same default array, not three separately-written literals that could drift.
export const DEFAULT_DEPENDENCY_FIELDS: readonly string[] = ['dependencies'];

export function resolveDependencyFields(options: Pick<WorkspaceArchitectureOptions, 'dependencyFields'>): readonly string[] {
  return options.dependencyFields ?? DEFAULT_DEPENDENCY_FIELDS;
}
