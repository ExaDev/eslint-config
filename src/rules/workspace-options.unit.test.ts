import { describe, expect, it } from 'vitest';
import { MISCONFIGURATION_MESSAGE, readWorkspaceArchitectureOptions, resolveDependencyFields, workspaceArchitectureOptionsSchema } from './workspace-options';

const MINIMAL = { groups: [{ name: 'core' }] };

describe('readWorkspaceArchitectureOptions', () => {
  it('throws for undefined options: there is no sensible default for "groups"', () => {
    expect(() => readWorkspaceArchitectureOptions(undefined)).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for a non-object options value', () => {
    expect(() => readWorkspaceArchitectureOptions('nonsense')).toThrow(MISCONFIGURATION_MESSAGE);
    // Not merely a loose message match: without the null check specifically, isRecord(null) would wrongly accept null as a record (typeof null === 'object'), and the very next line would then crash reading `null['groups']` with a native "Cannot read properties of null" TypeError instead of this function's own intended message. That is a genuinely different failure, and this exact assertion is what tells the two apart.
    expect(() => readWorkspaceArchitectureOptions(null)).toThrow(MISCONFIGURATION_MESSAGE);
    expect(() => readWorkspaceArchitectureOptions(['array'])).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws when "groups" is missing', () => {
    expect(() => readWorkspaceArchitectureOptions({})).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws when "groups" is not an array', () => {
    expect(() => readWorkspaceArchitectureOptions({ groups: 'core' })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws when a group has no "name"', () => {
    expect(() => readWorkspaceArchitectureOptions({ groups: [{ rank: 0 }] })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws when a "groups" element is not an object at all', () => {
    expect(() => readWorkspaceArchitectureOptions({ groups: ['core'] })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws when only SOME "groups" elements are valid: every one must satisfy isGroupSpec, not merely one of them', () => {
    expect(() => readWorkspaceArchitectureOptions({ groups: [{ name: 'core' }, { rank: 0 }] })).toThrow(MISCONFIGURATION_MESSAGE);
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

  it('throws for an unknown top-level property, even one that only misspells a real one ("rankskip" for "rankSkip")', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, rankskip: { maxDistance: 1, exemptRanks: [] } })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('passes through a valid "root" string', () => {
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, root: '/repo' }).root).toBe('/repo');
  });

  it('throws for a non-string "root"', () => {
    const notAString = 5;
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, root: notAString })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('passes through a valid "packages" string array', () => {
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, packages: ['core/*'] }).packages).toEqual(['core/*']);
  });

  it('throws for a "packages" array containing a non-string', () => {
    const notAString = 5;
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, packages: ['core/*', notAString] })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for a non-array "packages"', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, packages: 'core/*' })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('passes through a valid "dependencyFields" string array', () => {
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, dependencyFields: ['dependencies', 'peerDependencies'] }).dependencyFields).toEqual([
      'dependencies',
      'peerDependencies',
    ]);
  });

  it('throws for a non-array "dependencyFields"', () => {
    const notAnArray = 5;
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, dependencyFields: notAnArray })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('accepts a group with every optional field set', () => {
    const groups = [{ name: 'features', path: 'features', rank: 1, slice: { segment: 0 }, naming: 'keep-group' as const }];
    expect(readWorkspaceArchitectureOptions({ groups }).groups).toEqual(groups);
  });

  it('accepts a group slice of the namePrefix form', () => {
    const groups = [{ name: 'targets', slice: { namePrefix: true as const } }];
    expect(readWorkspaceArchitectureOptions({ groups }).groups).toEqual(groups);
  });

  it('throws for a group with an unknown property', () => {
    expect(() => readWorkspaceArchitectureOptions({ groups: [{ name: 'core', ranks: 0 }] })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for a group whose "path" is not a string', () => {
    const notAString = 5;
    expect(() => readWorkspaceArchitectureOptions({ groups: [{ name: 'core', path: notAString }] })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for a group whose "rank" is not a number', () => {
    expect(() => readWorkspaceArchitectureOptions({ groups: [{ name: 'core', rank: '0' }] })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for a group whose "slice" is neither shape', () => {
    expect(() => readWorkspaceArchitectureOptions({ groups: [{ name: 'core', slice: {} }] })).toThrow(MISCONFIGURATION_MESSAGE);
    expect(() => readWorkspaceArchitectureOptions({ groups: [{ name: 'core', slice: 'segment-0' }] })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for a group whose "naming" is not one of the three strategies', () => {
    expect(() => readWorkspaceArchitectureOptions({ groups: [{ name: 'core', naming: 'nonsense' }] })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it("accepts a group with naming explicitly set to 'drop-group' (not merely relying on the default)", () => {
    const groups = [{ name: 'core', naming: 'drop-group' as const }];
    expect(readWorkspaceArchitectureOptions({ groups }).groups).toEqual(groups);
  });

  it("accepts a group with naming explicitly set to 'basename'", () => {
    const groups = [{ name: 'core', naming: 'basename' as const }];
    expect(readWorkspaceArchitectureOptions({ groups }).groups).toEqual(groups);
  });

  it('passes through valid "nameRanks"', () => {
    const nameRanks = [{ pattern: '-contract$', rank: 0 }];
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, nameRanks }).nameRanks).toEqual(nameRanks);
  });

  it('throws for a "nameRanks" entry missing "pattern" or "rank"', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, nameRanks: [{ rank: 0 }] })).toThrow(MISCONFIGURATION_MESSAGE);
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, nameRanks: [{ pattern: 'x' }] })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws when only SOME "nameRanks" entries are valid', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, nameRanks: [{ pattern: 'x', rank: 0 }, { rank: 1 }] })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for a "nameRanks" entry with an unknown property', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, nameRanks: [{ pattern: 'x', rank: 0, weight: 1 }] })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('passes through a valid "defaultRank"', () => {
    const rank = 3;
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, defaultRank: rank }).defaultRank).toBe(rank);
  });

  it('throws for a non-number "defaultRank"', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, defaultRank: '3' })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('passes through valid "rankSkip"', () => {
    const rankSkip = { maxDistance: 1, exemptRanks: [0] };
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, rankSkip }).rankSkip).toEqual(rankSkip);
  });

  it('throws for a "rankSkip" missing "maxDistance"', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, rankSkip: { exemptRanks: [0] } })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for a "rankSkip" that is not an object at all', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, rankSkip: 'nonsense' })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for a "rankSkip" whose "exemptRanks" contains a non-number', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, rankSkip: { maxDistance: 1, exemptRanks: ['0'] } })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws when only SOME "rankSkip.exemptRanks" entries are numbers', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, rankSkip: { maxDistance: 1, exemptRanks: [0, '1'] } })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for a "rankSkip" whose "exemptRanks" is not an array', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, rankSkip: { maxDistance: 1, exemptRanks: 0 } })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for a "rankSkip" with an unknown property', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, rankSkip: { maxDistance: 1, exemptRanks: [], extra: true } })).toThrow(
      MISCONFIGURATION_MESSAGE,
    );
  });

  it('passes through valid "isolatedGroups"', () => {
    const groups = [{ name: 'core' }, { name: 'features' }, { name: 'verticals' }];
    const isolatedGroups = [['features', 'verticals']];
    expect(readWorkspaceArchitectureOptions({ groups, isolatedGroups }).isolatedGroups).toEqual(isolatedGroups);
  });

  it('throws for an "isolatedGroups" pair naming a group not declared in "groups"', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, isolatedGroups: [['features', 'verticals']] })).toThrow(
      '"isolatedGroups" names a group not declared in "groups"',
    );
  });

  it('throws for an "isolatedGroups" pair that is too short', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, isolatedGroups: [['features']] })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for an "isolatedGroups" pair that is too long, even though its first two entries are both genuine strings', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, isolatedGroups: [['features', 'verticals', 'extra']] })).toThrow(
      MISCONFIGURATION_MESSAGE,
    );
  });

  it('throws for an "isolatedGroups" pair whose second entry is not a string', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, isolatedGroups: [['features', 1]] })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for an "isolatedGroups" pair whose first entry is not a string, even though its second is', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, isolatedGroups: [[1, 'features']] })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws when only SOME "isolatedGroups" pairs are valid', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, isolatedGroups: [['a', 'b'], ['only-one']] })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for a non-array "isolatedGroups"', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, isolatedGroups: 'features' })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('passes through valid "naming" with both fields', () => {
    const naming = { scope: '@exacap', separator: '_' };
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, naming }).naming).toEqual(naming);
  });

  it('accepts "naming" with neither field set', () => {
    expect(readWorkspaceArchitectureOptions({ ...MINIMAL, naming: {} }).naming).toEqual({});
  });

  it('throws for a "naming.scope" that is not a string', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, naming: { scope: 5 } })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for a "naming.separator" that is not a string', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, naming: { separator: 5 } })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for a non-object "naming"', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, naming: 'scoped' })).toThrow(MISCONFIGURATION_MESSAGE);
  });

  it('throws for a "naming" with an unknown property', () => {
    expect(() => readWorkspaceArchitectureOptions({ ...MINIMAL, naming: { scope: '@x', prefix: '@x' } })).toThrow(MISCONFIGURATION_MESSAGE);
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
