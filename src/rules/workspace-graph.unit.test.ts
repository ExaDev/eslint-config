import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceGraph,
  deriveRank,
  findOwningGroup,
  getWorkspaceGraph,
  loadWorkspaceGraph,
  manifestRelativeDir,
  readDeclaredManifest,
  resetWorkspaceGraphCache,
  resolveWorkspacePackagePatterns,
  resolveWorkspaceRoot,
  stripScope,
} from './workspace-graph';
import { realWorkspaceFs, type WorkspaceFs } from './workspace-fs';
import type { GroupSpec, WorkspaceArchitectureOptions } from './workspace-options';

const FIXTURE_ROOT = join(import.meta.dirname, '__fixtures__/workspace');

// `realpaths` maps a lexical path to the canonical path it should resolve to (a symlinked spelling standing in for a real directory tree); a path with no entry resolves to itself, exactly as node:fs's own realpathSync does for a path with no symlink anywhere along it.
function fakeFs(
  files: Readonly<Record<string, string>>,
  dirs: Readonly<Record<string, readonly string[]>>,
  realpaths: Readonly<Record<string, string>> = {},
): WorkspaceFs {
  return {
    existsSync: (path) => path in files || path in dirs,
    readFileSync: (path) => {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    readdirSync: (path) => {
      const entries = dirs[path];
      if (entries === undefined) return [];
      return entries.map((name) => ({ name, isDirectory: () => !name.includes('.') }));
    },
    realpathSync: (path) => realpaths[path] ?? path,
  };
}

describe('stripScope', () => {
  it('strips a leading npm scope, however many characters it holds', () => {
    // A single-character scope ("@x/") cannot distinguish the anchor from the quantifier: both "^@[^/]+/" and a hypothetical "^@[^/]/" (exactly one character) would strip it identically. A real, multi-character scope name is what actually exercises "+" (one or more characters), not merely "exactly one".
    expect(stripScope('@exacap/store-cli')).toBe('store-cli');
  });

  it('leaves a name with no scope at all unchanged', () => {
    expect(stripScope('store-cli')).toBe('store-cli');
  });

  it('never strips a "@scope/"-shaped substring that does not start the name', () => {
    // An unanchored pattern would still match "@scope/" here, just starting partway through, and (since stripScope slices by the match's own LENGTH, not its position) would wrongly cut characters off the front of the string.
    expect(stripScope('a@scope/b')).toBe('a@scope/b');
  });
});

describe('findOwningGroup', () => {
  const groups: readonly GroupSpec[] = [{ name: 'core' }, { name: 'features' }, { name: 'nested', path: 'core/nested' }];

  it('matches a group by its own name when no path is given', () => {
    expect(findOwningGroup('core/kv/kv-contract', groups)?.name).toBe('core');
  });

  it('returns undefined for a directory outside every declared group', () => {
    expect(findOwningGroup('tooling/scripts', groups)).toBeUndefined();
  });

  it('prefers the longest matching group path over a shorter sibling prefix', () => {
    expect(findOwningGroup('core/nested/thing', groups)?.name).toBe('nested');
    expect(findOwningGroup('core/other/thing', groups)?.name).toBe('core');
  });

  it('does not match a group whose prefix is only a partial segment (a false positive on string prefix alone)', () => {
    const withCoreLike: readonly GroupSpec[] = [{ name: 'core' }, { name: 'core-extra' }];
    expect(findOwningGroup('core-extra-thing/pkg', withCoreLike)).toBeUndefined();
  });

  it('matches a package that sits directly at a group\'s own root, with no further sub-segment', () => {
    expect(findOwningGroup('core', groups)?.name).toBe('core');
  });

  it('keeps the first-declared group when two groups resolve to equal-length matching paths', () => {
    const tiedGroups: readonly GroupSpec[] = [
      { name: 'alpha', path: 'shared' },
      { name: 'beta', path: 'shared' },
    ];
    expect(findOwningGroup('shared/pkg', tiedGroups)?.name).toBe('alpha');
  });
});

describe('deriveRank', () => {
  const group: GroupSpec = { name: 'core', rank: 0 };
  // Arbitrary but distinct ranks, named so a nameRanks match is visibly not the same value as the group's own rank (0) or defaultRank (see below), rather than an unexplained literal.
  const CONTRACT_NAME_RANK = 9;
  const KV_PREFIX_NAME_RANK = 8;
  const TARGETS_DEFAULT_RANK = 3;

  it('uses the first matching nameRanks pattern ahead of the group rank', () => {
    const options: WorkspaceArchitectureOptions = { groups: [group], nameRanks: [{ pattern: '-contract$', rank: CONTRACT_NAME_RANK }] };
    expect(deriveRank('kv-contract', group, options)).toBe(CONTRACT_NAME_RANK);
  });

  it('checks nameRanks patterns in declared order, first match wins', () => {
    const options: WorkspaceArchitectureOptions = {
      groups: [group],
      nameRanks: [
        { pattern: '-contract$', rank: CONTRACT_NAME_RANK },
        { pattern: '^kv-', rank: KV_PREFIX_NAME_RANK },
      ],
    };
    expect(deriveRank('kv-contract', group, options)).toBe(CONTRACT_NAME_RANK);
  });

  it('falls back to group.rank when no nameRanks pattern matches', () => {
    const options: WorkspaceArchitectureOptions = { groups: [group], nameRanks: [{ pattern: '-contract$', rank: CONTRACT_NAME_RANK }] };
    expect(deriveRank('kv-adapter-memory', group, options)).toBe(0);
  });

  it('falls back to defaultRank when the group itself has no rank', () => {
    const rankless: GroupSpec = { name: 'targets' };
    const options: WorkspaceArchitectureOptions = { groups: [rankless], defaultRank: TARGETS_DEFAULT_RANK };
    expect(deriveRank('store-cli', rankless, options)).toBe(TARGETS_DEFAULT_RANK);
  });

  it('throws when neither nameRanks, group.rank, nor defaultRank resolves anything', () => {
    const rankless: GroupSpec = { name: 'targets' };
    const options: WorkspaceArchitectureOptions = { groups: [rankless] };
    expect(() => deriveRank('store-cli', rankless, options)).toThrow(/no rank could be resolved/);
  });

  it("matches a nameRanks pattern's unicode-property escape, which only parses under the regex's own 'u' flag", () => {
    // '\\p{L}' (a Unicode letter) is only recognised as a property escape under the 'u' flag; without it, most engines treat '\\p' as a plain identity escape matching a literal "p" instead, which "𝔘" (a single astral-plane letter, two UTF-16 code units) is not. This also exercises the 'u' flag's own "." matches one whole codepoint, not one UTF-16 unit" behaviour: '^.$' only matches this two-code-unit string as a single character under 'u'.
    const options: WorkspaceArchitectureOptions = { groups: [group], nameRanks: [{ pattern: '^\\p{L}$', rank: CONTRACT_NAME_RANK }] };
    expect(deriveRank('𝔘', group, options)).toBe(CONTRACT_NAME_RANK);
  });

  it('skips nameRanks entirely for a nameless package (undefined), even when a pattern would otherwise match its group\'s own directory-derived identity key, falling straight through to group.rank', () => {
    // A pattern deliberately shaped to match nothing about a real declared name, only ever an identity key that happens to be a directory path (the shape collectCandidates falls back to for a nameless package): if deriveRank were still matching nameRanks against that fallback, this would wrongly return CONTRACT_NAME_RANK instead of the group's own rank (0).
    const options: WorkspaceArchitectureOptions = { groups: [group], nameRanks: [{ pattern: '/', rank: CONTRACT_NAME_RANK }] };
    expect(deriveRank(undefined, group, options)).toBe(0);
  });

  it('falls through undefined to defaultRank when the group itself has no rank either', () => {
    const rankless: GroupSpec = { name: 'targets' };
    const options: WorkspaceArchitectureOptions = { groups: [rankless], defaultRank: TARGETS_DEFAULT_RANK };
    expect(deriveRank(undefined, rankless, options)).toBe(TARGETS_DEFAULT_RANK);
  });

  it('names the package as having no declared name in the thrown message when undefined resolves nothing at all', () => {
    const rankless: GroupSpec = { name: 'targets' };
    const options: WorkspaceArchitectureOptions = { groups: [rankless] };
    expect(() => deriveRank(undefined, rankless, options)).toThrow(/\(no declared name\)/);
  });
});

describe('resolveWorkspaceRoot', () => {
  it('resolves a given root option directly, without touching the filesystem', () => {
    const fs = fakeFs({}, {});
    expect(resolveWorkspaceRoot(fs, '/anything/file.json', '/given/root')).toBe(join('/given/root'));
  });

  it('walks up from the linted file to the nearest ancestor pnpm-workspace.yaml', () => {
    const fs = fakeFs({ '/repo/pnpm-workspace.yaml': 'packages:\n' }, {});
    expect(resolveWorkspaceRoot(fs, '/repo/core/kv/package.json', undefined)).toBe('/repo');
  });

  it('throws when no ancestor pnpm-workspace.yaml exists anywhere above the file', () => {
    const fs = fakeFs({}, {});
    expect(() => resolveWorkspaceRoot(fs, '/no/workspace/here/package.json', undefined)).toThrow(/pnpm-workspace\.yaml/);
  });

  it('resolves the real fixture tree from a nested file path', () => {
    const nestedFile = join(FIXTURE_ROOT, 'targets/store-cli/src/index.ts');
    expect(resolveWorkspaceRoot(realWorkspaceFs, nestedFile, undefined)).toBe(FIXTURE_ROOT);
  });
});

describe('resolveWorkspacePackagePatterns', () => {
  it('returns the given packages option verbatim, without reading pnpm-workspace.yaml at all', () => {
    const fs = fakeFs({}, {});
    expect(resolveWorkspacePackagePatterns(fs, '/root', ['core/*'])).toEqual(['core/*']);
  });

  it('reads pnpm-workspace.yaml when packages is omitted', () => {
    const fs = fakeFs({ '/root/pnpm-workspace.yaml': "packages:\n  - 'core/*'\n" }, {});
    expect(resolveWorkspacePackagePatterns(fs, '/root', undefined)).toEqual(['core/*']);
  });

  it('throws when packages is omitted and no pnpm-workspace.yaml exists at the root', () => {
    // The exact message, not a loose substring match: fakeFs's own readFileSync ENOENT message also happens to embed the literal path "/root/pnpm-workspace.yaml" (it is, after all, the very path this guard exists to check first), so a /pnpm-workspace\.yaml/ regex alone cannot tell "the intended guard fired" apart from "the guard never fired and the code fell through to a real read failure that merely mentions the same filename".
    const fs = fakeFs({}, {});
    expect(() => resolveWorkspacePackagePatterns(fs, '/root', undefined)).toThrow(
      '@exadev/eslint-config: no "pnpm-workspace.yaml" found at workspace root "/root", and no "packages" option was given.',
    );
  });

  it('throws when the given "packages" option is explicitly empty', () => {
    const fs = fakeFs({}, {});
    expect(() => resolveWorkspacePackagePatterns(fs, '/root', [])).toThrow(/resolved workspace "packages" glob list is empty/);
  });

  it('throws when pnpm-workspace.yaml has no "packages:" key at all and no override option was given, rather than silently resolving to zero patterns', () => {
    const fs = fakeFs({ '/root/pnpm-workspace.yaml': 'onlyIgnores:\n  - "**/dist"\n' }, {});
    expect(() => resolveWorkspacePackagePatterns(fs, '/root', undefined)).toThrow(/resolved workspace "packages" glob list is empty/);
  });

  it('reads the real fixture tree\'s own pnpm-workspace.yaml', () => {
    expect(resolveWorkspacePackagePatterns(realWorkspaceFs, FIXTURE_ROOT, undefined)).toEqual([
      'core/*/*',
      'features/*/*',
      'product/*/*',
      'targets/*',
      'test/*',
    ]);
  });
});

function packageJson(name: string, dependencies: Readonly<Record<string, string>> = {}): string {
  return JSON.stringify({ name, dependencies });
}

describe('buildWorkspaceGraph (fabricated tree)', () => {
  const groups: readonly GroupSpec[] = [
    { name: 'core', rank: 0 },
    { name: 'features', rank: 1, slice: { segment: 0 } },
    { name: 'targets', rank: 2, slice: { namePrefix: true } },
  ];

  it('resolves group, rank, and segment-derived slice for a matched package', () => {
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'core/*'\n  - 'features/*/*'\n",
        '/root/core/kv/package.json': packageJson('kv-contract'),
        '/root/features/store/api/package.json': packageJson('store-api'),
      },
      {
        '/root': ['core', 'features'],
        '/root/core': ['kv'],
        '/root/features': ['store'],
        '/root/features/store': ['api'],
      },
    );

    const graph = buildWorkspaceGraph(fs, '/root', { groups });
    expect(graph.packagesByName.get('kv-contract')).toEqual({ name: 'kv-contract', relativeDir: 'core/kv', group: 'core', rank: 0, slice: undefined });
    expect(graph.packagesByName.get('store-api')).toEqual({ name: 'store-api', relativeDir: 'features/store/api', group: 'features', rank: 1, slice: 'store' });
  });

  it('drops a "." packages entry (the workspace root itself) rather than throwing "is not covered by any configured group"', () => {
    // A "." glob resolves to the workspace root itself, relative to itself: the empty string. pnpm allows this so the root package.json can opt into workspace-wide tooling without becoming a publishable member of any group; no configured group's own "path" could ever cover an empty relativeDir, so this must be dropped before findOwningGroup ever sees it.
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - '.'\n  - 'core/*'\n",
        '/root/package.json': packageJson('workspace-root'),
        '/root/core/kv/package.json': packageJson('kv-contract'),
      },
      { '/root': ['core'], '/root/core': ['kv'] },
    );

    const graph = buildWorkspaceGraph(fs, '/root', { groups });
    expect(graph.packagesByName.get('workspace-root')).toBeUndefined();
    expect(graph.packagesByName.get('kv-contract')).toEqual({ name: 'kv-contract', relativeDir: 'core/kv', group: 'core', rank: 0, slice: undefined });
  });

  it("a segment-sliced group whose configured segment index is deeper than the package's own path never contributes a known slice", () => {
    const shallowGroups: readonly GroupSpec[] = [
      { name: 'features', rank: 1, slice: { segment: 5 } },
      { name: 'targets', rank: 2, slice: { namePrefix: true } },
    ];
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'features/*'\n  - 'targets/*'\n",
        '/root/features/api/package.json': packageJson('api'),
        '/root/targets/api-cli/package.json': packageJson('api-cli'),
      },
      { '/root': ['features', 'targets'], '/root/features': ['api'], '/root/targets': ['api-cli'] },
    );

    const graph = buildWorkspaceGraph(fs, '/root', { groups: shallowGroups });
    expect(graph.packagesByName.get('api')?.slice).toBeUndefined();
    expect(graph.packagesByName.get('api-cli')?.slice).toBeUndefined();
  });

  it('derives a namePrefix slice from another group\'s already-observed segment slice', () => {
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'features/*/*'\n  - 'targets/*'\n",
        '/root/features/store/api/package.json': packageJson('store-api'),
        '/root/targets/store-cli/package.json': packageJson('store-cli'),
      },
      {
        '/root': ['features', 'targets'],
        '/root/features': ['store'],
        '/root/features/store': ['api'],
        '/root/targets': ['store-cli'],
      },
    );

    const graph = buildWorkspaceGraph(fs, '/root', { groups });
    expect(graph.packagesByName.get('store-cli')?.slice).toBe('store');
  });

  it('a namePrefix package whose declared name is an EXACT match for a known slice (no hyphen suffix) still resolves it', () => {
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'features/*/*'\n  - 'targets/*'\n",
        '/root/features/store/api/package.json': packageJson('store-api'),
        '/root/targets/store/package.json': packageJson('store'),
      },
      {
        '/root': ['features', 'targets'],
        '/root/features': ['store'],
        '/root/features/store': ['api'],
        '/root/targets': ['store'],
      },
    );

    const graph = buildWorkspaceGraph(fs, '/root', { groups });
    expect(graph.packagesByName.get('store')?.slice).toBe('store');
  });

  it('a namePrefix package matching no known slice at all resolves to an undefined slice', () => {
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'targets/*'\n",
        '/root/targets/lonely/package.json': packageJson('lonely-tool'),
      },
      { '/root': ['targets'], '/root/targets': ['lonely'] },
    );

    const graph = buildWorkspaceGraph(fs, '/root', { groups });
    expect(graph.packagesByName.get('lonely-tool')?.slice).toBeUndefined();
  });

  it('a namePrefix package with no declared name at all (pnpm allows this) resolves to an undefined slice too, never matching a known slice against its own directory-derived identity key', () => {
    // knownSlices here is genuinely non-empty ('store', from the features group), so this proves the nameless package is skipped entirely (no name to prefix-match at all), not merely that an empty knownSlices set happened to match nothing.
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'features/*/*'\n  - 'targets/*'\n",
        '/root/features/store/api/package.json': packageJson('store-api'),
        '/root/targets/nameless/package.json': JSON.stringify({ dependencies: {} }),
      },
      {
        '/root': ['features', 'targets'],
        '/root/features': ['store'],
        '/root/features/store': ['api'],
        '/root/targets': ['nameless'],
      },
    );

    const graph = buildWorkspaceGraph(fs, '/root', { groups });
    expect(graph.packagesByName.get('targets/nameless')?.slice).toBeUndefined();
  });

  it('a namePrefix package whose name genuinely does not match any real, non-empty known slice resolves to an undefined slice', () => {
    // Unlike the case above, knownSlices here is genuinely non-empty ('store', from the features group below): this exercises sliceByNamePrefix's own loop body actually running and rejecting a real candidate, not merely short-circuiting on an empty set.
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'features/*/*'\n  - 'targets/*'\n",
        '/root/features/store/api/package.json': packageJson('store-api'),
        '/root/targets/billing-thing/package.json': packageJson('billing-thing'),
      },
      {
        '/root': ['features', 'targets'],
        '/root/features': ['store'],
        '/root/features/store': ['api'],
        '/root/targets': ['billing-thing'],
      },
    );

    const graph = buildWorkspaceGraph(fs, '/root', { groups });
    expect(graph.packagesByName.get('billing-thing')?.slice).toBeUndefined();
  });

  it('a namePrefix package resolves the LONGEST matching known slice, not merely the first one collected (a shorter candidate that is itself a prefix of a longer one must not win by insertion order alone)', () => {
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'features/*/*'\n  - 'targets/*'\n",
        '/root/features/store/api/package.json': packageJson('store-api'),
        '/root/features/store-admin/web/package.json': packageJson('store-admin-web'),
        '/root/targets/store-admin-cli/package.json': packageJson('store-admin-cli'),
      },
      {
        '/root': ['features', 'targets'],
        // 'store' is listed, and so collected into knownSlices, before 'store-admin': a first-match-by-insertion-order implementation would wrongly resolve the target below to the shorter 'store' slice.
        '/root/features': ['store', 'store-admin'],
        '/root/features/store': ['api'],
        '/root/features/store-admin': ['web'],
        '/root/targets': ['store-admin-cli'],
      },
    );

    const graph = buildWorkspaceGraph(fs, '/root', { groups });
    expect(graph.packagesByName.get('store-admin-cli')?.slice).toBe('store-admin');
  });

  it('an already-established longest match is not overridden by a shorter matching candidate collected afterwards', () => {
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'features/*/*'\n  - 'targets/*'\n",
        '/root/features/store-admin/web/package.json': packageJson('store-admin-web'),
        '/root/features/store/api/package.json': packageJson('store-api'),
        '/root/targets/store-admin-cli/package.json': packageJson('store-admin-cli'),
      },
      {
        '/root': ['features', 'targets'],
        // Reversed from the test above: 'store-admin' is collected into knownSlices first this time, so the longest-match logic's own "a later, shorter candidate must not replace it" branch is exercised, not merely its "a later, longer one must replace it" counterpart.
        '/root/features': ['store-admin', 'store'],
        '/root/features/store-admin': ['web'],
        '/root/features/store': ['api'],
        '/root/targets': ['store-admin-cli'],
      },
    );

    const graph = buildWorkspaceGraph(fs, '/root', { groups });
    expect(graph.packagesByName.get('store-admin-cli')?.slice).toBe('store-admin');
  });

  it("a namePrefix package's own npm scope is stripped before matching, so a scoped declared name still resolves the same slice an unscoped sibling would", () => {
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'features/*/*'\n  - 'targets/*'\n",
        '/root/features/store/api/package.json': packageJson('store-api'),
        '/root/targets/store-cli/package.json': packageJson('@x/store-cli'),
      },
      {
        '/root': ['features', 'targets'],
        '/root/features': ['store'],
        '/root/features/store': ['api'],
        '/root/targets': ['store-cli'],
      },
    );

    const graph = buildWorkspaceGraph(fs, '/root', { groups });
    expect(graph.packagesByName.get('@x/store-cli')?.slice).toBe('store');
  });

  it('throws for a matched directory outside every declared group, rather than silently skipping it', () => {
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'tooling/*'\n",
        '/root/tooling/scripts/package.json': packageJson('scripts'),
      },
      { '/root': ['tooling'], '/root/tooling': ['scripts'] },
    );

    expect(() => buildWorkspaceGraph(fs, '/root', { groups })).toThrow(
      '@exadev/eslint-config: workspace package directory "tooling/scripts"',
    );
  });

  it('a package.json with no "name" field at all is kept in the graph, keyed by its own relativeDir rather than dropped: pnpm allows a workspace package to omit "name" entirely, and its own outgoing dependencies still need checking', () => {
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'core/*'\n",
        '/root/core/nameless/package.json': JSON.stringify({ version: '1.0.0', dependencies: { a: '1' } }),
      },
      { '/root': ['core'], '/root/core': ['nameless'] },
    );

    const graph = buildWorkspaceGraph(fs, '/root', { groups });
    expect(graph.packagesByName.size).toBe(1);
    expect(graph.packagesByName.get('core/nameless')).toEqual({ name: 'core/nameless', relativeDir: 'core/nameless', group: 'core', rank: 0, slice: undefined });
    expect(graph.dependencyNamesByName.get('core/nameless')).toEqual([]);
  });

  it('a matched directory whose package.json parses to a non-object JSON value is silently skipped', () => {
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'core/*'\n",
        '/root/core/broken/package.json': JSON.stringify('just a string, not an object'),
      },
      { '/root': ['core'], '/root/core': ['broken'] },
    );

    const graph = buildWorkspaceGraph(fs, '/root', { groups });
    expect(graph.packagesByName.size).toBe(0);
  });

  it('a matched directory whose package.json is exactly JSON null is silently skipped, not treated as a record (typeof null is "object")', () => {
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'core/*'\n",
        '/root/core/broken/package.json': JSON.stringify(null),
      },
      { '/root': ['core'], '/root/core': ['broken'] },
    );

    expect(() => buildWorkspaceGraph(fs, '/root', { groups })).not.toThrow();
    const graph = buildWorkspaceGraph(fs, '/root', { groups });
    expect(graph.packagesByName.size).toBe(0);
  });

  it('a glob match with no package.json at all is silently skipped', () => {
    const fs = fakeFs(
      { '/root/pnpm-workspace.yaml': "packages:\n  - 'core/*'\n" },
      { '/root': ['core'], '/root/core': ['empty'] },
    );

    const graph = buildWorkspaceGraph(fs, '/root', { groups });
    expect(graph.packagesByName.size).toBe(0);
  });

  it('throws when two workspace packages declare the same name', () => {
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'core/*'\n",
        '/root/core/a/package.json': packageJson('duplicate'),
        '/root/core/b/package.json': packageJson('duplicate'),
      },
      { '/root': ['core'], '/root/core': ['a', 'b'] },
    );

    expect(() => buildWorkspaceGraph(fs, '/root', { groups })).toThrow(/both declare the name "duplicate"/);
  });

  it('filters dependencyNamesByName down to workspace-internal names only', () => {
    const fs = fakeFs(
      {
        '/root/pnpm-workspace.yaml': "packages:\n  - 'core/*'\n",
        '/root/core/a/package.json': packageJson('a'),
        '/root/core/b/package.json': packageJson('b', { a: 'workspace:*', zod: '^3' }),
      },
      { '/root': ['core'], '/root/core': ['a', 'b'] },
    );

    const graph = buildWorkspaceGraph(fs, '/root', { groups });
    expect(graph.dependencyNamesByName.get('b')).toEqual(['a']);
  });

  it('propagates deriveRank\'s own throw for a package whose rank cannot be resolved at all', () => {
    const rankless: readonly GroupSpec[] = [{ name: 'core' }];
    const fs = fakeFs(
      { '/root/pnpm-workspace.yaml': "packages:\n  - 'core/*'\n", '/root/core/a/package.json': packageJson('a') },
      { '/root': ['core'], '/root/core': ['a'] },
    );
    expect(() => buildWorkspaceGraph(fs, '/root', { groups: rankless })).toThrow(/no rank could be resolved/);
  });

  it('builds the real fixture tree end to end with the group-rank model', () => {
    // The fixture tree's own seven packages, one per __fixtures__/workspace/**/package.json (see that directory).
    const FIXTURE_PACKAGE_COUNT = 7;
    const realGroups: readonly GroupSpec[] = [
      { name: 'core', rank: 0 },
      { name: 'features', rank: 1, slice: { segment: 0 } },
      { name: 'product', rank: 2, slice: { segment: 0 } },
      { name: 'targets', rank: 3, slice: { namePrefix: true } },
      { name: 'test', rank: 4 },
    ];
    const graph = buildWorkspaceGraph(realWorkspaceFs, FIXTURE_ROOT, { groups: realGroups });

    expect(graph.packagesByName.size).toBe(FIXTURE_PACKAGE_COUNT);
    expect(graph.packagesByName.get('kv-contract')).toEqual({ name: 'kv-contract', relativeDir: 'core/kv/kv-contract', group: 'core', rank: 0, slice: undefined });
    expect(graph.packagesByName.get('store-api-router')).toMatchObject({ group: 'features', rank: 1, slice: 'store' });
    expect(graph.packagesByName.get('store-application-context')).toMatchObject({ group: 'product', rank: 2, slice: 'store' });
    expect(graph.packagesByName.get('store-cli')).toMatchObject({ group: 'targets', rank: 3, slice: 'store' });
    expect(graph.packagesByName.get('test-database')).toMatchObject({ group: 'test', rank: 4, slice: undefined });
    expect(graph.dependencyNamesByName.get('store-api-router')?.slice().sort()).toEqual(['kv-adapter-memory', 'store-api-contract']);
  });
});

