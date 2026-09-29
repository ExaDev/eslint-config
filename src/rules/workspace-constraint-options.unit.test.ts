import { describe, expect, it } from 'vitest';
import {
  readAllow,
  readDevOnly,
  readExemptTargetGroups,
  readRequiredFiles,
  readRequiredScripts,
  workspaceConstraintOptionsSchema,
  type ConstraintContext,
} from './workspace-constraint-options';

const CONTEXT: ConstraintContext = { groupNames: new Set(['core', 'test']), dependencyFields: ['dependencies', 'devDependencies'] };

describe('readAllow', () => {
  const edge = { from: '@s/a', to: '@s/b', reason: 'a persists the contract types' };

  it('returns valid entries unchanged', () => {
    expect(readAllow([edge, { ...edge, to: '@s/c' }])).toEqual([edge, { ...edge, to: '@s/c' }]);
  });

  it('accepts an empty list', () => {
    expect(readAllow([])).toEqual([]);
  });

  it('rejects a non-array value', () => {
    expect(() => readAllow(edge)).toThrow('"allow" must be an array.');
  });

  it.each([null, 'x', ['x'], { ...edge, extra: 1 }, { from: 'a', to: 'b' }])('rejects the malformed entry %j', (entry) => {
    expect(() => readAllow([entry])).toThrow(/^@exadev\/eslint-config: "allow"/u);
  });

  it('rejects an entry with an empty or missing reason, naming why', () => {
    expect(() => readAllow([{ ...edge, reason: '' }])).toThrow('"reason" (an exception must say why it exists) must be a non-empty string.');
    expect(() => readAllow([{ ...edge, reason: 3 }])).toThrow('"reason"');
  });

  it('rejects an empty or non-string from or to', () => {
    expect(() => readAllow([{ ...edge, from: '' }])).toThrow('"from" must be a non-empty string.');
    expect(() => readAllow([{ ...edge, to: 1 }])).toThrow('"to" must be a non-empty string.');
  });

  it('rejects the same edge listed twice but allows the same source or target in different pairs', () => {
    expect(() => readAllow([edge, { ...edge, reason: 'again' }])).toThrow('lists the edge from "@s/a" to "@s/b" more than once.');
    const distinct = [edge, { ...edge, from: '@s/z' }, { ...edge, to: '@s/z' }];
    expect(readAllow(distinct)).toEqual(distinct);
  });

  it('treats a pair whose names merely concatenate alike as different edges', () => {
    expect(readAllow([{ ...edge, from: 'a,b', to: 'c' }, { ...edge, from: 'a', to: 'b,c' }])).toHaveLength(2);
  });
});

describe('readExemptTargetGroups', () => {
  it('returns valid entries', () => {
    expect(readExemptTargetGroups([{ group: 'test', fields: ['devDependencies'] }], CONTEXT)).toEqual([{ group: 'test', fields: ['devDependencies'] }]);
  });

  it('rejects a non-array, a malformed entry and an unknown key', () => {
    expect(() => readExemptTargetGroups('test', CONTEXT)).toThrow('"exemptTargetGroups" must be an array.');
    expect(() => readExemptTargetGroups(['test'], CONTEXT)).toThrow('"exemptTargetGroups" entries must be objects');
    expect(() => readExemptTargetGroups([{ group: 'test', fields: ['devDependencies'], x: 1 }], CONTEXT)).toThrow('"exemptTargetGroups" entries must be objects');
  });

  it('rejects a group that is not declared, or an empty group name', () => {
    expect(() => readExemptTargetGroups([{ group: 'nope', fields: ['devDependencies'] }], CONTEXT)).toThrow('names a group not declared in "groups" ("nope").');
    expect(() => readExemptTargetGroups([{ group: '', fields: ['devDependencies'] }], CONTEXT)).toThrow('"group" must be a non-empty string.');
  });

  it('rejects a group listed twice', () => {
    const entry = { group: 'test', fields: ['devDependencies'] };
    expect(() => readExemptTargetGroups([entry, entry], CONTEXT)).toThrow('lists group "test" more than once.');
  });

  it('rejects an empty fields list and a non-string field', () => {
    expect(() => readExemptTargetGroups([{ group: 'test', fields: [] }], CONTEXT)).toThrow('"fields" must not be empty.');
    expect(() => readExemptTargetGroups([{ group: 'test', fields: [1] }], CONTEXT)).toThrow('"fields" must be a non-empty string.');
    expect(() => readExemptTargetGroups([{ group: 'test', fields: 'devDependencies' }], CONTEXT)).toThrow('"exemptTargetGroups" must be an array.');
  });

  it('rejects a field that dependencyFields does not read, naming the fields that are read', () => {
    expect(() => readExemptTargetGroups([{ group: 'test', fields: ['peerDependencies'] }], CONTEXT)).toThrow(
      'exempts field "peerDependencies" for group "test", which is not among the "dependencyFields" being read (dependencies, devDependencies), so the exemption could never apply.',
    );
  });

  it('accepts every field when all are read, rejecting on the first that is not', () => {
    expect(readExemptTargetGroups([{ group: 'test', fields: ['dependencies', 'devDependencies'] }], CONTEXT)).toHaveLength(1);
    expect(() => readExemptTargetGroups([{ group: 'test', fields: ['dependencies', 'x'] }], CONTEXT)).toThrow('field "x"');
  });
});

