import { describe, expect, it } from 'vitest';
import { readWorkspaceArchitectureOptions, resolveDependencyFields, workspaceArchitectureOptionsSchema } from './workspace-options';

const MINIMAL = { groups: [{ name: 'core' }] };

describe('readWorkspaceArchitectureOptions', () => {
  it('throws for undefined options: there is no sensible default for "groups"', () => {
    expect(() => readWorkspaceArchitectureOptions(undefined)).toThrow(/groups/);
  });

  it('throws for a non-object options value', () => {
    expect(() => readWorkspaceArchitectureOptions('nonsense')).toThrow(/groups/);
    expect(() => readWorkspaceArchitectureOptions(null)).toThrow(/groups/);
    expect(() => readWorkspaceArchitectureOptions(['array'])).toThrow(/groups/);
  });

  it('throws when "groups" is missing', () => {
    expect(() => readWorkspaceArchitectureOptions({})).toThrow(/groups/);
  });

  it('throws when "groups" is not an array', () => {
    expect(() => readWorkspaceArchitectureOptions({ groups: 'core' })).toThrow(/groups/);
  });

  it('throws when a group has no "name"', () => {
    expect(() => readWorkspaceArchitectureOptions({ groups: [{ rank: 0 }] })).toThrow(/groups/);
  });

  it('throws when a "groups" element is not an object at all', () => {
    expect(() => readWorkspaceArchitectureOptions({ groups: ['core'] })).toThrow(/groups/);
  });

  it('accepts the minimal valid shape: one group with only a name', () => {
    const result = readWorkspaceArchitectureOptions(MINIMAL);
    expect(result.groups).toEqual([{ name: 'core' }]);
  });

  it('omits every optional field from the result when it was omitted from the input', () => {
    const result = readWorkspaceArchitectureOptions(MINIMAL);
    expect(result).not.toHaveProperty('root');
    expect(result).not.toHaveProperty('packages');
    expect(result).not.toHaveProperty('dependencyFields');
    expect(result).not.toHaveProperty('nameRanks');
    expect(result).not.toHaveProperty('defaultRank');
    expect(result).not.toHaveProperty('rankSkip');
    expect(result).not.toHaveProperty('isolatedGroups');
    expect(result).not.toHaveProperty('naming');
  });

  it('passes through a valid "root" string', () => {
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, root: '/repo' }).root).toBe('/repo');
  });

  it('throws for a non-string "root"', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, root: 5 })).toThrow(/groups/);
  });

  it('passes through a valid "packages" string array', () => {
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, packages: ['core/*'] }).packages).toEqual(['core/*']);
  });

  it('throws for a "packages" array containing a non-string', () => {
    const notAString = 5;
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, packages: ['core/*', notAString] })).toThrow(/groups/);
  });

  it('throws for a non-array "packages"', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, packages: 'core/*' })).toThrow(/groups/);
  });

  it('passes through a valid "dependencyFields" string array', () => {
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, dependencyFields: ['dependencies', 'peerDependencies'] }).dependencyFields).toEqual([
      'dependencies',
      'peerDependencies',
    ]);
  });

  it('throws for a non-array "dependencyFields"', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, dependencyFields: 5 })).toThrow(/groups/);
  });

  it('accepts a group with every optional field set', () => {
    const groups = [{ name: 'features', path: 'features', rank: 1, slice: { segment: 0 }, naming: 'keep-group' as const }];
    expect(readWorkspaceArchitectureOptions({ groups }).groups).toEqual(groups);
  });

  it('accepts a group slice of the namePrefix form', () => {
    const groups = [{ name: 'targets', slice: { namePrefix: true as const } }];
    expect(readWorkspaceArchitectureOptions({ groups }).groups).toEqual(groups);
  });

  it('throws for a group whose "path" is not a string', () => {
    expect(() => readWorkspaceArchitectureOptions({ groups: [{ name: 'core', path: 5 }] })).toThrow(/groups/);
  });

  it('throws for a group whose "rank" is not a number', () => {
    expect(() => readWorkspaceArchitectureOptions({ groups: [{ name: 'core', rank: '0' }] })).toThrow(/groups/);
  });

  it('throws for a group whose "slice" is neither shape', () => {
    expect(() => readWorkspaceArchitectureOptions({ groups: [{ name: 'core', slice: {} }] })).toThrow(/groups/);
    expect(() => readWorkspaceArchitectureOptions({ groups: [{ name: 'core', slice: 'segment-0' }] })).toThrow(/groups/);
  });

  it('throws for a group whose "naming" is not one of the three strategies', () => {
    expect(() => readWorkspaceArchitectureOptions({ groups: [{ name: 'core', naming: 'nonsense' }] })).toThrow(/groups/);
  });

  it('passes through valid "nameRanks"', () => {
    const nameRanks = [{ pattern: '-contract$', rank: 0 }];
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, nameRanks }).nameRanks).toEqual(nameRanks);
  });

  it('throws for a "nameRanks" entry missing "pattern" or "rank"', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, nameRanks: [{ rank: 0 }] })).toThrow(/groups/);
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, nameRanks: [{ pattern: 'x' }] })).toThrow(/groups/);
  });

  it('passes through a valid "defaultRank"', () => {
    const rank = 3;
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, defaultRank: rank }).defaultRank).toBe(rank);
  });

  it('throws for a non-number "defaultRank"', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, defaultRank: '3' })).toThrow(/groups/);
  });

  it('passes through valid "rankSkip"', () => {
    const rankSkip = { maxDistance: 1, exemptRanks: [0] };
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, rankSkip }).rankSkip).toEqual(rankSkip);
  });

  it('throws for a "rankSkip" missing "maxDistance"', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, rankSkip: { exemptRanks: [0] } })).toThrow(/groups/);
  });

  it('throws for a "rankSkip" that is not an object at all', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, rankSkip: 'nonsense' })).toThrow(/groups/);
  });

  it('throws for a "rankSkip" whose "exemptRanks" contains a non-number', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, rankSkip: { maxDistance: 1, exemptRanks: ['0'] } })).toThrow(/groups/);
  });

  it('throws for a "rankSkip" whose "exemptRanks" is not an array', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, rankSkip: { maxDistance: 1, exemptRanks: 0 } })).toThrow(/groups/);
  });

  it('passes through valid "isolatedGroups"', () => {
    const isolatedGroups = [['features', 'verticals']];
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, isolatedGroups }).isolatedGroups).toEqual(isolatedGroups);
  });

  it('throws for an "isolatedGroups" pair of the wrong length', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, isolatedGroups: [['features']] })).toThrow(/groups/);
  });

  it('throws for an "isolatedGroups" pair with a non-string entry', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, isolatedGroups: [['features', 1]] })).toThrow(/groups/);
  });

  it('throws for a non-array "isolatedGroups"', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, isolatedGroups: 'features' })).toThrow(/groups/);
  });

  it('passes through valid "naming" with both fields', () => {
    const naming = { scope: '@exacap', separator: '_' };
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, naming }).naming).toEqual(naming);
  });

  it('accepts "naming" with neither field set', () => {
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, naming: {} }).naming).toEqual({});
  });

  it('throws for a "naming.scope" that is not a string', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, naming: { scope: 5 } })).toThrow(/groups/);
  });

  it('throws for a "naming.separator" that is not a string', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, naming: { separator: 5 } })).toThrow(/groups/);
  });

  it('throws for a non-object "naming"', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, naming: 'scoped' })).toThrow(/groups/);
  });
});

describe('resolveDependencyFields', () => {
  it("defaults to ['dependencies'] when dependencyFields is omitted", () => {
    expect(resolveDependencyFields({})).toEqual(['dependencies']);
  });

  it('returns the configured fields verbatim when given', () => {
    expect(resolveDependencyFields({ dependencyFields: ['dependencies', 'peerDependencies'] })).toEqual(['dependencies', 'peerDependencies']);
  });
});

describe('workspaceArchitectureOptionsSchema', () => {
  it('requires "groups" and forbids unknown top-level properties', () => {
    expect(workspaceArchitectureOptionsSchema.required).toEqual(['groups']);
    expect(workspaceArchitectureOptionsSchema.additionalProperties).toBe(false);
  });
});
