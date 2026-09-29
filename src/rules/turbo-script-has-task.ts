import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { readScripts } from './manifest-scripts';
import { isExemptTask } from './turbo-checks';
import { resolveScriptTask } from './turbo-json';
import { loadTurboOptions, turboOptionsSchema, type TurboOptions } from './turbo-options';
import { readLintedTurboPackage, type TurboRuleDeps } from './turbo-rule-support';
import { realWorkspaceFs } from './workspace-fs';

export type TurboScriptHasTaskMessageIds = 'missingTask';

export type TurboScriptHasTaskRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [TurboOptions];
  MessageIds: TurboScriptHasTaskMessageIds;
}>;

/**
 * Requires every prefixed script (`_lint`) to be configured as a task in turbo.json: the root configuration under its own name (or, in the root package, `//#` plus its name, or, in another package, its package name plus `#`), or the package's own turbo.json. Turbo runs a script only when a task names it, so an unconfigured prefixed script is never run by turbo. A no-op in a package that is not part of a turbo repository.
 */
export function createTurboScriptHasTaskRule(deps: TurboRuleDeps = {}): TurboScriptHasTaskRuleDefinition {
  const { fs = realWorkspaceFs } = deps;

  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [turboOptionsSchema],
      docs: {
        recommended: false,
        description: 'Require every prefixed script that implements a turbo task to have a task entry in turbo.json.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-script-has-task.ts',
      },
      messages: {
        missingTask: 'Script "{{script}}" has no task in turbo.json, so turbo never runs it. Define the task, or rename the script if it is not a turbo task.',
      },
    },
    create(context) {
      const options = loadTurboOptions(context.options[0]);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          const linted = readLintedTurboPackage({ fs, filename: context.filename, manifest: node, rootOption: options.root });
          if (linted === undefined) return;

          for (const [script, entry] of readScripts(node).entries) {
            if (!script.startsWith(options.prefix) || script.length === options.prefix.length || isExemptTask(script, options.exemptTasks)) continue;
            const task = resolveScriptTask({ script, root: linted.root.turbo, qualifier: linted.qualifier, own: linted.own });
            if (task === undefined) context.report({ loc: entry.member.loc, messageId: 'missingTask', data: { script } });
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createTurboScriptHasTaskRule();