describe('selectors, through readDevOnly', () => {
  it('accepts a bare pattern string, a group, a name pattern and both together', () => {
    expect(readDevOnly(['-testkit$', { group: 'test' }, { namePattern: '^x' }, { group: 'core', namePattern: 'y$' }], CONTEXT)).toEqual([
      '-testkit$',
      { group: 'test' },
      { namePattern: '^x' },
      { group: 'core', namePattern: 'y$' },
    ]);
  });

  it('rejects an empty list and a non-array', () => {
    expect(() => readDevOnly([], CONTEXT)).toThrow('"devOnly" must not be empty.');
    expect(() => readDevOnly('x', CONTEXT)).toThrow('"devOnly" must be an array.');
  });

  it('rejects an empty string selector', () => {
    expect(() => readDevOnly([''], CONTEXT)).toThrow('a selector must be a non-empty string.');
  });

  it('rejects an object selector with neither field, with an unknown key, or that is not an object', () => {
    expect(() => readDevOnly([{}], CONTEXT)).toThrow('selectors must name a "group", a "namePattern", or both.');
    expect(() => readDevOnly([{ other: 'x' }], CONTEXT)).toThrow('"devOnly" entries must be objects with only the keys "group", "namePattern".');
    expect(() => readDevOnly([true], CONTEXT)).toThrow('"devOnly" entries must be objects');
  });

  it('rejects an undeclared or non-string group', () => {
    expect(() => readDevOnly([{ group: 'nope' }], CONTEXT)).toThrow('selector names a group not declared in "groups" ("nope").');
    expect(() => readDevOnly([{ group: 3 }], CONTEXT)).toThrow('selector names a group not declared');
  });

  it('rejects an invalid or non-string name pattern, naming the option, the pattern and the cause', () => {
    expect(() => readDevOnly(['('], CONTEXT)).toThrow(/^@exadev\/eslint-config: "devOnly" pattern "\(" is not a valid regular expression: /u);
    expect(() => readDevOnly([{ namePattern: '*-testkit' }], CONTEXT)).toThrow('"devOnly" pattern "*-testkit" is not a valid regular expression');
    expect(() => readDevOnly([{ namePattern: 3 }], CONTEXT)).toThrow('"namePattern" must be a non-empty string.');
    expect(() => readDevOnly([{ namePattern: '' }], CONTEXT)).toThrow('"namePattern" must be a non-empty string.');
  });

  it('compiles patterns with the u flag, as nameRanks does', () => {
    expect(() => readDevOnly(['\\-'], CONTEXT)).toThrow('not a valid regular expression');
  });

  it('keeps an object selector that names only a group free of a namePattern key, and vice versa', () => {
    const [byGroup, byName] = readDevOnly([{ group: 'test' }, { namePattern: 'x' }], CONTEXT);
    expect(byGroup).not.toHaveProperty('namePattern');
    expect(byName).not.toHaveProperty('group');
  });
});

describe('readRequiredFiles', () => {
  it('returns valid entries with selectors validated', () => {
    expect(readRequiredFiles([{ packages: '-contract$', files: ['src/errors.ts', 'src/**/*.conformance.ts'] }], CONTEXT)).toEqual([
      { packages: '-contract$', files: ['src/errors.ts', 'src/**/*.conformance.ts'] },
    ]);
  });

  it('rejects a non-array, a malformed entry and an unknown key', () => {
    expect(() => readRequiredFiles({}, CONTEXT)).toThrow('"requiredFiles" must be an array.');
    expect(() => readRequiredFiles([1], CONTEXT)).toThrow('"requiredFiles" entries must be objects with only the keys "packages", "files".');
    expect(() => readRequiredFiles([{ packages: 'x', files: ['a'], more: 1 }], CONTEXT)).toThrow('"requiredFiles" entries must be objects');
  });

  it('rejects an empty or non-array files list', () => {
    expect(() => readRequiredFiles([{ packages: 'x', files: [] }], CONTEXT)).toThrow('"files" must not be empty.');
    expect(() => readRequiredFiles([{ packages: 'x', files: 'a' }], CONTEXT)).toThrow('"requiredFiles" must be an array.');
  });

  it('rejects an empty, absolute or escaping path but allows dots inside a name', () => {
    expect(() => readRequiredFiles([{ packages: 'x', files: [''] }], CONTEXT)).toThrow('"files" entries must be a non-empty string.');
    expect(() => readRequiredFiles([{ packages: 'x', files: ['/etc/passwd'] }], CONTEXT)).toThrow('path "/etc/passwd" must be relative to the package directory and stay inside it.');
    expect(() => readRequiredFiles([{ packages: 'x', files: ['a/../../b'] }], CONTEXT)).toThrow('stay inside it');
    expect(readRequiredFiles([{ packages: 'x', files: ['..a/b..c', '.env'] }], CONTEXT)[0]?.files).toEqual(['..a/b..c', '.env']);
  });

  it('validates the selector', () => {
    expect(() => readRequiredFiles([{ packages: { group: 'nope' }, files: ['a'] }], CONTEXT)).toThrow('"requiredFiles" selector names a group not declared');
  });
});

