import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';

import { tmpdir } from 'node:os';

import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { decideAutoBarrelMode, findNearestPackageJson, resolveAutoMode } from './barrel-auto-detect';

describe('decideAutoBarrelMode', () => {
  it('resolves single for a non-empty object exports field', () => {
    expect(decideAutoBarrelMode({ exports: { '.': './dist/index.js' } })).toBe('single');
  });

  it('resolves single for a non-empty string exports field', () => {
    expect(decideAutoBarrelMode({ exports: './dist/index.js' })).toBe('single');
  });

  it('resolves single for a non-empty main field', () => {
    expect(decideAutoBarrelMode({ main: './dist/index.js' })).toBe('single');
  });

  it('resolves single when both exports and main are present', () => {
    expect(decideAutoBarrelMode({ exports: { '.': './dist/index.js' }, main: './dist/index.js' })).toBe('single');
  });

  it('resolves single for a real exports field even when private is true — a workspace package can be private and still a genuine import target for siblings', () => {
    expect(decideAutoBarrelMode({ private: true, exports: { '.': './dist/index.js' } })).toBe('single');
  });

  it('resolves banned when neither exports nor main is present', () => {
    expect(decideAutoBarrelMode({ name: 'internal-app' })).toBe('banned');
  });

  it('resolves banned for an empty-string main', () => {
    expect(decideAutoBarrelMode({ main: '' })).toBe('banned');
  });

  it('resolves banned for an empty-object exports', () => {
    expect(decideAutoBarrelMode({ exports: {} })).toBe('banned');
  });

  it('resolves banned for an empty-array exports', () => {
    expect(decideAutoBarrelMode({ exports: [] })).toBe('banned');
  });

  it('resolves single for a non-empty-array exports', () => {
    expect(decideAutoBarrelMode({ exports: ['./dist/index.js'] })).toBe('single');
  });

  it('resolves banned for an empty-string exports', () => {
    expect(decideAutoBarrelMode({ exports: '' })).toBe('banned');
  });
});

describe('resolveAutoMode with an injected resolver', () => {
  it('returns banned when no ancestor package.json is found', () => {
    expect(resolveAutoMode('/repo/src/foo.ts', () => undefined)).toBe('banned');
  });

  it('returns single when the injected package.json declares real exports', () => {
    expect(resolveAutoMode('/repo/src/foo.ts', () => ({ exports: { '.': './dist/index.js' } }))).toBe('single');
  });

  it('passes the containing directory of filename, not filename itself, to the resolver', () => {
    const seenDirs: string[] = [];
    resolveAutoMode('/repo/src/foo.ts', (dir) => {
      seenDirs.push(dir);

      return undefined;
    });
    expect(seenDirs).toEqual(['/repo/src']);
  });
});

describe('resolveAutoMode with the real filesystem walk-up', () => {
  let root: string;

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('finds the nearest ancestor package.json and stops there rather than a more distant one', () => {
    root = mkdtempSync(join(tmpdir(), 'barrel-auto-detect-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'distant-root', main: './dist/index.js' }));
    const packageDir = join(root, 'packages', 'nearest');
    mkdirSync(join(packageDir, 'src'), { recursive: true });
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'nearest', exports: {} }));

    // The distant root package.json has a real `main`, which would resolve 'single' — if the walk found it instead of the nearer one, this assertion would fail, proving it stopped at the nearest ancestor (whose own exports/main are both empty, so it resolves 'banned').
    expect(resolveAutoMode(join(packageDir, 'src', 'foo.ts'))).toBe('banned');
  });

  it('resolves single via the real filesystem walk when the nearest package.json declares real exports', () => {
    root = mkdtempSync(join(tmpdir(), 'barrel-auto-detect-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'publish-shaped', exports: { '.': './dist/index.js' } }));

    expect(resolveAutoMode(join(root, 'src', 'index.ts'))).toBe('single');
  });
});

describe('findNearestPackageJson', () => {
  let root: string;

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns undefined once the walk reaches the real filesystem root with no ancestor package.json anywhere', () => {
    // tmpdir()'s own ancestry (verified directly against this machine) owns no package.json all the way up to "/", so this genuinely exercises the walk's own root-reached branch (parent === dir) rather than a mocked stand-in for it.
    root = mkdtempSync(join(tmpdir(), 'barrel-auto-detect-no-ancestor-'));
    const deepDir = join(root, 'a', 'b', 'c');
    mkdirSync(deepDir, { recursive: true });

    expect(findNearestPackageJson(deepDir)).toBeUndefined();
  });

  it('returns undefined for a package.json that parses to a top-level array rather than an object, the same outcome as no ancestor manifest at all', () => {
    // Pins the behaviour the extracted, shared isRecord (src/is-record.ts) gives this walk: it excludes arrays (`!Array.isArray`), unlike a bare `typeof === 'object' && !== null` check would, so an array-shaped manifest is indistinguishable from a wholly absent one to every caller of findNearestPackageJson, matching workspace-graph.ts's identical readDeclaredManifest.
    root = mkdtempSync(join(tmpdir(), 'barrel-auto-detect-array-manifest-'));
    const startDir = join(root, 'src');
    mkdirSync(startDir, { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify(['not', 'an', 'object']));

    expect(findNearestPackageJson(startDir)).toBeUndefined();
  });

  it('caches the resolved manifest by its own start directory, never re-reading the file on a later call for the same directory', () => {
    root = mkdtempSync(join(tmpdir(), 'barrel-auto-detect-cache-'));
    const startDir = join(root, 'src');
    mkdirSync(startDir, { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'original' }));

    const first = findNearestPackageJson(startDir);
    expect(first).toEqual({ name: 'original' });

    // Rewritten after the first call, without ever clearing the cache: a genuinely fresh read would see this new content, so the second call below can only still return the original value if it actually came from the cache rather than a re-read.
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'changed' }));
    const second = findNearestPackageJson(startDir);
    expect(second).toEqual({ name: 'original' });
  });

  it('caches an undefined outcome too, for a start directory proven above to have no ancestor package.json at all', () => {
    root = mkdtempSync(join(tmpdir(), 'barrel-auto-detect-cache-undefined-'));
    const deepDir = join(root, 'a', 'b');
    mkdirSync(deepDir, { recursive: true });

    expect(findNearestPackageJson(deepDir)).toBeUndefined();

    // Written only AFTER the first call already walked (finding nothing) and cached that outcome: a genuinely fresh second walk would find this file immediately (it sits directly in deepDir), so only the cached "undefined" outcome being returned, not a real re-walk, explains a second undefined result here.
    writeFileSync(join(deepDir, 'package.json'), JSON.stringify({ name: 'appeared-after-first-call' }));
    expect(findNearestPackageJson(deepDir)).toBeUndefined();
  });
});
