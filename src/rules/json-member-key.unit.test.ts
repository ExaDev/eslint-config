import { describe, expect, it } from 'vitest';
import { getMemberKeyName } from './json-member-key';

describe('getMemberKeyName', () => {
  it('reads a String-named member', () => {
    const member = { name: { type: 'String', value: 'name' } };
    expect(getMemberKeyName(member)).toBe('name');
  });

  it('throws for an Identifier-named member, a shape only reachable via JSON5, which json/json and json/jsonc never parse', () => {
    const fakeMember = { name: { type: 'Identifier', name: 'foo' } };
    expect(() => getMemberKeyName(fakeMember)).toThrow(/Unreachable/);
  });
});
