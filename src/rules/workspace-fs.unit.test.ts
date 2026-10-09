import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listEntryNames, listFileNames, listSubdirectories, listEntriesOrEmpty, listSubdirectoriesThroughLinks, realWorkspaceFs, type WorkspaceFs } from './workspace-fs';

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
    realpathSync: () => {
      throw new Error('not used in these tests');
    },
  };
}

describe('realWorkspaceFs.realpathSync', () => {
  it('delegates directly to node:fs\'s own realpathSync, resolving a real directory to its own canonical path', () => {
    expect(realWorkspaceFs.realpathSync(import.meta.dirname)).toBe(realpathSync(import.meta.dirname));
  });
});

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

describe('listEntryNames', () => {
  it('returns an empty array for a directory that does not exist', () => {
    expect(listEntryNames(fakeFs({}), '/root/missing')).toEqual([]);
  });

  it('returns files and directories alike', () => {
    expect(listEntryNames(fakeFs({ '/root': ['a', 'b', 'package.json'] }), '/root')).toEqual(['a', 'b', 'package.json']);
  });
});

describe('listFileNames', () => {
  it('returns an empty array for a directory that does not exist', () => {
    expect(listFileNames(fakeFs({}), '/root/missing')).toEqual([]);
  });

  it('returns only file entries, filtering out directories', () => {
    expect(listFileNames(fakeFs({ '/root': ['a', 'b', 'package.json', 'eslint.config.ts'] }), '/root')).toEqual(['package.json', 'eslint.config.ts']);
  });
});

describe('listSubdirectoriesThroughLinks', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'exadev-eslint-config-workspace-fs-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns an empty array for a directory that does not exist', () => {
    expect(listSubdirectoriesThroughLinks(realWorkspaceFs, join(root, 'missing'))).toEqual([]);
  });

  it('lists a directory, a symbolic link to a directory (directly or through another link) and nothing else', () => {
    mkdirSync(join(root, 'real', 'target'), { recursive: true });
    mkdirSync(join(root, 'plugins', 'plain'), { recursive: true });
    writeFileSync(join(root, 'plugins', 'file.json'), '{}');
    writeFileSync(join(root, 'real', 'file.json'), '{}');
    symlinkSync(join(root, 'real', 'target'), join(root, 'plugins', 'linked'));
    symlinkSync(join(root, 'plugins', 'linked'), join(root, 'plugins', 'chained'));
    symlinkSync(join(root, 'real', 'file.json'), join(root, 'plugins', 'linked-file'));
    symlinkSync(join(root, 'real', 'gone'), join(root, 'plugins', 'dangling'));

    expect([...listSubdirectoriesThroughLinks(realWorkspaceFs, join(root, 'plugins'))].sort()).toEqual(['chained', 'linked', 'plain']);
    expect(listSubdirectories(realWorkspaceFs, join(root, 'plugins'))).toEqual(['plain']);
  });
});

class CodedError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

function refusingFs(code: string): WorkspaceFs {
  return {
    existsSync: () => true,
    readFileSync: () => {
      throw new Error('not used in these tests');
    },
    readdirSync: () => {
      throw new CodedError(`${code}: refused`, code);
    },
    realpathSync: (path) => path,
  };
}

describe('listEntriesOrEmpty', () => {
  it.each(['ENOTDIR', 'EACCES', 'EPERM'])('lists a path refused with %s as empty', (code) => {
    expect(listEntriesOrEmpty(refusingFs(code), '/root/x')).toEqual([]);
  });

  it('lets any other error through', () => {
    expect(() => listEntriesOrEmpty(refusingFs('EIO'), '/root/x')).toThrow(/EIO/u);
  });

  it('lists a directory', () => {
    expect(listEntriesOrEmpty(fakeFs({ '/root': ['a'] }), '/root').map((entry) => entry.name)).toEqual(['a']);
  });
});

describe('listSubdirectoriesThroughLinks over a path that cannot be listed', () => {
  it.each(['ENOTDIR', 'EACCES', 'EPERM'])('is empty for %s', (code) => {
    expect(listSubdirectoriesThroughLinks(refusingFs(code), '/root/skills')).toEqual([]);
  });

  it('is empty for a regular file where a directory would be', () => {
    const root = mkdtempSync(join(tmpdir(), 'exadev-eslint-config-workspace-fs-file-'));
    try {
      writeFileSync(join(root, 'skills'), 'not a directory');
      expect(listSubdirectoriesThroughLinks(realWorkspaceFs, join(root, 'skills'))).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
