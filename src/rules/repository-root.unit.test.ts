import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import { findRepositoryRoot } from './repository-root';

describe('findRepositoryRoot', () => {
  it('finds the nearest ancestor holding a pnpm-workspace.yaml, wherever ESLint runs from', () => {
    const fs = createMemoryFs({ '/repo/pnpm-workspace.yaml': '', '/repo/packages/lib/package.json': '{}' });
    expect(findRepositoryRoot(fs, '/repo/packages/lib', '/repo/packages/lib')).toBe('/repo');
    expect(findRepositoryRoot(fs, '/repo', '/elsewhere')).toBe('/repo');
  });

  it('finds a package.json that lists workspaces', () => {
    const fs = createMemoryFs({ '/repo/package.json': '{"workspaces":["packages/*"]}', '/repo/packages/lib/package.json': '{}' });
    expect(findRepositoryRoot(fs, '/repo/packages/lib', '/repo/packages/lib')).toBe('/repo');
  });

  it('finds the git root of a repository with no workspace', () => {
    const fs = createMemoryFs({ '/repo/.git/HEAD': '', '/repo/tools/a/package.json': '{}' });
    expect(findRepositoryRoot(fs, '/repo/tools/a', '/repo/tools/a')).toBe('/repo');
  });

  it('prefers the nearer marker', () => {
    const fs = createMemoryFs({ '/repo/.git/HEAD': '', '/repo/inner/pnpm-workspace.yaml': '', '/repo/inner/pkg/package.json': '{}' });
    expect(findRepositoryRoot(fs, '/repo/inner/pkg', '/repo')).toBe('/repo/inner');
  });

  it('roots a tree with no marker where ESLint runs', () => {
    const fs = createMemoryFs({ '/loose/a/package.json': '{}' });
    expect(findRepositoryRoot(fs, '/loose/a', '/loose')).toBe('/loose');
  });
});
