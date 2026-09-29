import { dirname, resolve } from 'node:path';
import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { parseJsonc } from './jsonc';
import { isExemptTask, missingEdges, requiredEdges } from './turbo-checks';
import { findTurboRoot, mergeTask, readTurboJson } from './turbo-json';
import { loadTurboOptions, turboOptionsSchema, type TurboOptions } from './turbo-options';
import { readTaskEntries, type TurboRuleDeps } from './turbo-rule-support';
import { readPackageName } from './turbo-workspace';
import { realWorkspaceFs } from './workspace-fs';

export type TurboTaskGraphMessageIds = 'missingEdge' | 'missingPackageEdge' | 'droppedEdge';

export type TurboTaskGraphRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [TurboOptions];
  MessageIds: TurboTaskGraphMessageIds;
}>;

/**
 * Requires the `dependsOn` edges the `taskGraph` option names, since which task depends on which is a per-repository policy that nothing else checks (`_build` after `_typecheck`, `_typecheck` after `^_build`). A `package#task` entry of the root turbo.json replaces the generic task entry instead of merging with it (checked against turbo 2.10.8 with `turbo run --dry=json`: an entry listing only `inputs` and `outputs` loses the generic `dependsOn` and `env`), so a requirement written for a task also applies to each of its package entries, which must repeat the edge. In a package's turbo.json, which extends the root, a task is checked as merged over the entry that governs the package, with `$TURBO_EXTENDS$` keeping the inherited entries, so an override that drops an edge is reported on the override; an edge the inherited task already lacks is reported at the root only. With no `taskGraph` the rule does nothing. Diagnostics land on the task's key.
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
        droppedEdge:
          'Task "{{task}}" drops "{{edge}}" from its "dependsOn", which the taskGraph option requires. A package task replaces the inherited "dependsOn" unless it lists "$TURBO_EXTENDS$" to keep the root entries.',
      },
    },
    create(context) {
      const options = loadTurboOptions(context.options[0]);
      const { taskGraph } = options;

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document' || taskGraph.length === 0) return;

          const config = readTurboJson(parseJsonc(context.sourceCode.text, context.filename), context.filename);
          const dir = dirname(resolve(context.filename));
          const entries = readTaskEntries(node, config.tasks).filter(({ key }) => !isExemptTask(key, options.exemptTasks));

          if (config.extends === undefined) {
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
            const governing = (packageName === undefined ? [key] : [`${packageName}#${key}`, key]).find((candidate) => root.turbo.tasks.has(candidate)) ?? key;
            const inherited = root.turbo.tasks.get(governing);
            const required = requiredEdges(governing, taskGraph);
            const inheritedMissing = inherited === undefined ? [] : missingEdges(inherited, required);
            const messageId = inherited === undefined ? 'missingEdge' : 'droppedEdge';
            for (const edge of missingEdges(mergeTask(inherited, task), required).filter((missing) => !inheritedMissing.includes(missing))) {
              context.report({ loc: member.name.loc, messageId, data: { task: key, edge } });
            }
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createTurboTaskGraphRule();
