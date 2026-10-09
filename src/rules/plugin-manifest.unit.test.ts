import json from '@eslint/json';
import { Linter, RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import { createPluginManifestRule } from './plugin-manifest';

const CWD = process.cwd();
const A = `${CWD}/plugins/a/.claude-plugin/plugin.json`;
const B = `${CWD}/plugins/b/.claude-plugin/plugin.json`;
const NO_VERSION = `${CWD}/plugins/c/.claude-plugin/plugin.json`;
const ROOT = `${CWD}/.claude-plugin/plugin.json`;
const NOT_OBJECT = `${CWD}/plugins/d/.claude-plugin/plugin.json`;

const NESTED_ROOT = `${CWD}/sub/.claude-plugin/plugin.json`;

const files = {
  [`${CWD}/sub/.claude-plugin/marketplace.json`]: '{}',
  [`${CWD}/plugins/a/package.json`]: JSON.stringify({ name: 'a', version: '1.2.3' }),
  [`${CWD}/plugins/c/package.json`]: JSON.stringify({ name: 'c' }),
  [`${CWD}/plugins/d/package.json`]: '[]',
};
const rule = createPluginManifestRule(createMemoryFs(files));
const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

function manifest(fields: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(fields, null, 2);
}

describe('rule metadata', () => {
  it('carries the docs url, the languages and no options', () => {
    expect(rule.meta?.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/plugin-manifest.ts');
    expect(rule.meta?.languages).toStrictEqual(['json/json', 'json/jsonc']);
    expect(rule.meta?.schema).toStrictEqual([]);
  });
});

ruleTester.run('plugin-manifest', rule, {
  valid: [
    { code: manifest({ name: 'a', version: '1.2.3', description: 'd' }), filename: A },
    // No package.json beside the manifest: nothing to keep in step with.
    { code: manifest({ name: 'b', version: '9.9.9' }), filename: B },
    { code: manifest({ name: 'b' }), filename: B },
    // A package.json without a version, or that is not an object, owns no version.
    { code: manifest({ name: 'c', version: '0.0.1' }), filename: NO_VERSION },
    { code: manifest({ name: 'd' }), filename: NOT_OBJECT },
    // A plugin at ESLint's working directory (a marketplace entry with source "./") has a directory named after the checkout, which says nothing about the plugin.
    { code: manifest({ name: 'myplugin' }), filename: ROOT },
    // A plugin beside a marketplace manifest is at that marketplace's root, wherever the marketplace sits, which is where a source "./" points.
    { code: manifest({ name: 'myplugin' }), filename: NESTED_ROOT },
    // The plugin directory is the one holding .claude-plugin, whatever the nesting.
    { code: manifest({ name: 'deep' }), filename: `${CWD}/a/b/deep/.claude-plugin/plugin.json` },
  ],
  invalid: [
    { code: '"a"', filename: A, errors: [{ messageId: 'notObject' }] },
    { code: manifest({ version: '1.2.3' }), filename: A, errors: [{ messageId: 'nameMissing', data: { directory: 'a' } }] },
    // A root plugin still has to name itself, but not after the checkout directory.
    { code: manifest({ version: '1.2.3' }), filename: ROOT, errors: [{ messageId: 'rootNameMissing' }] },
    { code: manifest({ name: '' }), filename: ROOT, errors: [{ messageId: 'rootNameMissing' }] },
    { code: manifest({ name: '' }), filename: NESTED_ROOT, errors: [{ messageId: 'rootNameMissing' }] },
    { code: manifest({ name: 3 }), filename: ROOT, errors: [{ messageId: 'rootNameMissing' }] },
    { code: manifest({ name: 3, version: '1.2.3' }), filename: A, errors: [{ messageId: 'nameMissing' }] },
    { code: manifest({ name: 'other', version: '1.2.3' }), filename: A, errors: [{ messageId: 'nameMismatch', data: { name: 'other', directory: 'a' } }] },
    { code: manifest({ name: '', version: '1.2.3' }), filename: A, errors: [{ messageId: 'nameMismatch', data: { name: '', directory: 'a' } }] },
    { code: manifest({ name: 'b', skills: ['./skills'] }), filename: B, errors: [{ messageId: 'skillsKey' }] },
    { code: manifest({ name: 'a', version: '1.2.4' }), filename: A, errors: [{ messageId: 'versionMismatch', data: { actual: '1.2.4', expected: '1.2.3' } }] },
    { code: manifest({ name: 'a' }), filename: A, errors: [{ messageId: 'versionMismatch', data: { actual: 'unset', expected: '1.2.3' } }] },
    { code: manifest({ name: 'a', version: 123 }), filename: A, errors: [{ messageId: 'versionMismatch', data: { actual: 'not a string', expected: '1.2.3' } }] },
    // Every problem is reported, not only the first.
    { code: manifest({ name: 'x', skills: [], version: '0' }), filename: A, errors: [{ messageId: 'nameMismatch' }, { messageId: 'skillsKey' }, { messageId: 'versionMismatch' }] },
  ],
});

// The name mismatch, the skills key and the unreadable package.json.
const NAME_SKILLS_AND_PACKAGE_JSON_FINDINGS = 3;

function lintWithPackageJson(packageJson: string, text: string): readonly string[] {
  const custom = createPluginManifestRule(createMemoryFs({ [`${CWD}/plugins/a/package.json`]: packageJson }));
  const config = [{ files: ['**/*.json'], language: 'json/json', plugins: { json, test: { rules: { 'plugin-manifest': custom } } }, rules: { 'test/plugin-manifest': 'error' } }];

  return new Linter({ cwd: CWD }).verify(text, config as never, { filename: A }).map((message) => message.message);
}

describe('a package.json that is not valid JSON', () => {
  it('is reported on the manifest, together with the manifest\'s other findings', () => {
    const messages = lintWithPackageJson('{', manifest({ name: 'x', skills: [] }));
    expect(messages).toHaveLength(NAME_SKILLS_AND_PACKAGE_JSON_FINDINGS);
    expect(messages.filter((message) => message.startsWith('The package.json beside the plugin is not valid JSON, so its version cannot be compared: '))).toHaveLength(1);
  });

  it.each([['a byte order mark', '\uFEFF{"version":"1.2.3"}'], ['a trailing comma', '{"version":"1.2.3",}']])('reads the version of a package.json with %s', (_label, packageJson) => {
    expect(lintWithPackageJson(packageJson, manifest({ name: 'a', version: '1.2.3' }))).toStrictEqual([]);
    expect(lintWithPackageJson(packageJson, manifest({ name: 'a', version: '9.9.9' }))).toStrictEqual(['The plugin version is 9.9.9 but package.json is 1.2.3; they must be equal.']);
  });
});
