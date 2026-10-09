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
  const fs = createMemoryFs({ '/r/ok.json': '{"a":1}', '/r/bad.json': '{"a":' });

  it('parses a file', () => {
    expect(readJsonFile(fs, '/r/ok.json')).toStrictEqual({ a: 1 });
  });

  it('names the file when it is not valid JSON', () => {
    expect(() => readJsonFile(fs, '/r/bad.json')).toThrow(/^@exadev\/eslint-config: cannot read "\/r\/bad\.json" as JSON: SyntaxError/u);
  });

  it('names the file when it does not exist', () => {
    expect(() => readJsonFile(fs, '/r/missing.json')).toThrow(/cannot read "\/r\/missing\.json" as JSON: Error: ENOENT/u);
  });
});
