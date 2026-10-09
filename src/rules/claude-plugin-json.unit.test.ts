import { parse } from '@humanwhocodes/momoa';
import { describe, expect, it } from 'vitest';
import { CLAUDE_PLUGIN_DIR, findMember, isNonEmptyString, PLUGIN_MANIFEST_FILE, readJsonFile } from './claude-plugin-json';
import { createMemoryFs } from './memory-fs';

function objectOf(json: string) {
  const { body } = parse(json);
  if (body.type !== 'Object') throw new Error('Unreachable: the fixture is an object literal.');

  return body;
}

describe('names', () => {
  it('are the directory and file Claude Code reads a plugin manifest from', () => {
    expect(CLAUDE_PLUGIN_DIR).toBe('.claude-plugin');
    expect(PLUGIN_MANIFEST_FILE).toBe('plugin.json');
  });
});

describe('findMember', () => {
  it('finds a member by key', () => {
    expect(findMember(objectOf('{"a":1,"b":2}'), 'b')?.value.type).toBe('Number');
  });

  it('returns the first of a repeated key', () => {
    expect(findMember(objectOf('{"a":"first","a":"second"}'), 'a')?.value).toMatchObject({ value: 'first' });
  });

  it('returns undefined for an absent key', () => {
    expect(findMember(objectOf('{"a":1}'), 'b')).toBeUndefined();
  });
});

describe('isNonEmptyString', () => {
  it.each([
    ['a string', '"a"', true],
    ['an empty string', '""', false],
    ['a number', '1', false],
    ['null', 'null', false],
    ['an object', '{}', false],
  ])('is %s: %s', (_label, json, expected) => {
    expect(isNonEmptyString(parse(json).body)).toBe(expected);
  });
});

describe('readJsonFile', () => {
  const fs = createMemoryFs({
    '/r/ok.json': '{"a":1}',
    '/r/bom.json': '\uFEFF{"a":1}',
    '/r/trailing.json': '{"a":1,}',
    '/r/bad.json': '{"a":',
  });

  it('parses a file', () => {
    expect(readJsonFile(fs, '/r/ok.json')).toStrictEqual({ kind: 'parsed', value: { a: 1 } });
  });

  it.each([['a byte order mark', '/r/bom.json'], ['a trailing comma', '/r/trailing.json']])('parses a file with %s, as editors and the JSONC reader do', (_label, path) => {
    expect(readJsonFile(fs, path)).toStrictEqual({ kind: 'parsed', value: { a: 1 } });
  });

  it('reports the syntax error as a value, so a rule can attach it to the file that points here', () => {
    const result = readJsonFile(fs, '/r/bad.json');
    if (result.kind !== 'invalid') throw new Error('Unreachable: the file is not valid JSON.');
    expect(result.reason).toMatch(/JSON/u);
  });

  it('lets a read error through, since only a syntax error is a finding about the file', () => {
    expect(() => readJsonFile(fs, '/r/missing.json')).toThrow(/ENOENT/u);
  });
});
