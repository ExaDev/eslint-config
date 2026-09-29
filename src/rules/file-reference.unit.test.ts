import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileReferenceSchema, readFileReference, readReferencedJson, resolveFileReference, type FileReferenceContext } from './file-reference';
import type { WorkspaceFs } from './workspace-fs';

function fakeFs(files: Readonly<Record<string, string>>): WorkspaceFs {
  return {
    existsSync: (path) => path in files,
    readFileSync: (path) => {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);

      return content;
    },
    readdirSync: () => [],
    realpathSync: (path) => path,
  };
}

function contextFor(files: Readonly<Record<string, string>>, filename: string, rootOption?: string): FileReferenceContext {
  return { fs: fakeFs(files), filename, rootOption };
}

describe('fileReferenceSchema', () => {
  it('requires a non-empty path and only allows file or root as the base', () => {
    expect(fileReferenceSchema).toStrictEqual({
      type: 'object',
      properties: { path: { type: 'string', minLength: 1 }, relativeTo: { type: 'string', enum: ['file', 'root'] } },
      required: ['path'],
      additionalProperties: false,
    });
  });
});

describe('readFileReference', () => {
  it('reads a path alone', () => {
    expect(readFileReference({ path: 'a.json' }, 'ref')).toStrictEqual({ path: 'a.json' });
  });

  it('reads a path with each base', () => {
    expect(readFileReference({ path: 'a.json', relativeTo: 'file' }, 'ref')).toStrictEqual({ path: 'a.json', relativeTo: 'file' });
    expect(readFileReference({ path: 'a.json', relativeTo: 'root' }, 'ref')).toStrictEqual({ path: 'a.json', relativeTo: 'root' });
  });

  it.each([
    ['a string', 'a.json'],
    ['null', null],
    ['an array', ['a.json']],
    ['a missing path', {}],
    ['a non-string path', { path: 1 }],
    ['an empty path', { path: '' }],
    ['an unknown key', { path: 'a.json', extra: true }],
    ['an unknown base', { path: 'a.json', relativeTo: 'cwd' }],
    ['an undefined-valued unknown key', { path: 'a.json', extra: undefined }],
  ])('rejects %s, naming the option', (_label, value) => {
    expect(() => readFileReference(value, 'myRef')).toThrow('@exadev/eslint-config: "myRef" must be { path: string, relativeTo?: "file" | "root" }.');
  });
});

describe('resolveFileReference', () => {
  const filename = '/repo/packages/a/package.json';

  it('resolves against the linted file\'s directory by default', () => {
    expect(resolveFileReference({ path: 'tsconfig.json' }, contextFor({}, filename))).toBe('/repo/packages/a/tsconfig.json');
  });

  it('resolves upwards from the linted file\'s directory', () => {
    expect(resolveFileReference({ path: '../b/x.json', relativeTo: 'file' }, contextFor({}, filename))).toBe('/repo/packages/b/x.json');
  });

  it('resolves against the workspace root found from pnpm-workspace.yaml', () => {
    const context = contextFor({ '/repo/pnpm-workspace.yaml': '' }, filename);
    expect(resolveFileReference({ path: 'turbo.json', relativeTo: 'root' }, context)).toBe('/repo/turbo.json');
  });

  it('resolves against an explicit root option', () => {
    const context = contextFor({}, filename, '/somewhere');
    expect(resolveFileReference({ path: 'turbo.json', relativeTo: 'root' }, context)).toBe(resolve('/somewhere/turbo.json'));
  });

  it('throws when the root is requested and cannot be found', () => {
    expect(() => resolveFileReference({ path: 'turbo.json', relativeTo: 'root' }, contextFor({}, filename))).toThrow(/no ancestor "pnpm-workspace.yaml"/);
  });

  it('uses an absolute path as given', () => {
    expect(resolveFileReference({ path: '/abs/x.json' }, contextFor({}, filename))).toBe('/abs/x.json');
    expect(dirname('/abs/x.json')).toBe('/abs');
  });
});

describe('readReferencedJson', () => {
  const filename = '/repo/packages/a/package.json';

  it('reads a sibling file as JSONC', () => {
    const context = contextFor({ '/repo/packages/a/tsconfig.json': '{ // c\n "extends": "../base", }' }, filename);
    expect(readReferencedJson({ path: 'tsconfig.json' }, context)).toStrictEqual({ extends: '../base' });
  });

  it('reads a root file', () => {
    const context = contextFor({ '/repo/pnpm-workspace.yaml': '', '/repo/turbo.json': '{"tasks": {}}' }, filename);
    expect(readReferencedJson({ path: 'turbo.json', relativeTo: 'root' }, context)).toStrictEqual({ tasks: {} });
  });

  it('returns undefined for a file that does not exist', () => {
    expect(readReferencedJson({ path: 'missing.json' }, contextFor({}, filename))).toBeUndefined();
  });

  it('throws naming the file when it exists but is not valid JSONC', () => {
    const context = contextFor({ '/repo/packages/a/bad.json': '{"a": }' }, filename);
    expect(() => readReferencedJson({ path: 'bad.json' }, context)).toThrow('could not parse "/repo/packages/a/bad.json"');
  });
});
