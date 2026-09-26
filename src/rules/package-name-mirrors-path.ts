import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { loadWorkspaceGraph, type LoadWorkspaceGraphFn } from './workspace-graph';
import { readWorkspaceArchitectureOptions, workspaceArchitectureOptionsSchema, type GroupSpec, type WorkspaceArchitectureOptions } from './workspace-options';
import { expectedPackageName } from './workspace-checks';
import { readDeclaredName } from './workspace-json-helpers';

/**
 * The GroupSpec this rule's own resolved `groupName` always identifies, looked up by name in `groups`. A real `groupName` (`self.group` in the visitor below) is set only by buildWorkspaceGraph itself (workspace-graph.ts), directly from `candidate.group.name`, where `candidate.group` in turn only ever comes from `findOwningGroup(relativeDir, options.groups)`, one of that SAME `options.groups` array the visitor passes back in here as `groups`. So a real graph's group name is provably one of `groups`' own names whenever both come from the identical options object, which loadGraph(context.filename, options) and this lookup always do; failing to find it here means the graph was built from a different options object than the one now inspecting it, not a legitimate absence to skip past. Exported so this throw (unreachable through the real call site below) can be tested directly, the same "Unreachable, tested directly rather than trusted on a comment" shape package-json-key-order.ts's own `at()` helper establishes.
 */
export function findGroupSpec(groups: readonly GroupSpec[], groupName: string): GroupSpec {
  const group = groups.find((candidate) => candidate.name === groupName);
  if (group === undefined) {
    throw new Error(`Unreachable: the workspace graph resolved group "${groupName}", which is not among this same rule invocation's own "groups" option.`);
  }
  return group;
}

export type PackageNameMirrorsPathMessageIds = 'mismatch';

export type PackageNameMirrorsPathRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [WorkspaceArchitectureOptions];
  MessageIds: PackageNameMirrorsPathMessageIds;
}>;

/**
 * Reports a workspace package whose declared name does not mirror its path, per its own group's naming strategy and the workspace's global scope/separator (see expectedPackageName in workspace-checks.ts for the exact derivation). Opt-in: entirely a no-op whenever the shared `naming` option is omitted, exactly as the option's own doc comment (workspace-options.ts) states, since a workspace with its own established naming convention this rule cannot express should not be forced to adopt one that fits.
 *
 * Deliberately not derived from `context.filename`'s own directory the way the hive original was: this rule instead looks its own package up in the already-built graph by its DECLARED name (the same self-identification every other workspace-architecture rule uses), which is what lets `expectedPackageName` be checked against the graph's own recorded relativeDir/group rather than re-deriving them from a path assumed to equal the folder a file happens to be linted from.
 */
export function createPackageNameMirrorsPathRule(loadGraph: LoadWorkspaceGraphFn = loadWorkspaceGraph): PackageNameMirrorsPathRuleDefinition {
  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [workspaceArchitectureOptionsSchema],
      docs: {
        recommended: false,
        description: 'Require a workspace package to declare the name its path derives, under the configured naming scope/separator.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/package-name-mirrors-path.ts',
      },
      messages: {
        mismatch: 'Package at "{{dir}}" declares "{{actual}}" but its path derives "{{expected}}".',
      },
    },
    create(context) {
      const options = readWorkspaceArchitectureOptions(context.options[0]);
      const { naming } = options;
      if (naming === undefined) return {};

      const graph = loadGraph(context.filename, options);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          const declared = readDeclaredName(node);
          if (declared === undefined) return;
          const self = graph.packagesByName.get(declared.name);
          if (self === undefined) return;
          const group = findGroupSpec(options.groups, self.group);

          const expected = expectedPackageName(self.relativeDir, group, naming);
          if (expected === declared.name) return;

          context.report({ loc: declared.node.loc, messageId: 'mismatch', data: { dir: self.relativeDir, actual: declared.name, expected } });
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createPackageNameMirrorsPathRule();
