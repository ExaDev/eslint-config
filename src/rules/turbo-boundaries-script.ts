import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { readScripts } from './manifest-scripts';
import { checkBoundariesScripts, type BoundariesScriptProblemKind } from './turbo-checks';
import { loadTurboOptions, turboOptionsSchema, type TurboOptions } from './turbo-options';
import { readLintedTurboPackage, type TurboRuleDeps } from './turbo-rule-support';
import { realWorkspaceFs } from './workspace-fs';

export type TurboBoundariesScriptMessageIds = BoundariesScriptProblemKind;

export type TurboBoundariesScriptRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [TurboOptions];
  MessageIds: TurboBoundariesScriptMessageIds;
}>;

/**
 * Requires the root package to wire `turbo boundaries` into a script that runs: a `boundaries` script that is exactly `turbo boundaries`, and, with `boundaries.aggregateScript`, an aggregate script (the one run before pushing) that invokes it directly or through a package manager. ESLint cannot see CI workflow files, so a check that lives only there stays unverified. This checks the wiring, never that the command passes. A no-op outside the root package.
 */
export function createTurboBoundariesScriptRule(deps: TurboRuleDeps = {}): TurboBoundariesScriptRuleDefinition {
  const { fs = realWorkspaceFs } = deps;

  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [turboOptionsSchema],
      docs: {
        recommended: false,
        description: 'Require the root package to define a boundaries script equal to turbo boundaries and to invoke it from the configured aggregate script.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-boundaries-script.ts',
      },
      messages: {
        missingBoundariesScript: 'The root package has no "boundaries" script. Add "boundaries": "turbo boundaries".',
        boundariesScriptMismatch: 'Script "boundaries" must be exactly "turbo boundaries", but is "{{actual}}".',
        missingAggregateScript: 'The aggregate script "{{script}}" named by the "boundaries.aggregateScript" option does not exist in the root package.',
        aggregateSkipsBoundaries: 'Script "{{script}}" does not run boundary checking, so "turbo boundaries" is not exercised wherever it runs. Invoke the "boundaries" script from it.',
      },
    },
    create(context) {
      const options = loadTurboOptions(context.options[0]);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          const linted = readLintedTurboPackage({ fs, filename: context.filename, manifest: node, rootOption: options.root });
          if (linted?.isRoot !== true) return;

          const scripts = readScripts(node);
          const commands = new Map([...scripts.entries].map(([name, entry]) => [name, entry.command]));
          for (const problem of checkBoundariesScripts(commands, options.boundaries?.aggregateScript)) {
            context.report({ loc: scripts.entries.get(problem.script)?.member.loc ?? scripts.loc, messageId: problem.kind, data: { script: problem.script, actual: problem.actual } });
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createTurboBoundariesScriptRule();
