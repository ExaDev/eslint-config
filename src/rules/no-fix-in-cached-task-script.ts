import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { readScripts } from './manifest-scripts';
import { fixFlagsIn, isExemptTask } from './turbo-checks';
import { resolveScriptTask } from './turbo-json';
import { loadTurboOptions, turboOptionsSchema, type TurboOptions } from './turbo-options';
import { readLintedTurboPackage, type TurboRuleDeps } from './turbo-rule-support';
import { realWorkspaceFs } from './workspace-fs';

export type NoFixInCachedTaskScriptMessageIds = 'fixInCachedTask';

export type NoFixInCachedTaskScriptRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [TurboOptions];
  MessageIds: NoFixInCachedTaskScriptMessageIds;
}>;

/**
 * Keeps a script that runs as a cached turbo task free of flags that make it rewrite its own inputs (`fixFlags`, by default `--fix` and `--write`). Turbo hashes a task's inputs before it runs, so a task that then changes them is stored under a key that no longer describes the files, and a later cache hit replays the log without applying the fix the log describes. Fixing belongs in a separate task with `cache: false`. A script counts as a cached task when turbo.json configures a task for it (see `turbo-script-has-task` for the lookup) that does not set `cache: false`. It checks the command line as written, and is a no-op in a package that is not part of a turbo repository.
 */
export function createNoFixInCachedTaskScriptRule(deps: TurboRuleDeps = {}): NoFixInCachedTaskScriptRuleDefinition {
  const { fs = realWorkspaceFs } = deps;

  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [turboOptionsSchema],
      docs: {
        recommended: false,
        description: 'Disallow fixing flags in a script that runs as a cached turbo task; put the fix in a separate uncached task.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-fix-in-cached-task-script.ts',
      },
      messages: {
        fixInCachedTask:
          'Script "{{script}}" runs as a cached turbo task but passes {{flags}}. The task hash is taken before the rewrite, and a cache hit replays the log without applying the fix. Keep the check free of it and put the fix in a separate task with "cache": false.',
      },
    },
    create(context) {
      const options = loadTurboOptions(context.options[0]);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          const linted = readLintedTurboPackage({ fs, filename: context.filename, manifest: node, rootOption: options.root });
          if (linted === undefined) return;

          for (const [script, entry] of readScripts(node).entries) {
            if (entry.command === undefined || isExemptTask(script, options.exemptTasks)) continue;
            const task = resolveScriptTask({ script, root: linted.root.turbo, qualifier: linted.qualifier, own: linted.own });
            if (task === undefined || task.cache === false) continue;
            const flags = fixFlagsIn(entry.command, options.fixFlags);
            if (flags.length > 0) context.report({ loc: entry.member.loc, messageId: 'fixInCachedTask', data: { script, flags: flags.map((flag) => `"${flag}"`).join(', ') } });
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createNoFixInCachedTaskScriptRule();
