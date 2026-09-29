import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import { turboOptionsSchema } from './turbo-options';
import turboScriptHasTask, { createTurboScriptHasTaskRule } from './turbo-script-has-task';

const fs = createMemoryFs({
  '/repo/turbo.json': JSON.stringify({ tasks: { _lint: {}, _build: {}, '//#_root-only': {}, 'web#_web-only': {} } }),
  '/repo/packages/web/package.json': '{}',
  '/repo/packages/web/turbo.json': JSON.stringify({ extends: ['//'], tasks: { _local: {} } }),
  '/repo/packages/api/package.json': '{}',
  '/lonely/package.json': '{}',
});

const rule = createTurboScriptHasTaskRule({ fs });
const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

function manifest(name: string | undefined, scripts: Readonly<Record<string, string>>): string {
  return JSON.stringify({ ...(name !== undefined && { name }), scripts }, null, 2);
}

const ROOT = '/repo/package.json';
const WEB = '/repo/packages/web/package.json';
const API = '/repo/packages/api/package.json';

describe('turbo-script-has-task meta', () => {
  it('carries the documented languages, docs and message', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: the rule always defines its own meta object literal.');
    expect(meta.type).toBe('problem');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.schema).toEqual([turboOptionsSchema]);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Require every prefixed script that implements a turbo task to have a task entry in turbo.json.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-script-has-task.ts');
    expect(meta.messages).toEqual({
      missingTask: 'Script "{{script}}" has no task in turbo.json, so turbo never runs it. Define the task, or rename the script if it is not a turbo task.',
    });
  });

  it('is exported as a ready-made rule', () => {
    expect(turboScriptHasTask.meta?.docs?.url).toBe(rule.meta?.docs?.url);
  });
});

ruleTester.run('turbo-script-has-task', rule, {
  valid: [
    // A root-configured task under its own name, for the root package and a member.
    { code: manifest('root', { _lint: 'eslint .', _build: 'tsc' }), filename: ROOT },
    { code: manifest('web', { _lint: 'eslint .' }), filename: WEB },
    // A `//#` task configures the root package's script, which has no unqualified task.
    { code: manifest('root', { '_root-only': 'x' }), filename: ROOT },
    // A package-qualified task configures that package's script.
    { code: manifest('web', { '_web-only': 'x' }), filename: WEB },
    // The package's own turbo.json configures a script.
    { code: manifest('web', { _local: 'x' }), filename: WEB },
    // Scripts without the prefix are not tasks.
    { code: manifest('root', { start: 'node .', prepare: 'husky' }), filename: ROOT },
    // A script that is only the prefix names no task.
    { code: manifest('root', { _: 'x' }), filename: ROOT },
    // Exempt tasks need no entry.
    { code: manifest('root', { _helper: 'x' }), filename: ROOT, options: [{ exemptTasks: ['_helper'] }] },
    // Not part of a turbo repository.
    { code: manifest('lonely', { _lint: 'x' }), filename: '/lonely/package.json' },
    // A custom prefix.
    { code: manifest('root', { __x: 'x', _helper: 'x' }), filename: ROOT, options: [{ prefix: '__', exemptTasks: ['__x'] }] },
    // A nested object is not the manifest.
    { code: JSON.stringify({ nested: { scripts: { _nope: 'x' } } }), filename: ROOT },
  ],
  invalid: [
    { code: manifest('root', { _lint: 'x', _nope: 'y' }), filename: ROOT, errors: [{ messageId: 'missingTask', data: { script: '_nope' }, line: 5 }] },
    // A package-qualified task of another package does not configure this one.
    { code: manifest('api', { '_web-only': 'x' }), filename: API, errors: [{ messageId: 'missingTask', data: { script: '_web-only' } }] },
    // A member's local task does not configure a sibling.
    { code: manifest('api', { _local: 'x' }), filename: API, errors: [{ messageId: 'missingTask', data: { script: '_local' } }] },
    // The root package is not configured by another package's qualified task or by a member-only one.
    { code: manifest('root', { '_web-only': 'x' }), filename: ROOT, errors: [{ messageId: 'missingTask', data: { script: '_web-only' } }] },
    // A nameless member is configured only by unqualified tasks.
    { code: manifest(undefined, { _lint: 'x', '_web-only': 'y' }), filename: API, errors: [{ messageId: 'missingTask', data: { script: '_web-only' } }] },
    // The prefix option.
    { code: manifest('root', { __x: 'x', _lint: 'y' }), filename: ROOT, options: [{ prefix: '__' }], errors: [{ messageId: 'missingTask', data: { script: '__x' } }] },
  ],
});
