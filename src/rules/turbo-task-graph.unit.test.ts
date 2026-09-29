import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import { turboOptionsSchema } from './turbo-options';
import turboTaskGraph, { createTurboTaskGraphRule } from './turbo-task-graph';

const fs = createMemoryFs({
  '/repo/turbo.json': JSON.stringify({ tasks: { _build: { dependsOn: ['_typecheck', '^_build'] }, 'web#_build': { dependsOn: ['_typecheck', '^_build', 'web-only'] }, 'undefined#_build': { dependsOn: ['nothing'] } } }),
  '/repo/packages/web/package.json': JSON.stringify({ name: 'web' }),
  '/repo/packages/web/turbo.json': '{"extends": ["//"]}',
  '/repo/packages/anon/package.json': '{}',
  '/repo/packages/anon/turbo.json': '{"extends": ["//"]}',
  '/repo/packages/bare/turbo.json': '{"extends": ["//"]}',
  '/lonely/x': '',
});

const rule = createTurboTaskGraphRule({ fs });
const ruleTester = new RuleTester({ language: 'json/jsonc', languageOptions: { allowTrailingCommas: true }, plugins: { json } });

function turbo(tasks: Readonly<Record<string, unknown>>, extra: Readonly<Record<string, unknown>> = {}): string {
  return JSON.stringify({ ...extra, tasks }, null, 2);
}

const ROOT = '/repo/turbo.json';
const WEB = '/repo/packages/web/turbo.json';
const ANON = '/repo/packages/anon/turbo.json';
const BARE = '/repo/packages/bare/turbo.json';
const FIRST_TASK_LINE = 3;
const SECOND_TASK_LINE = 4;
const PACKAGE_TASK_AFTER_DEPENDS_LINE = 9;
const GRAPH = [{ task: '_build', dependsOn: ['_typecheck', '^_build'] }];
const OPTIONS = [{ taskGraph: GRAPH }];
const EXTENDS = '$TURBO_EXTENDS$';

describe('turbo-task-graph meta', () => {
  it('carries the documented languages, docs and messages', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: the rule always defines its own meta object literal.');
    expect(meta.type).toBe('problem');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.schema).toEqual([turboOptionsSchema]);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Require the dependsOn edges between turbo tasks that the taskGraph option names.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-task-graph.ts');
    expect(meta.messages).toEqual({
      missingEdge: 'Task "{{task}}" must list "{{edge}}" in its "dependsOn", as the taskGraph option requires.',
      missingPackageEdge:
        'Task "{{task}}" must list "{{edge}}" in its "dependsOn", as the taskGraph option requires. A "package#task" entry replaces the generic task instead of extending it, so it lists every edge itself.',
      droppedEdge:
        'Task "{{task}}" drops "{{edge}}" from its "dependsOn", which the taskGraph option requires. A package task replaces the inherited "dependsOn" unless it lists "$TURBO_EXTENDS$" to keep the root entries.',
    });
  });

  it('is exported as a ready-made rule', () => {
    expect(turboTaskGraph.meta?.docs?.url).toBe(rule.meta?.docs?.url);
  });
});

