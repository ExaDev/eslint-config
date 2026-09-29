import json from '@eslint/json';
import { Linter, RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import { turboOptionsSchema } from './turbo-options';
import turboTaskHasScript, { createTurboTaskHasScriptRule } from './turbo-task-has-script';

const fs = createMemoryFs({
  '/mono/pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
  '/mono/package.json': JSON.stringify({
    name: 'mono',
    scripts: { 'test:coverage': 'vitest --coverage', noop: ':', run: 'turbo run //#test:coverage //#noop', all: 'turbo run all', build: 'turbo run _build _test' },
  }),
  '/mono/packages/a/package.json': JSON.stringify({ name: 'a', scripts: { _build: 'tsc' } }),
  '/mono/packages/b/package.json': JSON.stringify({ name: 'b', scripts: { _test: 'vitest' } }),
  '/single/pnpm-workspace.yaml': 'packages: []\n',
  '/single/package.json': JSON.stringify({ name: 'single', scripts: { _lint: 'eslint .', lint: 'turbo run _lint' } }),
  '/globbed/package.json': JSON.stringify({ name: 'globbed', workspaces: ['libs/*'], scripts: { l: 'turbo run _x' } }),
  '/globbed/libs/x/package.json': JSON.stringify({ name: 'x', scripts: { _x: 'y' } }),
});

const rule = createTurboTaskHasScriptRule({ fs });
const ruleTester = new RuleTester({ language: 'json/jsonc', languageOptions: { allowTrailingCommas: true }, plugins: { json } });

function turbo(tasks: Readonly<Record<string, unknown>>, extra: Readonly<Record<string, unknown>> = {}): string {
  return JSON.stringify({ ...extra, tasks }, null, 2);
}

const MONO = '/mono/turbo.json';
const SINGLE = '/single/turbo.json';
// turbo() writes an opening brace, then the first task on line 3 when there is no other key.
const FIRST_TASK_LINE = 3;

describe('turbo-task-has-script meta', () => {
  it('carries the documented languages, docs and messages', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: the rule always defines its own meta object literal.');
    expect(meta.type).toBe('problem');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.schema).toEqual([turboOptionsSchema]);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Require every task in the root turbo.json to be implemented by a package script and reachable from a root script or another task.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-task-has-script.ts');
    expect(meta.messages).toEqual({
      unimplementedTask:
        'Task "{{task}}" is defined in turbo.json but no package has a script that implements it, so turbo skips it silently. Add the script, remove the task, or give the task "dependsOn" if it only groups other tasks.',
      unreachableTask: 'Task "{{task}}" never runs: no other task depends on it and no root package script invokes it through turbo. Invoke it from a root script or remove it.',
    });
  });

  it('is exported as a ready-made rule', () => {
    expect(turboTaskHasScript.meta?.docs?.url).toBe(rule.meta?.docs?.url);
  });
});

ruleTester.run('turbo-task-has-script', rule, {
  valid: [
    // Leaf tasks implemented by members, an aggregate a root script invokes, and root tasks resolved against the root scripts (a no-op script counts).
    { code: turbo({ _build: {}, _test: {}, all: { dependsOn: ['_build', '_test'] }, '//#test:coverage': {}, '//#noop': {} }), filename: MONO },
    // A single-package repository is implemented by its root package.
    { code: turbo({ _lint: {} }), filename: SINGLE },
    // Members found through the workspaces field.
    { code: turbo({ _x: {} }), filename: '/globbed/turbo.json' },
    // The packages option replaces the workspace file.
    { code: turbo({ _build: {} }), filename: MONO, options: [{ packages: ['packages/a'] }] },
    // Comments and trailing commas in turbo.json.
    { code: '// tasks\n{"tasks": {"_lint": {},},}', filename: SINGLE },
    // A package configuration is not checked here.
    { code: JSON.stringify({ extends: ['//'], tasks: { _nothing: {} } }), filename: '/mono/packages/a/turbo.json' },
    // Exempt tasks.
    { code: turbo({ _ghost: {}, '//#ghost': {} }), filename: MONO, options: [{ exemptTasks: ['_ghost', 'ghost'] }] },
    // A document with no tasks.
    { code: '{}', filename: MONO },
    // A nested object is not the document.
    { code: JSON.stringify({ nested: { tasks: { _nope: {} } } }), filename: MONO },
  ],
  invalid: [
    {
      code: turbo({ _lint: {}, _nope: {} }),
      filename: MONO,
      errors: [
        { messageId: 'unimplementedTask', data: { task: '_lint' }, line: FIRST_TASK_LINE },
        { messageId: 'unimplementedTask', data: { task: '_nope' }, line: FIRST_TASK_LINE + 1 },
      ],
    },
    {
      code: turbo({ '//#gone': {} }),
      filename: MONO,
      errors: [{ messageId: 'unimplementedTask', data: { task: '//#gone' } }, { messageId: 'unreachableTask', data: { task: '//#gone' } }],
    },
    // An aggregate nobody invokes.
    {
      code: turbo({ _build: {}, orphan: { dependsOn: ['_build'] } }),
      filename: MONO,
      errors: [
        {
          message: 'Task "orphan" never runs: no other task depends on it and no root package script invokes it through turbo. Invoke it from a root script or remove it.',
          line: FIRST_TASK_LINE + 1,
        },
      ],
    },
    // A single-package repository still needs the script.
    {
      code: turbo({ _lint: {}, _test: {} }),
      filename: SINGLE,
      errors: [
        {
          message:
            'Task "_test" is defined in turbo.json but no package has a script that implements it, so turbo skips it silently. Add the script, remove the task, or give the task "dependsOn" if it only groups other tasks.',
          line: FIRST_TASK_LINE + 1,
        },
      ],
    },
    // The packages option can exclude a member.
    { code: turbo({ _test: {} }), filename: MONO, options: [{ packages: ['packages/a'] }], errors: [{ messageId: 'unimplementedTask', data: { task: '_test' } }] },
  ],
});

describe('turbo-task-has-script options', () => {
  const linter = new Linter({ cwd: '/single' });
  const verify = (options: unknown) =>
    linter.verify('{}', [{ files: ['**'], language: 'json/jsonc', plugins: { json, exadev: { rules: { rule } } }, rules: { 'exadev/rule': ['error', options] } }], '/single/turbo.json');

  it('rejects an unknown option through the schema', () => {
    expect(() => verify({ nope: true })).toThrow(/nope/u);
  });
});
