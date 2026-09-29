import { describe, expect, it } from 'vitest';
import { applyAllowList, checkDependencies, dependencyPathExists, exemptDependencyNames, expectedPackageName, last, matchesSelector, type WorkspaceViolation } from './workspace-checks';
import type { WorkspacePackageInfo } from './workspace-graph';
import type { GroupSpec } from './workspace-options';

function pkg(overrides: Partial<WorkspacePackageInfo> & { readonly name: string }): WorkspacePackageInfo {
  return { relativeDir: `unused/${overrides.name}`, group: 'core', rank: 0, slice: undefined, ...overrides };
}

describe('checkDependencies', () => {
  const contract = pkg({ name: 'kv-contract', rank: 0 });
  const adapter = pkg({ name: 'kv-adapter-memory', rank: 1 });
  const storeApiContract = pkg({ name: 'store-api-contract', rank: 0, group: 'features', slice: 'store' });
  const storeApiRouter = pkg({ name: 'store-api-router', rank: 1, group: 'features', slice: 'store' });
  const storeApplicationContext = pkg({ name: 'store-application-context', rank: 2, group: 'product', slice: 'store' });
  const storeCli = pkg({ name: 'store-cli', rank: 3, group: 'targets', slice: 'store' });
  const billingContract = pkg({ name: 'billing-contract', rank: 0, group: 'features', slice: 'billing' });
  const vertical = pkg({ name: 'checkout-vertical', rank: 1, group: 'verticals', slice: 'checkout' });

  const graph = new Map(
    [contract, adapter, storeApiContract, storeApiRouter, storeApplicationContext, storeCli, billingContract, vertical].map((entry) => [
      entry.name,
      entry,
    ]),
  );

  it('a dependency with no violation at all reports nothing', () => {
    expect(checkDependencies('kv-contract', contract, [], { graph })).toEqual([]);
    expect(checkDependencies('kv-adapter-memory', adapter, ['kv-contract'], { graph })).toEqual([]);
  });

  it('an unknown (non-workspace) dependency is silently ignored', () => {
    expect(checkDependencies('kv-contract', contract, ['zod'], { graph })).toEqual([]);
  });

  it('reports uphillRank when the dependency outranks self', () => {
    const violations = checkDependencies('kv-contract', contract, ['kv-adapter-memory'], { graph });
    expect(violations).toEqual([
      { dependencyName: 'kv-adapter-memory', messageId: 'uphillRank', data: { self: 'kv-contract', selfRank: '0', dependency: 'kv-adapter-memory', dependencyRank: '1' } },
    ]);
  });

  it('permits a same-rank dependency', () => {
    const peer = pkg({ name: 'kv-adapter-fs', rank: 1 });
    const graphWithPeer = new Map(graph).set(peer.name, peer);
    expect(checkDependencies('kv-adapter-memory', adapter, ['kv-adapter-fs'], { graph: graphWithPeer })).toEqual([]);
  });

  it('rankSkip is not checked at all when the option is omitted', () => {
    expect(checkDependencies('store-cli', storeCli, ['kv-adapter-memory'], { graph })).toEqual([]);
  });

  it('reports rankSkip when the dependency sits more than maxDistance ranks below and is not exempt', () => {
    const violations = checkDependencies('store-cli', storeCli, ['kv-adapter-memory'], { graph, rankSkip: { maxDistance: 1, exemptRanks: [0] } });
    expect(violations).toEqual([
      { dependencyName: 'kv-adapter-memory', messageId: 'rankSkip', data: { self: 'store-cli', selfRank: '3', dependency: 'kv-adapter-memory', dependencyRank: '1' } },
    ]);
  });

  it('permits a dependency exactly maxDistance ranks below', () => {
    expect(checkDependencies('store-cli', storeCli, ['store-application-context'], { graph, rankSkip: { maxDistance: 1, exemptRanks: [0] } })).toEqual([]);
  });

  it('permits skipping straight to an exempt rank regardless of distance', () => {
    expect(checkDependencies('store-cli', storeCli, ['kv-contract'], { graph, rankSkip: { maxDistance: 1, exemptRanks: [0] } })).toEqual([]);
  });

  it('reports crossSlice when both packages have a resolved, differing slice', () => {
    const violations = checkDependencies('store-api-router', storeApiRouter, ['billing-contract'], { graph });
    expect(violations).toEqual([
      { dependencyName: 'billing-contract', messageId: 'crossSlice', data: { self: 'store-api-router', selfSlice: 'store', dependency: 'billing-contract', dependencySlice: 'billing' } },
    ]);
  });

  it('permits a same-slice dependency', () => {
    expect(checkDependencies('store-api-router', storeApiRouter, ['store-api-contract'], { graph })).toEqual([]);
  });

  it('permits a dependency when self has no resolved slice', () => {
    expect(checkDependencies('kv-adapter-memory', adapter, ['store-api-contract'], { graph })).toEqual([]);
  });

  it('permits a dependency when the dependency has no resolved slice', () => {
    expect(checkDependencies('store-api-router', storeApiRouter, ['kv-contract'], { graph })).toEqual([]);
  });

  it('reports isolatedGroup for a forbidden group pair in either declared order', () => {
    const isolatedGroups: readonly (readonly [string, string])[] = [['features', 'verticals']];
    const violations = checkDependencies('checkout-vertical', vertical, ['store-api-contract'], { graph, isolatedGroups });
    expect(violations).toEqual([
      { dependencyName: 'store-api-contract', messageId: 'isolatedGroup', data: { self: 'checkout-vertical', selfGroup: 'verticals', dependency: 'store-api-contract', dependencyGroup: 'features' } },
    ]);
  });

  it('isolatedGroup matches the reverse declared order too', () => {
    const isolatedGroups: readonly (readonly [string, string])[] = [['verticals', 'features']];
    const violations = checkDependencies('checkout-vertical', vertical, ['store-api-contract'], { graph, isolatedGroups });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.messageId).toBe('isolatedGroup');
  });

  it('isolatedGroups leaves an unrelated group pair alone', () => {
    expect(checkDependencies('kv-adapter-memory', adapter, ['store-api-contract'], { graph, isolatedGroups: [['features', 'verticals']] })).toEqual([]);
  });

  it('isolatedGroup is reported when only ONE of several configured pairs matches, not only when every pair does', () => {
    // Two configured pairs, only the second of which involves this dependency's own groups: distinguishes isIsolatedPair's real "some pair matches" semantics from a wrongly-inverted "every pair matches", which this same input would satisfy vacuously if the array happened to be empty but must genuinely fail here since the first, unrelated pair does not match at all.
    const isolatedGroups: readonly (readonly [string, string])[] = [
      ['pair-a', 'pair-b'],
      ['features', 'verticals'],
    ];
    const violations = checkDependencies('checkout-vertical', vertical, ['store-api-contract'], { graph, isolatedGroups });
    expect(violations).toEqual([
      { dependencyName: 'store-api-contract', messageId: 'isolatedGroup', data: { self: 'checkout-vertical', selfGroup: 'verticals', dependency: 'store-api-contract', dependencyGroup: 'features' } },
    ]);
  });

  it('isolatedGroup is checked ahead of uphillRank: reported even when the dependency also outranks self', () => {
    const higherRankVertical = pkg({ name: 'checkout-vertical-router', rank: 5, group: 'verticals', slice: 'checkout' });
    const graphWithHigher = new Map(graph).set(higherRankVertical.name, higherRankVertical);
    const violations = checkDependencies('store-api-router', storeApiRouter, ['checkout-vertical-router'], {
      graph: graphWithHigher,
      isolatedGroups: [['features', 'verticals']],
    });
    expect(violations).toEqual([
      {
        dependencyName: 'checkout-vertical-router',
        messageId: 'isolatedGroup',
        data: { self: 'store-api-router', selfGroup: 'features', dependency: 'checkout-vertical-router', dependencyGroup: 'verticals' },
      },
    ]);
  });

  it('reports at most one violation per dependency, and continues checking the rest', () => {
    const violations = checkDependencies('kv-contract', contract, ['kv-adapter-memory', 'store-api-contract'], { graph });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.dependencyName).toBe('kv-adapter-memory');
  });

  // isIsolatedPair's own three-way match (first===groupA && second===groupB) || (first===groupB && second===groupA) can be satisfied "accidentally" by a pair sharing only ONE element with a genuinely unrelated group: each case below shares exactly one element with the declared pair ['pair-a', 'pair-b'] while the actual (self, dependency) groups are not that pair at all, proving every one of the four equality comparisons is load-bearing on its own, not just the overall disjunction.
  describe('isolatedGroups: a pair sharing only one element with an unrelated group combination is not isolated', () => {
    const pairA = pkg({ name: 'pair-a-pkg', group: 'pair-a' });
    const pairB = pkg({ name: 'pair-b-pkg', group: 'pair-b' });
    const unrelated = pkg({ name: 'unrelated-pkg', group: 'unrelated' });
    const isolatedGraph = new Map([pairA, pairB, unrelated].map((entry) => [entry.name, entry]));
    const isolatedGroups: readonly (readonly [string, string])[] = [['pair-a', 'pair-b']];

    it('self in an unrelated group depending on the pair\'s own "second" group is not isolated', () => {
      expect(checkDependencies('unrelated-pkg', unrelated, ['pair-b-pkg'], { graph: isolatedGraph, isolatedGroups })).toEqual([]);
    });

    it('self in the pair\'s own "first" group depending on an unrelated group is not isolated', () => {
      expect(checkDependencies('pair-a-pkg', pairA, ['unrelated-pkg'], { graph: isolatedGraph, isolatedGroups })).toEqual([]);
    });

    it('self in the pair\'s own "second" group depending on an unrelated group is not isolated', () => {
      expect(checkDependencies('pair-b-pkg', pairB, ['unrelated-pkg'], { graph: isolatedGraph, isolatedGroups })).toEqual([]);
    });
  });
});