ruleTester.run('turbo-task-graph', rule, {
  valid: [
    // Nothing is required without the option, or with an empty one.
    { code: turbo({ _build: {} }), filename: ROOT },
    { code: turbo({ _build: {} }), filename: ROOT, options: [{ taskGraph: [] }] },
    // Every edge present, in any order.
    { code: turbo({ _build: { dependsOn: ['^_build', '_typecheck', 'other'] } }), filename: ROOT, options: OPTIONS },
    // A task the graph does not name.
    { code: turbo({ _lint: {}, _build2: {}, x_build: {} }), filename: ROOT, options: OPTIONS },
    // A package entry that repeats the edges, and a requirement written for exactly that entry.
    { code: turbo({ 'web#_build': { dependsOn: ['_typecheck', '^_build'] } }), filename: ROOT, options: OPTIONS },
    { code: turbo({ 'web#_build': {} }), filename: ROOT, options: [{ taskGraph: [{ task: 'api#_build', dependsOn: ['y'] }] }] },
    // The root package's own task is covered only by a requirement written with its qualifier.
    { code: turbo({ '//#_build': {} }), filename: ROOT, options: OPTIONS },
    // Exempt tasks, by full key and by unqualified name.
    { code: turbo({ _build: {}, 'web#_build': {} }), filename: ROOT, options: [{ taskGraph: GRAPH, exemptTasks: ['_build'] }] },
    // A package override that keeps the edges: by omission, by $TURBO_EXTENDS$, or by listing them.
    { code: turbo({ _build: { inputs: ['a'] } }, { extends: ['//'] }), filename: WEB, options: OPTIONS },
    { code: turbo({ _build: { dependsOn: [EXTENDS, 'gen'] } }, { extends: ['//'] }), filename: WEB, options: OPTIONS },
    { code: turbo({ _build: { dependsOn: ['_typecheck', '^_build'] } }, { extends: ['//'] }), filename: WEB, options: OPTIONS },
    // A package task is measured against the package# entry of the root when there is one.
    { code: turbo({ _build: { inputs: ['a'] } }, { extends: ['//'] }), filename: WEB, options: [{ taskGraph: [{ task: 'web#_build', dependsOn: ['web-only'] }] }] },
    // A package task the graph does not name.
    { code: turbo({ gen: { dependsOn: [] } }, { extends: ['//'] }), filename: WEB, options: OPTIONS },
    // A package configuration with no root above it has nothing to be measured against.
    { code: turbo({ _build: { dependsOn: [] } }, { extends: ['//'] }), filename: '/lonely/turbo.json', options: OPTIONS },
    // An edge the root task already lacks is reported at the root, not again in the package.
    { code: turbo({ _build: { inputs: ['a'] } }, { extends: ['//'] }), filename: WEB, options: [{ taskGraph: [{ task: '_build', dependsOn: ['missing-at-root'] }] }] },
    // A nested object is not the document.
    { code: JSON.stringify({ nested: { tasks: { _build: {} } } }), filename: ROOT, options: OPTIONS },
    { code: '{}', filename: ROOT, options: OPTIONS },
  ],
  invalid: [
    {
      code: turbo({ _lint: {}, _build: { dependsOn: ['^_build'] } }),
      filename: ROOT,
      options: OPTIONS,
      errors: [{ message: 'Task "_build" must list "_typecheck" in its "dependsOn", as the taskGraph option requires.', line: SECOND_TASK_LINE }],
    },
    // Each missing edge is reported, on the task's key.
    {
      code: turbo({ _build: {} }),
      filename: ROOT,
      options: OPTIONS,
      errors: [
        { messageId: 'missingEdge', data: { task: '_build', edge: '_typecheck' }, line: FIRST_TASK_LINE },
        { messageId: 'missingEdge', data: { task: '_build', edge: '^_build' }, line: FIRST_TASK_LINE },
      ],
    },
    // Requirements that cover the same entry are unioned, each edge reported once.
    {
      code: turbo({ 'web#_build': { dependsOn: [] } }),
      filename: ROOT,
      options: [{ taskGraph: [{ task: '_build', dependsOn: ['a'] }, { task: 'web#_build', dependsOn: ['a', 'b'] }] }],
      errors: [
        { messageId: 'missingPackageEdge', data: { task: 'web#_build', edge: 'a' } },
        { messageId: 'missingPackageEdge', data: { task: 'web#_build', edge: 'b' } },
      ],
    },
    // A package entry replaces the generic task, so listing only inputs and outputs drops every edge.
    {
      code: turbo({ _build: { dependsOn: ['_typecheck', '^_build'] }, 'web#_build': { inputs: ['a'], outputs: ['dist/**'] } }),
      filename: ROOT,
      options: OPTIONS,
      errors: [
        { messageId: 'missingPackageEdge', data: { task: 'web#_build', edge: '_typecheck' }, line: PACKAGE_TASK_AFTER_DEPENDS_LINE },
        { messageId: 'missingPackageEdge', data: { task: 'web#_build', edge: '^_build' }, line: PACKAGE_TASK_AFTER_DEPENDS_LINE },
      ],
    },
    // A requirement written with a qualifier covers that entry only, and a // requirement covers the root package task.
    { code: turbo({ 'web#_build': {}, 'api#_build': {} }), filename: ROOT, options: [{ taskGraph: [{ task: 'api#_build', dependsOn: ['y'] }] }], errors: [{ messageId: 'missingPackageEdge', data: { task: 'api#_build', edge: 'y' } }] },
    { code: turbo({ '//#_build': {}, _build: {} }), filename: ROOT, options: [{ taskGraph: [{ task: '//#_build', dependsOn: ['y'] }] }], errors: [{ messageId: 'missingPackageEdge', data: { task: '//#_build', edge: 'y' } }] },
    // An exemption for another name does not exempt this task.
    { code: turbo({ _build: {} }), filename: ROOT, options: [{ taskGraph: [{ task: '_build', dependsOn: ['x'] }], exemptTasks: ['_lint'] }], errors: [{ messageId: 'missingEdge' }] },
    // A package override that replaces dependsOn without the edges.
    {
      code: turbo({ _build: { dependsOn: ['gen'] } }, { extends: ['//'] }),
      filename: WEB,
      options: OPTIONS,
      errors: [
        { messageId: 'droppedEdge', data: { task: '_build', edge: '_typecheck' } },
        { messageId: 'droppedEdge', data: { task: '_build', edge: '^_build' } },
      ],
    },
    { code: turbo({ _build: { dependsOn: ['gen'] } }, { extends: ['//'] }), filename: WEB, options: [{ taskGraph: [{ task: 'web#_build', dependsOn: ['web-only'] }] }], errors: [{ messageId: 'droppedEdge', data: { task: '_build', edge: 'web-only' } }] },
    // A package task with no root entry is judged on its own.
    { code: turbo({ gen: {} }, { extends: ['//'] }), filename: BARE, options: [{ taskGraph: [{ task: 'gen', dependsOn: ['x'] }] }], errors: [{ messageId: 'missingEdge', data: { task: 'gen', edge: 'x' } }] },
    // A package with no name is judged against the generic root entry.
    { code: turbo({ _build: { dependsOn: ['gen'] } }, { extends: ['//'] }), filename: ANON, options: OPTIONS, errors: [{ messageId: 'droppedEdge' }, { messageId: 'droppedEdge' }] },
  ],
});
