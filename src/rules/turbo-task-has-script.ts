import { dirname, resolve } from 'node:path';
import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { parseJsonc } from './jsonc';
import { checkTaskScripts, type TaskProblemKind } from './turbo-checks';
import { readTurboJson } from './turbo-json';
import { loadTurboOptions, turboOptionsSchema, type TurboOptions } from './turbo-options';
import { readTaskEntries, type TurboRuleDeps } from './turbo-rule-support';
import { listTurboPackages } from './turbo-workspace';
import { realWorkspaceFs } from './workspace-fs';

export type TurboTaskHasScriptMessageIds = TaskProblemKind;

export type TurboTaskHasScriptRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [TurboOptions];
  MessageIds: TurboTaskHasScriptMessageIds;
}>;

/**
 * Cross-checks a root turbo.json against the repository's scripts. Turbo skips a task silently when no package has a script of that name, so a task nothing implements is reported, unless it has `dependsOn` and only groups other tasks. A `//#` task is implemented by the root package's script of the name after the prefix; a `pkg#` task by that package's script; any other task by a workspace member's script, or by the root package's when the repository has no members. A `//#` task or an aggregate that no other task depends on and no root script invokes through turbo is reported too, since it never runs. Diagnostics land on the task's key. A no-op in a turbo.json that extends another (a package configuration), which is not the place tasks are declared repository-wide.
 */
export function createTurboTaskHasScriptRule(deps: TurboRuleDeps = {}): TurboTaskHasScriptRuleDefinition {
  const { fs = realWorkspaceFs } = deps;

  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [turboOptionsSchema],
      docs: {
        recommended: false,
        description: 'Require every task in the root turbo.json to be implemented by a package script and reachable from a root script or another task.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-task-has-script.ts',
      },
      messages: {
        unimplementedTask:
          'Task "{{task}}" is defined in turbo.json but no package has a script that implements it, so turbo skips it silently. Add the script, remove the task, or give the task "dependsOn" if it only groups other tasks.',
        unreachableTask: 'Task "{{task}}" never runs: no other task depends on it and no root package script invokes it through turbo. Invoke it from a root script or remove it.',
      },
    },
    create(context) {
      const options = loadTurboOptions(context.options[0]);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          const config = readTurboJson(parseJsonc(context.sourceCode.text, context.filename));
          if (config.extends !== undefined) return;

          const { root, members } = listTurboPackages(fs, dirname(resolve(context.filename)), options.packages);
          const problems = checkTaskScripts({ tasks: config.tasks, root, members, exempt: options.exemptTasks });
          for (const { key, member } of readTaskEntries(node, config.tasks)) {
            for (const problem of problems.filter((candidate) => candidate.task === key)) {
              context.report({ loc: member.name.loc, messageId: problem.kind, data: { task: key } });
            }
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createTurboTaskHasScriptRule();
