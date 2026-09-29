import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { findLintedPackage, loadWorkspaceGraph, manifestRelativeDir, type WorkspaceRuleDeps } from './workspace-graph';
import { readWorkspaceArchitectureOptions, resolveDependencyFields, workspaceArchitectureOptionsSchema, type WorkspaceArchitectureOptions } from './workspace-options';
import { applyAllowList, checkDependencies, exemptDependencyNames, type StaleAllowedEdge } from './workspace-checks';
import { collectTopLevelDependencies, readDeclaredName, type NamedDependency } from './workspace-json-helpers';
import { realWorkspaceFs } from './workspace-fs';

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

export type NoUphillDependencyMessageIds = 'uphillRank' | 'rankSkip' | 'crossSlice' | 'isolatedGroup' | 'allowUndeclared' | 'allowUnneeded' | 'allowSourceGone';

export type NoUphillDependencyRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [WorkspaceArchitectureOptions];
  MessageIds: NoUphillDependencyMessageIds;
}>;

const STALE_MESSAGE_IDS = { undeclared: 'allowUndeclared', unneeded: 'allowUnneeded' } as const satisfies Record<StaleAllowedEdge['kind'], NoUphillDependencyMessageIds>;

/**
 * Enforces the configured workspace's own rank, rank-skip, slice and group-isolation boundaries on every `package.json`'s declared dependencies (see workspace-checks.ts's checkDependencies for the exact rules, and the package README's "Workspace architecture" section for the option shape). A factory, not a plain object, so a test can inject a stubbed LoadWorkspaceGraphFn returning a fabricated graph directly, exercising this rule's own reporting logic (which violation, which message, which location) with zero real filesystem I/O, the same "injectable in tests, defaulted in production" shape createBarrelPolicyRule already establishes.
 */
export function createNoUphillDependencyRule(deps: WorkspaceRuleDeps = {}): NoUphillDependencyRuleDefinition {
  const { loadGraph = loadWorkspaceGraph, fs = realWorkspaceFs } = deps;

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
        allowUndeclared:
          'Stale "allow" entry: "{{from}}" no longer declares a dependency on "{{to}}" ({{reason}}). Remove the entry.',
        allowUnneeded:
          'Stale "allow" entry: the edge from "{{from}}" to "{{to}}" passes every check without an exception ({{reason}}). Remove the entry.',
        allowSourceGone:
          'Stale "allow" entry: "{{from}}" is not a workspace package ({{reason}}). Remove the entry.',
      },
    },
    create(context) {
      const options = readWorkspaceArchitectureOptions(context.options[0]);
      const graph = loadGraph(context.filename, options);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          // Self-identified by the manifest's own declared name when it has one, or by its own directory when it does not: pnpm allows a workspace package to declare no "name" at all, and buildWorkspaceGraph keys such a package by its relativeDir for exactly this reason (see workspace-graph.ts), so its own outgoing dependencies still get checked rather than silently skipped.
          const relativeDir = manifestRelativeDir(fs, graph.root, context.filename);
          // The workspace root's own manifest is never a graph member (collectCandidates drops it), so it is where an "allow" entry whose source package no longer exists is reported: no package.json of that package is left to carry the diagnostic.
          if (relativeDir === '') {
            for (const entry of options.allow ?? []) {
              if (!graph.packagesByName.has(entry.from)) context.report({ loc: node.loc, messageId: 'allowSourceGone', data: { ...entry } });
            }

            return;
          }
          const declared = readDeclaredName(node);
          const self = findLintedPackage(graph, relativeDir, declared?.name);
          if (self === undefined) return;

          const dependencies = collectTopLevelDependencies(node, resolveDependencyFields(options));
          // De-duplicated by name: checkDependencies works from names alone, and a name declared under more than one configured dependencyField (dependencies and devDependencies, say) would otherwise be checked, and reported, once per field. findDependencyEntry below always resolves the FIRST such entry, so without de-duplication here two identical violations would both land on that same first location, a duplicate diagnostic rather than two genuinely distinct ones.
          const dependencyNames = [...new Set(dependencies.map((dependency) => dependency.name))];
          const found = checkDependencies(
            self.name,
            self,
            dependencyNames,
            {
              graph: graph.packagesByName,
              exemptTargets: exemptDependencyNames(dependencies, graph.packagesByName, options.exemptTargetGroups),
              ...(options.rankSkip !== undefined && { rankSkip: options.rankSkip }),
              ...(options.isolatedGroups !== undefined && { isolatedGroups: options.isolatedGroups }),
            },
          );
          // The allow list suppresses direction and isolation violations only; no-dependency-cycle never reads it, so an allowed edge can still be reported there.
          const { violations, stale } = applyAllowList(self.name, { violations: found, dependencyNames }, options.allow ?? []);

          for (const violation of violations) {
            const entry = findDependencyEntry(dependencies, violation.dependencyName);
            context.report({ loc: entry.node.loc, messageId: violation.messageId, data: violation.data });
          }
          for (const { entry, kind } of stale) {
            // An undeclared edge has no dependency entry to point at, so it is reported on the manifest itself.
            const loc = kind === 'undeclared' ? node.loc : findDependencyEntry(dependencies, entry.to).node.loc;
            context.report({ loc, messageId: STALE_MESSAGE_IDS[kind], data: { ...entry } });
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createNoUphillDependencyRule();
