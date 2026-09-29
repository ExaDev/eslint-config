import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { readScripts, requireScriptEntry } from './manifest-scripts';
import { checkConvention, type ConventionProblemKind } from './turbo-checks';
import { loadTurboOptions, turboOptionsSchema, type TurboOptions } from './turbo-options';
import { readLintedTurboPackage, type TurboRuleDeps } from './turbo-rule-support';
import { realWorkspaceFs } from './workspace-fs';

export type TurboScriptConventionMessageIds = ConventionProblemKind;

export type TurboScriptConventionRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [TurboOptions];
  MessageIds: TurboScriptConventionMessageIds;
}>;

/**
 * Keeps the real command of a turbo task in a prefixed script (`_lint`) and the public script (`lint`) a thin delegate to turbo (`turbo run _lint`), so nothing runs a tool directly and bypasses turbo's cache and task graph. In the root package every prefixed script needs a public counterpart that is the delegating command, with only flags after it. In any other package a bare script named after a task the root orchestrates is reported, since the public name belongs to the root. It checks the command line as written, never what it does when run. A no-op in a package that is not part of a turbo repository.
 */
export function createTurboScriptConventionRule(deps: TurboRuleDeps = {}): TurboScriptConventionRuleDefinition {
  const { fs = realWorkspaceFs } = deps;

  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [turboOptionsSchema],
      docs: {
        recommended: false,
        description: 'Require each prefixed turbo task script to have a public script that delegates to turbo, and keep those public names out of non-root packages.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-script-convention.ts',
      },
      messages: {
        missingPublicScript: 'Script "{{script}}" implements a turbo task but the package has no public script "{{expected}}". Add "{{expected}}" as "{{command}}".',
        notDelegating: 'Public script "{{script}}" must delegate to turbo as "{{expected}}" (flags may follow), but is "{{actual}}". Running the tool directly bypasses the turbo cache and task graph.',
        bareTaskScript: 'Script "{{script}}" in a package other than the root shadows the turbo task "{{expected}}" that the root package orchestrates under that public name. Only the root package defines it.',
      },
    },
    create(context) {
      const options = loadTurboOptions(context.options[0]);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          const linted = readLintedTurboPackage({ fs, filename: context.filename, manifest: node, rootOption: options.root });
          if (linted === undefined) return;

          const scripts = readScripts(node);
          const commands = new Map([...scripts.entries].map(([name, entry]) => [name, entry.command]));
          const problems = checkConvention({
            commands,
            isRoot: linted.isRoot,
            rootTasks: linted.root.turbo.tasks,
            prefix: options.prefix,
            delegate: options.delegate,
            exempt: options.exemptTasks,
          });
          for (const problem of problems) {
            context.report({
              loc: requireScriptEntry(scripts.entries, problem.script).member.loc,
              messageId: problem.kind,
              data: { script: problem.script, expected: problem.expected, actual: problem.actual, command: `${options.delegate} ${problem.script}` },
            });
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createTurboScriptConventionRule();
