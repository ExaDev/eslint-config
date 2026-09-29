import json from '@eslint/json';
import { Linter, RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import { turboOptionsSchema } from './turbo-options';
import turboPackageTags, { createTurboPackageTagsRule } from './turbo-package-tags';

const fs = createMemoryFs({
  '/repo/turbo.json': '{"boundaries": {}}',
  '/repo/pnpm-workspace.yaml': "packages:\n  - 'core/*'\n  - 'apps/*'\n  - 'stray/*'\n",
  '/repo/core/kv/package.json': '{}',
  '/repo/core/kv/turbo.json': '{"extends": ["//"], "tags": ["core"]}',
  '/repo/core/loose/package.json': '{}',
  '/repo/core/loose/turbo.json': '{"extends": ["//"], "tags": ["misc"]}',
  '/repo/core/bare/package.json': '{}',
  '/repo/core/detached/package.json': '{}',
  '/repo/core/detached/turbo.json': '{"tags": ["core"]}',
  '/repo/core/untagged/package.json': '{}',
  '/repo/core/untagged/turbo.json': '{"extends": ["//"]}',
  '/repo/apps/web/package.json': '{}',
  '/repo/apps/web/turbo.json': '{"extends": ["//"], "tags": ["app"]}',
  '/repo/stray/x/package.json': '{}',
  '/repo/stray/x/turbo.json': '{"extends": ["//"], "tags": ["x"]}',
  '/repo/scratch/package.json': '{}',
  '/lonely/a/package.json': '{}',
});

const rule = createTurboPackageTagsRule({ fs });
const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

const GROUPS = [{ name: 'core' }, { name: 'app', path: 'apps' }];

function manifest(name: string | undefined): string {
  return JSON.stringify(name === undefined ? {} : { name }, null, 2);
}

describe('turbo-package-tags meta', () => {
  it('carries the documented languages, docs and messages', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: the rule always defines its own meta object literal.');
    expect(meta.type).toBe('problem');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.schema).toEqual([turboOptionsSchema]);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Require every workspace package to have a turbo.json that extends the root and carries boundary tags, including its group name when groups are configured.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-package-tags.ts');
    expect(meta.messages).toEqual({
      missingTurboJson: 'Package "{{name}}" has no turbo.json. "turbo boundaries" needs one with "extends": ["//"] and a "tags" list.',
      notExtendingRoot: 'The turbo.json of package "{{name}}" must extend the root configuration with "extends": ["//"].',
      missingTags: 'The turbo.json of package "{{name}}" declares no "tags", so "turbo boundaries" cannot apply tag rules to it.',
      missingGroupTag: 'The turbo.json of package "{{name}}" must carry the tag "{{group}}", the name of the group its directory belongs to.',
    });
  });

  it('is exported as a ready-made rule', () => {
    expect(turboPackageTags.meta?.docs?.url).toBe(rule.meta?.docs?.url);
  });
});

ruleTester.run('turbo-package-tags', rule, {
  valid: [
    // Extends the root and carries a tag, with no groups configured.
    { code: manifest('kv'), filename: '/repo/core/kv/package.json' },
    // The tag equals the group name, for a group with and without its own path.
    { code: manifest('kv'), filename: '/repo/core/kv/package.json', options: [{ boundaries: { groups: GROUPS } }] },
    { code: manifest('web'), filename: '/repo/apps/web/package.json', options: [{ boundaries: { groups: GROUPS } }] },
    // The root package is not a workspace member.
    { code: manifest('root'), filename: '/repo/package.json' },
    // A manifest outside the workspace globs is not checked.
    { code: manifest('scratch'), filename: '/repo/scratch/package.json' },
    // Not part of a turbo repository.
    { code: manifest('a'), filename: '/lonely/a/package.json' },
    // The packages option replaces the workspace file's globs.
    { code: manifest('bare'), filename: '/repo/core/bare/package.json', options: [{ packages: ['apps/*'] }] },
    // A nested object is not the manifest.
    { code: JSON.stringify({ nested: { name: 'x' } }), filename: '/repo/scratch/package.json' },
  ],
  invalid: [
    {
      code: manifest('bare'),
      filename: '/repo/core/bare/package.json',
      errors: [
        {
          message: 'Package "bare" has no turbo.json. "turbo boundaries" needs one with "extends": ["//"] and a "tags" list.',
          line: 1,
          column: 1,
        },
      ],
    },
    {
      code: manifest('detached'),
      filename: '/repo/core/detached/package.json',
      errors: [{ message: 'The turbo.json of package "detached" must extend the root configuration with "extends": ["//"].' }],
    },
    {
      code: manifest('untagged'),
      filename: '/repo/core/untagged/package.json',
      errors: [{ message: 'The turbo.json of package "untagged" declares no "tags", so "turbo boundaries" cannot apply tag rules to it.' }],
    },
    {
      code: manifest('loose'),
      filename: '/repo/core/loose/package.json',
      options: [{ boundaries: { groups: GROUPS } }],
      errors: [{ message: 'The turbo.json of package "loose" must carry the tag "core", the name of the group its directory belongs to.' }],
    },
    // A nested object in the manifest is not checked a second time.
    {
      code: JSON.stringify({ name: 'bare', nested: { name: 'inner' } }, null, 2),
      filename: '/repo/core/bare/package.json',
      errors: [{ messageId: 'missingTurboJson', data: { name: 'bare' } }],
    },
    // A package with no name is identified by its directory.
    {
      code: manifest(undefined),
      filename: '/repo/core/bare/package.json',
      errors: [{ messageId: 'missingTurboJson', data: { name: 'core/bare' } }],
    },
  ],
});

describe('turbo-package-tags groups', () => {
  const linter = new Linter({ cwd: '/repo' });
  const verify = (filename: string, options: unknown) =>
    linter.verify(manifest('x'), [{ files: ['**'], language: 'json/json', plugins: { json, exadev: { rules: { rule } } }, rules: { 'exadev/rule': ['error', options] } }], filename);

  it('throws for a workspace package under no configured group, naming its directory', () => {
    expect(() => verify('/repo/stray/x/package.json', { boundaries: { groups: GROUPS } })).toThrow('workspace package directory "stray/x" is not covered by any "boundaries.groups" path');
  });

  it('does not throw for a package under a group', () => {
    expect(verify('/repo/core/kv/package.json', { boundaries: { groups: GROUPS } })).toEqual([]);
  });

  it('rejects an unknown option through the schema', () => {
    expect(() => verify('/repo/core/kv/package.json', { boundaries: { group: [] } })).toThrow(/group/u);
  });
});
