import { dirname, resolve } from 'node:path';
import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { parseJsonc } from './jsonc';
import { isExemptTask, outputProblem, type OutputProblemKind } from './turbo-checks';
import { findTurboRoot, mergeTask, readTurboJson } from './turbo-json';
import { loadTurboOptions, turboOptionsSchema, type TurboOptions } from './turbo-options';
import { readTaskEntries, type TurboRuleDeps } from './turbo-rule-support';
import { realWorkspaceFs } from './workspace-fs';

export type TurboTaskOutputsMessageIds = OutputProblemKind;

export type TurboTaskOutputsRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [TurboOptions];
  MessageIds: TurboTaskOutputsMessageIds;
}>;

/**
 * Requires every cached task in turbo.json to declare `outputs`, using `[]` where it produces no files. A task with no `outputs` key caches its logs only, the same as `outputs: []`, so a build task that forgot the key looks configured but restores nothing on a cache hit; stating the list makes the absence a choice. A task that sets `cache: false`, or that only wires other tasks together (nothing beyond `dependsOn` and `description`), is exempt unless `requireEmptyOutputs` asks for the list everywhere. A persistent task never completes, so it is reported unless it sets `cache: false`. In a package's turbo.json, which extends the root, a task is checked as merged over the root's entry of the same name, and only when the root's entry is not already reported itself. Diagnostics land on the task's key.
 */
export function createTurboTaskOutputsRule(deps: TurboRuleDeps = {}): TurboTaskOutputsRuleDefinition {
  const { fs = realWorkspaceFs } = deps;

  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [turboOptionsSchema],
      docs: {
        recommended: false,
        description: 'Require every cached turbo task to declare outputs, and every persistent task to disable caching.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-task-outputs.ts',
      },
      messages: {
        missingOutputs: 'Task "{{task}}" is cached but declares no "outputs", so a cache hit restores its log only. List its output globs, or state "outputs": [] if it produces no files.',
        persistentCached: 'Task "{{task}}" is persistent, so it never completes and has nothing to cache. Set "cache": false.',
      },
    },
    create(context) {
      const options = loadTurboOptions(context.options[0]);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          const config = readTurboJson(parseJsonc(context.sourceCode.text, context.filename), context.filename);
          const rootTasks = config.extends === undefined ? undefined : findTurboRoot(fs, dirname(resolve(context.filename)), options.root)?.turbo.tasks;
          for (const { key, member, task } of readTaskEntries(node, config.tasks)) {
            if (isExemptTask(key, options.exemptTasks)) continue;
            const inherited = rootTasks?.get(key);
            const problem = outputProblem(mergeTask(inherited, task), options);
            const inheritedProblem = inherited === undefined ? undefined : outputProblem(inherited, options);
            if (problem !== undefined && problem !== inheritedProblem) context.report({ loc: member.name.loc, messageId: problem, data: { task: key } });
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createTurboTaskOutputsRule();
