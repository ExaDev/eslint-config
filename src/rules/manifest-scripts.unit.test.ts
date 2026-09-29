import { parse, type ObjectNode } from '@humanwhocodes/momoa';
import { describe, expect, it } from 'vitest';
import { readScripts, requireScriptEntry, type ScriptEntry } from './manifest-scripts';

function manifestObject(text: string): ObjectNode {
  const document = parse(text, { mode: 'json' });
  if (document.body.type !== 'Object') throw new Error('Unreachable: the fixture is a top-level JSON object.');

  return document.body;
}

describe('readScripts', () => {
  it('keys each script by name, with its command when the value is a string and undefined otherwise', () => {
    const { entries } = readScripts(manifestObject('{"scripts": {"a": "x", "b": 1}}'));
    expect([...entries].map(([name, entry]) => [name, entry.command])).toEqual([
      ['a', 'x'],
      ['b', undefined],
    ]);
  });

  it('locates the scripts entry as a whole', () => {
    const scriptsLine = 3;
    const { loc } = readScripts(manifestObject('{\n  "name": "p",\n  "scripts": {}\n}'));
    expect(loc.start.line).toBe(scriptsLine);
  });

  it('reads no scripts, located at the manifest, when the manifest has none', () => {
    const { entries, loc } = readScripts(manifestObject('{"name": "p"}'));
    expect(entries.size).toBe(0);
    expect(loc.start.column).toBe(1);
  });

  it('reads no scripts when the value is not an object', () => {
    expect(readScripts(manifestObject('{"scripts": "x"}')).entries.size).toBe(0);
  });
});

describe('requireScriptEntry', () => {
  it('returns the entry for a known script', () => {
    const document = parse('{"a": "x"}', { mode: 'json' });
    if (document.body.type !== 'Object') throw new Error('Unreachable: the fixture is a top-level JSON object.');
    const [member] = document.body.members;
    if (member === undefined) throw new Error('Unreachable: the fixture has exactly one member.');
    const entry: ScriptEntry = { command: 'x', member };
    expect(requireScriptEntry(new Map([['a', entry]]), 'a')).toBe(entry);
  });

  it('throws for a script with no entry, a shape no real call site (which only names scripts it just read) produces', () => {
    expect(() => requireScriptEntry(new Map(), 'missing')).toThrow(/Unreachable/u);
  });
});

