import { describe, expect, it } from 'vitest';
import { readImportPolicies } from './import-policy-options';

const DENY = { specifiers: ['fs'], message: 'not in workers' };

describe('readImportPolicies', () => {
  it('returns the normalised policies, keeping only the fields given', () => {
    expect(
      readImportPolicies([
        {
          files: ['src/**'],
          ignores: ['src/legacy/**'],
          deny: [{ ...DENY, importNames: ['readFile'], allowTypeImports: true }],
          confine: [{ specifiers: ['sdk'], onlyIn: ['src/adapter.ts'], allowTypeImports: false, message: 'use the adapter' }],
          exceptEdges: [{ file: 'src/a.ts', specifier: 'fs', reason: 'needed' }],
          computedSpecifiers: 'report',
        },
        { files: ['src/**'], deny: [DENY] },
      ]),
    ).toStrictEqual([
      {
        files: ['src/**'],
        ignores: ['src/legacy/**'],
        deny: [{ specifiers: ['fs'], importNames: ['readFile'], allowTypeImports: true, message: 'not in workers' }],
        confine: [{ specifiers: ['sdk'], onlyIn: ['src/adapter.ts'], allowTypeImports: false, message: 'use the adapter' }],
        exceptEdges: [{ file: 'src/a.ts', specifier: 'fs', reason: 'needed' }],
        computedSpecifiers: 'report',
      },
      { files: ['src/**'], deny: [{ specifiers: ['fs'], message: 'not in workers' }] },
    ]);
  });

  it('rejects a policy list that is not an array of objects', () => {
    expect(() => readImportPolicies({})).toThrow(/must be an array of objects/u);
    expect(() => readImportPolicies(['x'])).toThrow(/must be an array of objects/u);
  });

  it('rejects unknown keys at every level', () => {
    expect(() => readImportPolicies([{ files: ['a'], deny: [DENY], nope: 1 }])).toThrow(/unknown key "nope"/u);
    expect(() => readImportPolicies([{ files: ['a'], deny: [{ ...DENY, nope: 1 }] }])).toThrow(/unknown key "nope"/u);
    expect(() => readImportPolicies([{ files: ['a'], confine: [{ specifiers: ['x'], onlyIn: ['a'], nope: 1 }] }])).toThrow(/unknown key "nope"/u);
    expect(() => readImportPolicies([{ files: ['a'], deny: [DENY], exceptEdges: [{ file: 'a', specifier: 'fs', reason: 'r', nope: 1 }] }])).toThrow(/unknown key "nope"/u);
  });

  it('requires files with an include, and a deny or confine entry', () => {
    expect(() => readImportPolicies([{ deny: [DENY] }])).toThrow(/array of glob strings/u);
    expect(() => readImportPolicies([{ files: ['!a'], deny: [DENY] }])).toThrow(/does not start with "!"/u);
    expect(() => readImportPolicies([{ files: ['a'] }])).toThrow(/at least one "deny" or "confine"/u);
    expect(() => readImportPolicies([{ files: ['a'], deny: [] }])).toThrow(/at least one "deny" or "confine"/u);
    expect(() => readImportPolicies([{ files: ['a'], ignores: ['!b'], deny: [DENY] }])).toThrow(/does not start with "!"/u);
  });

  it('requires a message on every deny entry, naming the requirement', () => {
    expect(() => readImportPolicies([{ files: ['a'], deny: [{ specifiers: ['fs'] }] }])).toThrow(/non-empty string "message"/u);
    expect(() => readImportPolicies([{ files: ['a'], deny: [{ specifiers: ['fs'], message: '' }] }])).toThrow(/non-empty string "message"/u);
  });

  it('validates specifier lists, importNames, booleans and confine fields', () => {
    expect(() => readImportPolicies([{ files: ['a'], deny: [{ specifiers: [], message: 'm' }] }])).toThrow(/"specifiers"/u);
    expect(() => readImportPolicies([{ files: ['a'], deny: [{ ...DENY, importNames: [] }] }])).toThrow(/"importNames"/u);
    expect(() => readImportPolicies([{ files: ['a'], deny: [{ ...DENY, allowTypeImports: 'yes' }] }])).toThrow(/"allowTypeImports" to be a boolean/u);
    expect(() => readImportPolicies([{ files: ['a'], confine: [{ specifiers: ['x'], onlyIn: [] }] }])).toThrow(/"importPolicies.confine.onlyIn" must contain at least one glob/u);
    expect(() => readImportPolicies([{ files: ['a'], confine: [{ specifiers: ['x'], onlyIn: ['a'], message: '' }] }])).toThrow(/non-empty string "message"/u);
    expect(() => readImportPolicies([{ files: ['a'], confine: [{ specifiers: ['x'], onlyIn: ['a'], allowTypeImports: 1 }] }])).toThrow(/"allowTypeImports" to be a boolean/u);
    expect(() => readImportPolicies([{ files: ['a'], confine: [{ specifiers: ['x'], onlyIn: ['!a'] }] }])).toThrow(/does not start with "!"/u);
  });

  it('accepts computedSpecifiers as ignore or report and rejects anything else', () => {
    expect(readImportPolicies([{ files: ['a'], deny: [DENY], computedSpecifiers: 'ignore' }])).toStrictEqual([{ files: ['a'], deny: [DENY], computedSpecifiers: 'ignore' }]);
    expect(() => readImportPolicies([{ files: ['a'], deny: [DENY], computedSpecifiers: 'warn' }])).toThrow(/"computedSpecifiers" to be one of "ignore", "report"/u);
    expect(() => readImportPolicies([{ files: ['a'], deny: [DENY], computedSpecifiers: true }])).toThrow(/"computedSpecifiers" to be one of/u);
  });

  describe('exception edges', () => {
    const policy = (edge: unknown) => [{ files: ['src/**'], ignores: ['src/skip/**'], deny: [DENY], confine: [{ specifiers: ['sdk'], onlyIn: ['src/adapter.ts'] }], exceptEdges: [edge] }];

    it('accepts an edge into a deny entry and into a confine entry', () => {
      expect(() => readImportPolicies(policy({ file: 'src/a.ts', specifier: 'fs', reason: 'r' }))).not.toThrow();
      expect(() => readImportPolicies(policy({ file: 'src/a.ts', specifier: 'sdk/sub', reason: 'r' }))).not.toThrow();
    });

    it('requires a reason', () => {
      expect(() => readImportPolicies(policy({ file: 'src/a.ts', specifier: 'fs' }))).toThrow(/non-empty string "reason"/u);
      expect(() => readImportPolicies(policy({ file: 'src/a.ts', specifier: 'fs', reason: '' }))).toThrow(/non-empty string "reason"/u);
    });

    it('rejects a wildcard in the file or the specifier, naming which', () => {
      expect(() => readImportPolicies(policy({ file: 'src/*.ts', specifier: 'fs', reason: 'r' }))).toThrow(/"file" to be exact.*src\/\*\.ts/u);
      expect(() => readImportPolicies(policy({ file: 'src/a.ts', specifier: 'fs/*', reason: 'r' }))).toThrow(/"specifier" to be exact/u);
      expect(() => readImportPolicies(policy({ file: 'src/{a,b}.ts', specifier: 'fs', reason: 'r' }))).toThrow(/"file" to be exact/u);
      expect(() => readImportPolicies(policy({ file: 'src/[a].ts', specifier: 'fs', reason: 'r' }))).toThrow(/"file" to be exact/u);
      expect(() => readImportPolicies(policy({ file: 'src/a?.ts', specifier: 'fs', reason: 'r' }))).toThrow(/"file" to be exact/u);
    });

    it('rejects an edge into a specifier that a confine entry allows in that very file', () => {
      expect(() => readImportPolicies(policy({ file: 'src/adapter.ts', specifier: 'sdk', reason: 'r' }))).toThrow(/not forbidden there/u);
      expect(() => readImportPolicies(policy({ file: 'src/adapter.ts', specifier: 'fs', reason: 'r' }))).not.toThrow();
    });

    it('stores the file in its normalised spelling, which the rule compares as a string', () => {
      const [read] = readImportPolicies(policy({ file: './src/../src/a.ts', specifier: 'fs', reason: 'r' }));
      expect(read?.exceptEdges).toEqual([{ file: 'src/a.ts', specifier: 'fs', reason: 'r' }]);
    });

    it('rejects an edge that could never apply', () => {
      expect(() => readImportPolicies(policy({ file: 'lib/a.ts', specifier: 'fs', reason: 'r' }))).toThrow(/names a file the policy's files do not select/u);
      expect(() => readImportPolicies(policy({ file: 'src/skip/a.ts', specifier: 'fs', reason: 'r' }))).toThrow(/names a file the policy's files do not select/u);
      expect(() => readImportPolicies(policy({ file: 'src/a.ts', specifier: 'path', reason: 'r' }))).toThrow(/not forbidden there by any deny entry/u);
    });
  });
});
