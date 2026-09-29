import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';

const fs = createMemoryFs({ '/repo/package.json': '{}', '/repo/packages/a/package.json': '{"name":"a"}', '/repo/packages/a/src/index.ts': '', '/repo/packages/b/package.json': '{}' });

describe('createMemoryFs', () => {
  it('reports a file and each of its ancestor directories as existing', () => {
    expect(fs.existsSync('/repo/packages/a/package.json')).toBe(true);
    expect(fs.existsSync('/repo/packages/a')).toBe(true);
    expect(fs.existsSync('/repo')).toBe(true);
  });

  it('reports a path that is neither a file nor a directory prefix as missing', () => {
    expect(fs.existsSync('/repo/packages/c')).toBe(false);
    expect(fs.existsSync('/repo/pack')).toBe(false);
    expect(fs.existsSync('/other')).toBe(false);
  });

  it('reads a file and throws ENOENT naming a missing one', () => {
    expect(fs.readFileSync('/repo/packages/a/package.json')).toBe('{"name":"a"}');
    expect(() => fs.readFileSync('/repo/packages/a')).toThrow('ENOENT: no such file "/repo/packages/a"');
  });

  it('lists the immediate children of a directory once each, telling files from directories', () => {
    const entries = fs.readdirSync('/repo/packages/a').map((entry) => [entry.name, entry.isDirectory()]);
    expect(entries).toEqual([
      ['package.json', false],
      ['src', true],
    ]);
    expect(fs.readdirSync('/repo/packages').map((entry) => [entry.name, entry.isDirectory()])).toEqual([
      ['a', true],
      ['b', true],
    ]);
  });

  it('lists nothing for a directory that holds no file', () => {
    expect(fs.readdirSync('/nowhere')).toEqual([]);
  });

  it('resolves a real path to itself', () => {
    expect(fs.realpathSync('/repo/packages/a')).toBe('/repo/packages/a');
  });
});
