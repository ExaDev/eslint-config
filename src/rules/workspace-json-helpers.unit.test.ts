import { parse } from '@humanwhocodes/momoa';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { describe, expect, it } from 'vitest';
import { collectTopLevelDependencies, readDeclaredName } from './workspace-json-helpers';

function rootObjectOf(json: string): ObjectNode {
  const document = parse(json, { mode: 'json' });
  if (document.body.type !== 'Object') {
    throw new Error('Unreachable: every fixture here is a top-level JSON object.');
  }
  return document.body;
}

describe('readDeclaredName', () => {
  it('reads a top-level "name" string field', () => {
    const result = readDeclaredName(rootObjectOf('{"name": "@exacap/clock-contract"}'));
    expect(result?.name).toBe('@exacap/clock-contract');
  });

  it('returns undefined when there is no "name" field at all', () => {
    expect(readDeclaredName(rootObjectOf('{"version": "1.0.0"}'))).toBeUndefined();
  });

  it('returns undefined when "name" is present but not a string', () => {
    expect(readDeclaredName(rootObjectOf('{"name": 5}'))).toBeUndefined();
  });
});

describe('collectTopLevelDependencies', () => {
  it('reads every entry under the default "dependencies" field', () => {
    const result = collectTopLevelDependencies(rootObjectOf('{"dependencies": {"a": "1", "b": "2"}}'), ['dependencies']);
    expect(result.map((entry) => entry.name)).toEqual(['a', 'b']);
  });

  it('reads across every configured field, in field order then declaration order', () => {
    const json = '{"dependencies": {"a": "1"}, "devDependencies": {"b": "2"}}';
    const result = collectTopLevelDependencies(rootObjectOf(json), ['dependencies', 'devDependencies']);
    expect(result.map((entry) => entry.name)).toEqual(['a', 'b']);
  });

  it('ignores a configured field that is not present at all', () => {
    const result = collectTopLevelDependencies(rootObjectOf('{"dependencies": {"a": "1"}}'), ['dependencies', 'peerDependencies']);
    expect(result.map((entry) => entry.name)).toEqual(['a']);
  });

  it('ignores a field that is present but not itself an object', () => {
    const result = collectTopLevelDependencies(rootObjectOf('{"dependencies": "not-an-object"}'), ['dependencies']);
    expect(result).toEqual([]);
  });

  it('ignores an unconfigured field entirely, even one named "dependencies"-like', () => {
    const result = collectTopLevelDependencies(rootObjectOf('{"devDependencies": {"a": "1"}}'), ['dependencies']);
    expect(result).toEqual([]);
  });

  it('returns an empty array for a manifest with no dependency fields at all', () => {
    expect(collectTopLevelDependencies(rootObjectOf('{"name": "x"}'), ['dependencies'])).toEqual([]);
  });
});
