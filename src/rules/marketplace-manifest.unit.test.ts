import json from '@eslint/json';
import { Linter, RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createMarketplaceManifestRule, PLUGINS_DIR } from './marketplace-manifest';
import { createMemoryFs } from './memory-fs';

const CWD = process.cwd();
const FILE = `${CWD}/.claude-plugin/marketplace.json`;

function plugin(name: string): string {
  return JSON.stringify({ name });
}

function marketplace(fields: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({ name: 'market', owner: { name: 'Owner' }, plugins: [], ...fields }, null, 2);
}

function entries(...values: readonly unknown[]): string {
  return marketplace({ plugins: values });
}

const files = {
  [`${CWD}/plugins/a/.claude-plugin/plugin.json`]: plugin('a'),
  [`${CWD}/plugins/b/.claude-plugin/plugin.json`]: plugin('b'),
  [`${CWD}/plugins/not-a-plugin/README.md`]: '',
  [`${CWD}/tools/c/.claude-plugin/plugin.json`]: plugin('c'),
};
const rule = createMarketplaceManifestRule(createMemoryFs(files));
const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

const listing = [
  { name: 'a', source: './plugins/a' },
  { name: 'b', source: './plugins/b' },
];

describe('rule metadata', () => {
  it('carries the docs url, the languages and no options', () => {
    expect(PLUGINS_DIR).toBe('plugins');
    expect(rule.meta?.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/marketplace-manifest.ts');
    expect(rule.meta?.languages).toStrictEqual(['json/json', 'json/jsonc']);
    expect(rule.meta?.schema).toStrictEqual([]);
  });
});

ruleTester.run('marketplace-manifest', rule, {
  valid: [
    { code: entries(...listing), filename: FILE },
    // Object sources live in another repository and are only required to be objects, alongside local ones.
    { code: entries(...listing, { name: 'remote', source: { source: 'github', repo: 'owner/repo' } }), filename: FILE },
    // A local source outside plugins/ is a listing like any other.
    { code: entries(...listing, { name: 'c', source: './tools/c' }), filename: FILE },
    // A trailing slash names the same directory.
    { code: entries({ name: 'a', source: './plugins/a/' }, { name: 'b', source: './plugins/b' }), filename: FILE },
    // Extra keys on the marketplace and on an entry are tolerated.
    { code: marketplace({ plugins: listing.map((entry) => ({ ...entry, description: 'd', category: 'x' })), metadata: { description: 'm' } }), filename: FILE },
  ],
  invalid: [
    { code: '[]', filename: FILE, errors: [{ messageId: 'notObject' }] },
    { code: entries(...listing).replace('"market"', '""'), filename: FILE, errors: [{ messageId: 'invalidName' }] },
    { code: JSON.stringify({ owner: { name: 'o' }, plugins: listing }), filename: FILE, errors: [{ messageId: 'invalidName' }] },
    { code: marketplace({ name: 3, plugins: listing }), filename: FILE, errors: [{ messageId: 'invalidName' }] },
    { code: marketplace({ owner: undefined, plugins: listing }), filename: FILE, errors: [{ messageId: 'invalidOwnerName' }] },
    { code: marketplace({ owner: 'Owner', plugins: listing }), filename: FILE, errors: [{ messageId: 'invalidOwnerName' }] },
    { code: marketplace({ owner: {}, plugins: listing }), filename: FILE, errors: [{ messageId: 'invalidOwnerName' }] },
    { code: marketplace({ owner: { name: '' }, plugins: listing }), filename: FILE, errors: [{ messageId: 'invalidOwnerName' }] },
    { code: marketplace({ plugins: undefined }), filename: FILE, errors: [{ messageId: 'pluginsNotArray' }] },
    { code: marketplace({ plugins: {} }), filename: FILE, errors: [{ messageId: 'pluginsNotArray' }] },
    { code: entries(...listing, 'oops'), filename: FILE, errors: [{ messageId: 'invalidEntry' }] },
    { code: entries(...listing, { source: './tools/c' }), filename: FILE, errors: [{ messageId: 'invalidEntryName', data: { entry: 'at index 2' } }] },
    { code: entries(...listing, { name: '', source: './tools/c' }), filename: FILE, errors: [{ messageId: 'invalidEntryName' }] },
    { code: entries(...listing, { name: 'a', source: { source: 'github' } }), filename: FILE, errors: [{ messageId: 'duplicateEntryName', data: { entry: '"a"' } }] },
    { code: entries(...listing, { name: 'c' }), filename: FILE, errors: [{ messageId: 'invalidSource', data: { entry: '"c"' } }] },
    { code: entries(...listing, { name: 'c', source: 3 }), filename: FILE, errors: [{ messageId: 'invalidSource' }] },
    { code: entries({ name: 'a', source: './plugins/a', version: '1.0.0' }, listing[1]), filename: FILE, errors: [{ messageId: 'entryVersion', data: { entry: '"a"' } }] },
    { code: entries({ name: 'a', source: './plugins/a', skills: ['./skills'] }, listing[1]), filename: FILE, errors: [{ messageId: 'entrySkills', data: { entry: '"a"' } }] },
    {
      code: entries(...listing, { name: 'c', source: 'tools/c' }),
      filename: FILE,
      errors: [{ messageId: 'sourceNotRelative', data: { entry: '"c"', source: 'tools/c' } }],
    },
    { code: entries(...listing, { name: 'c', source: '../x' }), filename: FILE, errors: [{ messageId: 'sourceNotRelative' }] },
    {
      code: entries(...listing, { name: 'd', source: './plugins/d' }),
      filename: FILE,
      errors: [{ messageId: 'missingPluginManifest', data: { entry: '"d"', source: './plugins/d', manifest: '.claude-plugin/plugin.json' } }],
    },
    {
      code: entries({ name: 'renamed', source: './plugins/a' }, listing[1]),
      filename: FILE,
      errors: [{ messageId: 'pluginNameMismatch', data: { entry: '"renamed"', actual: 'a' } }],
    },
    { code: entries(...listing, { name: 'a2', source: './plugins/a' }), filename: FILE, errors: [{ messageId: 'pluginNameMismatch' }, { messageId: 'duplicateSource', data: { directory: 'plugins/a' } }] },
    { code: entries(...listing, { name: 'a', source: './plugins/a/' }), filename: FILE, errors: [{ messageId: 'duplicateEntryName' }, { messageId: 'duplicateSource', data: { directory: 'plugins/a' } }] },
    // plugins/b holds a manifest but no entry lists it.
    { code: entries(listing[0]), filename: FILE, errors: [{ messageId: 'unlistedPlugin', data: { directory: 'plugins/b' } }] },
    { code: entries(), filename: FILE, errors: [{ messageId: 'unlistedPlugin' }, { messageId: 'unlistedPlugin' }] },
    // An entry with an object source does not list a directory.
    { code: entries(listing[0], { name: 'b', source: { source: 'github' } }), filename: FILE, errors: [{ messageId: 'unlistedPlugin', data: { directory: 'plugins/b' } }] },
  ],
});

// Lints through the Linter API so a test can give the rule its own fabricated tree.
function lintWith(tree: Readonly<Record<string, string>>, text: string, filename = FILE): readonly string[] {
  const config = [{ files: ['**/*.json'], language: 'json/json', plugins: { json, test: { rules: { 'marketplace-manifest': createMarketplaceManifestRule(createMemoryFs(tree)) } } }, rules: { 'test/marketplace-manifest': 'error' } }];

  return new Linter({ cwd: CWD }).verify(text, config as never, { filename }).map((message) => message.message);
}

describe('a plugin manifest that is not JSON', () => {
  it('fails loudly, naming the file', () => {
    expect(() => lintWith({ [`${CWD}/plugins/a/.claude-plugin/plugin.json`]: '{' }, entries(listing[0]))).toThrow(/plugins\/a\/\.claude-plugin\/plugin\.json" as JSON/u);
  });
});

describe('a plugin manifest without a name', () => {
  it.each([['a missing name', '{}'], ['a non-string name', '{"name":1}'], ['a non-object manifest', '[]']])('reports the entry as pointing at an unset name for %s', (_label, manifest) => {
    expect(lintWith({ [`${CWD}/plugins/a/.claude-plugin/plugin.json`]: manifest }, entries(listing[0]))).toStrictEqual(['Marketplace entry "a" points at a plugin named "unset".']);
  });
});

describe('the marketplace root', () => {
  it('is the directory holding .claude-plugin, wherever ESLint runs', () => {
    expect(lintWith({ [`${CWD}/market/plugins/a/.claude-plugin/plugin.json`]: plugin('a') }, entries(listing[0]), `${CWD}/market/.claude-plugin/marketplace.json`)).toStrictEqual([]);
  });

  it('can itself be the plugin when an entry names it with ./', () => {
    expect(lintWith({ [`${CWD}/.claude-plugin/plugin.json`]: plugin('solo') }, entries({ name: 'solo', source: './' }))).toStrictEqual([]);
  });
});
