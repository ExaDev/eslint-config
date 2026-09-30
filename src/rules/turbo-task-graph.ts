import { dirname, resolve } from 'node:path';
import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { getMemberKeyName } from './json-member-key';
import { parseJsonc } from './jsonc';
import { isExemptTask, missingEdges, requiredEdges, unmatchedGraphTasks } from './turbo-checks';
import { findTurboRoot, mergeTask, readTurboJson } from './turbo-json';
import { loadTurboOptions, turboOptionsSchema, type TurboOptions } from './turbo-options';
import { readTaskEntries, type TurboRuleDeps } from './turbo-rule-support';
import { readPackageName } from './turbo-workspace';
import { realWorkspaceFs } from './workspace-fs';

export type TurboTaskGraphMessageIds = 'missingEdge' | 'missingPackageEdge' | 'droppedEdge' | 'unmatchedRequirement';

export type TurboTaskGraphRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [TurboOptions];
  MessageIds: TurboTaskGraphMessageIds;
}>;

/**
 * Requires the `dependsOn` edges the `taskGraph` option names, since which task depends on which is a per-repository policy that nothing else checks (`_build` after `_typecheck`, `_typecheck` after `^_build`). A `package#task` entry of the root turbo.json replaces the generic task entry instead of merging with it (checked against turbo 2.10.8 with `turbo run --dry=json`: an entry listing only `inputs` and `outputs` loses the generic `dependsOn` and `env`), so a requirement written for a task also applies to each of its package entries, which must repeat the edge. In a package's turbo.json, which extends the root, a task is checked as merged over the entry that governs the package, with `$TURBO_EXTENDS$` keeping the inherited entries, so an override that drops an edge is reported on the override; an edge the inherited task already lacks is reported at the root only. A requirement that matches no task entry of the root turbo.json (a misspelt task name) is reported on `tasks`, or on the document when there is none. With no `taskGraph` the rule does nothing. Diagnostics land on the task's key.
 */
export function createTurboTaskGraphRule(deps: TurboRuleDeps = {}): TurboTaskGraphRuleDefinition {
  const { fs = realWorkspaceFs } = deps;

  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [turboOptionsSchema],
      docs: {
        recommended: false,
        description: 'Require the dependsOn edges between turbo tasks that the taskGraph option names.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-task-graph.ts',
      },
      messages: {
        missingEdge: 'Task "{{task}}" must list "{{edge}}" in its "dependsOn", as the taskGraph option requires.',
        missingPackageEdge:
          'Task "{{task}}" must list "{{edge}}" in its "dependsOn", as the taskGraph option requires. A "package#task" entry replaces the generic task instead of extending it, so it lists every edge itself.',
        unmatchedRequirement: 'The taskGraph option requires edges for "{{task}}", but no task entry of this turbo.json has that name, so the requirement never applies. Check it for a typo.',
        droppedEdge:
          'Task "{{task}}" drops "{{edge}}" from its "dependsOn", which the taskGraph option requires. A package task replaces the inherited "dependsOn" unless it lists "$TURBO_EXTENDS$" to keep the root entries.',
      },
    },
    create(context) {
      const options = loadTurboOptions(context.options[0]);
      const { taskGraph } = options;

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          const config = readTurboJson(parseJsonc(context.sourceCode.text, context.filename), context.filename);
          const dir = dirname(resolve(context.filename));
          const entries = readTaskEntries(node, config.tasks).filter(({ key }) => !isExemptTask(key, options.exemptTasks));

          if (config.extends === undefined) {
            const tasksMember = node.members.find((candidate) => getMemberKeyName(candidate) === 'tasks');
            const unmatched = unmatchedGraphTasks(taskGraph, [...config.tasks.keys()]).filter((task) => !isExemptTask(task, options.exemptTasks));
            for (const task of unmatched) context.report({ loc: tasksMember?.name.loc ?? node.loc, messageId: 'unmatchedRequirement', data: { task } });
            for (const { key, member, task } of entries) {
              const messageId = key.includes('#') ? 'missingPackageEdge' : 'missingEdge';
              for (const edge of missingEdges(task, requiredEdges(key, taskGraph))) context.report({ loc: member.name.loc, messageId, data: { task: key, edge } });
            }

            return;
          }

          const root = findTurboRoot(fs, dir, options.root);
          if (root === undefined) return;
          const packageName = readPackageName(fs, dir);
          for (const { key, member, task } of entries) {
            const qualifiedKey = packageName === undefined ? undefined : `${packageName}#${key}`;
            const governing = qualifiedKey !== undefined && root.turbo.tasks.has(qualifiedKey) ? qualifiedKey : key;
            const inherited = root.turbo.tasks.get(governing);
            const merged = mergeTask(inherited, task);
            // An edge the inherited task already lacks is that entry's problem, reported at the root.
            const dropped = missingEdges(merged, requiredEdges(governing, taskGraph)).filter((edge) => inherited === undefined || inherited.dependsOn.includes(edge));
            const messageId = inherited === undefined ? 'missingEdge' : 'droppedEdge';
            for (const edge of dropped) {
              context.report({ loc: member.name.loc, messageId, data: { task: key, edge } });
            }
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createTurboTaskGraphRule();
