import { describe, expect, it } from 'vitest';
import { appliesTo, applicableRequirements, collectScripts, fieldPathKey, missingFiles, unsetFields, type ManifestFacts } from './package-requirements-checks';
import { createMemoryFs } from './memory-fs';

const FACTS: ManifestFacts = {
  isPrivate: false,
  isRoot: false,
  name: '@scope/pkg',
  declared: new Set(['husky', 'vitest']),
  setFields: new Set(['name', 'engines']),
  setPaths: new Set([fieldPathKey('name'), fieldPathKey('engines'), fieldPathKey(['engines', 'node'])]),
};

describe('appliesTo', () => {
  it('applies to every manifest without a condition', () => {
    expect(appliesTo(undefined, FACTS)).toBe(true);
  });

  it('requires private to equal the manifest in both directions', () => {
    expect(appliesTo({ private: false }, FACTS)).toBe(true);
    expect(appliesTo({ private: true }, FACTS)).toBe(false);
    expect(appliesTo({ private: true }, { ...FACTS, isPrivate: true })).toBe(true);
    expect(appliesTo({ private: false }, { ...FACTS, isPrivate: true })).toBe(false);
  });

  it('requires root to equal the manifest in both directions', () => {
    expect(appliesTo({ root: true }, FACTS)).toBe(false);
    expect(appliesTo({ root: false }, FACTS)).toBe(true);
    expect(appliesTo({ root: true }, { ...FACTS, isRoot: true })).toBe(true);
  });

  it('matches the name pattern, and never matches a manifest without a name', () => {
    expect(appliesTo({ namePattern: '^@scope/' }, FACTS)).toBe(true);
    expect(appliesTo({ namePattern: '^@other/' }, FACTS)).toBe(false);
    expect(appliesTo({ namePattern: '.*' }, { ...FACTS, name: undefined })).toBe(false);
  });

  it('holds when any listed dependency is declared', () => {
    expect(appliesTo({ declares: ['husky'] }, FACTS)).toBe(true);
    expect(appliesTo({ declares: ['knip', 'vitest'] }, FACTS)).toBe(true);
    expect(appliesTo({ declares: ['knip'] }, FACTS)).toBe(false);
  });

  it('needs every stated condition to hold', () => {
    expect(appliesTo({ private: false, declares: ['husky'] }, FACTS)).toBe(true);
    expect(appliesTo({ private: false, declares: ['knip'] }, FACTS)).toBe(false);
    expect(appliesTo({ private: true, declares: ['husky'] }, FACTS)).toBe(false);
    expect(appliesTo({ private: false, root: true, declares: ['husky'], namePattern: 'pkg' }, FACTS)).toBe(false);
  });
});

describe('applicableRequirements', () => {
  it('keeps the requirements whose condition holds, in order', () => {
    const everywhere = { fields: ['a'] };
    const privateOnly = { when: { private: true }, fields: ['b'] };
    const publishable = { when: { private: false }, fields: ['c'] };
    expect(applicableRequirements([everywhere, privateOnly, publishable], FACTS)).toEqual([everywhere, publishable]);
  });
});

describe('collectScripts', () => {
  it('concatenates the scripts of every requirement and skips those without any', () => {
    expect(collectScripts([{ scripts: ['a', { name: 'b', includes: ['x'] }] }, { fields: ['f'] }, { scripts: ['c'] }])).toEqual(['a', { name: 'b', includes: ['x'] }, 'c']);
  });
});

describe('unsetFields', () => {
  it('lists the required fields the manifest does not set, once each, in order', () => {
    expect(unsetFields([{ fields: ['engines', 'packageManager'] }, { fields: ['packageManager', 'files'] }, { scripts: ['x'] }], FACTS)).toEqual(['packageManager', 'files']);
  });
});

describe('missingFiles', () => {
  const fs = createMemoryFs({ '/pkg/.husky/pre-commit': '', '/pkg/knip.json': '', '/pkg/src/a.ts': '' });

  it('lists the required paths that do not exist, once each, in order', () => {
    expect(missingFiles([{ files: ['.husky', 'src/b.ts'] }, { files: ['src/b.ts', 'nope/**/*.ts'] }], fs, '/pkg', FACTS)).toEqual(['src/b.ts', 'nope/**/*.ts']);
  });

  it('accepts a glob that matches an existing path', () => {
    expect(missingFiles([{ files: ['knip.{json,ts}', 'src/*.ts'] }], fs, '/pkg', FACTS)).toEqual([]);
  });

  it('accepts a set manifest field instead of the file, and names both when neither exists', () => {
    const entry = { glob: 'syncpack.config.*', orFields: ['syncpack', ['config', 'syncpack']] };
    expect(missingFiles([{ files: [entry] }], fs, '/pkg', { ...FACTS, setPaths: new Set([fieldPathKey('syncpack')]) })).toEqual([]);
    expect(missingFiles([{ files: [entry] }], fs, '/pkg', { ...FACTS, setPaths: new Set([fieldPathKey(['config', 'syncpack'])]) })).toEqual([]);
    expect(missingFiles([{ files: [entry] }], fs, '/pkg', FACTS)).toEqual(['one of syncpack.config.* (or a "syncpack" or "config.syncpack" property)']);
    expect(missingFiles([{ files: [{ glob: 'knip.json', orFields: ['knip'] }] }], fs, '/pkg', FACTS)).toEqual([]);
  });

  it('does not take a nested property for the top-level field of the same name', () => {
    const entry = { glob: 'syncpack.config.*', orFields: ['syncpack'] };
    expect(missingFiles([{ files: [entry] }], fs, '/pkg', { ...FACTS, setPaths: new Set([fieldPathKey(['config', 'syncpack'])]) })).toEqual(['one of syncpack.config.* (or a "syncpack" property)']);
  });

  it('lists nothing for requirements without files', () => {
    expect(missingFiles([{ fields: ['a'] }], fs, '/pkg', FACTS)).toEqual([]);
  });
});
