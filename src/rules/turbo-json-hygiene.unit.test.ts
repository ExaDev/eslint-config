import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { turboOptionsSchema } from './turbo-options';
import turboJsonHygiene, { createTurboJsonHygieneRule } from './turbo-json-hygiene';

const rule = createTurboJsonHygieneRule();
const ruleTester = new RuleTester({ language: 'json/jsonc', languageOptions: { allowTrailingCommas: true }, plugins: { json } });

function turbo(fields: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(fields, null, 2);
}

const SCHEMA = 'https://turborepo.com/schema.json';
const ROOT = '/repo/turbo.json';
const WEB = '/repo/packages/web/turbo.json';
const HOSTS = 'turborepo.com, turborepo.dev, turbo.build';
const SECOND_MEMBER_LINE = 3;
const AGGREGATE = { name: '_prepush', includes: ['_lint', '_typecheck', '_test'] };

describe('turbo-json-hygiene meta', () => {
  it('carries the documented languages, docs and messages', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: the rule always defines its own meta object literal.');
    expect(meta.type).toBe('problem');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.schema).toEqual([turboOptionsSchema]);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Require turbo.json to declare a known $schema and, optionally, CI pass-through and an aggregate pre-push task.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-json-hygiene.ts');
    expect(meta.messages).toEqual({
      missingSchema: 'turbo.json has no "$schema", so editors cannot validate it. Add "$schema": "https://<host>/schema.json" with one of the hosts {{hosts}}.',
      unknownSchema: '"$schema" is "{{schema}}", which is not "https://<host>/schema.json" for one of the hosts {{hosts}}.',
      missingCiPassThrough: 'turbo.json does not list "CI" in "globalPassThroughEnv", so a task that reads it either cannot see it or has it in its cache key. Add it.',
      missingAggregateTask: 'turbo.json has no task "{{task}}", the aggregate that runs {{includes}}. Add it with those tasks in its "dependsOn".',
      aggregateMissingDependency: 'Aggregate task "{{task}}" must list "{{dependency}}" in its "dependsOn", so running the aggregate runs it.',
    });
  });

  it('is exported as a ready-made rule', () => {
    expect(turboJsonHygiene.meta?.docs?.url).toBe(rule.meta?.docs?.url);
  });
});

