import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createPackageNameMirrorsPathRule, findGroupSpec } from './package-name-mirrors-path';
import type { WorkspaceGraph, WorkspacePackageInfo } from './workspace-graph';
import type { GroupSpec } from './workspace-options';
import type { WorkspaceFs } from './workspace-fs';

function pkg(name: string, relativeDir: string, group: string): WorkspacePackageInfo {
  return { name, relativeDir, group, rank: 0, slice: undefined };
}

// A workspace package with no declared "name" at all (pnpm allows this): keyed by its own relativeDir, exactly as buildWorkspaceGraph's own collectCandidates does for a real one (workspace-graph.ts).
const NAMELESS_RELATIVE_DIR = 'core/nameless';

const FIXED_GRAPH: WorkspaceGraph = {
  root: '/fixture',
  packagesByName: new Map(
    [
      pkg('@acme/clock-contract', 'core/clock/contract', 'core'),
      pkg('clock-system', 'core/clock/system', 'core'),
      pkg('@acme/test-database', 'test/database', 'test'),
      pkg(NAMELESS_RELATIVE_DIR, NAMELESS_RELATIVE_DIR, 'core'),
    ].map((entry) => [entry.name, entry]),
  ),
  dependencyNamesByName: new Map(),
};

// FIXED_GRAPH's own root and every filename built from it (filenameFor below) are fabricated paths, never real directories: manifestRelativeDir's own realpath resolution (workspace-graph.ts) is exercised directly by its own unit tests, so this rule's tests only need a WorkspaceFs whose realpathSync passes every path through unchanged, the same as node:fs's own realpathSync would for a path with no symlink anywhere along it.
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

describe('findGroupSpec', () => {
  const groups: readonly GroupSpec[] = [{ name: 'core' }, { name: 'test', naming: 'keep-group' }];

  it('returns the matching group', () => {
    expect(findGroupSpec(groups, 'test')).toBe(groups[1]);
  });

  it('throws for a group name not present among the given groups, a shape no real call site (which only ever looks up a name the same options object\'s own graph just resolved) produces', () => {
    expect(() => findGroupSpec(groups, 'missing')).toThrow(/Unreachable/);
  });
});

const rule = createPackageNameMirrorsPathRule({ loadGraph: () => FIXED_GRAPH, fs: identityFs });
const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

const GROUPS_AND_NAMING = { groups: [{ name: 'core' }, { name: 'test', naming: 'keep-group' as const }], naming: { scope: '@acme' } };

describe('createPackageNameMirrorsPathRule meta', () => {
  it('declares its own two message ids', () => {
    expect(Object.keys(rule.meta?.messages ?? {}).sort()).toEqual(['mismatch', 'missingName']);
  });

  it('carries the exact docs/languages content the rule is documented to have', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: createPackageNameMirrorsPathRule always defines its own meta object literal.');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe("Require a workspace package to declare the name its path derives, under the configured naming scope/separator.");
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/package-name-mirrors-path.ts');
    expect(meta.messages?.mismatch).toBe('Package at "{{dir}}" declares "{{actual}}" but its path derives "{{expected}}".');
    expect(meta.messages?.missingName).toBe('Package at "{{dir}}" declares no name at all, but its path derives "{{expected}}".');
  });
});

// The manifest path buildWorkspaceGraph would have resolved this same package FROM, matching FIXED_GRAPH's own pkg() calls above: the rule now also confirms context.filename's own directory is the matched graph entry's relativeDir (see manifestRelativeDir, workspace-graph.ts), so a realistic filename is required for it to ever reach its reporting logic at all.
function filenameFor(relativeDir: string): string {
  return `${FIXED_GRAPH.root}/${relativeDir}/package.json`;
}

ruleTester.run('package-name-mirrors-path', rule, {
  valid: [
    // A correctly scoped, drop-group-derived name.
    { code: JSON.stringify({ name: '@acme/clock-contract' }), filename: filenameFor('core/clock/contract'), options: [GROUPS_AND_NAMING] },
    // A nested (non-top-level) object that itself looks exactly like a self-contained manifest (a real graph package's own declared name, mismatched) must never be analysed as if it were the file's own top-level manifest: only the Object visitor's own parent.type === 'Document' check stands between "the real top level" and "any nested object anywhere in the file". If bypassed, this nested object would be read as declaring "clock-system", whose expected name is "@acme/clock-system", and wrongly reported as a mismatch even though the top-level manifest itself is correctly named.
    {
      code: JSON.stringify({ name: '@acme/clock-contract', nested: { name: 'clock-system' } }),
      filename: filenameFor('core/clock/contract'),
      options: [GROUPS_AND_NAMING],
    },
    // A correctly scoped, keep-group-derived name.
    { code: JSON.stringify({ name: '@acme/test-database' }), filename: filenameFor('test/database'), options: [GROUPS_AND_NAMING] },
    // A manifest whose declared name is not a workspace member at all is skipped.
    { code: JSON.stringify({ name: 'not-a-workspace-package' }), options: [GROUPS_AND_NAMING] },
    // A manifest with no "name" field at all is skipped.
    { code: JSON.stringify({ version: '1.0.0' }), options: [GROUPS_AND_NAMING] },
    // Opt-in: with the shared "naming" option omitted entirely, the rule is a no-op even for a name that would otherwise mismatch.
    { code: JSON.stringify({ name: 'clock-system' }), filename: filenameFor('core/clock/system'), options: [{ groups: [{ name: 'core' }] }] },
    // A manifest declaring a real graph member's name, but linted from a DIFFERENT directory than that member's own relativeDir (a stale or duplicated copy sitting elsewhere), is skipped rather than checking the copy's OWN path against the real package's expected name.
    { code: JSON.stringify({ name: 'clock-system' }), filename: filenameFor('dist/clock-system'), options: [GROUPS_AND_NAMING] },
  ],
  invalid: [
    {
      code: JSON.stringify({ name: 'clock-system' }),
      filename: filenameFor('core/clock/system'),
      options: [GROUPS_AND_NAMING],
      errors: [{ messageId: 'mismatch', data: { dir: 'core/clock/system', actual: 'clock-system', expected: '@acme/clock-system' } }],
    },
    // A package that declares no "name" at all is reported too: it plainly cannot mirror its path when it names nothing.
    {
      code: JSON.stringify({ version: '1.0.0' }),
      filename: filenameFor(NAMELESS_RELATIVE_DIR),
      options: [GROUPS_AND_NAMING],
      errors: [{ messageId: 'missingName', data: { dir: NAMELESS_RELATIVE_DIR, expected: '@acme/nameless' } }],
    },
    // A NESTED object with no "name" of its own must never be analysed as if it were the file's own top-level manifest either, even though (unlike the "nested real-name" valid case above) its relativeDir-fallback identity resolves to the exact SAME graph entry as the genuine top-level manifest, since relativeDir is derived purely from context.filename, never from which node within the file is being visited: exactly ONE missingName violation is expected here, at the TOP-level object's own location, never two. If the top-level parent.type === 'Document' guard were ever bypassed, the nested object (also nameless, resolving to the identical graph entry) would be visited too and wrongly reported a second time.
    {
      code: JSON.stringify({ nested: { version: '1.0.0' } }),
      filename: filenameFor(NAMELESS_RELATIVE_DIR),
      options: [GROUPS_AND_NAMING],
      errors: [{ messageId: 'missingName', data: { dir: NAMELESS_RELATIVE_DIR, expected: '@acme/nameless' } }],
    },
  ],
});
