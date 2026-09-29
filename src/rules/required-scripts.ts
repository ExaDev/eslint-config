import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { findLintedPackage, loadWorkspaceGraph, manifestRelativeDir, type WorkspaceRuleDeps } from './workspace-graph';
import { readWorkspaceArchitectureOptions, workspaceArchitectureOptionsSchema, type WorkspaceArchitectureOptions } from './workspace-options';
import { checkScripts, type ScriptProblemKind } from './workspace-requirements';
import { readScripts, requireScriptEntry } from './manifest-scripts';
import { readDeclaredName } from './workspace-json-helpers';
import { realWorkspaceFs } from './workspace-fs';

export type RequiredScriptsMessageIds = 'missingScripts' | ScriptProblemKind;

export type RequiredScriptsRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [WorkspaceArchitectureOptions];
  MessageIds: RequiredScriptsMessageIds;
}>;

/**
 * Requires the scripts the shared `requiredScripts` option lists to exist in every workspace package its selector matches, optionally constraining a script's content: the exact command (`equals`), or flags it must (`includes`) or must not (`excludes`) contain, compared token by token so `--max-warnings 0` and `--max-warnings=0` agree and `--passWithNoTests` never matches a longer flag. A missing script is reported once per package, on its `scripts` entry (or the manifest when it has none); a content problem is reported on the script itself. It checks the command line as written and never what the script does when run. A no-op when `requiredScripts` is omitted.
 */
export function createRequiredScriptsRule(deps: WorkspaceRuleDeps = {}): RequiredScriptsRuleDefinition {
  const { loadGraph = loadWorkspaceGraph, fs = realWorkspaceFs } = deps;

  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [workspaceArchitectureOptionsSchema],
      docs: {
        recommended: false,
        description: 'Require the configured scripts, with the configured content, in every workspace package the configured selector matches.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/required-scripts.ts',
      },
      messages: {
        missingScripts: 'Package "{{name}}" is missing required script(s): {{scripts}}.',
        notEqual: 'Script "{{script}}" in "{{name}}" must be exactly "{{expected}}", but is "{{actual}}".',
        missingFlag: 'Script "{{script}}" in "{{name}}" must contain "{{expected}}", but is "{{actual}}".',
        forbiddenFlag: 'Script "{{script}}" in "{{name}}" must not contain "{{expected}}", but is "{{actual}}".',
      },
    },
    create(context) {
      const options = readWorkspaceArchitectureOptions(context.options[0]);
      const { requiredScripts } = options;
      if (requiredScripts === undefined) return {};

      const graph = loadGraph(context.filename, options);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          const relativeDir = manifestRelativeDir(fs, graph.root, context.filename);
          const declared = readDeclaredName(node);
          const self = findLintedPackage(graph, relativeDir, declared?.name);
          if (self === undefined) return;

          const scripts = readScripts(node);
          const commands = new Map([...scripts.entries].map(([name, entry]) => [name, entry.command]));
          const { missing, problems } = checkScripts(commands, requiredScripts, { group: self.group, name: declared?.name });

          if (missing.length > 0) context.report({ loc: scripts.loc, messageId: 'missingScripts', data: { name: self.name, scripts: missing.join(', ') } });
          for (const problem of problems) {
            context.report({
              loc: requireScriptEntry(scripts.entries, problem.script).member.loc,
              messageId: problem.kind,
              data: { name: self.name, script: problem.script, expected: problem.expected, actual: problem.actual },
            });
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createRequiredScriptsRule();
