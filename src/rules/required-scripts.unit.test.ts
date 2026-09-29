import json from '@eslint/json';
import { parse } from '@humanwhocodes/momoa';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createRequiredScriptsRule, requireScriptEntry, type ScriptEntry } from './required-scripts';
import type { WorkspaceFs } from './workspace-fs';
import type { WorkspaceGraph, WorkspacePackageInfo } from './workspace-graph';

const identityFs: WorkspaceFs = {
  existsSync: () => {
    throw new Error('not used: this rule only resolves realpaths.');
  },
  readFileSync: () => {
    throw new Error('not used: this rule only resolves realpaths.');
  },
  readdirSync: () => {
    throw new Error('not used: this rule only resolves realpaths.');
  },
  realpathSync: (path) => path,
};

function pkg(name: string, group: string): WorkspacePackageInfo {
  return { name, relativeDir: `unused/${name}`, group, rank: 0, slice: undefined };
}

const GRAPH: WorkspaceGraph = {
  root: '/fixture',
  packagesByName: new Map([pkg('orders', 'features'), pkg('orders-schema', 'features'), pkg('kv-contract', 'core')].map((entry) => [entry.name, entry])),
  dependencyNamesByName: new Map(),
};

const rule = createRequiredScriptsRule({ loadGraph: () => GRAPH, fs: identityFs });
const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

const GROUPS = [{ name: 'features' }, { name: 'core' }];

function filenameOf(name: string): string {
  return `/fixture/unused/${name}/package.json`;
}

function manifest(name: string, scripts?: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(scripts === undefined ? { name } : { name, scripts }, null, 2);
}

describe('createRequiredScriptsRule meta', () => {
  it('carries the documented languages, docs and messages', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: createRequiredScriptsRule always defines its own meta object literal.');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Require the configured scripts, with the configured content, in every workspace package the configured selector matches.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/required-scripts.ts');
    expect(meta.messages).toEqual({
      missingScripts: 'Package "{{name}}" is missing required script(s): {{scripts}}.',
      notEqual: 'Script "{{script}}" in "{{name}}" must be exactly "{{expected}}", but is "{{actual}}".',
      missingFlag: 'Script "{{script}}" in "{{name}}" must contain "{{expected}}", but is "{{actual}}".',
      forbiddenFlag: 'Script "{{script}}" in "{{name}}" must not contain "{{expected}}", but is "{{actual}}".',
    });
  });
});

describe('requireScriptEntry', () => {
  it('returns the entry for a known script', () => {
    const document = parse('{"a": "x"}', { mode: 'json' });
    if (document.body.type !== 'Object') throw new Error('Unreachable: the fixture is a top-level JSON object.');
    const [member] = document.body.members;
    if (member === undefined) throw new Error('Unreachable: the fixture has exactly one member.');
    const entry: ScriptEntry = { command: 'x', member };
    expect(requireScriptEntry(new Map([['a', entry]]), 'a')).toBe(entry);
  });

  it('throws for a script with no entry, a shape no real call site (which only names scripts it just read) produces', () => {
    expect(() => requireScriptEntry(new Map(), 'missing')).toThrow(/Unreachable/u);
  });
});

const TYPECHECK_AND_TEST = [{ match: { group: 'features' }, scripts: ['typecheck', 'test'] }];

