import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import { turboOptionsSchema } from './turbo-options';
import turboTaskOutputs, { createTurboTaskOutputsRule } from './turbo-task-outputs';

const fs = createMemoryFs({
  '/repo/turbo.json': JSON.stringify({ tasks: { build: { outputs: ['dist/**'] }, bare: {}, dev: { cache: false, persistent: true } } }),
  '/repo/packages/web/turbo.json': '{"extends": ["//"]}',
  '/lonely/x': '',
});

const rule = createTurboTaskOutputsRule({ fs });
const ruleTester = new RuleTester({ language: 'json/jsonc', languageOptions: { allowTrailingCommas: true }, plugins: { json } });

function turbo(tasks: Readonly<Record<string, unknown>>, extra: Readonly<Record<string, unknown>> = {}): string {
  return JSON.stringify({ ...extra, tasks }, null, 2);
}

const ROOT = '/repo/turbo.json';
const WEB = '/repo/packages/web/turbo.json';
const FIRST_TASK_LINE = 3;
// The line of a second task after a first one that pretty-prints over several lines.
const LINT_AFTER_BUILD_LINE = 6;
const DEV_AFTER_CHECK_LINE = 8;

describe('turbo-task-outputs meta', () => {
  it('carries the documented languages, docs and messages', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: the rule always defines its own meta object literal.');
    expect(meta.type).toBe('problem');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.schema).toEqual([turboOptionsSchema]);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Require every cached turbo task to declare outputs, and every persistent task to disable caching.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-task-outputs.ts');
    expect(meta.messages).toEqual({
      missingOutputs: 'Task "{{task}}" is cached but declares no "outputs", so a cache hit restores its log only. List its output globs, or state "outputs": [] if it produces no files.',
      persistentCached: 'Task "{{task}}" is persistent, so it never completes and has nothing to cache. Set "cache": false.',
    });
  });

  it('is exported as a ready-made rule', () => {
    expect(turboTaskOutputs.meta?.docs?.url).toBe(rule.meta?.docs?.url);
  });
});

ruleTester.run('turbo-task-outputs', rule, {
  valid: [
    { code: turbo({ build: { outputs: ['dist/**'] }, lint: { outputs: [] } }), filename: ROOT },
    // Uncached and graph-only tasks need no list by default.
    { code: turbo({ dev: { cache: false, persistent: true }, check: { dependsOn: ['build'] }, docs: { cache: false } }), filename: ROOT },
    // Comments and trailing commas.
    { code: '{\n  // tasks\n  "tasks": {"build": {"outputs": [],},},\n}', filename: ROOT },
    // Exempt tasks, by full key and by unqualified name.
    { code: turbo({ '//#x': {}, y: {} }), filename: ROOT, options: [{ exemptTasks: ['//#x', 'y'] }] },
    { code: turbo({ '//#x': {} }), filename: ROOT, options: [{ exemptTasks: ['x'] }] },
    // With the option, a declared list is enough everywhere.
    { code: turbo({ dev: { cache: false, outputs: [] }, check: { dependsOn: ['build'], outputs: [] } }), filename: ROOT, options: [{ requireEmptyOutputs: true }] },
    // A package configuration inherits outputs from the root task of the same name.
    { code: turbo({ build: { dependsOn: ['gen'] } }, { extends: ['//'] }), filename: WEB },
    // A package configuration inherits `cache: false` from the root task.
    { code: turbo({ dev: { dependsOn: ['gen'] } }, { extends: ['//'] }), filename: WEB },
    // A package task that declares its own outputs.
    { code: turbo({ gen: { outputs: ['generated/**'] } }, { extends: ['//'] }), filename: WEB },
    // A problem the root already has is reported there, not again in a package that only wires it.
    { code: turbo({ bare: { inputs: ['a'] } }, { extends: ['//'] }), filename: WEB },
    // No tasks at all.
    { code: '{}', filename: ROOT },
    // A nested object is not the document.
    { code: JSON.stringify({ nested: { tasks: { build: {} } } }), filename: ROOT },
  ],
  invalid: [
    {
      code: turbo({ build: { outputs: [] }, lint: {} }),
      filename: ROOT,
      errors: [
        {
          message: 'Task "lint" is cached but declares no "outputs", so a cache hit restores its log only. List its output globs, or state "outputs": [] if it produces no files.',
          line: LINT_AFTER_BUILD_LINE,
        },
      ],
    },
    { code: turbo({ '//#docs': { inputs: ['a'] } }), filename: ROOT, errors: [{ messageId: 'missingOutputs', data: { task: '//#docs' }, line: FIRST_TASK_LINE }] },
    {
      code: turbo({ dev: { persistent: true } }),
      filename: ROOT,
      errors: [{ message: 'Task "dev" is persistent, so it never completes and has nothing to cache. Set "cache": false.', line: FIRST_TASK_LINE }],
    },
    // A persistent task that is explicitly cached, with outputs declared, is still reported.
    { code: turbo({ dev: { persistent: true, cache: true, outputs: [] } }), filename: ROOT, errors: [{ messageId: 'persistentCached' }] },
    // Only one message per task.
    { code: turbo({ dev: { persistent: true, outputs: ['x'] } }), filename: ROOT, errors: [{ messageId: 'persistentCached' }] },
    // The option extends the requirement to graph-only and uncached tasks.
    {
      code: turbo({ check: { dependsOn: ['build'] }, dev: { cache: false } }),
      filename: ROOT,
      options: [{ requireEmptyOutputs: true }],
      errors: [
        { messageId: 'missingOutputs', data: { task: 'check' }, line: FIRST_TASK_LINE },
        { messageId: 'missingOutputs', data: { task: 'dev' }, line: DEV_AFTER_CHECK_LINE },
      ],
    },
    // A task defined only in a package configuration, with no root entry, is checked as it stands.
    { code: turbo({ gen: {} }, { extends: ['//'] }), filename: WEB, errors: [{ messageId: 'missingOutputs', data: { task: 'gen' } }] },
    // A package override that turns a root task into a problem the root did not have.
    { code: turbo({ build: { outputs: undefined, persistent: true } }, { extends: ['//'] }), filename: WEB, errors: [{ messageId: 'persistentCached', data: { task: 'build' } }] },
    // A package override that makes a task a different problem from the root's.
    { code: turbo({ bare: { persistent: true } }, { extends: ['//'] }), filename: WEB, errors: [{ messageId: 'persistentCached', data: { task: 'bare' } }] },
    // A package configuration with no root above it is checked on its own.
    { code: turbo({ gen: {} }, { extends: ['//'] }), filename: '/lonely/turbo.json', errors: [{ messageId: 'missingOutputs' }] },
    // The root option points the search at another root.
    { code: turbo({ build: {} }, { extends: ['//'] }), filename: WEB, options: [{ root: '/lonely' }], errors: [{ messageId: 'missingOutputs' }] },
  ],
});
