import type { Rule } from 'eslint';
import { isIndexFile, isPureReexport } from './barrel-helpers';

// Structural counterpart to no-non-barrel-reexport: that rule says re-exports belong only in a barrel; this one says a barrel may contain only re-exports. A file restricted to nothing but `export * from '...'` / `export { x } from '...'` / `export type { x } from '...'` cannot execute anything at import time -- no semantic "does this statement have a side effect" judgement is needed, which matters because this codebase's own top-level `z.object(...)`/`z.discriminatedUnion(...)`/`z.codec(...)` schema construction (present throughout every non-barrel module) would need special-casing under any naive "no top-level function calls" heuristic.
//
// Self-scoped to ANY index file via isIndexFile (context.filename), mirroring no-non-barrel-index's own basename match -- this rule only has a legitimate target (an index/barrel file), so it no-ops on every non-index file rather than relying on a consumer's own `files` config. In a 'single'-mode repo, no-non-barrel-index guarantees src/index.ts is the only index file, so this collapses to flagging side effects in exactly that one barrel; in a 'siblings'-mode repo any index file is a barrel and this enforces the same purity on each of them.
const noSideEffectsInIndex: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      notAPureReexport:
        "A barrel (index) file may contain only re-export statements ('export * from ...' / 'export { x } from ...' / 'export type { x } from ...') -- nothing else, so it can never have a side effect at import time by construction. Found: {{ description }}.",
    },
  },
  create(context) {
    if (!isIndexFile(context.filename)) return {};
    return {
      Program(node) {
        for (const statement of node.body) {
          if (!isPureReexport(statement)) {
            context.report({ node: statement, messageId: 'notAPureReexport', data: { description: statement.type } });
          }
        }
      },
    };
  },
};

export default noSideEffectsInIndex;