describe('dependencyPathExists', () => {
  const edges = new Map<string, readonly string[]>([
    ['a', ['b']],
    ['b', ['c']],
    ['c', []],
    ['cyclic-a', ['cyclic-b']],
    ['cyclic-b', ['cyclic-a']],
  ]);

  it('finds a direct edge', () => {
    expect(dependencyPathExists('a', 'b', edges)).toBe(true);
  });

  it('finds a transitive path', () => {
    expect(dependencyPathExists('a', 'c', edges)).toBe(true);
  });

  it('returns false when no path exists', () => {
    expect(dependencyPathExists('c', 'a', edges)).toBe(false);
  });

  it('returns false for a name with no outgoing edges at all', () => {
    expect(dependencyPathExists('unknown', 'a', edges)).toBe(false);
  });

  it('terminates on a genuine cycle without infinite looping', () => {
    expect(dependencyPathExists('cyclic-a', 'cyclic-a', edges)).toBe(true);
    expect(dependencyPathExists('cyclic-a', 'unrelated', edges)).toBe(false);
  });
});

describe('last', () => {
  it('returns the final element of a non-empty array', () => {
    expect(last(['a', 'b', 'c'])).toBe('c');
  });

  it('throws for an empty array, a shape expectedPackageName\'s own real call site cannot produce', () => {
    expect(() => last([])).toThrow(/Unreachable/);
  });
});

