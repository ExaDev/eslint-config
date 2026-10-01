import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import { createPackageRequirementsRule } from './package-requirements';
import type { PackageRequirement } from './package-requirements-options';

const CWD = process.cwd();

// The files of a fabricated package directory under the working directory, so the root manifest is the one in CWD itself.
const fs = createMemoryFs({ [`${CWD}/.husky/pre-commit`]: '', [`${CWD}/packages/lib/dist/index.js`]: '' });
const rule = createPackageRequirementsRule(fs);
const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

const ROOT_FILE = `${CWD}/package.json`;
const LIB_FILE = `${CWD}/packages/lib/package.json`;

function manifest(fields: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(fields, null, 2);
}

function options(...requirements: readonly PackageRequirement[]): [{ requirements: readonly PackageRequirement[] }] {
  return [{ requirements }];
}

describe('createPackageRequirementsRule meta', () => {
  it('carries the documented languages, docs and messages', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: createPackageRequirementsRule always defines its own meta object literal.');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/package-requirements.ts');
    expect(meta.messages).toEqual({
      unsetFields: 'Package "{{name}}" must set: {{fields}}.',
      missingFiles: 'Package "{{name}}" is missing required file(s): {{files}}.',
      missingScripts: 'Package "{{name}}" is missing required script(s): {{scripts}}.',
      notEqual: 'Script "{{script}}" in "{{name}}" must be exactly "{{expected}}", but is "{{actual}}".',
      missingFlag: 'Script "{{script}}" in "{{name}}" must contain "{{expected}}", but is "{{actual}}".',
      forbiddenFlag: 'Script "{{script}}" in "{{name}}" must not contain "{{expected}}", but is "{{actual}}".',
    });
  });
});

const PUBLISHABLE: PackageRequirement = { when: { private: false }, scripts: [{ name: 'prepublishOnly', includes: ['publint', 'attw'] }], fields: ['engines'] };

