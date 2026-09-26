import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { loadWorkspaceGraph, manifestRelativeDir, type WorkspaceRuleDeps } from './workspace-graph';
import { readWorkspaceArchitectureOptions, resolveDependencyFields, workspaceArchitectureOptionsSchema, type WorkspaceArchitectureOptions } from './workspace-options';
import { dependencyPathExists } from './workspace-checks';
import { collectTopLevelDependencies, readDeclaredName } from './workspace-json-helpers';
import { realWorkspaceFs } from './workspace-fs';

export type NoDependencyCycleMessageIds = 'cycle';

export type NoDependencyCycleRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [WorkspaceArchitectureOptions];
  MessageIds: NoDependencyCycleMessageIds;
}>;

/**
 * Reports a workspace dependency that can reach back to the declaring package: a cycle. This is NOT covered by no-uphill-dependency, and the distinction matters: that rule permits a same-rank (or, within a slice, a same-slice) dependency, so two packages at the same rank depending on each other passes it while still being a cycle. Turborepo does reject a cyclic task graph, but only once the whole graph is assembled, by which point a large refactor has already moved everything; reporting it at the manifest, where the edge is declared, names the two packages and the direction to reverse.
 *
 * Identifies "self" by this manifest's own DECLARED name (read via readDeclaredName) when it has one, never a name derived by re-deriving what its path OUGHT to produce: the hive original derived `ownName` from the package's path through its own expectedPackageName, so a package whose declared name did not yet match its path (itself a naming violation, but a distinct one from a cycle) was checked under the WRONG name here, silently missing or misattributing a real cycle. A manifest with no declared name at all (pnpm allows this) falls back to its own directory instead, the same key buildWorkspaceGraph gives such a package in the graph (workspace-graph.ts), so its outgoing edges are still checked rather than silently dropped. Either way, the manifest actually being linted must also be confirmed as the graph entry's own file (see manifestRelativeDir below), not a stale or duplicated copy elsewhere in the tree sharing the same declared name.
 */
export function createNoDependencyCycleRule(deps: WorkspaceRuleDeps = {}): NoDependencyCycleRuleDefinition {
  const { loadGraph = loadWorkspaceGraph, fs = realWorkspaceFs } = deps;
  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [workspaceArchitectureOptionsSchema],
      docs: {
        recommended: false,
        description: 'Disallow a cyclic workspace dependency.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-dependency-cycle.ts',
      },
      messages: {
        cycle:
          '"{{from}}" depends on "{{to}}", which depends back on "{{from}}": a workspace cycle. Move the shared code into a package both can depend on, or invert one edge behind a contract.',
      },
    },
    create(context) {
      const options = readWorkspaceArchitectureOptions(context.options[0]);
      const graph = loadGraph(context.filename, options);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          // Self-identified by the manifest's own declared name when it has one, or by its own directory when it does not: pnpm allows a workspace package to declare no "name" at all, and buildWorkspaceGraph keys such a package by its relativeDir for exactly this reason (see workspace-graph.ts), so its own outgoing dependencies still get checked for a cycle rather than silently skipped.
          const relativeDir = manifestRelativeDir(fs, graph.root, context.filename);
          const declared = readDeclaredName(node);
          const self = graph.packagesByName.get(declared?.name ?? relativeDir);
          if (self === undefined) return;
          // The manifest currently being linted must be the SAME file buildWorkspaceGraph resolved this graph entry from, not a stale or duplicated copy sharing its declared name elsewhere in the tree: checking a copy under the real package's own entry would double-report the same real cycle once per copy.
          if (self.relativeDir !== relativeDir) return;

          const dependencies = collectTopLevelDependencies(node, resolveDependencyFields(options));
          for (const dependency of dependencies) {
            if (!graph.packagesByName.has(dependency.name)) continue;
            if (!dependencyPathExists(dependency.name, self.name, graph.dependencyNamesByName)) continue;
            context.report({ loc: dependency.node.loc, messageId: 'cycle', data: { from: self.name, to: dependency.name } });
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createNoDependencyCycleRule();
