import { parse } from '@humanwhocodes/momoa';
import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createNoUphillDependencyRule, findDependencyEntry } from './no-uphill-dependency';
import type { WorkspaceGraph } from './workspace-graph';
import type { WorkspacePackageInfo } from './workspace-graph';
import type { NamedDependency } from './workspace-json-helpers';
import type { WorkspaceFs } from './workspace-fs';

// FIXED_GRAPH's own root and every filename built from it (selfFilename below) are fabricated paths, never real directories: manifestRelativeDir's own realpath resolution (workspace-graph.ts) is exercised directly by its own unit tests, so this rule's tests only need a WorkspaceFs whose realpathSync passes every path through unchanged, the same as node:fs's own realpathSync would for a path with no symlink anywhere along it.
const identityFs: WorkspaceFs = {
  existsSync: () => {
    throw new Error('not used: this rule never calls existsSync/readFileSync/readdirSync itself, only realpathSync via manifestRelativeDir.');
  },
  readFileSync: () => {
    throw new Error('not used: this rule never calls existsSync/readFileSync/readdirSync itself, only realpathSync via manifestRelativeDir.');
  },
  readdirSync: () => {
    throw new Error('not used: this rule never calls existsSync/readFileSync/readdirSync itself, only realpathSync via manifestRelativeDir.');
  },
  realpathSync: (path) => path,
};

function namedDependency(name: string): NamedDependency {
  const document = parse(`{"${name}": "1"}`, { mode: 'json' });
  if (document.body.type !== 'Object') throw new Error('Unreachable: fixture is a top-level JSON object.');
  const [member] = document.body.members;
  if (member === undefined) throw new Error('Unreachable: fixture has exactly one member.');

  return { name, field: 'dependencies', node: member };
}

function pkg(name: string, group: string, rank: number, slice: string | undefined): WorkspacePackageInfo {
  return { name, relativeDir: `unused/${name}`, group, rank, slice };
}

// Named so the "3" and "2" ranks below read as the group-rank hierarchy they represent, not an arbitrary literal.
const PRODUCT_RANK = 2;
const TARGETS_RANK = 3;

// A workspace package with no declared "name" at all (pnpm allows this): keyed by its own relativeDir, exactly as buildWorkspaceGraph's own collectCandidates does for a real one (workspace-graph.ts), so its dependency on the rank-3 "store-cli" below is still checked as an uphill violation rather than silently skipped.
const NAMELESS_RELATIVE_DIR = 'core/nameless';

const FIXED_GRAPH: WorkspaceGraph = {
  root: '/fixture',
  packagesByName: new Map(
    [
      pkg('kv-contract', 'core', 0, undefined),
      pkg('kv-adapter-memory', 'core', 1, undefined),
      pkg('billing-contract', 'features', 0, 'billing'),
      pkg('store-api-router', 'features', 1, 'store'),
      pkg('store-application-context', 'product', PRODUCT_RANK, 'store'),
      pkg('store-cli', 'targets', TARGETS_RANK, 'store'),
      pkg('checkout-vertical', 'verticals', 1, 'checkout'),
      { name: NAMELESS_RELATIVE_DIR, relativeDir: NAMELESS_RELATIVE_DIR, group: 'core', rank: 0, slice: undefined },
    ].map((entry) => [entry.name, entry]),
  ),
  dependencyNamesByName: new Map(),
};

const rule = createNoUphillDependencyRule({ loadGraph: () => FIXED_GRAPH, fs: identityFs });

const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

function manifest(name: string, dependencies: Readonly<Record<string, string>> = {}): string {
  return JSON.stringify({ name, dependencies }, null, 2);
}

// The manifest path buildWorkspaceGraph would have resolved this same package FROM, matching each pkg() entry's own `relativeDir` above: every test case below identifies "self" by declared name, and the rule now also confirms context.filename's own directory is that same graph entry's relativeDir (see manifestRelativeDir, workspace-graph.ts), so a realistic filename is required for the rule to ever reach its reporting logic at all, not merely to exercise the new guard itself.
function selfFilename(name: string): string {
  return `${FIXED_GRAPH.root}/unused/${name}/package.json`;
}

