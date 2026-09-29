import { parse } from '@humanwhocodes/momoa';
import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import { readTurboJson, type TurboTask } from './turbo-json';
import { readLintedTurboPackage, readTaskEntries } from './turbo-rule-support';

function objectNode(text: string) {
  const document = parse(text, { mode: 'jsonc' });
  if (document.body.type !== 'Object') throw new Error('Unreachable: the fixture is a top-level JSON object.');

  return document.body;
}

const fs = createMemoryFs({
  '/repo/turbo.json': '{"tasks": {"_lint": {}}}',
  '/repo/packages/web/turbo.json': '{"extends": ["//"], "tasks": {"_local": {}}}',
  '/repo/packages/api/package.json': '{}',
  '/elsewhere/turbo.json': '{}',
});

describe('readLintedTurboPackage', () => {
  it('places the root package', () => {
    const linted = readLintedTurboPackage({ fs, filename: '/repo/package.json', manifest: objectNode('{"name": "root"}'), rootOption: undefined });
    expect(linted?.isRoot).toBe(true);
    expect(linted?.dir).toBe('/repo');
    expect(linted?.root.dir).toBe('/repo');
    expect(linted?.name).toBe('root');
    expect(linted?.qualifier).toBe('//');
    expect(linted?.own).toBeUndefined();
  });

  it('places a member with its own turbo.json', () => {
    const linted = readLintedTurboPackage({ fs, filename: '/repo/packages/web/package.json', manifest: objectNode('{"name": "web"}'), rootOption: undefined });
    expect(linted?.isRoot).toBe(false);
    expect(linted?.dir).toBe('/repo/packages/web');
    expect(linted?.qualifier).toBe('web');
    expect(linted?.own?.tasks.has('_local')).toBe(true);
  });

  it('places a member without one, and a nameless member with no qualifier', () => {
    const linted = readLintedTurboPackage({ fs, filename: '/repo/packages/api/package.json', manifest: objectNode('{}'), rootOption: undefined });
    expect(linted?.isRoot).toBe(false);
    expect(linted?.name).toBeUndefined();
    expect(linted?.qualifier).toBeUndefined();
    expect(linted?.own).toBeUndefined();
  });

  it('is undefined when no turbo repository contains the manifest', () => {
    expect(readLintedTurboPackage({ fs, filename: '/lonely/package.json', manifest: objectNode('{}'), rootOption: undefined })).toBeUndefined();
  });

  it('is undefined when the manifest is outside the root the option names, and placed when inside', () => {
    expect(readLintedTurboPackage({ fs, filename: '/repo/package.json', manifest: objectNode('{}'), rootOption: '/elsewhere' })).toBeUndefined();
    expect(readLintedTurboPackage({ fs, filename: '/repo/packages/api/package.json', manifest: objectNode('{}'), rootOption: '/repo' })?.isRoot).toBe(false);
  });

  it('treats a directory whose name merely starts with two dots as inside the root', () => {
    const dotted = createMemoryFs({ '/repo/turbo.json': '{}', '/repo/..hidden/package.json': '{}' });
    expect(readLintedTurboPackage({ fs: dotted, filename: '/repo/..hidden/package.json', manifest: objectNode('{}'), rootOption: '/repo' })).toBeDefined();
  });
});

describe('readTaskEntries', () => {
  const text = '{"tasks": {"a": {}, "b": {"cache": false}}}';

  it('pairs each task member with its parsed task, in document order', () => {
    const entries = readTaskEntries(objectNode(text), readTurboJson(JSON.parse(text), 'turbo.json').tasks);
    expect(entries.map((entry) => [entry.key, entry.task.cache, entry.member.name.type])).toEqual([
      ['a', undefined, 'String'],
      ['b', false, 'String'],
    ]);
  });

  it('is empty when the document has no tasks object', () => {
    expect(readTaskEntries(objectNode('{"tasks": []}'), new Map())).toEqual([]);
    expect(readTaskEntries(objectNode('{}'), new Map())).toEqual([]);
  });

  it('throws for a member that was not parsed from the same text', () => {
    const empty: ReadonlyMap<string, TurboTask> = new Map();
    expect(() => readTaskEntries(objectNode(text), empty)).toThrow(/Unreachable: task "a"/u);
  });
});