describe('readRequiredScripts', () => {
  it('returns string and object script requirements', () => {
    const value = [
      {
        match: { group: 'core' },
        scripts: ['typecheck', { name: 'lint', includes: ['--max-warnings 0'], excludes: ['--fix'] }, { name: 'boundaries', equals: 'turbo boundaries' }, { name: 'plain' }],
      },
    ];
    expect(readRequiredScripts(value, CONTEXT)).toEqual(value);
  });

  it('keeps optional content keys absent unless given', () => {
    const [entry] = readRequiredScripts([{ match: 'x', scripts: [{ name: 'a' }] }], CONTEXT);
    expect(entry?.scripts[0]).toStrictEqual({ name: 'a' });
  });

  it('accepts an empty-string equals: a script that must be blank', () => {
    expect(readRequiredScripts([{ match: 'x', scripts: [{ name: 'a', equals: '' }] }], CONTEXT)[0]?.scripts[0]).toStrictEqual({ name: 'a', equals: '' });
  });

  it('rejects a non-array, a malformed entry and an unknown key', () => {
    expect(() => readRequiredScripts(1, CONTEXT)).toThrow('"requiredScripts" must be an array.');
    expect(() => readRequiredScripts([null], CONTEXT)).toThrow('"requiredScripts" entries must be objects with only the keys "match", "scripts".');
    expect(() => readRequiredScripts([{ match: 'x', scripts: ['a'], z: 1 }], CONTEXT)).toThrow('"requiredScripts" entries must be objects');
  });

  it('rejects an empty or non-array scripts list', () => {
    expect(() => readRequiredScripts([{ match: 'x', scripts: [] }], CONTEXT)).toThrow('"scripts" must not be empty.');
    expect(() => readRequiredScripts([{ match: 'x', scripts: 'a' }], CONTEXT)).toThrow('"requiredScripts" must be an array.');
  });

  it('rejects an empty script name, string or object', () => {
    expect(() => readRequiredScripts([{ match: 'x', scripts: [''] }], CONTEXT)).toThrow('a script name must be a non-empty string.');
    expect(() => readRequiredScripts([{ match: 'x', scripts: [{ name: '' }] }], CONTEXT)).toThrow('"name" must be a non-empty string.');
  });

  it('rejects a script requirement that is neither a string nor an object with only the known keys', () => {
    expect(() => readRequiredScripts([{ match: 'x', scripts: [true] }], CONTEXT)).toThrow('"requiredScripts" entries must be objects with only the keys "name", "equals", "includes", "excludes".');
    expect(() => readRequiredScripts([{ match: 'x', scripts: [{ name: 'a', other: 1 }] }], CONTEXT)).toThrow('entries must be objects');
  });

  it('rejects a non-string equals', () => {
    expect(() => readRequiredScripts([{ match: 'x', scripts: [{ name: 'a', equals: 1 }] }], CONTEXT)).toThrow('"equals" must be a string.');
  });

  it('rejects empty, non-array or token-less includes and excludes', () => {
    expect(() => readRequiredScripts([{ match: 'x', scripts: [{ name: 'a', includes: [] }] }], CONTEXT)).toThrow('"includes" must not be empty.');
    expect(() => readRequiredScripts([{ match: 'x', scripts: [{ name: 'a', excludes: '--x' }] }], CONTEXT)).toThrow('"requiredScripts" must be an array.');
    expect(() => readRequiredScripts([{ match: 'x', scripts: [{ name: 'a', excludes: [''] }] }], CONTEXT)).toThrow('"excludes" must be a non-empty string.');
    expect(() => readRequiredScripts([{ match: 'x', scripts: [{ name: 'a', includes: ['  '] }] }], CONTEXT)).toThrow('"includes" entry "  " contains no tokens.');
  });

  it('validates the selector', () => {
    expect(() => readRequiredScripts([{ match: {}, scripts: ['a'] }], CONTEXT)).toThrow('"requiredScripts" selectors must name');
  });
});

describe('workspaceConstraintOptionsSchema', () => {
  it('declares exactly the five constraint options', () => {
    expect(Object.keys(workspaceConstraintOptionsSchema).sort()).toEqual(['allow', 'devOnly', 'exemptTargetGroups', 'requiredFiles', 'requiredScripts']);
  });
});
