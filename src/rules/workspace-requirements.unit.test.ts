import { describe, expect, it } from 'vitest';
import { checkScripts, missingRequiredFiles } from './workspace-requirements';
import type { WorkspaceFs } from './workspace-fs';

function treeFs(tree: Record<string, readonly string[]>): WorkspaceFs {
  return {
    existsSync: (path) => path in tree,
    readFileSync: () => {
      throw new Error('not used in these tests');
    },
    readdirSync: (path) => (tree[path] ?? []).map((name) => ({ name, isDirectory: () => `${path}/${name}` in tree })),
    realpathSync: () => {
      throw new Error('not used in these tests');
    },
  };
}

describe('missingRequiredFiles', () => {
  const fs = treeFs({
    '/kv-contract': ['src'],
    '/kv-contract/src': ['errors.ts', 'a.conformance.ts'],
    '/other': ['src'],
    '/other/src': [],
  });
  const target = { group: 'core', name: 'kv-contract' };
  const requirements = [{ packages: '-contract$', files: ['src/errors.ts', 'src/fake.ts', 'src/**/*.conformance.ts'] }];

  it('lists only the required paths that do not exist, in declaration order', () => {
    expect(missingRequiredFiles(fs, '/kv-contract', requirements, target)).toEqual(['src/fake.ts']);
    expect(missingRequiredFiles(fs, '/other', requirements, target)).toEqual(['src/errors.ts', 'src/fake.ts', 'src/**/*.conformance.ts']);
  });

  it('lists nothing when everything exists', () => {
    expect(missingRequiredFiles(fs, '/kv-contract', [{ packages: '-contract$', files: ['src/errors.ts'] }], target)).toEqual([]);
  });

  it('ignores requirements whose selector does not match the package', () => {
    expect(missingRequiredFiles(fs, '/other', requirements, { group: 'core', name: 'plain' })).toEqual([]);
    expect(missingRequiredFiles(fs, '/other', [{ packages: { group: 'test' }, files: ['x'] }], target)).toEqual([]);
  });

  it('merges several matching requirements and lists a shared path once', () => {
    const several = [
      { packages: { group: 'core' }, files: ['src/fake.ts', 'a'] },
      { packages: '-contract$', files: ['src/fake.ts', 'b'] },
    ];
    expect(missingRequiredFiles(fs, '/other', several, target)).toEqual(['src/fake.ts', 'a', 'b']);
  });

  it('lists nothing for an empty requirement list', () => {
    expect(missingRequiredFiles(fs, '/other', [], target)).toEqual([]);
  });
});

