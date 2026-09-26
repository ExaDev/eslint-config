import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createNoDependencyCycleRule } from './no-dependency-cycle';
import type { WorkspaceGraph, WorkspacePackageInfo } from './workspace-graph';

function pkg(name: string): WorkspacePackageInfo {
  return { name, relativeDir: `unused/${name}`, group: 'core', rank: 0, slice: undefined };
}

// a -> b -> c, no cycle; cyclic-a <-> cyclic-b, a genuine cycle; solo depends on nothing and nothing depends on it. c also edges to "ghost-consumer" and zod edges to "a": neither "ghost-consumer" nor "zod" is a real workspace member (absent from packagesByName), a shape buildWorkspaceGraph itself never produces (it only ever records edges to real members), but deliberately fabricated here so this rule's own "is this manifest, or this dependency, a real workspace member at all" guards can each be proven load-bearing in isolation, independent of whether the graph that reaches them was built correctly.
const FIXED_GRAPH: WorkspaceGraph = {
  root: '/fixture',
  packagesByName: new Map(['a', 'b', 'c', 'cyclic-a', 'cyclic-b', 'solo'].map((name) => [name, pkg(name)])),
  dependencyNamesByName: new Map([
    ['a', ['b']],
    ['b', ['c']],
    ['c', ['ghost-consumer']],
    ['cyclic-a', ['cyclic-b']],
    ['cyclic-b', ['cyclic-a']],
    ['solo', []],
    ['zod', ['a']],
  ]),
};

const rule = createNoDependencyCycleRule(() => FIXED_GRAPH);
const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

function manifest(name: string, dependencies: Readonly<Record<string, string>> = {}): string {
  return JSON.stringify({ name, dependencies }, null, 2);
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
      '"{{from}}" depends on "{{to}}", which depends back on "{{from}}": a workspace cycle. Move the shared code into a package both can depend on, or invert one edge behind a contract.',
    );
  });
});

ruleTester.run('no-dependency-cycle', rule, {
  valid: [
    { code: manifest('a', { b: 'workspace:*' }), options: [{ groups: [{ name: 'core' }] }] },
    { code: manifest('b', { c: 'workspace:*' }), options: [{ groups: [{ name: 'core' }] }] },
    { code: manifest('solo'), options: [{ groups: [{ name: 'core' }] }] },
    // A manifest whose own declared name is not a workspace member at all is skipped entirely: even though "a" (a real dependency) can, via a->b->c->ghost-consumer, actually reach "ghost-consumer" in this fixture's own edges, that path is never checked, since "ghost-consumer" itself is never a legitimate subject for a cycle check.
    { code: manifest('ghost-consumer', { a: 'workspace:*' }), options: [{ groups: [{ name: 'core' }] }] },
    // A dependency name that is itself not a workspace member is ignored (never fed to dependencyPathExists): even though "zod" itself, in this fixture's own edges, edges straight back to "a", that path is never checked, since "zod" is never a legitimate dependency to walk from.
    { code: manifest('a', { zod: '^3' }), options: [{ groups: [{ name: 'core' }] }] },
    // A manifest with no "name" field at all is skipped.
    { code: JSON.stringify({ dependencies: { a: 'workspace:*' } }), options: [{ groups: [{ name: 'core' }] }] },
    // A nested (non-top-level) object that itself looks exactly like a self-contained manifest (its own real "name" and "dependencies") must never be analysed as if it were the file's own top-level manifest: only the Object visitor's own parent.type === 'Document' check stands between "the real top level" and "any nested object anywhere in the file". If bypassed, this nested object would be read as declaring "cyclic-a" depending on "cyclic-b", a genuine cycle, and wrongly reported.
    {
      code: JSON.stringify({ name: 'a', nested: { name: 'cyclic-a', dependencies: { 'cyclic-b': 'workspace:*' } } }),
      options: [{ groups: [{ name: 'core' }] }],
    },
  ],
  invalid: [
    {
      code: manifest('cyclic-a', { 'cyclic-b': 'workspace:*' }),
      options: [{ groups: [{ name: 'core' }] }],
      errors: [{ messageId: 'cycle', data: { from: 'cyclic-a', to: 'cyclic-b' } }],
    },
    {
      code: manifest('cyclic-b', { 'cyclic-a': 'workspace:*' }),
      options: [{ groups: [{ name: 'core' }] }],
      errors: [{ messageId: 'cycle', data: { from: 'cyclic-b', to: 'cyclic-a' } }],
    },
    // Reading a non-default dependency field.
    {
      code: JSON.stringify({ name: 'cyclic-a', devDependencies: { 'cyclic-b': 'workspace:*' } }, null, 2),
      options: [{ groups: [{ name: 'core' }], dependencyFields: ['devDependencies'] }],
      errors: [{ messageId: 'cycle' }],
    },
  ],
});
