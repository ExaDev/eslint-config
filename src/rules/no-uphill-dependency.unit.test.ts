import { parse } from '@humanwhocodes/momoa';
import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createNoUphillDependencyRule, findDependencyEntry } from './no-uphill-dependency';
import type { WorkspaceGraph } from './workspace-graph';
import type { WorkspacePackageInfo } from './workspace-graph';
import type { NamedDependency } from './workspace-json-helpers';

function namedDependency(name: string): NamedDependency {
  const document = parse(`{"${name}": "1"}`, { mode: 'json' });
  if (document.body.type !== 'Object') throw new Error('Unreachable: fixture is a top-level JSON object.');
  const [member] = document.body.members;
  if (member === undefined) throw new Error('Unreachable: fixture has exactly one member.');
  return { name, node: member };
}

function pkg(name: string, group: string, rank: number, slice: string | undefined): WorkspacePackageInfo {
  return { name, relativeDir: `unused/${name}`, group, rank, slice };
}

// Named so the "3" and "2" ranks below read as the group-rank hierarchy they represent, not an arbitrary literal.
const PRODUCT_RANK = 2;
const TARGETS_RANK = 3;

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
    ].map((entry) => [entry.name, entry]),
  ),
  dependencyNamesByName: new Map(),
};

const rule = createNoUphillDependencyRule(() => FIXED_GRAPH);

const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

function manifest(name: string, dependencies: Readonly<Record<string, string>> = {}): string {
  return JSON.stringify({ name, dependencies }, null, 2);
}

describe('createNoUphillDependencyRule meta', () => {
  it('declares the four message ids the rule can report', () => {
    expect(Object.keys(rule.meta?.messages ?? {}).sort()).toEqual(['crossSlice', 'isolatedGroup', 'rankSkip', 'uphillRank']);
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
    // A manifest with no "name" field at all (readDeclaredName returns undefined) is silently skipped, never treated as any particular workspace package.
    { code: JSON.stringify({ dependencies: { 'kv-adapter-memory': 'workspace:*' } }), options: [{ groups: [{ name: 'core' }] }] },
    // Same rank, permitted regardless of rankSkip configuration.
    { code: manifest('kv-adapter-memory', { 'kv-contract': 'workspace:*' }), options: [{ groups: [{ name: 'core' }] }] },
    // Exactly one rank below, within maxDistance.
    {
      code: manifest('store-cli', { 'store-application-context': 'workspace:*' }),
      options: [{ groups: [{ name: 'core' }], rankSkip: { maxDistance: 1, exemptRanks: [0] } }],
    },
    // A rank-0 (exempt) dependency reached from any distance is permitted even under rankSkip.
    {
      code: manifest('store-cli', { 'kv-contract': 'workspace:*' }),
      options: [{ groups: [{ name: 'core' }], rankSkip: { maxDistance: 1, exemptRanks: [0] } }],
    },
    // rankSkip entirely unconfigured: a deep, otherwise-skip-shaped dependency is not checked at all.
    { code: manifest('store-cli', { 'kv-adapter-memory': 'workspace:*' }), options: [{ groups: [{ name: 'core' }] }] },
    // Same slice, permitted.
    {
      code: manifest('store-application-context', { 'store-api-router': 'workspace:*' }),
      options: [{ groups: [{ name: 'core' }] }],
    },
    // An unknown (non-workspace, third-party) dependency name is ignored.
    { code: manifest('kv-contract', { zod: '^3' }), options: [{ groups: [{ name: 'core' }] }] },
    // isolatedGroups configured, but this pair is not one of the forbidden ones.
    {
      code: manifest('kv-adapter-memory', { 'billing-contract': 'workspace:*' }),
      options: [{ groups: [{ name: 'core' }, { name: 'features' }, { name: 'verticals' }], isolatedGroups: [['features', 'verticals']] }],
    },
    // A nested (non-top-level) object that itself looks exactly like a self-contained manifest (its own real "name" and "dependencies") must never be analysed as if it were the file's own top-level manifest: only the Object visitor's own parent.type === 'Document' check stands between "the real top level" and "any nested object anywhere in the file". If bypassed, this nested object would be read as "store-cli" (rank 3) depending on "kv-adapter-memory" (rank 1), a genuine rankSkip violation, and wrongly reported even though the top-level manifest itself declares no dependencies at all.
    {
      code: JSON.stringify({ name: 'kv-contract', nested: { name: 'store-cli', dependencies: { 'kv-adapter-memory': 'workspace:*' } } }),
      options: [{ groups: [{ name: 'core' }], rankSkip: { maxDistance: 1, exemptRanks: [0] } }],
    },
  ],
  invalid: [
    {
      code: manifest('kv-contract', { 'kv-adapter-memory': 'workspace:*' }),
      options: [{ groups: [{ name: 'core' }] }],
      errors: [{ messageId: 'uphillRank' }],
    },
    {
      code: manifest('store-cli', { 'kv-adapter-memory': 'workspace:*' }),
      options: [{ groups: [{ name: 'core' }], rankSkip: { maxDistance: 1, exemptRanks: [0] } }],
      errors: [{ messageId: 'rankSkip' }],
    },
    {
      code: manifest('store-application-context', { 'billing-contract': 'workspace:*' }),
      options: [{ groups: [{ name: 'core' }], rankSkip: { maxDistance: 1, exemptRanks: [0] } }],
      errors: [{ messageId: 'crossSlice' }],
    },
    {
      code: manifest('checkout-vertical', { 'store-api-router': 'workspace:*' }),
      options: [{ groups: [{ name: 'core' }, { name: 'features' }, { name: 'verticals' }], isolatedGroups: [['features', 'verticals']] }],
      errors: [{ messageId: 'isolatedGroup' }],
    },
    // isolatedGroups matches in the reverse declared order too.
    {
      code: manifest('checkout-vertical', { 'store-api-router': 'workspace:*' }),
      options: [{ groups: [{ name: 'core' }, { name: 'features' }, { name: 'verticals' }], isolatedGroups: [['verticals', 'features']] }],
      errors: [{ messageId: 'isolatedGroup' }],
    },
    // Two violating dependencies in one manifest each get their own reported error, at their own location.
    {
      code: manifest('kv-contract', { 'kv-adapter-memory': 'workspace:*', 'store-cli': 'workspace:*' }),
      options: [{ groups: [{ name: 'core' }] }],
      errors: [{ messageId: 'uphillRank' }, { messageId: 'uphillRank' }],
    },
    // Reading a non-default dependency field.
    {
      code: JSON.stringify({ name: 'kv-contract', devDependencies: { 'kv-adapter-memory': 'workspace:*' } }, null, 2),
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
      options: [{ groups: [{ name: 'core' }], dependencyFields: ['dependencies', 'devDependencies'] }],
      errors: [{ messageId: 'uphillRank' }],
    },
  ],
});