ruleTester.run('turbo-json-hygiene', rule, {
  valid: [
    // Each of the three hosts turbo has published its schema under.
    { code: turbo({ $schema: 'https://turborepo.com/schema.json' }), filename: ROOT },
    { code: turbo({ $schema: 'https://turborepo.dev/schema.json' }), filename: ROOT },
    { code: turbo({ $schema: 'https://turbo.build/schema.json' }), filename: ROOT },
    // A package configuration needs the schema too, but neither opt-in check.
    { code: turbo({ $schema: SCHEMA, extends: ['//'] }), filename: WEB, options: [{ hygiene: { requireCiPassThrough: true, aggregateTask: AGGREGATE } }] },
    // A canonical host given as the only one.
    { code: turbo({ $schema: 'https://turborepo.dev/schema.json' }), filename: ROOT, options: [{ hygiene: { schemaHosts: ['turborepo.dev'] } }] },
    // Comments and trailing commas.
    { code: `{\n  // schema\n  "$schema": "${SCHEMA}",\n}`, filename: ROOT },
    // CI pass-through among other variables.
    { code: turbo({ $schema: SCHEMA, globalPassThroughEnv: ['HOME', 'CI'] }), filename: ROOT, options: [{ hygiene: { requireCiPassThrough: true } }] },
    // An aggregate that is graph-only, and one backed by an uncached no-op script, with extra dependencies.
    { code: turbo({ $schema: SCHEMA, tasks: { _prepush: { dependsOn: ['_lint', '_typecheck', '_test'] } } }), filename: ROOT, options: [{ hygiene: { aggregateTask: AGGREGATE } }] },
    { code: turbo({ $schema: SCHEMA, tasks: { _prepush: { cache: false, dependsOn: ['_test', 'x', '_lint', '_typecheck'] } } }), filename: ROOT, options: [{ hygiene: { aggregateTask: AGGREGATE } }] },
  ],
  invalid: [
    {
      code: turbo({ tasks: {} }),
      filename: ROOT,
      errors: [{ message: `turbo.json has no "$schema", so editors cannot validate it. Add "$schema": "https://<host>/schema.json" with one of the hosts ${HOSTS}.`, line: 1 }],
    },
    {
      code: turbo({ tasks: {}, $schema: 'https://example.com/schema.json' }),
      filename: ROOT,
      errors: [{ message: `"$schema" is "https://example.com/schema.json", which is not "https://<host>/schema.json" for one of the hosts ${HOSTS}.`, line: 3 }],
    },
    // Not the schema path, or not https.
    { code: turbo({ $schema: 'https://turborepo.com/other.json' }), filename: ROOT, errors: [{ messageId: 'unknownSchema', line: 2 }] },
    { code: turbo({ $schema: 'http://turborepo.com/schema.json' }), filename: ROOT, errors: [{ messageId: 'unknownSchema' }] },
    { code: turbo({ $schema: 'https://turborepo.com/schema.json?x' }), filename: ROOT, errors: [{ messageId: 'unknownSchema' }] },
    // A canonical host reports the others.
    {
      code: turbo({ $schema: 'https://turbo.build/schema.json' }),
      filename: ROOT,
      options: [{ hygiene: { schemaHosts: ['turborepo.dev'] } }],
      errors: [{ messageId: 'unknownSchema', data: { schema: 'https://turbo.build/schema.json', hosts: 'turborepo.dev' } }],
    },
    // A package configuration is checked for the schema.
    { code: turbo({ extends: ['//'] }), filename: WEB, errors: [{ messageId: 'missingSchema' }] },
    // CI pass-through: absent, and present without CI, reported on the member when there is one.
    { code: turbo({ $schema: SCHEMA }), filename: ROOT, options: [{ hygiene: { requireCiPassThrough: true } }], errors: [{ messageId: 'missingCiPassThrough', line: 1 }] },
    { code: turbo({ $schema: SCHEMA, globalPassThroughEnv: ['HOME'] }), filename: ROOT, options: [{ hygiene: { requireCiPassThrough: true } }], errors: [{ messageId: 'missingCiPassThrough', line: SECOND_MEMBER_LINE }] },
    { code: turbo({ $schema: SCHEMA, globalPassThroughEnv: null }), filename: ROOT, options: [{ hygiene: { requireCiPassThrough: true } }], errors: [{ messageId: 'missingCiPassThrough', line: SECOND_MEMBER_LINE }] },
    // The aggregate task is missing altogether.
    {
      code: turbo({ $schema: SCHEMA, tasks: { _lint: {} } }),
      filename: ROOT,
      options: [{ hygiene: { aggregateTask: AGGREGATE } }],
      errors: [{ message: 'turbo.json has no task "_prepush", the aggregate that runs _lint, _typecheck, _test. Add it with those tasks in its "dependsOn".', line: 1 }],
    },
    { code: turbo({ $schema: SCHEMA }), filename: ROOT, options: [{ hygiene: { aggregateTask: AGGREGATE } }], errors: [{ messageId: 'missingAggregateTask' }] },
    // It exists but lacks some of the tasks it must include, one report each, on its key.
    {
      code: turbo({ $schema: SCHEMA, tasks: { _prepush: { dependsOn: ['_lint'] } } }),
      filename: ROOT,
      options: [{ hygiene: { aggregateTask: AGGREGATE } }],
      errors: [
        { message: 'Aggregate task "_prepush" must list "_typecheck" in its "dependsOn", so running the aggregate runs it.', line: 4 },
        { messageId: 'aggregateMissingDependency', data: { task: '_prepush', dependency: '_test' }, line: 4 },
      ],
    },
    // Only the exact task name is the aggregate.
    { code: turbo({ $schema: SCHEMA, tasks: { 'web#_prepush': { dependsOn: ['_lint', '_typecheck', '_test'] } } }), filename: ROOT, options: [{ hygiene: { aggregateTask: AGGREGATE } }], errors: [{ messageId: 'missingAggregateTask' }] },
  ],
});
