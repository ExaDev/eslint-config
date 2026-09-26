import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { loadWorkspaceGraph, type LoadWorkspaceGraphFn } from './workspace-graph';
import { readWorkspaceArchitectureOptions, resolveDependencyFields, workspaceArchitectureOptionsSchema, type WorkspaceArchitectureOptions } from './workspace-options';
import { checkDependencies } from './workspace-checks';
import { collectTopLevelDependencies, readDeclaredName, type NamedDependency } from './workspace-json-helpers';

/**
 * The dependency entry checkDependencies' own violation refers to by name, looked back up so context.report has a real node to attach the diagnostic to. Every violation's dependencyName is provably one of the names collected into `dependencies` two lines above the only call site below (checkDependencies never invents a name of its own), so the throw here is unreachable through that call site; it is exported specifically so this file's own unit tests can exercise it directly with a deliberately mismatched name, the same "Unreachable, tested directly rather than trusted on a comment" shape package-json-key-order.ts's own `at()` helper establishes.
 */
export function findDependencyEntry(dependencies: readonly NamedDependency[], name: string): NamedDependency {
  const entry = dependencies.find((dependency) => dependency.name === name);
  if (entry === undefined) {
    throw new Error(`Unreachable: no dependency entry named "${name}" among this manifest's own collected dependencies.`);
  }
  return entry;
}

export type NoUphillDependencyMessageIds = 'uphillRank' | 'rankSkip' | 'crossSlice' | 'isolatedGroup';

export type NoUphillDependencyRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [WorkspaceArchitectureOptions];
  MessageIds: NoUphillDependencyMessageIds;
}>;

/**
 * Enforces the configured workspace's own rank, rank-skip, slice and group-isolation boundaries on every `package.json`'s declared dependencies (see workspace-checks.ts's checkDependencies for the exact rules, and the package README's "Workspace architecture" section for the option shape). A factory, not a plain object, so a test can inject a stubbed LoadWorkspaceGraphFn returning a fabricated graph directly, exercising this rule's own reporting logic (which violation, which message, which location) with zero real filesystem I/O, the same "injectable in tests, defaulted in production" shape createBarrelPolicyRule already establishes.
 */
export function createNoUphillDependencyRule(loadGraph: LoadWorkspaceGraphFn = loadWorkspaceGraph): NoUphillDependencyRuleDefinition {
  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [workspaceArchitectureOptionsSchema],
      docs: {
        recommended: false,
        description: 'Disallow a workspace package depending on another package ranked strictly above it, on a non-exempt-rank package more than the configured distance below it, on a package in a different slice of the same or another group, or on a package in a group this workspace declares isolated from its own.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-uphill-dependency.ts',
      },
      messages: {
        uphillRank:
          'Illegal dependency: "{{self}}" (rank {{selfRank}}) depends on "{{dependency}}" (rank {{dependencyRank}}), which is ranked above it. A package may only depend on its own rank or lower.',
        rankSkip:
          'Illegal dependency: "{{self}}" (rank {{selfRank}}) depends directly on "{{dependency}}" (rank {{dependencyRank}}), skipping too many ranks in between.',
        crossSlice:
          'Illegal dependency: "{{self}}" (slice "{{selfSlice}}") depends on "{{dependency}}" (slice "{{dependencySlice}}"). A package may depend on another in the same slice, but not a different one.',
        isolatedGroup:
          'Illegal dependency: "{{self}}" (group "{{selfGroup}}") depends on "{{dependency}}" (group "{{dependencyGroup}}"), and this workspace declares these two groups isolated from each other.',
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
          const self = graph.packagesByName.get(declared.name);
          if (self === undefined) return;

          const dependencies = collectTopLevelDependencies(node, resolveDependencyFields(options));
          // De-duplicated by name: checkDependencies works from names alone, and a name declared under more than one configured dependencyField (dependencies and devDependencies, say) would otherwise be checked, and reported, once per field. findDependencyEntry below always resolves the FIRST such entry, so without de-duplication here two identical violations would both land on that same first location, a duplicate diagnostic rather than two genuinely distinct ones.
          const dependencyNames = [...new Set(dependencies.map((dependency) => dependency.name))];
          const violations = checkDependencies(
            declared.name,
            self,
            dependencyNames,
            {
              graph: graph.packagesByName,
              ...(options.rankSkip !== undefined && { rankSkip: options.rankSkip }),
              ...(options.isolatedGroups !== undefined && { isolatedGroups: options.isolatedGroups }),
            },
          );

          for (const violation of violations) {
            const entry = findDependencyEntry(dependencies, violation.dependencyName);
            context.report({ loc: entry.node.loc, messageId: violation.messageId, data: violation.data });
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createNoUphillDependencyRule();