describe('expectedPackageName', () => {
  const core: GroupSpec = { name: 'core' };
  const test: GroupSpec = { name: 'test', naming: 'keep-group' };
  const nestedPath: GroupSpec = { name: 'product', path: 'product' };

  it("'drop-group' (the default) drops the group's own path segments and joins the rest", () => {
    expect(expectedPackageName('core/clock/contract', core, { scope: '@exacap' })).toBe('@exacap/clock-contract');
    expect(expectedPackageName('core/clock/system', core, { scope: '@exacap' })).toBe('@exacap/clock-system');
  });

  it("'keep-group' joins every segment including the group's own", () => {
    expect(expectedPackageName('test/database', test, { scope: '@novus' })).toBe('@novus/test-database');
  });

  it("'keep-group' uses the group's own name regardless of how deep its path nests, when the two happen to agree", () => {
    const nestedTestGroup: GroupSpec = { name: 'test', path: 'packages/test', naming: 'keep-group' };
    expect(expectedPackageName('packages/test/e2e', nestedTestGroup, { scope: '@x' })).toBe('@x/test-e2e');
  });

  it("'keep-group' uses the group's own name when its path nests only one directory deep", () => {
    const singleSegmentPathGroup: GroupSpec = { name: 'test', path: 'tests', naming: 'keep-group' };
    expect(expectedPackageName('tests/e2e', singleSegmentPathGroup, { scope: '@x' })).toBe('@x/test-e2e');
  });

  it("'keep-group' uses the group's own NAME, never a path segment standing in for it, even when its path nests more than one directory deep and the two disagree", () => {
    const nameDiffersFromNestedPathGroup: GroupSpec = { name: 'e2e', path: 'packages/test', naming: 'keep-group' };
    expect(expectedPackageName('packages/test/smoke', nameDiffersFromNestedPathGroup, { scope: '@x' })).toBe('@x/e2e-smoke');
  });

  it("'basename' uses only the final path segment", () => {
    const basenameGroup: GroupSpec = { name: 'core', naming: 'basename' };
    expect(expectedPackageName('core/domain/models/user', basenameGroup, { scope: '@acme' })).toBe('@acme/user');
  });

  it('omits the scope prefix entirely when naming.scope is undefined', () => {
    expect(expectedPackageName('core/clock/contract', core, {})).toBe('clock-contract');
  });

  it('uses a custom separator when given', () => {
    expect(expectedPackageName('core/clock/contract', core, { scope: '@exacap', separator: '_' })).toBe('@exacap/clock_contract');
  });

  it("a multi-segment group path is dropped in full under 'drop-group'", () => {
    expect(expectedPackageName('product/store/store-application-context', nestedPath, { scope: '@acme' })).toBe('@acme/store-store-application-context');
  });

  it('drops an empty segment from a leading slash in relativeDir, rather than shifting every later segment', () => {
    expect(expectedPackageName('/core/clock/contract', core, { scope: '@exacap' })).toBe('@exacap/clock-contract');
  });

  it("tolerates a trailing slash in a group's own path, rather than shifting the drop-group boundary by one", () => {
    const trailingSlashGroup: GroupSpec = { name: 'core', path: 'core/' };
    expect(expectedPackageName('core/clock/contract', trailingSlashGroup, { scope: '@exacap' })).toBe('@exacap/clock-contract');
  });

  it("'drop-group' falls back to the group's own name when the package sits exactly at the group's own root, leaving no path segments for rest to keep", () => {
    const docsGroup: GroupSpec = { name: 'docs' };
    expect(expectedPackageName('docs', docsGroup, { scope: '@x' })).toBe('@x/docs');
  });

  it("'drop-group' falls back to the group's own name at the root of a group nested under its own path, not the path's own last segment", () => {
    const nestedRootGroup: GroupSpec = { name: 'web', path: 'apps/web' };
    expect(expectedPackageName('apps/web', nestedRootGroup, { scope: '@x' })).toBe('@x/web');
  });
});

