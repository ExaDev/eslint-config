import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createDevDependencyOnlyRule, RUNTIME_DEPENDENCY_FIELDS } from './dev-dependency-only';
import type { WorkspaceFs } from './workspace-fs';
import type { WorkspaceGraph, WorkspacePackageInfo } from './workspace-graph';

const identityFs: WorkspaceFs = {
  existsSync: () => {
    throw new Error('not used: this rule only resolves realpaths.');
  },
  readFileSync: () => {
    throw new Error('not used: this rule only resolves realpaths.');
  },
  readdirSync: () => {
    throw new Error('not used: this rule only resolves realpaths.');
  },
  realpathSync: (path) => path,
};

function pkg(name: string, group: string): WorkspacePackageInfo {
  return { name, relativeDir: `unused/${name}`, group, rank: 0, slice: undefined };
}

const GRAPH: WorkspaceGraph = {
  root: '/fixture',
  packagesByName: new Map([pkg('feature', 'core'), pkg('shared-testkit', 'test'), pkg('orders-testkit', 'core'), pkg('test-database', 'test'), pkg('kv-contract', 'core')].map((entry) => [entry.name, entry])),
  dependencyNamesByName: new Map(),
};

const rule = createDevDependencyOnlyRule({ loadGraph: () => GRAPH, fs: identityFs });
const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

const GROUPS = [{ name: 'core' }, { name: 'test' }];
const DEV_ONLY = ['-testkit$', { group: 'test' }];

function filenameOf(name: string): string {
  return `/fixture/unused/${name}/package.json`;
}

function manifest(fields: Readonly<Record<string, Readonly<Record<string, string>>>>): string {
  return JSON.stringify({ name: 'feature', ...fields }, null, 2);
}

describe('createDevDependencyOnlyRule meta', () => {
  it('carries the documented languages, docs and message', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: createDevDependencyOnlyRule always defines its own meta object literal.');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Disallow a workspace package from listing a dev-only package anywhere except devDependencies.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/dev-dependency-only.ts');
    expect(meta.messages).toEqual({
      devOnly: '"{{self}}" lists "{{dependency}}" under "{{field}}", but "{{dependency}}" is dev-only and may appear only under "devDependencies".',
    });
  });

  it('forbids exactly the three runtime dependency fields', () => {
    expect([...RUNTIME_DEPENDENCY_FIELDS]).toEqual(['dependencies', 'peerDependencies', 'optionalDependencies']);
  });
});

ruleTester.run('dev-dependency-only', rule, {
  valid: [
    // devDependencies is the permitted place, for a name-matched and a group-matched package alike.
    { code: manifest({ devDependencies: { 'shared-testkit': '*', 'orders-testkit': '*' } }), filename: filenameOf('feature'), options: [{ groups: GROUPS, devOnly: DEV_ONLY }] },
    // A package the selectors do not match may appear anywhere.
    { code: manifest({ dependencies: { 'kv-contract': '*' } }), filename: filenameOf('feature'), options: [{ groups: GROUPS, devOnly: DEV_ONLY }] },
    // A third-party package that merely matches the name pattern is not a workspace member and is not restricted.
    { code: manifest({ dependencies: { 'third-party-testkit': '*' } }), filename: filenameOf('feature'), options: [{ groups: GROUPS, devOnly: DEV_ONLY }] },
    // A field that is not a dependency field is not read.
    { code: JSON.stringify({ name: 'feature', resolutions: { 'shared-testkit': '*' } }), filename: filenameOf('feature'), options: [{ groups: GROUPS, devOnly: DEV_ONLY }] },
    // No option, no rule.
    { code: manifest({ dependencies: { 'shared-testkit': '*' } }), filename: filenameOf('feature'), options: [{ groups: GROUPS }] },
    // A manifest that is not a graph member is skipped.
    { code: manifest({ dependencies: { 'shared-testkit': '*' } }), filename: '/fixture/dist/feature/package.json', options: [{ groups: GROUPS, devOnly: DEV_ONLY }] },
    // A nested object is not the manifest, even when it names the same package.
    {
      code: JSON.stringify({ name: 'feature', nested: { name: 'feature', dependencies: { 'shared-testkit': '*' } } }),
      filename: filenameOf('feature'),
      options: [{ groups: GROUPS, devOnly: DEV_ONLY }],
    },
    // dependencyFields narrows the rank checks only: it neither widens nor narrows this rule, which still allows devDependencies when only that is read.
    { code: manifest({ devDependencies: { 'shared-testkit': '*' } }), filename: filenameOf('feature'), options: [{ groups: GROUPS, dependencyFields: ['devDependencies'], devOnly: DEV_ONLY }] },
  ],
  invalid: [
    // Each runtime field is caught, at the offending key, naming the field.
    {
      code: manifest({ dependencies: { 'shared-testkit': '*' } }),
      filename: filenameOf('feature'),
      options: [{ groups: GROUPS, devOnly: DEV_ONLY }],
      errors: [{ messageId: 'devOnly', line: 4, column: 5, data: { self: 'feature', dependency: 'shared-testkit', field: 'dependencies' } }],
    },
    {
      code: manifest({ peerDependencies: { 'orders-testkit': '*' } }),
      filename: filenameOf('feature'),
      options: [{ groups: GROUPS, devOnly: DEV_ONLY }],
      errors: [{ messageId: 'devOnly', data: { self: 'feature', dependency: 'orders-testkit', field: 'peerDependencies' } }],
    },
    {
      code: manifest({ optionalDependencies: { 'test-database': '*' } }),
      filename: filenameOf('feature'),
      options: [{ groups: GROUPS, devOnly: DEV_ONLY }],
      errors: [{ messageId: 'devOnly', data: { self: 'feature', dependency: 'test-database', field: 'optionalDependencies' } }],
    },
    // dependencyFields does not hide a forbidden field from this rule.
    {
      code: manifest({ dependencies: { 'shared-testkit': '*' } }),
      filename: filenameOf('feature'),
      options: [{ groups: GROUPS, dependencyFields: ['devDependencies'], devOnly: DEV_ONLY }],
      errors: [{ messageId: 'devOnly' }],
    },
    // A name in a permitted and a forbidden field is still reported for the forbidden one, once.
    {
      code: manifest({ dependencies: { 'shared-testkit': '*' }, devDependencies: { 'shared-testkit': '*' } }),
      filename: filenameOf('feature'),
      options: [{ groups: GROUPS, devOnly: DEV_ONLY }],
      errors: [{ messageId: 'devOnly', data: { self: 'feature', dependency: 'shared-testkit', field: 'dependencies' } }],
    },
    // Several offending entries are each reported.
    {
      code: manifest({ dependencies: { 'shared-testkit': '*', 'orders-testkit': '*' } }),
      filename: filenameOf('feature'),
      options: [{ groups: GROUPS, devOnly: DEV_ONLY }],
      errors: [{ messageId: 'devOnly' }, { messageId: 'devOnly' }],
    },
  ],
});
