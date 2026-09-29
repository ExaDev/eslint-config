import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import { listTurboPackages, workspaceMemberDirs } from './turbo-workspace';

const PNPM_REPO = createMemoryFs({
  '/repo/package.json': '{"name": "root", "scripts": {"build": "turbo run _build", "count": 1}}',
  '/repo/pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n  - '!packages/skip'\n",
  '/repo/packages/a/package.json': '{"name": "@s/a", "scripts": {"_build": "tsc"}}',
  '/repo/packages/b/package.json': '{"scripts": {"_test": "vitest"}}',
  '/repo/packages/skip/package.json': '{"name": "skip"}',
  '/repo/packages/empty/README.md': '',
});

describe('workspaceMemberDirs', () => {
  it('reads the members from pnpm-workspace.yaml, skipping excludes and directories without a manifest', () => {
    expect(workspaceMemberDirs(PNPM_REPO, '/repo', undefined)).toEqual(['packages/a', 'packages/b']);
  });

  it('prefers the packages option to every file', () => {
    expect(workspaceMemberDirs(PNPM_REPO, '/repo', ['packages/a'])).toEqual(['packages/a']);
  });

  it('never counts the root as a member', () => {
    expect(workspaceMemberDirs(PNPM_REPO, '/repo', ['.', 'packages/a'])).toEqual(['packages/a']);
  });

  it('reads the workspaces list of package.json when there is no pnpm-workspace.yaml', () => {
    const fs = createMemoryFs({ '/r/package.json': '{"workspaces": ["apps/*"]}', '/r/apps/x/package.json': '{}' });
    expect(workspaceMemberDirs(fs, '/r', undefined)).toEqual(['apps/x']);
  });

  it('reads the packages list of an object-form workspaces field', () => {
    const fs = createMemoryFs({ '/r/package.json': '{"workspaces": {"packages": ["apps/*"]}}', '/r/apps/x/package.json': '{}' });
    expect(workspaceMemberDirs(fs, '/r', undefined)).toEqual(['apps/x']);
  });

  it('ignores non-string workspace entries and a workspaces field of another shape', () => {
    const list = createMemoryFs({ '/r/package.json': '{"workspaces": ["apps/*", 1]}', '/r/apps/x/package.json': '{}' });
    expect(workspaceMemberDirs(list, '/r', undefined)).toEqual(['apps/x']);
    const scalar = createMemoryFs({ '/r/package.json': '{"workspaces": "apps/*"}', '/r/apps/x/package.json': '{}' });
    expect(workspaceMemberDirs(scalar, '/r', undefined)).toEqual([]);
  });

  it('has no members for a single-package repository', () => {
    expect(workspaceMemberDirs(createMemoryFs({ '/r/package.json': '{}' }), '/r', undefined)).toEqual([]);
  });

  it('has no members for an empty pnpm-workspace.yaml packages list', () => {
    const fs = createMemoryFs({ '/r/package.json': '{"workspaces": ["apps/*"]}', '/r/pnpm-workspace.yaml': 'packages: []\n', '/r/apps/x/package.json': '{}' });
    expect(workspaceMemberDirs(fs, '/r', undefined)).toEqual([]);
  });

  it('has no members when the root has no package.json and declares no workspace', () => {
    expect(workspaceMemberDirs(createMemoryFs({ '/r/turbo.json': '{}' }), '/r', undefined)).toEqual([]);
  });
});

describe('listTurboPackages', () => {
  it('reads the root package first, keeping only string scripts', () => {
    const { root } = listTurboPackages(PNPM_REPO, '/repo', undefined);
    expect(root.dir).toBe('');
    expect(root.name).toBe('root');
    expect([...root.scripts]).toEqual([['build', 'turbo run _build']]);
  });

  it('reads each member with its directory, declared name and scripts', () => {
    const { members } = listTurboPackages(PNPM_REPO, '/repo', undefined);
    expect(members.map((member) => [member.dir, member.name, [...member.scripts.keys()]])).toEqual([
      ['packages/a', '@s/a', ['_build']],
      ['packages/b', undefined, ['_test']],
    ]);
  });

  it('reads a root without a package.json as a nameless package with no scripts', () => {
    const { root, members } = listTurboPackages(createMemoryFs({ '/r/turbo.json': '{}' }), '/r', undefined);
    expect(root).toEqual({ dir: '', name: undefined, scripts: new Map() });
    expect(members).toEqual([]);
  });

  it('reads a manifest that is not an object as a package with no name or scripts', () => {
    const { root } = listTurboPackages(createMemoryFs({ '/r/package.json': '[]' }), '/r', undefined);
    expect(root).toEqual({ dir: '', name: undefined, scripts: new Map() });
  });

  it('reads a name that is not a string as no name and scripts that are not an object as none', () => {
    const { root } = listTurboPackages(createMemoryFs({ '/r/package.json': '{"name": 1, "scripts": "x"}' }), '/r', undefined);
    expect(root.name).toBeUndefined();
    expect(root.scripts.size).toBe(0);
  });

  it('throws naming a manifest that is not valid JSON', () => {
    const fs = createMemoryFs({ '/r/package.json': '{"scripts": ' });
    expect(() => listTurboPackages(fs, '/r', undefined)).toThrow('"/r/package.json"');
  });
});
