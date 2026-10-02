import { describe, expect, it } from 'vitest';
import { readPackageRequirementsOptions } from './package-requirements-options';

const read = (requirements: unknown) => readPackageRequirementsOptions({ requirements });

describe('readPackageRequirementsOptions', () => {
  it('reads every field of a requirement', () => {
    const requirement = {
      when: { private: false, root: true, namePattern: '^@scope/', declares: ['husky'] },
      scripts: ['build', { name: 'prepare', includes: ['husky'] }],
      files: ['.husky', { glob: 'knip.{json,ts}', orFields: ['knip', ['config', 'knip']] }],
      fields: ['engines'],
    };
    expect(read([requirement])).toEqual({ requirements: [requirement] });
  });

  it('keeps a requirement that lists only one of scripts, files and fields', () => {
    expect(read([{ fields: ['engines'] }])).toEqual({ requirements: [{ fields: ['engines'] }] });
    expect(read([{ files: ['a'] }])).toEqual({ requirements: [{ files: ['a'] }] });
    expect(read([{ scripts: ['a'] }])).toEqual({ requirements: [{ scripts: ['a'] }] });
  });

  it.each([
    ['options that are not an object', () => readPackageRequirementsOptions('x'), /options must be an object/u],
    ['an unknown top-level key', () => readPackageRequirementsOptions({ requirements: [{ fields: ['a'] }], extra: 1 }), /unknown key "extra"/u],
    ['no requirements key', () => readPackageRequirementsOptions({}), /"requirements" to be a non-empty array/u],
    ['an empty requirements list', () => read([]), /"requirements" to be a non-empty array/u],
    ['a requirement that is not an object', () => read(['x']), /must be an array of objects/u],
    ['an unknown requirement key', () => read([{ fields: ['a'], what: 1 }]), /unknown key "what"/u],
    ['a requirement that requires nothing', () => read([{ when: { root: true } }]), /list "scripts", "files" or "fields"/u],
    ['a when that is not an object', () => read([{ when: 'x', fields: ['a'] }]), /"when" to be an object/u],
    ['an empty when', () => read([{ when: {}, fields: ['a'] }]), /at least one condition/u],
    ['an unknown when key', () => read([{ when: { public: true }, fields: ['a'] }]), /unknown key "public"/u],
    ['a non-boolean private', () => read([{ when: { private: 'no' }, fields: ['a'] }]), /"when.private" to be a boolean/u],
    ['a non-boolean root', () => read([{ when: { root: 1 }, fields: ['a'] }]), /"when.root" to be a boolean/u],
    ['an invalid name pattern', () => read([{ when: { namePattern: '(' }, fields: ['a'] }]), /when\.namePattern" pattern "\(" is not a valid regular expression/u],
    ['an empty name pattern', () => read([{ when: { namePattern: '' }, fields: ['a'] }]), /"when.namePattern" to be a non-empty string/u],
    ['an empty declares list', () => read([{ when: { declares: [] }, fields: ['a'] }]), /"when.declares" to be a non-empty array/u],
    ['a non-string field', () => read([{ fields: [1] }]), /"fields" to be a non-empty array of non-empty strings/u],
    ['an empty scripts list', () => read([{ scripts: [] }]), /"scripts" to be a non-empty array/u],
    ['a malformed script requirement', () => read([{ scripts: [{ name: 'a', what: 1 }] }]), /exadev\/package-requirements" entries must be objects with only the keys/u],
    ['an empty files list', () => read([{ files: [] }]), /"files" to be a non-empty array/u],
    ['an absolute path', () => read([{ files: ['/etc'] }]), /path "\/etc" must be relative/u],
    ['a path that climbs out of the package', () => read([{ files: ['../x'] }]), /path "\.\.\/x" must be relative/u],
    ['an unbalanced brace', () => read([{ files: ['a.{b'] }]), /has an unmatched "\{"/u],
    ['a files entry that is neither a string nor an object', () => read([{ files: [1] }]), /each "files" entry to be a path or an object/u],
    ['a files object without orFields', () => read([{ files: [{ glob: 'a' }] }]), /non-empty string "glob" and a non-empty "orFields" array/u],
    ['a files object with an empty orFields list', () => read([{ files: [{ glob: 'a', orFields: [] }] }]), /non-empty "orFields" array/u],
    ['a files object with an empty glob', () => read([{ files: [{ glob: '', orFields: ['a'] }] }]), /non-empty string "glob"/u],
    ['an orFields entry that is neither a name nor a path', () => read([{ files: [{ glob: 'a', orFields: [1] }] }]), /each "orFields" entry/u],
    ['an empty orFields path', () => read([{ files: [{ glob: 'a', orFields: [[]] }] }]), /each "orFields" entry/u],
    ['a files object with an unknown key', () => read([{ files: [{ glob: 'a', orFields: ['b'], c: 1 }] }]), /unknown key "c"/u],
  ])('rejects %s', (_, run, message) => {
    expect(run).toThrow(message);
  });
});
