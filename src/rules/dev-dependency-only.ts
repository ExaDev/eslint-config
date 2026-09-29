import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { matchesSelector } from './workspace-checks';
import { findLintedPackage, loadWorkspaceGraph, manifestRelativeDir, type WorkspaceRuleDeps } from './workspace-graph';
import { readWorkspaceArchitectureOptions, workspaceArchitectureOptionsSchema, type WorkspaceArchitectureOptions } from './workspace-options';
import { collectTopLevelDependencies, readDeclaredName } from './workspace-json-helpers';
import { realWorkspaceFs } from './workspace-fs';

/**
 * The fields a shipped package resolves at install or runtime. `devDependencies` is the only field not listed, so it is where a restricted package is allowed. Deliberately independent of the shared `dependencyFields` option, which narrows what the rank checks read: this rule must look at exactly the fields it forbids.
 */
export const RUNTIME_DEPENDENCY_FIELDS: readonly string[] = ['dependencies', 'peerDependencies', 'optionalDependencies'];

export type DevDependencyOnlyMessageIds = 'devOnly';

export type DevDependencyOnlyRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [WorkspaceArchitectureOptions];
  MessageIds: DevDependencyOnlyMessageIds;
}>;

/**
 * Reports a workspace package that lists a `devOnly` package under `dependencies`, `peerDependencies` or `optionalDependencies`, at the offending entry. A package that exists only to support tests (fixtures, fakes, a conformance kit) must never ship as a runtime dependency. Restricted packages are the workspace members the shared `devOnly` selectors match, by group or declared-name pattern. A no-op when `devOnly` is omitted.
 */
export function createDevDependencyOnlyRule(deps: WorkspaceRuleDeps = {}): DevDependencyOnlyRuleDefinition {
  const { loadGraph = loadWorkspaceGraph, fs = realWorkspaceFs } = deps;

  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [workspaceArchitectureOptionsSchema],
      docs: {
        recommended: false,
        description: 'Disallow a workspace package from listing a dev-only package anywhere except devDependencies.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/dev-dependency-only.ts',
      },
      messages: {
        devOnly: '"{{self}}" lists "{{dependency}}" under "{{field}}", but "{{dependency}}" is dev-only and may appear only under "devDependencies".',
      },
    },
    create(context) {
      const options = readWorkspaceArchitectureOptions(context.options[0]);
      const { devOnly } = options;
      if (devOnly === undefined) return {};

      const graph = loadGraph(context.filename, options);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          const relativeDir = manifestRelativeDir(fs, graph.root, context.filename);
          const declared = readDeclaredName(node);
          const self = findLintedPackage(graph, relativeDir, declared?.name);
          if (self === undefined) return;

          for (const dependency of collectTopLevelDependencies(node, RUNTIME_DEPENDENCY_FIELDS)) {
            const target = graph.packagesByName.get(dependency.name);
            if (target === undefined || !devOnly.some((selector) => matchesSelector(selector, { group: target.group, name: dependency.name }))) continue;
            context.report({
              loc: dependency.node.name.loc,
              messageId: 'devOnly',
              data: { self: self.name, dependency: dependency.name, field: dependency.field },
            });
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createDevDependencyOnlyRule();
