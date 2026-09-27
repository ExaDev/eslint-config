import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createNoDependencyCycleRule } from './no-dependency-cycle';
import type { WorkspaceGraph, WorkspacePackageInfo } from './workspace-graph';
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

function pkg(name: string): WorkspacePackageInfo {
  return { name, relativeDir: `unused/${name}`, group: 'core', rank: 0, slice: undefined };
}

// A workspace package with no declared "name" at all (pnpm allows this): keyed by its own relativeDir, exactly as buildWorkspaceGraph's own collectCandidates does for a real one (workspace-graph.ts), so the cycle its dependency on "cyclic-a" completes below is still checked rather than silently skipped.
const NAMELESS_RELATIVE_DIR = 'core/nameless';

// a -> b -> c, no cycle; cyclic-a <-> cyclic-b, a genuine cycle; solo depends on nothing and nothing depends on it. c also edges to "ghost-consumer" and zod edges to "a": neither "ghost-consumer" nor "zod" is a real workspace member (absent from packagesByName), a shape buildWorkspaceGraph itself never produces (it only ever records edges to real members), but deliberately fabricated here so this rule's own "is this manifest, or this dependency, a real workspace member at all" guards can each be proven load-bearing in isolation, independent of whether the graph that reaches them was built correctly.
const FIXED_GRAPH: WorkspaceGraph = {
  root: '/fixture',
  packagesByName: new Map([
    ...['a', 'b', 'c', 'cyclic-a', 'cyclic-b', 'solo'].map((name): readonly [string, WorkspacePackageInfo] => [name, pkg(name)]),
    [NAMELESS_RELATIVE_DIR, { name: NAMELESS_RELATIVE_DIR, relativeDir: NAMELESS_RELATIVE_DIR, group: 'core', rank: 0, slice: undefined }],
  ]),
  dependencyNamesByName: new Map([
    // "a" already depends on the nameless package below (fabricated graph metadata, independent of any test's own linted JSON): the nameless package's own manifest, in the invalid case below, then declares a dependency back on "a", completing a cycle only through this pre-existing edge.
    ['a', ['b', NAMELESS_RELATIVE_DIR]],
    ['b', ['c']],
    ['c', ['ghost-consumer']],
    ['cyclic-a', ['cyclic-b']],
    ['cyclic-b', ['cyclic-a']],
    ['solo', []],
    ['zod', ['a']],
  ]),
};

const rule = createNoDependencyCycleRule({ loadGraph: () => FIXED_GRAPH, fs: identityFs });
const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

function manifest(name: string, dependencies: Readonly<Record<string, string>> = {}): string {
  return JSON.stringify({ name, dependencies }, null, 2);
}

// The manifest path buildWorkspaceGraph would have resolved this same package FROM, matching each pkg() entry's own `relativeDir` above: every test case below identifies "self" by declared name, and the rule now also confirms context.filename's own directory is that same graph entry's relativeDir (see manifestRelativeDir, workspace-graph.ts), so a realistic filename is required for the rule to ever reach its reporting logic at all.
function selfFilename(name: string): string {
  return `${FIXED_GRAPH.root}/unused/${name}/package.json`;
}

describe('createNoDependencyCycleRule meta', () => {
  it('declares its own single message id', () => {
    expect(Object.keys(rule.meta?.messages ?? {})).toEqual(['cycle']);
  });

  it('carries the exact docs/languages content the rule is documented to have', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: createNoDependencyCycleRule always defines its own meta object literal.');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Disallow a cyclic workspace dependency.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-dependency-cycle.ts');
    expect(meta.messages?.cycle).toBe(
      '"{{from}}" depends on "{{to}}", which can reach back to "{{from}}": a workspace cycle. Move the shared code into a package both can depend on, or invert one edge behind a contract.',
    );
  });
});

