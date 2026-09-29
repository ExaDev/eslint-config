import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { parseJsonc } from './jsonc';
import { readTurboJson } from './turbo-json';
import { turboOptionsSchema, type TurboOptions } from './turbo-options';

export type TurboBoundariesConfigMessageIds = 'missingBoundaries';

export type TurboBoundariesConfigRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [TurboOptions];
  MessageIds: TurboBoundariesConfigMessageIds;
}>;

/**
 * Requires the root turbo.json to opt in to `turbo boundaries` with a `boundaries` key. The command checks nothing tag-related until the key exists, so a repository can drop the configuration and keep a passing script. This checks that the repository has opted in, never that `turbo boundaries` passes: the command can fail on a workspace whose packages share configuration through imports of files at the root, which it reports as leaving the package. A no-op in a turbo.json that extends another.
 */
export const turboBoundariesConfigRule: TurboBoundariesConfigRuleDefinition = {
  meta: {
    type: 'problem',
    languages: ['json/json', 'json/jsonc'],
    schema: [turboOptionsSchema],
    docs: {
      recommended: false,
      description: 'Require the root turbo.json to configure turbo boundaries.',
      url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-boundaries-config.ts',
    },
    messages: {
      missingBoundaries: 'The root turbo.json has no "boundaries" key, so "turbo boundaries" applies no tag rules. Add "boundaries" (an empty object is enough to opt in).',
    },
  },
  create(context) {
    return {
      Object(node: ObjectNode, parent) {
        if (parent?.type !== 'Document') return;

        const config = readTurboJson(parseJsonc(context.sourceCode.text, context.filename));
        if (config.extends === undefined && !config.hasBoundaries) context.report({ loc: node.loc, messageId: 'missingBoundaries' });
      },
    } satisfies JSONRuleVisitor;
  },
};

export default turboBoundariesConfigRule;
