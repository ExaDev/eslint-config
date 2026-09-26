import { describe, expect, it } from 'vitest';
import { expandGlob, resolveWorkspacePackageDirs } from './workspace-glob';
import type { WorkspaceFs } from './workspace-fs';

// An in-memory tree keyed by absolute-ish path, mapping each directory to its own subdirectory names, plus a set of paths that own a real package.json.
function fakeFs(dirs: Record<string, readonly string[]>, packageJsonDirs: readonly string[] = []): WorkspaceFs {
  const packageJsonSet = new Set(packageJsonDirs.map((dir) => `${dir}/package.json`));
  return {
    existsSync: (path) => path in dirs || packageJsonSet.has(path),
    readFileSync: () => {
      throw new Error('not used in these tests');
    },
    readdirSync: (path) => {
      const entries = dirs[path];
      if (entries === undefined) return [];
      return entries.map((name) => ({ name, isDirectory: () => true }));
    },
  };
}

describe('expandGlob', () => {
  it('matches a literal pattern with no wildcards, when the directory exists', () => {
    const fs = fakeFs({ '/root': ['targets'], '/root/targets': ['store-cli'] });
    expect(expandGlob(fs, '/root', 'targets')).toEqual(['targets']);
  });

  it('returns nothing for a literal pattern whose directory does not exist', () => {
    const fs = fakeFs({ '/root': [] });
    expect(expandGlob(fs, '/root', 'missing')).toEqual([]);
  });

  it("expands '*' to every subdirectory at that level", () => {
    const fs = fakeFs({ '/root': ['core'], '/root/core': ['kv', 'auth'] });
    expect([...expandGlob(fs, '/root', 'core/*')].sort()).toEqual(['core/auth', 'core/kv']);
  });

  it("expands a two-level '*/*' pattern", () => {
    const fs = fakeFs({
      '/root': ['core'],
      '/root/core': ['kv'],
      '/root/core/kv': ['kv-contract', 'kv-adapter-memory'],
    });
    expect([...expandGlob(fs, '/root', 'core/*/*')].sort()).toEqual(['core/kv/kv-adapter-memory', 'core/kv/kv-contract']);
  });

  it("'**' matches zero segments, so a pattern like 'core/**' also matches 'core' itself", () => {
    const fs = fakeFs({ '/root': ['core'], '/root/core': [] });
    expect(expandGlob(fs, '/root', 'core/**')).toEqual(['core']);
  });

  it("'**' matches several segments deep", () => {
    const fs = fakeFs({
      '/root': ['core'],
      '/root/core': ['clock'],
      '/root/core/clock': ['contract', 'system'],
    });
    expect([...expandGlob(fs, '/root', 'core/**')].sort()).toEqual(['core', 'core/clock', 'core/clock/contract', 'core/clock/system']);
  });
});

describe('resolveWorkspacePackageDirs', () => {
  it('includes only matches that also own a real package.json', () => {
    const fs = fakeFs({ '/root': ['core'], '/root/core': ['kv', 'scratch'] }, ['/root/core/kv']);
    expect(resolveWorkspacePackageDirs(fs, '/root', ['core/*'])).toEqual(['core/kv']);
  });

  it('unions matches across several include patterns', () => {
    const fs = fakeFs(
      { '/root': ['core', 'targets'], '/root/core': ['kv'], '/root/targets': ['store-cli'] },
      ['/root/core/kv', '/root/targets/store-cli'],
    );
    expect([...resolveWorkspacePackageDirs(fs, '/root', ['core/*', 'targets/*'])].sort()).toEqual(['core/kv', 'targets/store-cli']);
  });

  it('removes a directory matched by an exclude pattern from the included set', () => {
    const fs = fakeFs({ '/root': ['features'], '/root/features': ['store', 'billing'] }, ['/root/features/store', '/root/features/billing']);
    expect([...resolveWorkspacePackageDirs(fs, '/root', ['features/*', '!features/billing'])].sort()).toEqual(['features/store']);
  });

  it('an exclude pattern matching nothing changes nothing', () => {
    const fs = fakeFs({ '/root': ['core'], '/root/core': ['kv'] }, ['/root/core/kv']);
    expect(resolveWorkspacePackageDirs(fs, '/root', ['core/*', '!core/missing'])).toEqual(['core/kv']);
  });

  it('a glob match with no package.json of its own is silently dropped', () => {
    const fs = fakeFs({ '/root': ['core'], '/root/core': ['kv', 'empty-scaffold'] }, ['/root/core/kv']);
    expect(resolveWorkspacePackageDirs(fs, '/root', ['core/*'])).toEqual(['core/kv']);
  });

  it('deduplicates a directory matched by more than one include pattern', () => {
    const fs = fakeFs({ '/root': ['core'], '/root/core': ['kv'] }, ['/root/core/kv']);
    expect(resolveWorkspacePackageDirs(fs, '/root', ['core/*', 'core/kv'])).toEqual(['core/kv']);
  });
});
