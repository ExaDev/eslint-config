import { join } from 'node:path';
import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { findLintedPackage, loadWorkspaceGraph, manifestRelativeDir, type WorkspaceRuleDeps } from './workspace-graph';
import { readWorkspaceArchitectureOptions, workspaceArchitectureOptionsSchema, type WorkspaceArchitectureOptions } from './workspace-options';
import { missingRequiredFiles } from './workspace-requirements';
import { readDeclaredName } from './workspace-json-helpers';
import { realWorkspaceFs } from './workspace-fs';

export type PackageHasFilesMessageIds = 'missingFiles';

export type PackageHasFilesRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [WorkspaceArchitectureOptions];
  MessageIds: PackageHasFilesMessageIds;
}>;

/**
 * Requires the files the shared `requiredFiles` option lists to exist in every workspace package its selector matches. ESLint cannot report a file that does not exist, so the diagnostic is anchored on the one file every package is guaranteed to have, its own `package.json`, which this rule lints through the JSON language. Entries are paths relative to the package directory and may be globs (`src/**\/*.conformance.ts`); a literal path must exist, a glob must match at least one existing path. A no-op when `requiredFiles` is omitted. Takes the same injectable graph loader and filesystem as the other workspace rules, so a test drives it from an in-memory tree.
 */
export function createPackageHasFilesRule(deps: WorkspaceRuleDeps = {}): PackageHasFilesRuleDefinition {
  const { loadGraph = loadWorkspaceGraph, fs = realWorkspaceFs } = deps;

  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [workspaceArchitectureOptionsSchema],
      docs: {
        recommended: false,
        description: 'Require the configured files to exist in every workspace package the configured selector matches.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/package-has-files.ts',
      },
      messages: {
        missingFiles: 'Package "{{name}}" is missing required file(s): {{files}}.',
      },
    },
    create(context) {
      const options = readWorkspaceArchitectureOptions(context.options[0]);
      const { requiredFiles } = options;
      if (requiredFiles === undefined) return {};

      const graph = loadGraph(context.filename, options);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          const relativeDir = manifestRelativeDir(fs, graph.root, context.filename);
          const declared = readDeclaredName(node);
          const self = findLintedPackage(graph, relativeDir, declared?.name);
          if (self === undefined) return;

          const missing = missingRequiredFiles(fs, join(graph.root, self.relativeDir), requiredFiles, { group: self.group, name: declared?.name });
          if (missing.length === 0) return;
          context.report({ loc: node.loc, messageId: 'missingFiles', data: { name: self.name, files: missing.join(', ') } });
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createPackageHasFilesRule();