ruleTester.run('package-requirements', rule, {
  valid: [
    // A publishable package that meets every requirement.
    { code: manifest({ name: 'lib', engines: { node: '>=20' }, scripts: { prepublishOnly: 'tsdown && publint && attw --pack' } }), filename: LIB_FILE, options: options(PUBLISHABLE) },
    // A private package is outside the condition.
    { code: manifest({ name: 'app', private: true }), filename: LIB_FILE, options: options(PUBLISHABLE) },
    // `"private": false` is publishable, so it is held to the requirement.
    { code: manifest({ name: 'lib', private: false, engines: { node: '>=20' }, scripts: { prepublishOnly: 'publint && attw' } }), filename: LIB_FILE, options: options(PUBLISHABLE) },
    // A required file that exists, and a glob that matches one.
    { code: manifest({ name: 'lib' }), filename: ROOT_FILE, options: options({ when: { root: true }, files: ['.husky', '.husky/*-commit'] }) },
    // A tool configured in package.json satisfies a file entry that accepts the field.
    { code: manifest({ name: 'root', knip: { entry: ['src/index.ts'] } }), filename: ROOT_FILE, options: options({ files: [{ glob: 'knip.json', orField: 'knip' }] }) },
    // The root condition rejects a nested manifest.
    { code: manifest({ name: 'lib' }), filename: LIB_FILE, options: options({ when: { root: true }, fields: ['packageManager'] }) },
    // A nested object is not the manifest.
    { code: manifest({ name: 'lib', nested: { private: true } }), filename: LIB_FILE, options: options({ when: { private: false }, fields: ['name'] }) },
    // Dependencies in any of the four fields satisfy declares.
    { code: manifest({ name: 'lib', peerDependencies: { husky: '*' } }), filename: LIB_FILE, options: options({ when: { declares: ['husky'] }, fields: ['name'] }) },
    // A manifest without husky is not asked for its hook wiring.
    { code: manifest({ name: 'lib' }), filename: LIB_FILE, options: options({ when: { declares: ['husky'] }, scripts: [{ name: 'prepare', includes: ['husky'] }] }) },
    // A name pattern selects by the declared name.
    { code: manifest({ name: 'other' }), filename: LIB_FILE, options: options({ when: { namePattern: '^@scope/' }, fields: ['engines'] }) },
    // A non-string script counts as present.
    { code: manifest({ name: 'lib', scripts: { prepare: 1 } }), filename: LIB_FILE, options: options({ scripts: ['prepare'] }) },
  ],
  invalid: [
    {
      code: manifest({ name: 'lib' }),
      filename: LIB_FILE,
      options: options(PUBLISHABLE),
      errors: [
        { messageId: 'unsetFields', data: { name: 'lib', fields: 'engines' } },
        { messageId: 'missingScripts', data: { name: 'lib', scripts: 'prepublishOnly' } },
      ],
    },
    // A script whose command lacks one of the required tools.
    {
      code: manifest({ name: 'lib', engines: { node: '>=20' }, scripts: { prepublishOnly: 'tsdown && publint' } }),
      filename: LIB_FILE,
      options: options(PUBLISHABLE),
      errors: [{ messageId: 'missingFlag', data: { name: 'lib', script: 'prepublishOnly', expected: 'attw', actual: 'tsdown && publint' } }],
    },
    // A forbidden flag and a non-matching exact command are reported on the script.
    {
      code: manifest({ name: 'lib', scripts: { test: 'vitest --passWithNoTests', build: 'tsc' } }),
      filename: LIB_FILE,
      options: options({ scripts: [{ name: 'test', excludes: ['--passWithNoTests'] }, { name: 'build', equals: 'tsdown' }] }),
      errors: [{ messageId: 'forbiddenFlag' }, { messageId: 'notEqual' }],
    },
    // Fields that are present but empty are not set.
    {
      code: manifest({ name: 'lib', engines: {}, packageManager: '', files: [], bin: null }),
      filename: LIB_FILE,
      options: options({ fields: ['engines', 'packageManager', 'files', 'bin'] }),
      errors: [{ messageId: 'unsetFields', data: { name: 'lib', fields: 'engines, packageManager, files, bin' } }],
    },
    // A set boolean or number field counts, so only the missing one is reported.
    {
      code: manifest({ name: 'lib', sideEffects: false, version: 1 }),
      filename: LIB_FILE,
      options: options({ fields: ['sideEffects', 'version', 'type'] }),
      errors: [{ messageId: 'unsetFields', data: { name: 'lib', fields: 'type' } }],
    },
    // A missing file is reported once with every missing path, naming both alternatives for a field entry.
    {
      code: manifest({ name: 'root' }),
      filename: ROOT_FILE,
      options: options({ when: { root: true }, files: ['.husky', 'knip.json', { glob: 'syncpack.config.*', orField: 'syncpack' }] }),
      errors: [{ messageId: 'missingFiles', data: { name: 'root', files: 'knip.json, one of syncpack.config.* (or a "syncpack" property)' } }],
    },
    // A husky repo must wire the prepare script.
    {
      code: manifest({ name: 'lib', devDependencies: { husky: '^9.0.0' }, scripts: { prepare: 'echo' } }),
      filename: LIB_FILE,
      options: options({ when: { declares: ['husky'] }, scripts: [{ name: 'prepare', includes: ['husky'] }] }),
      errors: [{ messageId: 'missingFlag', data: { name: 'lib', script: 'prepare', expected: 'husky', actual: 'echo' } }],
    },
    // The root manifest is named by its path when it declares no name.
    {
      code: manifest({ private: true }),
      filename: ROOT_FILE,
      options: options({ when: { root: true, private: true }, fields: ['packageManager'] }),
      errors: [{ messageId: 'unsetFields', data: { name: CWD.split('/').at(-1), fields: 'packageManager' } }],
    },
    {
      code: manifest({ private: true }),
      filename: LIB_FILE,
      options: options({ fields: ['packageManager'] }),
      errors: [{ messageId: 'unsetFields', data: { name: 'packages/lib', fields: 'packageManager' } }],
    },
    // Requirements from several matching groups merge into one report.
    {
      code: manifest({ name: 'lib' }),
      filename: LIB_FILE,
      options: options({ fields: ['engines'] }, { when: { private: false }, fields: ['engines', 'type'] }),
      errors: [{ messageId: 'unsetFields', data: { name: 'lib', fields: 'engines, type' } }],
    },
  ],
});