describe('createNoUphillDependencyRule meta', () => {
  it('declares the message ids the rule can report', () => {
    expect(Object.keys(rule.meta?.messages ?? {}).sort()).toEqual(['allowSourceGone', 'allowUndeclared', 'allowUnneeded', 'crossSlice', 'isolatedGroup', 'rankSkip', 'uphillRank']);
  });

  it('words each stale allow-list message exactly', () => {
    const messages = rule.meta?.messages;
    expect(messages?.allowUndeclared).toBe('Stale "allow" entry: "{{from}}" no longer declares a dependency on "{{to}}" ({{reason}}). Remove the entry.');
    expect(messages?.allowUnneeded).toBe('Stale "allow" entry: the edge from "{{from}}" to "{{to}}" passes every check without an exception ({{reason}}). Remove the entry.');
    expect(messages?.allowSourceGone).toBe('Stale "allow" entry: "{{from}}" is not a workspace package ({{reason}}). Remove the entry.');
  });

  it('carries the exact docs/languages content the rule is documented to have', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: createNoUphillDependencyRule always defines its own meta object literal.');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe(
      'Disallow a workspace package depending on another package ranked strictly above it, on a non-exempt-rank package more than the configured distance below it, on a package in a different slice of the same or another group, or on a package in a group this workspace declares isolated from its own.',
    );
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-uphill-dependency.ts');
    expect(meta.messages?.uphillRank).toBe(
      'Illegal dependency: "{{self}}" (rank {{selfRank}}) depends on "{{dependency}}" (rank {{dependencyRank}}), which is ranked above it. A package may only depend on its own rank or lower.',
    );
    expect(meta.messages?.rankSkip).toBe(
      'Illegal dependency: "{{self}}" (rank {{selfRank}}) depends directly on "{{dependency}}" (rank {{dependencyRank}}), skipping too many ranks in between.',
    );
    expect(meta.messages?.crossSlice).toBe(
      'Illegal dependency: "{{self}}" (slice "{{selfSlice}}") depends on "{{dependency}}" (slice "{{dependencySlice}}"). A package may depend on another in the same slice, but not a different one.',
    );
    expect(meta.messages?.isolatedGroup).toBe(
      'Illegal dependency: "{{self}}" (group "{{selfGroup}}") depends on "{{dependency}}" (group "{{dependencyGroup}}"), and this workspace declares these two groups isolated from each other.',
    );
  });
});

describe('findDependencyEntry', () => {
  it('returns the matching entry', () => {
    const entry = namedDependency('a');
    expect(findDependencyEntry([entry], 'a')).toBe(entry);
  });

  it('returns the matching entry by name even when it is not the first in the list', () => {
    const first = namedDependency('a');
    const second = namedDependency('b');
    expect(findDependencyEntry([first, second], 'b')).toBe(second);
  });

  it('throws for a name with no matching entry, a shape no real call site (which only ever asks for a name it just collected) produces', () => {
    expect(() => findDependencyEntry([], 'missing')).toThrow(/Unreachable/);
  });
});

