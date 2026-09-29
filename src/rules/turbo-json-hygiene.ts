import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { getMemberKeyName } from './json-member-key';
import { parseJsonc } from './jsonc';
import { isKnownSchema, missingEdges } from './turbo-checks';
import { readTurboJson } from './turbo-json';
import { loadTurboOptions, turboOptionsSchema, type TurboOptions } from './turbo-options';
import { readTaskEntries } from './turbo-rule-support';

export type TurboJsonHygieneMessageIds = 'missingSchema' | 'unknownSchema' | 'missingCiPassThrough' | 'missingAggregateTask' | 'aggregateMissingDependency';

export type TurboJsonHygieneRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [TurboOptions];
  MessageIds: TurboJsonHygieneMessageIds;
}>;

/**
 * Plain presence checks on turbo.json. Every turbo.json needs a `$schema` of the form `https://<host>/schema.json`, for a host in `hygiene.schemaHosts` (the three hosts turbo has published it under by default; give one to make it canonical and report the others), so editors validate the file. In the root turbo.json, two opt-in checks: `hygiene.requireCiPassThrough` requires `CI` in `globalPassThroughEnv`, which lets tasks that read it see it without it entering their cache key, and `hygiene.aggregateTask` requires a task of that name (graph-only, or backed by a no-op root script, either way it is a task entry) whose `dependsOn` lists every task in `includes`. Diagnostics land on the offending member, or on the document when the member is missing.
 */
export function createTurboJsonHygieneRule(): TurboJsonHygieneRuleDefinition {
  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [turboOptionsSchema],
      docs: {
        recommended: false,
        description: 'Require turbo.json to declare a known $schema and, optionally, CI pass-through and an aggregate pre-push task.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-json-hygiene.ts',
      },
      messages: {
        missingSchema: 'turbo.json has no "$schema", so editors cannot validate it. Add "$schema": "https://<host>/schema.json" with one of the hosts {{hosts}}.',
        unknownSchema: '"$schema" is "{{schema}}", which is not "https://<host>/schema.json" for one of the hosts {{hosts}}.',
        missingCiPassThrough: 'turbo.json does not list "CI" in "globalPassThroughEnv", so a task that reads it either cannot see it or has it in its cache key. Add it.',
        missingAggregateTask: 'turbo.json has no task "{{task}}", the aggregate that runs {{includes}}. Add it with those tasks in its "dependsOn".',
        aggregateMissingDependency: 'Aggregate task "{{task}}" must list "{{dependency}}" in its "dependsOn", so running the aggregate runs it.',
      },
    },
    create(context) {
      const options = loadTurboOptions(context.options[0]);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          const config = readTurboJson(parseJsonc(context.sourceCode.text, context.filename), context.filename);
          const member = (name: string) => node.members.find((candidate) => getMemberKeyName(candidate) === name);

          const hosts = options.schemaHosts.join(', ');
          const schemaMember = member('$schema');
          if (schemaMember === undefined) {
            context.report({ loc: node.loc, messageId: 'missingSchema', data: { hosts } });
          } else if (!isKnownSchema(config.schema, options.schemaHosts)) {
            context.report({ loc: schemaMember.value.loc, messageId: 'unknownSchema', data: { schema: config.schema, hosts } });
          }
          if (config.extends !== undefined) return;

          if (options.requireCiPassThrough && config.globalPassThroughEnv?.includes('CI') !== true) {
            context.report({ loc: member('globalPassThroughEnv')?.name.loc ?? node.loc, messageId: 'missingCiPassThrough' });
          }

          const { aggregateTask } = options;
          if (aggregateTask === undefined) return;
          const entry = readTaskEntries(node, config.tasks).find(({ key }) => key === aggregateTask.name);
          if (entry === undefined) {
            context.report({ loc: node.loc, messageId: 'missingAggregateTask', data: { task: aggregateTask.name, includes: aggregateTask.includes.join(', ') } });

            return;
          }
          for (const dependency of missingEdges(entry.task, aggregateTask.includes)) {
            context.report({ loc: entry.member.name.loc, messageId: 'aggregateMissingDependency', data: { task: aggregateTask.name, dependency } });
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createTurboJsonHygieneRule();
