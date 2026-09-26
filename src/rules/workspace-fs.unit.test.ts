import { describe, expect, it } from 'vitest';
import { listSubdirectories, type WorkspaceFs } from './workspace-fs';

function fakeFs(tree: Record<string, readonly string[]>): WorkspaceFs {
  return {
    existsSync: (path) => path in tree,
    readFileSync: () => {
      throw new Error('not used in these tests');
    },
    readdirSync: (path) => {
      const entries = tree[path];
      if (entries === undefined) throw new Error(`ENOENT: ${path}`);
      return entries.map((name) => ({ name, isDirectory: () => !name.includes('.') }));
    },
  };
}

describe('listSubdirectories', () => {
  it('returns an empty array for a directory that does not exist', () => {
    const fs = fakeFs({});
    expect(listSubdirectories(fs, '/root/missing')).toEqual([]);
  });

  it('returns only directory entries, filtering out files', () => {
    const fs = fakeFs({ '/root': ['a', 'b', 'package.json'] });
    expect(listSubdirectories(fs, '/root')).toEqual(['a', 'b']);
  });

  it('returns an empty array for an existing but empty directory', () => {
    const fs = fakeFs({ '/root/empty': [] });
    expect(listSubdirectories(fs, '/root/empty')).toEqual([]);
  });
});
