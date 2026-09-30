import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import { turboOptionsSchema } from './turbo-options';
import turboTaskConfigInputs, { createTurboTaskConfigInputsRule } from './turbo-task-config-inputs';

const fs = createMemoryFs({
  '/repo/pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
  '/repo/package.json': JSON.stringify({ name: 'root', scripts: { lint: 'turbo run _lint' } }),
  '/repo/eslint.config.ts': '',
  '/repo/tsconfig.base.json': '',
  '/repo/tsdown.config.ts': '',
  '/repo/packages/web/package.json': JSON.stringify({ name: 'web', scripts: { _lint: 'eslint .', _typecheck: 'tsc', _build: 'tsdown' } }),
  '/repo/packages/web/tsconfig.json': '',
  '/repo/packages/api/package.json': JSON.stringify({ name: 'api', scripts: { _typecheck: 'tsc' } }),
  '/single/package.json': JSON.stringify({ name: 'single', scripts: { _lint: 'eslint .' } }),
  '/single/eslint.config.ts': '',
});

const rule = createTurboTaskConfigInputsRule({ fs });
const ruleTester = new RuleTester({ language: 'json/jsonc', languageOptions: { allowTrailingCommas: true }, plugins: { json } });

function turbo(tasks: Readonly<Record<string, unknown>>, extra: Readonly<Record<string, unknown>> = {}): string {
  return JSON.stringify({ ...extra, tasks }, null, 2);
}

const ROOT = '/repo/turbo.json';
const FIRST_TASK_LINE = 3;

describe('turbo-task-config-inputs meta', () => {
  it('carries the documented languages, docs and messages', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: the rule always defines its own meta object literal.');
    expect(meta.type).toBe('problem');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.schema).toEqual([turboOptionsSchema]);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Require a cached turbo task to include the config files of the tools its script runs in its cache key.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-task-config-inputs.ts');
    expect(meta.messages).toEqual({
      missingRootConfig:
        'Task "{{task}}" runs {{tool}} in {{packages}}, which reads "{{file}}" at the repository root, but the cache key does not include it, so changing it restores a stale result. List it in "globalDependencies" or add "$TURBO_ROOT$/{{file}}" to the task\'s "inputs".',
      missingPackageConfig:
        'Task "{{task}}" runs {{tool}} in {{packages}}, which reads "{{file}}" in its package, but the task\'s "inputs" replace the default files without including it, so changing it restores a stale result. Add "{{file}}" to "inputs" or add "$TURBO_DEFAULT$".',
      excludedConfig:
        'Task "{{task}}" runs {{tool}} in {{packages}}, which reads "{{file}}", but the "inputs" glob "{{glob}}" excludes it from the cache key, so changing it restores a stale result. Narrow or remove that glob; listing the file or "$TURBO_DEFAULT$" does not override an exclusion.',
    });
  });

  it('is exported as a ready-made rule', () => {
    expect(turboTaskConfigInputs.meta?.docs?.url).toBe(rule.meta?.docs?.url);
  });
});

ruleTester.run('turbo-task-config-inputs', rule, {
  valid: [
    // Root configs listed in globalDependencies or through $TURBO_ROOT$.
    { code: turbo({ _lint: {}, _typecheck: {} }, { globalDependencies: ['eslint.config.ts', 'tsconfig.base.json'] }), filename: ROOT },
    { code: turbo({ _lint: { inputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/eslint.config.ts'] }, _typecheck: { inputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/tsconfig.base.json'] } }), filename: ROOT },
    // A script that runs no known tool, an uncached task and an exempt task need nothing.
    { code: turbo({ _build: {} }), filename: ROOT },
    { code: turbo({ _lint: { cache: false } }), filename: ROOT },
    { code: turbo({ _lint: {} }), filename: ROOT, options: [{ exemptTasks: ['_lint'] }] },
    // A tool the option switches off.
    { code: turbo({ _lint: {} }), filename: ROOT, options: [{ toolConfigs: { eslint: [] } }] },
    // A single-package repository needs only its own files, which the default inputs cover.
    { code: turbo({ _lint: {} }), filename: '/single/turbo.json' },
    // A package configuration is not checked itself, even where it would be a problem in the root one.
    { code: turbo({ _lint: { inputs: ['src/**'] } }, { extends: ['//'] }), filename: '/single/turbo.json' },
    { code: turbo({ _lint: { inputs: [] } }, { extends: ['//'] }), filename: '/repo/packages/web/turbo.json' },
    // No tasks, and a nested object that is not the document.
    { code: '{}', filename: ROOT },
    { code: JSON.stringify({ nested: { tasks: { _lint: {} } } }), filename: ROOT },
  ],
  invalid: [
    {
      code: turbo({ _lint: {} }),
      filename: ROOT,
      errors: [
        {
          message:
            'Task "_lint" runs eslint in web, which reads "eslint.config.ts" at the repository root, but the cache key does not include it, so changing it restores a stale result. List it in "globalDependencies" or add "$TURBO_ROOT$/eslint.config.ts" to the task\'s "inputs".',
          line: FIRST_TASK_LINE,
        },
      ],
    },
    {
      code: turbo({ _typecheck: { inputs: ['src/**'] } }),
      filename: ROOT,
      errors: [
        { messageId: 'missingPackageConfig', data: { task: '_typecheck', tool: 'tsc', file: 'tsconfig.json', packages: 'web' }, line: FIRST_TASK_LINE },
        { messageId: 'missingRootConfig', data: { task: '_typecheck', tool: 'tsc', file: 'tsconfig.base.json', packages: 'api, web' }, line: FIRST_TASK_LINE },
      ],
    },
    // A ! glob that drops a config the task keeps $TURBO_DEFAULT$ for gets its own explanation.
    {
      code: turbo({ _lint: { inputs: ['$TURBO_DEFAULT$', '!eslint.config.ts'] } }),
      filename: '/single/turbo.json',
      errors: [
        {
          message:
            'Task "_lint" runs eslint in //, which reads "eslint.config.ts", but the "inputs" glob "!eslint.config.ts" excludes it from the cache key, so changing it restores a stale result. Narrow or remove that glob; listing the file or "$TURBO_DEFAULT$" does not override an exclusion.',
          line: FIRST_TASK_LINE,
        },
      ],
    },
    // The single-package repository is checked when its inputs replace the default.
    { code: turbo({ _lint: { inputs: ['src/**'] } }), filename: '/single/turbo.json', errors: [{ messageId: 'missingPackageConfig', data: { task: '_lint', tool: 'eslint', file: 'eslint.config.ts', packages: '//' } }] },
    // A tool added through the option.
    {
      code: turbo({ _build: {} }),
      filename: ROOT,
      options: [{ toolConfigs: { tsdown: ['tsdown.config.*'] } }],
      errors: [{ messageId: 'missingRootConfig', data: { task: '_build', tool: 'tsdown', file: 'tsdown.config.ts', packages: 'web' } }],
    },
  ],
});