ruleTester.run('no-uphill-dependency', rule, {
  valid: [
    // A manifest whose declared name is not in the graph at all (not a workspace member this rule knows about) is silently skipped.
    { code: manifest('not-a-workspace-package', { anything: '1' }), options: [{ groups: [{ name: 'core' }] }] },
    // A manifest with no "name" field at all, linted from a file whose own directory is not a known package directory either (the default RuleTester filename resolves nowhere near "/fixture"): neither a declared name nor a directory fallback identifies it in the graph, so it is skipped, not treated as any particular workspace package.
    { code: JSON.stringify({ dependencies: { 'kv-adapter-memory': 'workspace:*' } }), options: [{ groups: [{ name: 'core' }] }] },
    // Same rank, permitted regardless of rankSkip configuration.
    { code: manifest('kv-adapter-memory', { 'kv-contract': 'workspace:*' }), filename: selfFilename('kv-adapter-memory'), options: [{ groups: [{ name: 'core' }] }] },
    // Exactly one rank below, within maxDistance.
    {
      code: manifest('store-cli', { 'store-application-context': 'workspace:*' }),
      filename: selfFilename('store-cli'),
      options: [{ groups: [{ name: 'core' }], rankSkip: { maxDistance: 1, exemptRanks: [0] } }],
    },
    // A rank-0 (exempt) dependency reached from any distance is permitted even under rankSkip.
    {
      code: manifest('store-cli', { 'kv-contract': 'workspace:*' }),
      filename: selfFilename('store-cli'),
      options: [{ groups: [{ name: 'core' }], rankSkip: { maxDistance: 1, exemptRanks: [0] } }],
    },
    // rankSkip entirely unconfigured: a deep, otherwise-skip-shaped dependency is not checked at all.
    { code: manifest('store-cli', { 'kv-adapter-memory': 'workspace:*' }), filename: selfFilename('store-cli'), options: [{ groups: [{ name: 'core' }] }] },
    // Same slice, permitted.
    {
      code: manifest('store-application-context', { 'store-api-router': 'workspace:*' }),
      filename: selfFilename('store-application-context'),
      options: [{ groups: [{ name: 'core' }] }],
    },
    // An unknown (non-workspace, third-party) dependency name is ignored.
    { code: manifest('kv-contract', { zod: '^3' }), filename: selfFilename('kv-contract'), options: [{ groups: [{ name: 'core' }] }] },
    // isolatedGroups configured, but this pair is not one of the forbidden ones.
    {
      code: manifest('kv-adapter-memory', { 'billing-contract': 'workspace:*' }),
      filename: selfFilename('kv-adapter-memory'),
      options: [{ groups: [{ name: 'core' }, { name: 'features' }, { name: 'verticals' }], isolatedGroups: [['features', 'verticals']] }],
    },
    // A nested (non-top-level) object that itself looks exactly like a self-contained manifest (its own real "name" and "dependencies") must never be analysed as if it were the file's own top-level manifest: only the Object visitor's own parent.type === 'Document' check stands between "the real top level" and "any nested object anywhere in the file". If bypassed, this nested object would be read as "store-cli" (rank 3) depending on "kv-adapter-memory" (rank 1), a genuine rankSkip violation, and wrongly reported even though the top-level manifest itself declares no dependencies at all.
    {
      code: JSON.stringify({ name: 'kv-contract', nested: { name: 'store-cli', dependencies: { 'kv-adapter-memory': 'workspace:*' } } }),
      filename: selfFilename('kv-contract'),
      options: [{ groups: [{ name: 'core' }], rankSkip: { maxDistance: 1, exemptRanks: [0] } }],
    },
    // A manifest declaring a real graph member's name, but linted from a DIFFERENT directory than that member's own relativeDir (a stale or duplicated copy of the same package.json sitting elsewhere, a build output directory that copied its source verbatim, say), is skipped rather than checked under the real package's own graph entry: this genuinely uphill dependency would otherwise be reported against the copy too.
    {
      code: manifest('kv-contract', { 'kv-adapter-memory': 'workspace:*' }),
      filename: `${FIXED_GRAPH.root}/dist/kv-contract/package.json`,
      options: [{ groups: [{ name: 'core' }] }],
    },
    // A NESTED object with no "name" of its own must never be analysed as if it were the file's own top-level manifest either, even though (unlike the "nested real-name" case above) its relativeDir-fallback identity resolves to the exact SAME graph entry as the genuine top-level manifest, since relativeDir is derived purely from context.filename, never from which node within the file is being visited. The linted package here (NAMELESS_RELATIVE_DIR) declares no top-level "dependencies" at all, only a nested object that does; if the top-level parent.type === 'Document' guard were ever bypassed, that nested object's own "store-cli" dependency (rank 3, above this rank-0 package) would be wrongly checked and reported as a genuine uphillRank violation.
    {
      code: JSON.stringify({ nested: { dependencies: { 'store-cli': 'workspace:*' } } }),
      filename: `${FIXED_GRAPH.root}/${NAMELESS_RELATIVE_DIR}/package.json`,
      options: [{ groups: [{ name: 'core' }] }],
    },
  ],
  invalid: [
    {
      code: manifest('kv-contract', { 'kv-adapter-memory': 'workspace:*' }),
      filename: selfFilename('kv-contract'),
      options: [{ groups: [{ name: 'core' }] }],
      errors: [{ messageId: 'uphillRank' }],
    },
    {
      code: manifest('store-cli', { 'kv-adapter-memory': 'workspace:*' }),
      filename: selfFilename('store-cli'),
      options: [{ groups: [{ name: 'core' }], rankSkip: { maxDistance: 1, exemptRanks: [0] } }],
      errors: [{ messageId: 'rankSkip' }],
    },
    {
      code: manifest('store-application-context', { 'billing-contract': 'workspace:*' }),
      filename: selfFilename('store-application-context'),
      options: [{ groups: [{ name: 'core' }], rankSkip: { maxDistance: 1, exemptRanks: [0] } }],
      errors: [{ messageId: 'crossSlice' }],
    },
    {
      code: manifest('checkout-vertical', { 'store-api-router': 'workspace:*' }),
      filename: selfFilename('checkout-vertical'),
      options: [{ groups: [{ name: 'core' }, { name: 'features' }, { name: 'verticals' }], isolatedGroups: [['features', 'verticals']] }],
      errors: [{ messageId: 'isolatedGroup' }],
    },
    // isolatedGroups matches in the reverse declared order too.
    {
      code: manifest('checkout-vertical', { 'store-api-router': 'workspace:*' }),
      filename: selfFilename('checkout-vertical'),
      options: [{ groups: [{ name: 'core' }, { name: 'features' }, { name: 'verticals' }], isolatedGroups: [['verticals', 'features']] }],
      errors: [{ messageId: 'isolatedGroup' }],
    },
    // Two violating dependencies in one manifest each get their own reported error, at their own location.
    {
      code: manifest('kv-contract', { 'kv-adapter-memory': 'workspace:*', 'store-cli': 'workspace:*' }),
      filename: selfFilename('kv-contract'),
      options: [{ groups: [{ name: 'core' }] }],
      errors: [{ messageId: 'uphillRank' }, { messageId: 'uphillRank' }],
    },
    // Reading a non-default dependency field.
    {
      code: JSON.stringify({ name: 'kv-contract', devDependencies: { 'kv-adapter-memory': 'workspace:*' } }, null, 2),
      filename: selfFilename('kv-contract'),
      options: [{ groups: [{ name: 'core' }], dependencyFields: ['devDependencies'] }],
      errors: [{ messageId: 'uphillRank' }],
    },
    // The same dependency name declared under two configured dependencyFields is de-duplicated by name before checking: exactly one diagnostic, never two identical ones both attributed to the first field's own location.
    {
      code: JSON.stringify(
        { name: 'kv-contract', dependencies: { 'kv-adapter-memory': 'workspace:*' }, devDependencies: { 'kv-adapter-memory': 'workspace:*' } },
        null,
        2,
      ),
      filename: selfFilename('kv-contract'),
      options: [{ groups: [{ name: 'core' }], dependencyFields: ['dependencies', 'devDependencies'] }],
      errors: [{ messageId: 'uphillRank' }],
    },
    // A workspace package with no declared "name" at all, keyed in the graph by its own relativeDir: its dependency on the rank-3 "store-cli" is still checked (and reported) as an uphill violation, proving it is no longer dropped from the graph without a word.
    {
      code: JSON.stringify({ dependencies: { 'store-cli': 'workspace:*' } }),
      filename: `${FIXED_GRAPH.root}/${NAMELESS_RELATIVE_DIR}/package.json`,
      options: [{ groups: [{ name: 'core' }] }],
      errors: [{ messageId: 'uphillRank' }],
    },
  ],
});