describe('checkDependencies with exemptTargets', () => {
  const low = pkg({ name: 'low', rank: 0 });
  const testkit = pkg({ name: 'shared-testkit', rank: 5, group: 'test' });
  const graph = new Map([low, testkit].map((entry) => [entry.name, entry]));

  it('skips every check for an exempt dependency but still checks the others', () => {
    expect(checkDependencies('low', low, ['shared-testkit'], { graph })).toHaveLength(1);
    expect(checkDependencies('low', low, ['shared-testkit'], { graph, exemptTargets: new Set(['shared-testkit']) })).toEqual([]);
    expect(checkDependencies('low', low, ['shared-testkit'], { graph, exemptTargets: new Set(['other']) })).toHaveLength(1);
  });
});

describe('exemptDependencyNames', () => {
  const graph = new Map([
    pkg({ name: 'shared-testkit', group: 'test' }),
    pkg({ name: 'kv-contract', group: 'core' }),
  ].map((entry) => [entry.name, entry]));
  const exemptions = [{ group: 'test', fields: ['devDependencies'] }];

  it('exempts a package in an exempt group declared only under an exempt field', () => {
    expect([...exemptDependencyNames([{ name: 'shared-testkit', field: 'devDependencies' }], graph, exemptions)]).toEqual(['shared-testkit']);
  });

  it('does not exempt it when declared under a field the exemption does not list', () => {
    expect(exemptDependencyNames([{ name: 'shared-testkit', field: 'dependencies' }], graph, exemptions).size).toBe(0);
  });

  it('does not exempt it when any occurrence is under another field', () => {
    const declared = [
      { name: 'shared-testkit', field: 'devDependencies' },
      { name: 'shared-testkit', field: 'dependencies' },
    ];
    expect(exemptDependencyNames(declared, graph, exemptions).size).toBe(0);
    expect(exemptDependencyNames([...declared].reverse(), graph, exemptions).size).toBe(0);
  });

  it('exempts it when every occurrence is under an exempt field', () => {
    const declared = [
      { name: 'shared-testkit', field: 'devDependencies' },
      { name: 'shared-testkit', field: 'peerDependencies' },
    ];
    const both = [{ group: 'test', fields: ['devDependencies', 'peerDependencies'] }];
    expect(exemptDependencyNames(declared, graph, both).has('shared-testkit')).toBe(true);
  });

  it('does not exempt a package outside every exempt group, or a name that is not a workspace member', () => {
    expect(exemptDependencyNames([{ name: 'kv-contract', field: 'devDependencies' }], graph, exemptions).size).toBe(0);
    expect(exemptDependencyNames([{ name: 'zod', field: 'devDependencies' }], graph, exemptions).size).toBe(0);
  });

  it('picks the exemption of the target\'s own group among several', () => {
    const several = [
      { group: 'core', fields: ['dependencies'] },
      { group: 'test', fields: ['devDependencies'] },
    ];
    expect([...exemptDependencyNames([{ name: 'shared-testkit', field: 'devDependencies' }], graph, several)]).toEqual(['shared-testkit']);
  });

  it('exempts nothing when no exemptions are configured', () => {
    expect(exemptDependencyNames([{ name: 'shared-testkit', field: 'devDependencies' }], graph, undefined).size).toBe(0);
    expect(exemptDependencyNames([{ name: 'shared-testkit', field: 'devDependencies' }], graph, []).size).toBe(0);
  });
});