ruleTester.run('no-dependency-cycle', rule, {
  valid: [
    { code: manifest('a', { b: 'workspace:*' }), filename: selfFilename('a'), options: [{ groups: [{ name: 'core' }] }] },
    { code: manifest('b', { c: 'workspace:*' }), filename: selfFilename('b'), options: [{ groups: [{ name: 'core' }] }] },
    { code: manifest('solo'), filename: selfFilename('solo'), options: [{ groups: [{ name: 'core' }] }] },
    // A manifest whose own declared name is not a workspace member at all is skipped entirely: even though "a" (a real dependency) can, via a->b->c->ghost-consumer, actually reach "ghost-consumer" in this fixture's own edges, that path is never checked, since "ghost-consumer" itself is never a legitimate subject for a cycle check.
    { code: manifest('ghost-consumer', { a: 'workspace:*' }), options: [{ groups: [{ name: 'core' }] }] },
    // A dependency name that is itself not a workspace member is ignored (never fed to dependencyPathExists): even though "zod" itself, in this fixture's own edges, edges straight back to "a", that path is never checked, since "zod" is never a legitimate dependency to walk from.
    { code: manifest('a', { zod: '^3' }), filename: selfFilename('a'), options: [{ groups: [{ name: 'core' }] }] },
    // A manifest with no "name" field at all, linted from a file whose own directory is not a known package directory either (the default RuleTester filename resolves nowhere near "/fixture"): neither a declared name nor a directory fallback identifies it in the graph, so it is skipped.
    { code: JSON.stringify({ dependencies: { a: 'workspace:*' } }), options: [{ groups: [{ name: 'core' }] }] },
    // A nested (non-top-level) object that itself looks exactly like a self-contained manifest (its own real "name" and "dependencies") must never be analysed as if it were the file's own top-level manifest: only the Object visitor's own parent.type === 'Document' check stands between "the real top level" and "any nested object anywhere in the file". If bypassed, this nested object would be read as declaring "cyclic-a" depending on "cyclic-b", a genuine cycle, and wrongly reported.
    {
      code: JSON.stringify({ name: 'a', nested: { name: 'cyclic-a', dependencies: { 'cyclic-b': 'workspace:*' } } }),
      filename: selfFilename('a'),
      options: [{ groups: [{ name: 'core' }] }],
    },
    // A manifest declaring a real graph member's name, but linted from a DIFFERENT directory than that member's own relativeDir (a stale or duplicated copy sitting elsewhere), is skipped rather than double-reporting the same real cycle once per copy.
    {
      code: manifest('cyclic-a', { 'cyclic-b': 'workspace:*' }),
      filename: `${FIXED_GRAPH.root}/dist/cyclic-a/package.json`,
      options: [{ groups: [{ name: 'core' }] }],
    },
    // A NESTED object with no "name" of its own must never be analysed as if it were the file's own top-level manifest either, even though (unlike the "nested real-name" case above) its relativeDir-fallback identity resolves to the exact SAME graph entry as the genuine top-level manifest, since relativeDir is derived purely from context.filename, never from which node within the file is being visited. The linted package here (NAMELESS_RELATIVE_DIR) declares no top-level "dependencies" at all, only a nested object that does; if the top-level parent.type === 'Document' guard were ever bypassed, that nested object's own dependency on "a" (which the fabricated graph already records as depending back on this same nameless package) would be wrongly checked and reported as a genuine cycle.
    {
      code: JSON.stringify({ nested: { dependencies: { a: 'workspace:*' } } }),
      filename: `${FIXED_GRAPH.root}/${NAMELESS_RELATIVE_DIR}/package.json`,
      options: [{ groups: [{ name: 'core' }] }],
    },
  ],
  invalid: [
    {
      code: manifest('cyclic-a', { 'cyclic-b': 'workspace:*' }),
      filename: selfFilename('cyclic-a'),
      options: [{ groups: [{ name: 'core' }] }],
      errors: [{ messageId: 'cycle', data: { from: 'cyclic-a', to: 'cyclic-b' } }],
    },
    {
      code: manifest('cyclic-b', { 'cyclic-a': 'workspace:*' }),
      filename: selfFilename('cyclic-b'),
      options: [{ groups: [{ name: 'core' }] }],
      errors: [{ messageId: 'cycle', data: { from: 'cyclic-b', to: 'cyclic-a' } }],
    },
    // Reading a non-default dependency field.
    {
      code: JSON.stringify({ name: 'cyclic-a', devDependencies: { 'cyclic-b': 'workspace:*' } }, null, 2),
      filename: selfFilename('cyclic-a'),
      options: [{ groups: [{ name: 'core' }], dependencyFields: ['devDependencies'] }],
      errors: [{ messageId: 'cycle' }],
    },
    // A workspace package with no declared "name" at all, keyed in the graph by its own relativeDir: its own declared dependency on "a" (which the fabricated graph already records as depending on this same nameless package) completes a real cycle, proving it is no longer dropped from the graph without a word.
    {
      code: JSON.stringify({ dependencies: { a: 'workspace:*' } }),
      filename: `${FIXED_GRAPH.root}/${NAMELESS_RELATIVE_DIR}/package.json`,
      options: [{ groups: [{ name: 'core' }] }],
      errors: [{ messageId: 'cycle', data: { from: NAMELESS_RELATIVE_DIR, to: 'a' } }],
    },
    // An INDIRECT cycle: "c" here declares a dependency on "a", and the fixture's own edges (a -> b -> c) mean "a" reaches back to "c" only through "b", never directly, so the message must not claim a direct back-edge from "a" to "c".
    {
      code: manifest('c', { a: 'workspace:*' }),
      filename: selfFilename('c'),
      options: [{ groups: [{ name: 'core' }] }],
      errors: [{ messageId: 'cycle', data: { from: 'c', to: 'a' } }],
    },
  ],
});
