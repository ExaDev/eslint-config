import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { loadWorkspaceGraph, type LoadWorkspaceGraphFn } from './workspace-graph';
import { readWorkspaceArchitectureOptions, resolveDependencyFields, workspaceArchitectureOptionsSchema, type WorkspaceArchitectureOptions } from './workspace-options';
import { dependencyPathExists } from './workspace-checks';
import { collectTopLevelDependencies, readDeclaredName } from './workspace-json-helpers';

export type NoDependencyCycleMessageIds = 'cycle';

export type NoDependencyCycleRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [WorkspaceArchitectureOptions];
  MessageIds: NoDependencyCycleMessageIds;
}>;

/**
 * Reports a workspace dependency that can reach back to the declaring package: a cycle. This is NOT covered by no-uphill-dependency, and the distinction matters: that rule permits a same-rank (or, within a slice, a same-slice) dependency, so two packages at the same rank depending on each other passes it while still being a cycle. Turborepo does reject a cyclic task graph, but only once the whole graph is assembled, by which point a large refactor has already moved everything; reporting it at the manifest, where the edge is declared, names the two packages and the direction to reverse.
 *
 * Identifies "self" by this manifest's own DECLARED name (read via readDeclaredName), not a name derived from its directory: the hive original derived `ownName` from the package's path through its own expectedPackageName, so a package whose declared name did not yet match its path (itself a naming violation, but a distinct one from a cycle) was checked under the WRONG name here, silently missing or misattributing a real cycle. Reading the manifest's own name directly is also strictly simpler: cycle detection has no need of path-derived naming at all.
 */
export function createNoDependencyCycleRule(loadGraph: LoadWorkspaceGraphFn = loadWorkspaceGraph): NoDependencyCycleRuleDefinition {
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

          const declared = readDeclaredName(node);
          if (declared === undefined) return;
          if (!graph.packagesByName.has(declared.name)) return;

          const dependencies = collectTopLevelDependencies(node, resolveDependencyFields(options));
          for (const dependency of dependencies) {
            if (!graph.packagesByName.has(dependency.name)) continue;
            if (!dependencyPathExists(dependency.name, declared.name, graph.dependencyNamesByName)) continue;
            context.report({ loc: dependency.node.loc, messageId: 'cycle', data: { from: declared.name, to: dependency.name } });
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createNoDependencyCycleRule();
