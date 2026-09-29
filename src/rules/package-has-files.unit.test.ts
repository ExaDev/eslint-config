import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createPackageHasFilesRule } from './package-has-files';
import type { WorkspaceFs } from './workspace-fs';
import type { WorkspaceGraph, WorkspacePackageInfo } from './workspace-graph';

// Every path here is fabricated: the tree maps each directory to its entries, and an entry is a directory exactly when the tree lists its own contents.
const TREE: Record<string, readonly string[]> = {
  '/fixture/packages/kv-contract': ['package.json', 'src'],
  '/fixture/packages/kv-contract/src': ['errors.ts', 'fake.ts', 'a.conformance.ts'],
  '/fixture/packages/order-contract': ['package.json', 'src'],
  '/fixture/packages/order-contract/src': ['errors.ts'],
  '/fixture/packages/plain': ['package.json'],
  '/fixture/packages/nameless': ['package.json'],
};

const fs: WorkspaceFs = {
  existsSync: (path) => path in TREE,
  readFileSync: () => {
    throw new Error('not used: this rule only lists directories.');
  },
  readdirSync: (path) => (TREE[path] ?? []).map((name) => ({ name, isDirectory: () => `${path}/${name}` in TREE })),
  realpathSync: (path) => path,
};

function pkg(name: string, dir: string, group: string): WorkspacePackageInfo {
  return { name, relativeDir: `packages/${dir}`, group, rank: 0, slice: undefined };
}

const NAMELESS: WorkspacePackageInfo = { name: 'packages/nameless', relativeDir: 'packages/nameless', group: 'core', rank: 0, slice: undefined };

const GRAPH: WorkspaceGraph = {
  root: '/fixture',
  packagesByName: new Map(
    [pkg('kv-contract', 'kv-contract', 'core'), pkg('order-contract', 'order-contract', 'core'), pkg('plain', 'plain', 'core'), NAMELESS].map((entry) => [entry.name, entry]),
  ),
  dependencyNamesByName: new Map(),
};

const rule = createPackageHasFilesRule({ loadGraph: () => GRAPH, fs });
const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

const GROUPS = [{ name: 'core' }];
const CONTRACT_FILES = [{ packages: '-contract$', files: ['src/errors.ts', 'src/fake.ts', 'src/**/*.conformance.ts'] }];

function filenameOf(dir: string): string {
  return `/fixture/packages/${dir}/package.json`;
}

describe('createPackageHasFilesRule meta', () => {
  it('carries the documented languages, docs and message', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: createPackageHasFilesRule always defines its own meta object literal.');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Require the configured files to exist in every workspace package the configured selector matches.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/package-has-files.ts');
    expect(meta.messages).toEqual({ missingFiles: 'Package "{{name}}" is missing required file(s): {{files}}.' });
  });
});

ruleTester.run('package-has-files', rule, {
  valid: [
    // Every required path exists, a glob included.
    { code: JSON.stringify({ name: 'kv-contract' }), filename: filenameOf('kv-contract'), options: [{ groups: GROUPS, requiredFiles: CONTRACT_FILES }] },
    // A package the selector does not match is not checked.
    { code: JSON.stringify({ name: 'plain' }), filename: filenameOf('plain'), options: [{ groups: GROUPS, requiredFiles: CONTRACT_FILES }] },
    // Without the option the rule is a no-op, however incomplete the package.
    { code: JSON.stringify({ name: 'order-contract' }), filename: filenameOf('order-contract'), options: [{ groups: GROUPS }] },
    // A manifest that is not a graph member (a stale copy elsewhere) is skipped.
    { code: JSON.stringify({ name: 'order-contract' }), filename: '/fixture/dist/order-contract/package.json', options: [{ groups: GROUPS, requiredFiles: CONTRACT_FILES }] },
    // A nested object is not the manifest, even when its name resolves to the same package: the real top level declares no name, which the name pattern cannot match, while the nested one declares the package's graph key and would.
    {
      code: JSON.stringify({ nested: { name: 'packages/nameless' } }),
      filename: filenameOf('nameless'),
      options: [{ groups: GROUPS, requiredFiles: [{ packages: '.*', files: ['README.md'] }] }],
    },
    // A name pattern never matches a package that declares no name.
    { code: JSON.stringify({ version: '1.0.0' }), filename: filenameOf('nameless'), options: [{ groups: GROUPS, requiredFiles: [{ packages: '.*', files: ['README.md'] }] }] },
    // A group selector reaches a package whose declared name would not match.
    { code: JSON.stringify({ name: 'kv-contract' }), filename: filenameOf('kv-contract'), options: [{ groups: GROUPS, requiredFiles: [{ packages: { group: 'core' }, files: ['src/errors.ts'] }] }] },
  ],
  invalid: [
    // Missing files are listed in declaration order, on the manifest.
    {
      code: JSON.stringify({ name: 'order-contract' }, null, 2),
      filename: filenameOf('order-contract'),
      options: [{ groups: GROUPS, requiredFiles: CONTRACT_FILES }],
      errors: [{ messageId: 'missingFiles', line: 1, data: { name: 'order-contract', files: 'src/fake.ts, src/**/*.conformance.ts' } }],
    },
    // A nameless package is matched by group only, and reported under its directory key.
    {
      code: JSON.stringify({ version: '1.0.0' }),
      filename: filenameOf('nameless'),
      options: [{ groups: GROUPS, requiredFiles: [{ packages: { group: 'core' }, files: ['README.md'] }] }],
      errors: [{ messageId: 'missingFiles', data: { name: 'packages/nameless', files: 'README.md' } }],
    },
    // One diagnostic per package even when several requirements each miss something.
    {
      code: JSON.stringify({ name: 'order-contract' }),
      filename: filenameOf('order-contract'),
      options: [
        {
          groups: GROUPS,
          requiredFiles: [
            { packages: { group: 'core' }, files: ['a.txt'] },
            { packages: 'order', files: ['b.txt'] },
          ],
        },
      ],
      errors: [{ messageId: 'missingFiles', data: { name: 'order-contract', files: 'a.txt, b.txt' } }],
    },
  ],
});
