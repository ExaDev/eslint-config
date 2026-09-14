import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decideAutoBarrelMode, resolveAutoMode } from './barrel-auto-detect';

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

  it('resolves single for a real exports field even when private is true -- a workspace package can be private and still a genuine import target for siblings', () => {
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

    // The distant root package.json has a real `main`, which would resolve 'single' -- if the walk found it instead of the nearer one, this assertion would fail, proving it stopped at the nearest ancestor (whose own exports/main are both empty, so it resolves 'banned').
    expect(resolveAutoMode(join(packageDir, 'src', 'foo.ts'))).toBe('banned');
  });

  it('resolves single via the real filesystem walk when the nearest package.json declares real exports', () => {
    root = mkdtempSync(join(tmpdir(), 'barrel-auto-detect-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'publish-shaped', exports: { '.': './dist/index.js' } }));

    expect(resolveAutoMode(join(root, 'src', 'index.ts'))).toBe('single');
  });
});