describe('checkScripts', () => {
  const target = { group: 'features', name: 'orders-schema' };
  const scripts = (entries: Readonly<Record<string, string | undefined>>) => new Map(Object.entries(entries));
  const featuresOnly = (list: readonly (string | Readonly<{ name: string; equals?: string; includes?: readonly string[]; excludes?: readonly string[] }>)[]) => [
    { match: { group: 'features' }, scripts: list },
  ];

  it('reports missing scripts once each, in declaration order, across matching requirements', () => {
    const requirements = [
      { match: { group: 'features' }, scripts: ['typecheck', 'test'] },
      { match: '-schema$', scripts: ['generate', 'test'] },
    ];
    expect(checkScripts(scripts({ test: 'vitest' }), requirements, target)).toEqual({ missing: ['typecheck', 'generate'], problems: [] });
  });

  it('reports nothing when every required script exists, whatever its value', () => {
    expect(checkScripts(scripts({ typecheck: '', test: undefined }), featuresOnly(['typecheck', 'test']), target)).toEqual({ missing: [], problems: [] });
  });

  it('ignores requirements whose selector does not match', () => {
    expect(checkScripts(scripts({}), [{ match: { group: 'core' }, scripts: ['typecheck'] }], target)).toEqual({ missing: [], problems: [] });
  });

  it('reports a command that differs from the required exact command', () => {
    const result = checkScripts(scripts({ boundaries: 'turbo boundaries --x' }), featuresOnly([{ name: 'boundaries', equals: 'turbo boundaries' }]), target);
    expect(result.problems).toEqual([{ script: 'boundaries', kind: 'notEqual', expected: 'turbo boundaries', actual: 'turbo boundaries --x' }]);
  });

  it('accepts a command equal to the required one, including an empty one', () => {
    expect(checkScripts(scripts({ boundaries: 'turbo boundaries' }), featuresOnly([{ name: 'boundaries', equals: 'turbo boundaries' }]), target).problems).toEqual([]);
    expect(checkScripts(scripts({ noop: '' }), featuresOnly([{ name: 'noop', equals: '' }]), target).problems).toEqual([]);
  });

  it('treats a non-string script value as an empty command for content checks', () => {
    const result = checkScripts(scripts({ lint: undefined }), featuresOnly([{ name: 'lint', includes: ['--max-warnings 0'] }]), target);
    expect(result.problems).toEqual([{ script: 'lint', kind: 'missingFlag', expected: '--max-warnings 0', actual: '' }]);
  });

  it('requires included flags as token runs, however the command is chained or spelled', () => {
    const requirement = featuresOnly([{ name: 'lint', includes: ['--max-warnings 0'] }]);
    expect(checkScripts(scripts({ lint: 'eslint . --max-warnings 0' }), requirement, target).problems).toEqual([]);
    expect(checkScripts(scripts({ lint: 'eslint . --max-warnings=0' }), requirement, target).problems).toEqual([]);
    expect(checkScripts(scripts({ lint: 'tsc && eslint --max-warnings 0 .' }), requirement, target).problems).toEqual([]);
    expect(checkScripts(scripts({ lint: 'eslint . --max-warnings 10' }), requirement, target).problems).toEqual([
      { script: 'lint', kind: 'missingFlag', expected: '--max-warnings 0', actual: 'eslint . --max-warnings 10' },
    ]);
  });

  it('reports every missing included flag, and only those', () => {
    const result = checkScripts(scripts({ lint: 'eslint --a' }), featuresOnly([{ name: 'lint', includes: ['--a', '--b', '--c'] }]), target);
    expect(result.problems.map((problem) => problem.expected)).toEqual(['--b', '--c']);
  });

  it('forbids excluded flags as whole tokens', () => {
    const requirement = featuresOnly([{ name: 'test', excludes: ['--passWithNoTests'] }]);
    expect(checkScripts(scripts({ test: 'vitest run' }), requirement, target).problems).toEqual([]);
    expect(checkScripts(scripts({ test: 'vitest run --passWithNoTestsFoo' }), requirement, target).problems).toEqual([]);
    expect(checkScripts(scripts({ test: 'vitest run --passWithNoTests' }), requirement, target).problems).toEqual([
      { script: 'test', kind: 'forbiddenFlag', expected: '--passWithNoTests', actual: 'vitest run --passWithNoTests' },
    ]);
  });

  it('reports each kind of content problem for one script together, equals first, then includes, then excludes', () => {
    const result = checkScripts(scripts({ s: 'x --bad' }), featuresOnly([{ name: 's', equals: 'y', includes: ['--good'], excludes: ['--bad'] }]), target);
    expect(result.problems.map((problem) => problem.kind)).toEqual(['notEqual', 'missingFlag', 'forbiddenFlag']);
  });

  it('does not check the content of a script that is missing', () => {
    const result = checkScripts(scripts({}), featuresOnly([{ name: 's', equals: 'y', includes: ['--good'] }]), target);
    expect(result).toEqual({ missing: ['s'], problems: [] });
  });

  it('checks a string requirement for presence only', () => {
    expect(checkScripts(scripts({ s: 'anything' }), featuresOnly(['s']), target).problems).toEqual([]);
  });
});
