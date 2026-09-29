import { relative } from 'node:path';
import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { tagProblem, type TagProblemKind } from './turbo-checks';
import { readTurboJsonAt } from './turbo-json';
import { loadTurboOptions, turboOptionsSchema, type TurboOptions } from './turbo-options';
import { readLintedTurboPackage, type TurboRuleDeps } from './turbo-rule-support';
import { workspaceMemberDirs } from './turbo-workspace';
import { findOwningGroup } from './workspace-graph';
import { realWorkspaceFs } from './workspace-fs';

export type TurboPackageTagsMessageIds = TagProblemKind;

export type TurboPackageTagsRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [TurboOptions];
  MessageIds: TurboPackageTagsMessageIds;
}>;

/**
 * Requires every workspace package to carry its own turbo.json that extends the root (`"extends": ["//"]`) and declares a non-empty `tags` list, which is what `turbo boundaries` applies tag rules to. With `boundaries.groups`, the tags must also include the name of the group the package's directory belongs to (the longest matching group path), so the layout is declared once and the tags cannot drift from it; a workspace package under no group throws, since it would otherwise be skipped silently. Diagnostics land on the package's package.json, the one file every package has. A no-op for the root package and for a manifest that is not a workspace member.
 */
export function createTurboPackageTagsRule(deps: TurboRuleDeps = {}): TurboPackageTagsRuleDefinition {
  const { fs = realWorkspaceFs } = deps;

  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [turboOptionsSchema],
      docs: {
        recommended: false,
        description: 'Require every workspace package to have a turbo.json that extends the root and carries boundary tags, including its group name when groups are configured.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-package-tags.ts',
      },
      messages: {
        missingTurboJson: 'Package "{{name}}" has no turbo.json. "turbo boundaries" needs one with "extends": ["//"] and a "tags" list.',
        notExtendingRoot: 'The turbo.json of package "{{name}}" must extend the root configuration with "extends": ["//"].',
        missingTags: 'The turbo.json of package "{{name}}" declares no "tags", so "turbo boundaries" cannot apply tag rules to it.',
        missingGroupTag: 'The turbo.json of package "{{name}}" must carry the tag "{{group}}", the name of the group its directory belongs to.',
      },
    },
    create(context) {
      const options = loadTurboOptions(context.options[0]);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          const linted = readLintedTurboPackage({ fs, filename: context.filename, manifest: node, rootOption: options.root });
          if (linted === undefined || linted.isRoot) return;
          const relativeDir = relative(linted.root.dir, linted.dir).split('\\').join('/');
          if (!workspaceMemberDirs(fs, linted.root.dir, options.packages).includes(relativeDir)) return;

          const groups = options.boundaries?.groups;
          const group = groups === undefined ? undefined : findOwningGroup(relativeDir, groups);
          if (groups !== undefined && group === undefined) {
            throw new Error(
              `@exadev/eslint-config: workspace package directory "${relativeDir}" is not covered by any "boundaries.groups" path. Add a group whose path prefixes it, or narrow "packages" to exclude it: an uncovered package would otherwise be skipped by the tag check.`,
            );
          }
          const problem = tagProblem(readTurboJsonAt(fs, linted.dir), group?.name);
          if (problem !== undefined) context.report({ loc: node.loc, messageId: problem, data: { name: linted.name ?? relativeDir, group: group?.name } });
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createTurboPackageTagsRule();