ruleTester.run('required-scripts', rule, {
  valid: [
    { code: manifest('orders', { typecheck: 'tsc', test: 'vitest' }), filename: filenameOf('orders'), options: [{ groups: GROUPS, requiredScripts: TYPECHECK_AND_TEST }] },
    // A package outside the selector needs nothing.
    { code: manifest('kv-contract'), filename: filenameOf('kv-contract'), options: [{ groups: GROUPS, requiredScripts: TYPECHECK_AND_TEST }] },
    // No option, no rule.
    { code: manifest('orders'), filename: filenameOf('orders'), options: [{ groups: GROUPS }] },
    // Not a graph member.
    { code: manifest('orders'), filename: '/fixture/dist/orders/package.json', options: [{ groups: GROUPS, requiredScripts: TYPECHECK_AND_TEST }] },
    // A nested object is not the manifest, even when it names the same package: it would lack the scripts the real top level has.
    {
      code: JSON.stringify({ name: 'orders', scripts: { typecheck: 'tsc', test: 'vitest' }, nested: { name: 'orders' } }),
      filename: filenameOf('orders'),
      options: [{ groups: GROUPS, requiredScripts: TYPECHECK_AND_TEST }],
    },
    // Content constraints satisfied: exact command, required flag in either spelling, forbidden flag absent.
    {
      code: manifest('orders', { boundaries: 'turbo boundaries', lint: 'eslint . --max-warnings=0', test: 'vitest run' }),
      filename: filenameOf('orders'),
      options: [
        {
          groups: GROUPS,
          requiredScripts: [
            {
              match: 'orders',
              scripts: [
                { name: 'boundaries', equals: 'turbo boundaries' },
                { name: 'lint', includes: ['--max-warnings 0'] },
                { name: 'test', excludes: ['--passWithNoTests'] },
              ],
            },
          ],
        },
      ],
    },
    // A "scripts" value that is not an object counts as no scripts, which a package needing none passes.
    { code: JSON.stringify({ name: 'kv-contract', scripts: 'nope' }), filename: filenameOf('kv-contract'), options: [{ groups: GROUPS, requiredScripts: TYPECHECK_AND_TEST }] },
  ],
  invalid: [
    // Missing scripts are listed together on the scripts entry.
    {
      code: manifest('orders', { build: 'tsc' }),
      filename: filenameOf('orders'),
      options: [{ groups: GROUPS, requiredScripts: TYPECHECK_AND_TEST }],
      errors: [{ messageId: 'missingScripts', line: 3, data: { name: 'orders', scripts: 'typecheck, test' } }],
    },
    // With no scripts entry at all the diagnostic lands on the manifest.
    {
      code: manifest('orders'),
      filename: filenameOf('orders'),
      options: [{ groups: GROUPS, requiredScripts: TYPECHECK_AND_TEST }],
      errors: [{ messageId: 'missingScripts', line: 1, data: { name: 'orders', scripts: 'typecheck, test' } }],
    },
    // A scripts value that is not an object is treated as no scripts.
    {
      code: JSON.stringify({ name: 'orders', scripts: 'nope' }),
      filename: filenameOf('orders'),
      options: [{ groups: GROUPS, requiredScripts: TYPECHECK_AND_TEST }],
      errors: [{ messageId: 'missingScripts' }],
    },
    // Name patterns and groups both select; a script required by both is listed once.
    {
      code: manifest('orders-schema', { test: 'vitest' }),
      filename: filenameOf('orders-schema'),
      options: [
        {
          groups: GROUPS,
          requiredScripts: [
            { match: { group: 'features' }, scripts: ['test'] },
            { match: '-schema$', scripts: ['generate', 'test', 'verify-generated'] },
          ],
        },
      ],
      errors: [{ messageId: 'missingScripts', data: { name: 'orders-schema', scripts: 'generate, verify-generated' } }],
    },
    // An exact-command mismatch is reported on the script's own entry.
    {
      code: manifest('orders', { boundaries: 'turbo boundaries --x' }),
      filename: filenameOf('orders'),
      options: [{ groups: GROUPS, requiredScripts: [{ match: 'orders', scripts: [{ name: 'boundaries', equals: 'turbo boundaries' }] }] }],
      errors: [{ messageId: 'notEqual', line: 4, data: { name: 'orders', script: 'boundaries', expected: 'turbo boundaries', actual: 'turbo boundaries --x' } }],
    },
    // A required flag that is absent or has the wrong value.
    {
      code: manifest('orders', { lint: 'eslint . --max-warnings 10' }),
      filename: filenameOf('orders'),
      options: [{ groups: GROUPS, requiredScripts: [{ match: 'orders', scripts: [{ name: 'lint', includes: ['--max-warnings 0'] }] }] }],
      errors: [{ messageId: 'missingFlag', data: { name: 'orders', script: 'lint', expected: '--max-warnings 0', actual: 'eslint . --max-warnings 10' } }],
    },
    // A forbidden flag that is present.
    {
      code: manifest('orders', { test: 'vitest run --passWithNoTests' }),
      filename: filenameOf('orders'),
      options: [{ groups: GROUPS, requiredScripts: [{ match: 'orders', scripts: [{ name: 'test', excludes: ['--passWithNoTests'] }] }] }],
      errors: [{ messageId: 'forbiddenFlag', data: { name: 'orders', script: 'test', expected: '--passWithNoTests', actual: 'vitest run --passWithNoTests' } }],
    },
    // A script whose value is not a string has an empty command for content checks.
    {
      code: manifest('orders', { lint: 5 }),
      filename: filenameOf('orders'),
      options: [{ groups: GROUPS, requiredScripts: [{ match: 'orders', scripts: [{ name: 'lint', includes: ['--fix'] }] }] }],
      errors: [{ messageId: 'missingFlag', data: { name: 'orders', script: 'lint', expected: '--fix', actual: '' } }],
    },
    // A missing script and a content problem on another script are reported together.
    {
      code: manifest('orders', { lint: 'eslint' }),
      filename: filenameOf('orders'),
      options: [{ groups: GROUPS, requiredScripts: [{ match: 'orders', scripts: ['typecheck', { name: 'lint', includes: ['--fix'] }] }] }],
      errors: [{ messageId: 'missingScripts' }, { messageId: 'missingFlag' }],
    },
  ],
});