describe('readDeclaredManifest', () => {
  it('reads the declared name and collects dependency names only from the configured fields, with no extra entries', () => {
    const fs = fakeFs({ '/root/core/a/package.json': packageJson('a', { b: '1', c: '2' }) }, {});
    expect(readDeclaredManifest(fs, '/root/core/a', ['dependencies'])).toEqual({ name: 'a', dependencyNames: ['b', 'c'] });
  });

  it('collects nothing when none of the configured fields are present', () => {
    const fs = fakeFs({ '/root/core/a/package.json': JSON.stringify({ name: 'a' }) }, {});
    expect(readDeclaredManifest(fs, '/root/core/a', ['dependencies'])).toEqual({ name: 'a', dependencyNames: [] });
  });

  it('reports "name" as undefined, not the whole manifest as absent, when the manifest is a usable object with no "name" field at all: pnpm allows this', () => {
    const fs = fakeFs({ '/root/core/a/package.json': JSON.stringify({ dependencies: { b: '1' } }) }, {});
    expect(readDeclaredManifest(fs, '/root/core/a', ['dependencies'])).toEqual({ name: undefined, dependencyNames: ['b'] });
  });

  it('reports "name" as undefined when it is present but not a string, the same as when it is absent entirely', () => {
    const fs = fakeFs({ '/root/core/a/package.json': JSON.stringify({ name: 123 }) }, {});
    expect(readDeclaredManifest(fs, '/root/core/a', ['dependencies'])).toEqual({ name: undefined, dependencyNames: [] });
  });

  it('names the manifest\'s own path in the thrown error when its content is not parseable JSON at all, rather than a bare JSON.parse SyntaxError with no indication of which file', () => {
    const fs = fakeFs({ '/root/core/broken/package.json': '{ this is not json' }, {});
    expect(() => readDeclaredManifest(fs, '/root/core/broken', ['dependencies'])).toThrow(/\/root\/core\/broken\/package\.json/);
  });

  it('attaches the original SyntaxError as the thrown error\'s own "cause", not merely folded into its message', () => {
    // expect.assertions confirms the catch block genuinely ran: with no throw at all, this test would otherwise pass vacuously having asserted nothing.
    expect.assertions(2);
    const fs = fakeFs({ '/root/core/broken/package.json': '{ this is not json' }, {});
    try {
      readDeclaredManifest(fs, '/root/core/broken', ['dependencies']);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).cause).toBeInstanceOf(Error);
    }
  });

  it('lets a real read failure (EACCES, a race that removes the file after resolveWorkspacePackageDirs confirmed it) propagate unchanged, never misreported as a JSON parse error: only JSON.parse itself sits inside the try', () => {
    const readError = new Error('EACCES: permission denied');
    const fs: WorkspaceFs = {
      existsSync: () => true,
      readFileSync: () => {
        throw readError;
      },
      readdirSync: () => [],
      realpathSync: (path) => path,
    };
    expect(() => readDeclaredManifest(fs, '/root/core/unreadable', ['dependencies'])).toThrow(readError);
  });

  it('reports a wholly absent manifest, not a usable one with every field undefined, when the manifest parses to an array rather than an object', () => {
    // A package.json that parses to an array is not a usable JSON object at all: it has no "name" field (arrays have no string-keyed properties of that name) and nothing this graph could sensibly read as "dependencies", so it must be dropped from the graph the same way a manifest with no name at all is NOT dropped, but a wholly non-object manifest IS. Confirms the fix for the bug where an array manifest passed a local isRecord that omitted the !Array.isArray check, silently collecting its own numeric indices as dependency names.
    const fs = fakeFs({ '/root/core/a/package.json': JSON.stringify(['not', 'an', 'object']) }, {});
    expect(readDeclaredManifest(fs, '/root/core/a', ['dependencies'])).toBeUndefined();
  });

  it('reports a wholly absent manifest when it parses to null', () => {
    const fs = fakeFs({ '/root/core/a/package.json': JSON.stringify(null) }, {});
    expect(readDeclaredManifest(fs, '/root/core/a', ['dependencies'])).toBeUndefined();
  });

  it('collects no dependency names when a configured dependency field itself holds an array rather than an object', () => {
    // "dependencies" is documented, and every real package.json in the wild, as an object mapping name to version range; an array value there is not a usable dependency map, so it must contribute no dependency names at all rather than have its own indices ("0", "1", ...) collected as though they were package names.
    const fs = fakeFs({ '/root/core/a/package.json': JSON.stringify({ name: 'a', dependencies: ['b', 'c'] }) }, {});
    expect(readDeclaredManifest(fs, '/root/core/a', ['dependencies'])).toEqual({ name: 'a', dependencyNames: [] });
  });
});

