import { dirname, resolve } from 'node:path';
import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { parseJsonc } from './jsonc';
import { isExemptTask } from './turbo-checks';
import { checkConfigInputs, type ConfigInputProblemKind } from './turbo-config-inputs';
import { readTurboJson } from './turbo-json';
import { loadTurboOptions, turboOptionsSchema, type TurboOptions } from './turbo-options';
import { readTaskEntries, type TurboRuleDeps } from './turbo-rule-support';
import { listTurboPackages } from './turbo-workspace';
import { realWorkspaceFs } from './workspace-fs';

export type TurboTaskConfigInputsMessageIds = ConfigInputProblemKind;

export type TurboTaskConfigInputsRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [TurboOptions];
  MessageIds: TurboTaskConfigInputsMessageIds;
}>;

/**
 * Requires a cached task whose script runs a tool (`eslint`, `tsc` and `vitest` by default, see `toolConfigs`) to have that tool's config files in its cache key. A task's key is hashed from its `inputs`, which default to the files of its own package, so a config file at the repository root is not part of it unless `globalDependencies` or an `$TURBO_ROOT$/` input lists it, and a task with explicit `inputs` and no `$TURBO_DEFAULT$` must list its package's own config files too; otherwise changing the config restores the result cached under the old one. A config that a `!` glob of `inputs` drops is reported separately, naming the glob, since an exclusion wins over `$TURBO_DEFAULT$` and over a glob that lists the file. Each package that implements the task is checked with its effective task, so a package `turbo.json` that replaces `inputs` is caught. Diagnostics land on the task's key in the root turbo.json. A no-op in a turbo.json that extends another (a package configuration).
 */
export function createTurboTaskConfigInputsRule(deps: TurboRuleDeps = {}): TurboTaskConfigInputsRuleDefinition {
  const { fs = realWorkspaceFs } = deps;

  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [turboOptionsSchema],
      docs: {
        recommended: false,
        description: 'Require a cached turbo task to include the config files of the tools its script runs in its cache key.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-task-config-inputs.ts',
      },
      messages: {
        missingRootConfig:
          'Task "{{task}}" runs {{tool}} in {{packages}}, which reads "{{file}}" at the repository root, but the cache key does not include it, so changing it restores a stale result. List it in "globalDependencies" or add "$TURBO_ROOT$/{{file}}" to the task\'s "inputs".',
        missingPackageConfig:
          'Task "{{task}}" runs {{tool}} in {{packages}}, which reads "{{file}}" in its package, but the task\'s "inputs" replace the default files without including it, so changing it restores a stale result. Add "{{file}}" to "inputs" or add "$TURBO_DEFAULT$".',
        excludedConfig:
          'Task "{{task}}" runs {{tool}} in {{packages}}, which reads "{{file}}", but the "inputs" glob "{{glob}}" excludes it from the cache key, so changing it restores a stale result. Narrow or remove that glob; listing the file or "$TURBO_DEFAULT$" does not override an exclusion.',
      },
    },
    create(context) {
      const options = loadTurboOptions(context.options[0]);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          const config = readTurboJson(parseJsonc(context.sourceCode.text, context.filename), context.filename);
          if (config.extends !== undefined) return;

          const rootDir = dirname(resolve(context.filename));
          const packages = listTurboPackages(fs, rootDir, options.packages);
          for (const { key, member, task } of readTaskEntries(node, config.tasks)) {
            if (isExemptTask(key, options.exemptTasks)) continue;
            for (const problem of checkConfigInputs({ fs, rootDir, config, key, entry: task, packages, toolConfigs: options.toolConfigs })) {
              context.report({ loc: member.name.loc, messageId: problem.kind, data: { task: key, tool: problem.tool, file: problem.file, packages: problem.packages.join(', '), ...(problem.excludedBy !== undefined && { glob: problem.excludedBy }) } });
            }
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createTurboTaskConfigInputsRule();