const REASON = 'documented exception';
const ALLOW_GROUPS = [{ name: 'core' }, { name: 'features' }, { name: 'verticals' }, { name: 'product' }, { name: 'targets' }, { name: 'test' }];
const DEV_FIELDS = ['dependencies', 'devDependencies'];
const ROOT_MANIFEST = `${FIXED_GRAPH.root}/package.json`;

ruleTester.run('no-uphill-dependency allow list and group exemptions', rule, {
  valid: [
    // An allowed edge that would otherwise be an uphillRank violation is permitted.
    {
      code: manifest('kv-contract', { 'kv-adapter-memory': 'workspace:*' }),
      filename: selfFilename('kv-contract'),
      options: [{ groups: ALLOW_GROUPS, allow: [{ from: 'kv-contract', to: 'kv-adapter-memory', reason: REASON }] }],
    },
    // The same exception covers a rankSkip, a crossSlice and an isolatedGroup violation: it is per edge, not per check.
    {
      code: manifest('store-cli', { 'kv-adapter-memory': 'workspace:*' }),
      filename: selfFilename('store-cli'),
      options: [{ groups: ALLOW_GROUPS, rankSkip: { maxDistance: 1, exemptRanks: [0] }, allow: [{ from: 'store-cli', to: 'kv-adapter-memory', reason: REASON }] }],
    },
    {
      code: manifest('store-application-context', { 'billing-contract': 'workspace:*' }),
      filename: selfFilename('store-application-context'),
      options: [{ groups: ALLOW_GROUPS, allow: [{ from: 'store-application-context', to: 'billing-contract', reason: REASON }] }],
    },
    {
      code: manifest('checkout-vertical', { 'store-api-router': 'workspace:*' }),
      filename: selfFilename('checkout-vertical'),
      options: [{ groups: ALLOW_GROUPS, isolatedGroups: [['features', 'verticals']], allow: [{ from: 'checkout-vertical', to: 'store-api-router', reason: REASON }] }],
    },
    // Only the named target is excused: a second, unlisted violation is still reported (see the invalid cases), and an entry for one source does not excuse the same target from another.
    // An entry naming another package is not stale for THIS manifest: it is that package's own manifest that judges it.
    {
      code: manifest('kv-adapter-memory', { 'kv-contract': 'workspace:*' }),
      filename: selfFilename('kv-adapter-memory'),
      options: [{ groups: ALLOW_GROUPS, allow: [{ from: 'kv-contract', to: 'kv-adapter-memory', reason: REASON }] }],
    },
    // A group exemption: an edge into the exempt group, declared only under the exempt field, passes every check.
    {
      code: JSON.stringify({ name: 'kv-contract', devDependencies: { 'store-cli': 'workspace:*' } }, null, 2),
      filename: selfFilename('kv-contract'),
      options: [{ groups: ALLOW_GROUPS, dependencyFields: DEV_FIELDS, exemptTargetGroups: [{ group: 'targets', fields: ['devDependencies'] }] }],
    },
    // The workspace root manifest is never a package: an allow entry whose source exists produces nothing there.
    {
      code: JSON.stringify({ name: 'root' }),
      filename: ROOT_MANIFEST,
      options: [{ groups: ALLOW_GROUPS, allow: [{ from: 'kv-contract', to: 'kv-adapter-memory', reason: REASON }] }],
    },
    // With no allow list the root manifest is skipped like any non-member.
    { code: JSON.stringify({ name: 'root' }), filename: ROOT_MANIFEST, options: [{ groups: ALLOW_GROUPS }] },
  ],
  invalid: [
    // The exception excuses only the listed target; the other violation stays.
    {
      code: manifest('kv-contract', { 'kv-adapter-memory': 'workspace:*', 'store-cli': 'workspace:*' }),
      filename: selfFilename('kv-contract'),
      options: [{ groups: ALLOW_GROUPS, allow: [{ from: 'kv-contract', to: 'kv-adapter-memory', reason: REASON }] }],
      errors: [{ messageId: 'uphillRank', data: { self: 'kv-contract', selfRank: '0', dependency: 'store-cli', dependencyRank: '3' } }],
    },
    // An exception for a different source does not excuse this package's edge.
    {
      code: manifest('kv-contract', { 'kv-adapter-memory': 'workspace:*' }),
      filename: selfFilename('kv-contract'),
      options: [{ groups: ALLOW_GROUPS, allow: [{ from: 'store-cli', to: 'kv-adapter-memory', reason: REASON }] }],
      errors: [{ messageId: 'uphillRank' }],
    },
    // An entry whose dependency is no longer declared is reported on the manifest itself.
    {
      code: manifest('kv-contract'),
      filename: selfFilename('kv-contract'),
      options: [{ groups: ALLOW_GROUPS, allow: [{ from: 'kv-contract', to: 'kv-adapter-memory', reason: REASON }] }],
      errors: [{ messageId: 'allowUndeclared', line: 1, data: { from: 'kv-contract', to: 'kv-adapter-memory', reason: REASON } }],
    },
    // An entry on an edge the checks would have passed anyway is reported on the dependency it names.
    {
      code: manifest('kv-adapter-memory', { 'kv-contract': 'workspace:*' }),
      filename: selfFilename('kv-adapter-memory'),
      options: [{ groups: ALLOW_GROUPS, allow: [{ from: 'kv-adapter-memory', to: 'kv-contract', reason: REASON }] }],
      errors: [{ messageId: 'allowUnneeded', line: 4, data: { from: 'kv-adapter-memory', to: 'kv-contract', reason: REASON } }],
    },
    // An entry excusing an edge into an exempt group is redundant: the exemption already passed it.
    {
      code: JSON.stringify({ name: 'kv-contract', devDependencies: { 'store-cli': 'workspace:*' } }, null, 2),
      filename: selfFilename('kv-contract'),
      options: [
        {
          groups: ALLOW_GROUPS,
          dependencyFields: DEV_FIELDS,
          exemptTargetGroups: [{ group: 'targets', fields: ['devDependencies'] }],
          allow: [{ from: 'kv-contract', to: 'store-cli', reason: REASON }],
        },
      ],
      errors: [{ messageId: 'allowUnneeded' }],
    },
    // An entry on an unknown (third-party) target is unneeded too: no check applies to it.
    {
      code: manifest('kv-contract', { zod: '^3' }),
      filename: selfFilename('kv-contract'),
      options: [{ groups: ALLOW_GROUPS, allow: [{ from: 'kv-contract', to: 'zod', reason: REASON }] }],
      errors: [{ messageId: 'allowUnneeded' }],
    },
    // Stale and live entries are told apart within one manifest, each judged on its own edge.
    {
      code: manifest('kv-contract', { 'kv-adapter-memory': 'workspace:*' }),
      filename: selfFilename('kv-contract'),
      options: [
        {
          groups: ALLOW_GROUPS,
          allow: [
            { from: 'kv-contract', to: 'gone', reason: REASON },
            { from: 'kv-contract', to: 'kv-adapter-memory', reason: REASON },
          ],
        },
      ],
      errors: [{ messageId: 'allowUndeclared', data: { from: 'kv-contract', to: 'gone', reason: REASON } }],
    },
    // An entry whose source package no longer exists is reported on the workspace root manifest.
    {
      code: JSON.stringify({ name: 'root' }),
      filename: ROOT_MANIFEST,
      options: [
        {
          groups: ALLOW_GROUPS,
          allow: [
            { from: 'removed-package', to: 'kv-contract', reason: REASON },
            { from: 'kv-contract', to: 'kv-adapter-memory', reason: REASON },
          ],
        },
      ],
      errors: [{ messageId: 'allowSourceGone', line: 1, data: { from: 'removed-package', to: 'kv-contract', reason: REASON } }],
    },
    // A group exemption covers only the listed fields: the same target under "dependencies" is still checked.
    {
      code: JSON.stringify({ name: 'kv-contract', dependencies: { 'store-cli': 'workspace:*' } }, null, 2),
      filename: selfFilename('kv-contract'),
      options: [{ groups: ALLOW_GROUPS, dependencyFields: DEV_FIELDS, exemptTargetGroups: [{ group: 'targets', fields: ['devDependencies'] }] }],
      errors: [{ messageId: 'uphillRank' }],
    },
    // A name declared under both an exempt and a non-exempt field is not exempt: the runtime edge cannot hide behind the dev one. Reported once, not once per field.
    {
      code: JSON.stringify({ name: 'kv-contract', dependencies: { 'store-cli': 'workspace:*' }, devDependencies: { 'store-cli': 'workspace:*' } }, null, 2),
      filename: selfFilename('kv-contract'),
      options: [{ groups: ALLOW_GROUPS, dependencyFields: DEV_FIELDS, exemptTargetGroups: [{ group: 'targets', fields: ['devDependencies'] }] }],
      errors: [{ messageId: 'uphillRank' }],
    },
    // An exemption for another group does not excuse this target.
    {
      code: JSON.stringify({ name: 'kv-contract', devDependencies: { 'store-cli': 'workspace:*' } }, null, 2),
      filename: selfFilename('kv-contract'),
      options: [{ groups: ALLOW_GROUPS, dependencyFields: DEV_FIELDS, exemptTargetGroups: [{ group: 'test', fields: ['devDependencies'] }] }],
      errors: [{ messageId: 'uphillRank' }],
    },
  ],
});