describe('getWorkspaceGraph / resetWorkspaceGraphCache', () => {
  const groups: readonly GroupSpec[] = [{ name: 'core', rank: 0 }];

  function treeWithOnePackage(root: string, name: string): WorkspaceFs {
    return fakeFs(
      { [`${root}/pnpm-workspace.yaml`]: "packages:\n  - 'core/*'\n", [`${root}/core/a/package.json`]: packageJson(name) },
      { [root]: ['core'], [`${root}/core`]: ['a'] },
    );
  }

  it('serves the identical graph reference for the same root and options', () => {
    resetWorkspaceGraphCache();
    const fs = treeWithOnePackage('/cache-a', 'a');
    const options: WorkspaceArchitectureOptions = { groups };
    const first = getWorkspaceGraph(fs, '/cache-a', options);
    const second = getWorkspaceGraph(fs, '/cache-a', options);
    expect(second).toBe(first);
  });

  it('builds a genuinely fresh graph for a different root, fixing the original template cache bug of ignoring its own root', () => {
    resetWorkspaceGraphCache();
    const options: WorkspaceArchitectureOptions = { groups };
    const first = getWorkspaceGraph(treeWithOnePackage('/cache-b1', 'first'), '/cache-b1', options);
    const second = getWorkspaceGraph(treeWithOnePackage('/cache-b2', 'second'), '/cache-b2', options);
    expect(second).not.toBe(first);
    expect(first.packagesByName.has('first')).toBe(true);
    expect(second.packagesByName.has('second')).toBe(true);
  });

  it('builds a fresh graph for the same root but genuinely different options', () => {
    resetWorkspaceGraphCache();
    const fs = treeWithOnePackage('/cache-c', 'a');
    const first = getWorkspaceGraph(fs, '/cache-c', { groups });
    const second = getWorkspaceGraph(fs, '/cache-c', { groups, defaultRank: 9 });
    expect(second).not.toBe(first);
  });

  it('resetWorkspaceGraphCache forces the next call to rebuild', () => {
    const fs = treeWithOnePackage('/cache-d', 'a');
    const options: WorkspaceArchitectureOptions = { groups };
    const first = getWorkspaceGraph(fs, '/cache-d', options);
    resetWorkspaceGraphCache();
    const second = getWorkspaceGraph(fs, '/cache-d', options);
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});

describe('manifestRelativeDir', () => {
  it('gives the forward-slash-joined directory, relative to root, that the manifest file sits in', () => {
    const fs = fakeFs({}, {});
    expect(manifestRelativeDir(fs, '/root', join('/root', 'core/kv/package.json'))).toBe('core/kv');
  });

  it('gives an empty string for a manifest that sits directly at the workspace root', () => {
    const fs = fakeFs({}, {});
    expect(manifestRelativeDir(fs, '/root', join('/root', 'package.json'))).toBe('');
  });

  it('resolves a relative filename against the current working directory first, the same way resolveWorkspaceRoot does', () => {
    // A rule's own context.filename is always an absolute path in a real lint run, but this still confirms the function's own contract rather than trusting it: relative() alone, given two paths that are not both already absolute, would compute something neither caller here intends.
    const fs = fakeFs({}, {});
    expect(manifestRelativeDir(fs, FIXTURE_ROOT, join(FIXTURE_ROOT, 'targets/store-cli/package.json'))).toBe('targets/store-cli');
  });

  it('resolves root and the manifest directory through realpath before comparing, so a symlinked spelling of either still yields the real relative directory', () => {
    // "/root" is the explicit "root" option's own (canonical) spelling; the manifest is reached through "/tmp-link", a different lexical path that resolves to the identical real directory tree (macOS's own /tmp -> /private/tmp being the recurring real case). A purely lexical relative() between "/root" and "/tmp-link/core/kv" would compute something nowhere near "core/kv".
    const fs = fakeFs({}, {}, { '/tmp-link/core/kv': '/root/core/kv' });
    expect(manifestRelativeDir(fs, '/root', join('/tmp-link', 'core/kv/package.json'))).toBe('core/kv');
  });

  it('still resolves correctly when it is the root option, not the filename, that carries the symlinked spelling', () => {
    const fs = fakeFs({}, {}, { '/tmp-link': '/root' });
    expect(manifestRelativeDir(fs, '/tmp-link', join('/root', 'core/kv/package.json'))).toBe('core/kv');
  });

  it('a manifest genuinely outside root, not merely a differently-spelled symlink of it, still resolves to a real ".." relative path rather than being masked by realpath resolution', () => {
    const fs = fakeFs({}, {});
    expect(manifestRelativeDir(fs, '/root/core', join('/root', 'other/package.json'))).toBe('../other');
  });
});

describe('loadWorkspaceGraph', () => {
  it('resolves the root from the real filesystem and loads the real fixture tree', () => {
    resetWorkspaceGraphCache();
    const groups: readonly GroupSpec[] = [
      { name: 'core', rank: 0 },
      { name: 'features', rank: 1 },
      { name: 'product', rank: 2 },
      { name: 'targets', rank: 3 },
      { name: 'test', rank: 4 },
    ];
    const filename = join(FIXTURE_ROOT, 'core/kv/kv-contract/package.json');
    const graph = loadWorkspaceGraph(filename, { groups });
    expect(graph.root).toBe(FIXTURE_ROOT);
    expect(graph.packagesByName.has('kv-contract')).toBe(true);
  });
});