describe('applyAllowList', () => {
  const violation = (dependencyName: string): WorkspaceViolation => ({ dependencyName, messageId: 'uphillRank', data: {} });
  const entry = (from: string, to: string) => ({ from, to, reason: 'documented' });

  it('drops a violation on an allowed edge and reports nothing stale', () => {
    const result = applyAllowList('a', { violations: [violation('b'), violation('c')], dependencyNames: ['b', 'c'] }, [entry('a', 'b')]);
    expect(result.violations).toEqual([violation('c')]);
    expect(result.stale).toEqual([]);
  });

  it('keeps every violation and reports nothing when the list is empty', () => {
    const result = applyAllowList('a', { violations: [violation('b')], dependencyNames: ['b'] }, []);
    expect(result).toEqual({ violations: [violation('b')], stale: [] });
  });

  it('reports an entry whose dependency is no longer declared as undeclared', () => {
    const result = applyAllowList('a', { violations: [], dependencyNames: ['x'] }, [entry('a', 'b')]);
    expect(result.stale).toEqual([{ entry: entry('a', 'b'), kind: 'undeclared' }]);
  });

  it('reports an entry on a declared dependency that violates nothing as unneeded', () => {
    const result = applyAllowList('a', { violations: [violation('other')], dependencyNames: ['b', 'other'] }, [entry('a', 'b')]);
    expect(result.stale).toEqual([{ entry: entry('a', 'b'), kind: 'unneeded' }]);
  });

  it('only considers entries whose source is the package being checked', () => {
    const result = applyAllowList('a', { violations: [violation('b')], dependencyNames: ['b'] }, [entry('z', 'b'), entry('z', 'gone')]);
    expect(result.violations).toEqual([violation('b')]);
    expect(result.stale).toEqual([]);
  });

  it('reports each stale entry, in declaration order, alongside used ones', () => {
    const result = applyAllowList(
      'a',
      { violations: [violation('b')], dependencyNames: ['b', 'c'] },
      [entry('a', 'gone'), entry('a', 'b'), entry('a', 'c')],
    );
    expect(result.stale.map((item) => [item.entry.to, item.kind])).toEqual([
      ['gone', 'undeclared'],
      ['c', 'unneeded'],
    ]);
  });
});

describe('matchesSelector', () => {
  const target = { group: 'core', name: '@s/kv-contract' };

  it('treats a string as a name pattern tested against the declared name', () => {
    expect(matchesSelector('-contract$', target)).toBe(true);
    expect(matchesSelector('^kv', target)).toBe(false);
  });

  it('matches an object selector on group, on name pattern, or on both together', () => {
    expect(matchesSelector({ group: 'core' }, target)).toBe(true);
    expect(matchesSelector({ group: 'test' }, target)).toBe(false);
    expect(matchesSelector({ namePattern: 'kv-' }, target)).toBe(true);
    expect(matchesSelector({ namePattern: 'zz' }, target)).toBe(false);
    expect(matchesSelector({ group: 'core', namePattern: 'kv-' }, target)).toBe(true);
    expect(matchesSelector({ group: 'core', namePattern: 'zz' }, target)).toBe(false);
    expect(matchesSelector({ group: 'test', namePattern: 'kv-' }, target)).toBe(false);
  });

  it('never matches a name pattern against a package that declares no name', () => {
    expect(matchesSelector('.*', { group: 'core', name: undefined })).toBe(false);
    expect(matchesSelector({ namePattern: '.*' }, { group: 'core', name: undefined })).toBe(false);
    expect(matchesSelector({ group: 'core' }, { group: 'core', name: undefined })).toBe(true);
  });

  it('compiles the pattern with the u flag', () => {
    expect(() => matchesSelector('\\-', target)).toThrow();
  });
});
