import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createNoDependencyCycleRule } from './no-dependency-cycle';
import type { WorkspaceGraph, WorkspacePackageInfo } from './workspace-graph';

function pkg(name: string): WorkspacePackageInfo {
  return { name, relativeDir: `unused/${name}`, group: 'core', rank: 0, slice: undefined };
}

// a -> b -> c, no cycle; cyclic-a <-> cyclic-b, a genuine cycle; solo depends on nothing and nothing depends on it.
const FIXED_GRAPH: WorkspaceGraph = {
  root: '/fixture',
  packagesByName: new Map(['a', 'b', 'c', 'cyclic-a', 'cyclic-b', 'solo'].map((name) => [name, pkg(name)])),
  dependencyNamesByName: new Map([
    ['a', ['b']],
    ['b', ['c']],
    ['c', []],
    ['cyclic-a', ['cyclic-b']],
    ['cyclic-b', ['cyclic-a']],
    ['solo', []],
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
});

ruleTester.run('no-dependency-cycle', rule, {
  valid: [
    { code: manifest('a', { b: 'workspace:*' }), options: [{ groups: [{ name: 'core' }] }] },
    { code: manifest('b', { c: 'workspace:*' }), options: [{ groups: [{ name: 'core' }] }] },
    { code: manifest('solo'), options: [{ groups: [{ name: 'core' }] }] },
    // A manifest whose own declared name is not a workspace member at all is skipped entirely.
    { code: manifest('not-a-workspace-package', { a: 'workspace:*' }), options: [{ groups: [{ name: 'core' }] }] },
    // A dependency name that is itself not a workspace member is ignored (never fed to dependencyPathExists).
    { code: manifest('a', { zod: '^3' }), options: [{ groups: [{ name: 'core' }] }] },
    // A manifest with no "name" field at all is skipped.
    { code: JSON.stringify({ dependencies: { a: 'workspace:*' } }), options: [{ groups: [{ name: 'core' }] }] },
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
