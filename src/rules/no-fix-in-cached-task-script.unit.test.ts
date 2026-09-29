import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import noFixInCachedTaskScript, { createNoFixInCachedTaskScriptRule } from './no-fix-in-cached-task-script';
import { turboOptionsSchema } from './turbo-options';

const fs = createMemoryFs({
  '/repo/turbo.json': JSON.stringify({ tasks: { _lint: { outputs: [] }, '_lint:fix': { cache: false }, '//#docs': {}, dev: { cache: false, persistent: true } } }),
  '/repo/packages/web/package.json': '{}',
  '/repo/packages/web/turbo.json': JSON.stringify({ extends: ['//'], tasks: { _lint: { cache: false }, _local: {} } }),
  '/lonely/package.json': '{}',
});

const rule = createNoFixInCachedTaskScriptRule({ fs });
const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

function manifest(name: string, scripts: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({ name, scripts }, null, 2);
}

const ROOT = '/repo/package.json';
const WEB = '/repo/packages/web/package.json';
const API = '/repo/packages/api/package.json';
const FIRST_SCRIPT_LINE = 4;
const MESSAGE_PREFIX = 'runs as a cached turbo task but passes';

describe('no-fix-in-cached-task-script meta', () => {
  it('carries the documented languages, docs and message', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: the rule always defines its own meta object literal.');
    expect(meta.type).toBe('problem');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.schema).toEqual([turboOptionsSchema]);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Disallow fixing flags in a script that runs as a cached turbo task; put the fix in a separate uncached task.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-fix-in-cached-task-script.ts');
    expect(meta.messages).toEqual({
      fixInCachedTask:
        'Script "{{script}}" runs as a cached turbo task but passes {{flags}}. The task hash is taken before the rewrite, and a cache hit replays the log without applying the fix. Keep the check free of it and put the fix in a separate task with "cache": false.',
    });
  });

  it('is exported as a ready-made rule', () => {
    expect(noFixInCachedTaskScript.meta?.docs?.url).toBe(rule.meta?.docs?.url);
  });
});

ruleTester.run('no-fix-in-cached-task-script', rule, {
  valid: [
    // A check without a fixing flag.
    { code: manifest('root', { _lint: 'eslint . --cache --max-warnings 0' }), filename: ROOT },
    // An uncached task may fix.
    { code: manifest('root', { '_lint:fix': 'eslint . --fix' }), filename: ROOT },
    // A persistent uncached task may do anything.
    { code: manifest('root', { dev: 'vite --write' }), filename: ROOT },
    // A script no task configures is not a cached task.
    { code: manifest('root', { format: 'prettier --write .', lint: 'eslint . --fix' }), filename: ROOT },
    // A member's own turbo.json turns caching off for its task.
    { code: manifest('web', { _lint: 'eslint . --fix' }), filename: WEB },
    // A script whose value is not a string has no flags.
    { code: manifest('root', { _lint: 5 }), filename: ROOT },
    // Exempt tasks are skipped.
    { code: manifest('root', { _lint: 'eslint . --fix' }), filename: ROOT, options: [{ exemptTasks: ['_lint'] }] },
    // Only the listed flags count.
    { code: manifest('root', { _lint: 'eslint . --fix' }), filename: ROOT, options: [{ fixFlags: ['--write'] }] },
    // A flag that merely starts with a listed one is a different flag.
    { code: manifest('root', { _lint: 'eslint . --fix-type problem' }), filename: ROOT },
    // Not part of a turbo repository.
    { code: manifest('lonely', { _lint: 'eslint . --fix' }), filename: '/lonely/package.json' },
    // A nested object is not the manifest.
    { code: JSON.stringify({ nested: { scripts: { _lint: 'eslint . --fix' } } }), filename: ROOT },
  ],
  invalid: [
    {
      code: manifest('root', { _lint: 'eslint . --fix --cache --max-warnings 0' }),
      filename: ROOT,
      errors: [
        {
          message: `Script "_lint" ${MESSAGE_PREFIX} "--fix". The task hash is taken before the rewrite, and a cache hit replays the log without applying the fix. Keep the check free of it and put the fix in a separate task with "cache": false.`,
          line: FIRST_SCRIPT_LINE,
        },
      ],
    },
    // Both default flags in one script are named together.
    {
      code: manifest('root', { _lint: 'prettier --write . && eslint --fix .' }),
      filename: ROOT,
      errors: [{ messageId: 'fixInCachedTask', data: { script: '_lint', flags: '"--fix", "--write"' } }],
    },
    // A `//#` task caches the root package's script.
    { code: manifest('root', { docs: 'prettier --write docs' }), filename: ROOT, errors: [{ messageId: 'fixInCachedTask', data: { script: 'docs', flags: '"--write"' } }] },
    // A member without its own override uses the root task.
    { code: manifest('api', { _lint: 'eslint . --fix' }), filename: API, errors: [{ messageId: 'fixInCachedTask', data: { script: '_lint', flags: '"--fix"' } }] },
    // A member's own cached task.
    { code: manifest('web', { _local: 'eslint . --fix' }), filename: WEB, errors: [{ messageId: 'fixInCachedTask', data: { script: '_local', flags: '"--fix"' } }] },
    // The flag list is configurable.
    { code: manifest('root', { _lint: 'biome check --apply' }), filename: ROOT, options: [{ fixFlags: ['--apply'] }], errors: [{ messageId: 'fixInCachedTask', data: { script: '_lint', flags: '"--apply"' } }] },
    // An exemption for another task does not apply.
    { code: manifest('root', { _lint: 'eslint . --fix' }), filename: ROOT, options: [{ exemptTasks: ['other'] }], errors: [{ messageId: 'fixInCachedTask' }] },
  ],
});
