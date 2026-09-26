import { describe, expect, it } from 'vitest';
import { expandGlob, isExcludePattern, resolveWorkspacePackageDirs, segmentToRegExp } from './workspace-glob';
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

describe('segmentToRegExp', () => {
  it("builds its RegExp with the 'u' flag", () => {
    // Asserted directly on .flags rather than through any particular directory name: every real match this module makes goes through code points, not UTF-16 code units, and no fixture of plain ASCII directory names would ever observe the difference behaviourally.
    expect(segmentToRegExp('anything').flags).toBe('u');
  });
});

describe('isExcludePattern', () => {
  it('is true for a leading "!"', () => {
    expect(isExcludePattern('!core/*')).toBe(true);
  });

  it('is false for a pattern with no "!" at all', () => {
    expect(isExcludePattern('core/*')).toBe(false);
  });

  it('is false for a trailing "!" (the asymmetry that distinguishes this from an ends-with check)', () => {
    expect(isExcludePattern('core/weird!')).toBe(false);
  });
});

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

  it("'**' never descends into a 'node_modules' directory, matching pnpm's own unconditional exclusion", () => {
    const fs = fakeFs({
      '/root': ['packages'],
      '/root/packages': ['a'],
      '/root/packages/a': ['node_modules'],
      '/root/packages/a/node_modules': ['lodash'],
    });
    expect([...expandGlob(fs, '/root', 'packages/**')].sort()).toEqual(['packages', 'packages/a']);
  });

  it("a single '*' segment never matches a literal 'node_modules' directory name either", () => {
    const fs = fakeFs({ '/root': ['packages'], '/root/packages': ['a', 'node_modules'] });
    expect(expandGlob(fs, '/root', 'packages/*')).toEqual(['packages/a']);
  });

  it("matches a partial, in-segment wildcard ('app-*'), pnpm's own supported dialect beyond a whole-segment '*'", () => {
    const fs = fakeFs({ '/root': ['features'], '/root/features': ['app-store', 'app-billing', 'other'] });
    expect([...expandGlob(fs, '/root', 'features/app-*')].sort()).toEqual(['features/app-billing', 'features/app-store']);
  });

  it("matches a partial, in-segment wildcard at the START of the segment ('*-web')", () => {
    const fs = fakeFs({ '/root': ['apps'], '/root/apps': ['store-web', 'store-api', 'admin-web'] });
    expect([...expandGlob(fs, '/root', 'apps/*-web')].sort()).toEqual(['apps/admin-web', 'apps/store-web']);
  });

  it("matches '?' as exactly one character", () => {
    const fs = fakeFs({ '/root': ['targets'], '/root/targets': ['v1', 'v22', 'vX'] });
    expect([...expandGlob(fs, '/root', 'targets/v?')].sort()).toEqual(['targets/v1', 'targets/vX']);
  });

  it('a partial pattern with a regex-special character in its literal portion matches only that exact literal, not an unintended regex meta-match', () => {
    const fs = fakeFs({ '/root': ['packages'], '/root/packages': ['a.b', 'aXb'] });
    expect(expandGlob(fs, '/root', 'packages/a.b')).toEqual(['packages/a.b']);
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

  it('never treats an exclude pattern as an include, even when its own literal text (leading "!" included) would otherwise glob-match something real', () => {
    // "!core/billing" is a real, resolvable directory here (a directory literally named "!core" containing "billing"), planted specifically so that treating the exclude pattern's own unstripped text as an include target (rather than filtering it out first) would wrongly add it to the result.
    const fs = fakeFs(
      { '/root': ['core', '!core'], '/root/core': ['kv'], '/root/!core': ['billing'] },
      ['/root/core/kv', '/root/!core/billing'],
    );
    expect(resolveWorkspacePackageDirs(fs, '/root', ['core/*', '!core/billing'])).toEqual(['core/kv']);
  });

  it('never strips the leading character off an INCLUDE pattern when computing the exclude set, even when doing so would coincidentally glob-match another real include\'s own result', () => {
    // Stripping "core/*"'s own first character gives "ore/*"; a real "ore" directory is planted, with a child that is itself a genuine, separately-included package (via the "ore/*" pattern), so wrongly treating every pattern (not just real "!"-prefixed ones) as an exclude source would remove it from the final result.
    const fs = fakeFs(
      { '/root': ['core', 'ore'], '/root/core': ['kv'], '/root/ore': ['thing'] },
      ['/root/core/kv', '/root/ore/thing'],
    );
    expect([...resolveWorkspacePackageDirs(fs, '/root', ['core/*', 'ore/*'])].sort()).toEqual(['core/kv', 'ore/thing']);
  });
});
