import type { Rule } from 'eslint';

// Structural counterpart to no-non-barrel-reexport: that rule says re-exports belong only in src/index.ts; this one says src/index.ts may contain only re-exports. A file restricted to nothing but `export * from '...'` / `export { x } from '...'` / `export type { x } from '...'` cannot execute anything at import time -- no semantic "does this statement have a side effect" judgement is needed, which matters because this codebase's own top-level `z.object(...)`/`z.discriminatedUnion(...)`/`z.codec(...)` schema construction (present throughout every non-barrel module) would need special-casing under any naive "no top-level function calls" heuristic.
//
// Self-scoped to src/index.ts via context.filename, mirroring no-non-barrel-index's own pattern -- this rule only has a legitimate target (the one designated barrel), so it no-ops on every other file rather than relying on a consumer's own `files: ['src/index.ts']` config to avoid flagging ordinary exports everywhere else. That external-scoping requirement is exactly what made applying the bundled recommended/barrel configs unscoped misfire (see this package's own README).
function isPureReexport(statement: { type: string; source?: unknown }): boolean {
  if (statement.type === 'ExportAllDeclaration') return true;
  return statement.type === 'ExportNamedDeclaration' && statement.source !== null && statement.source !== undefined;
}

const noSideEffectsInIndex: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      notAPureReexport:
        "The public barrel (src/index.ts) may contain only re-export statements ('export * from ...' / 'export { x } from ...' / 'export type { x } from ...') -- nothing else, so it can never have a side effect at import time by construction. Found: {{ description }}.",
    },
  },
  create(context) {
    if (!context.filename.endsWith('/src/index.ts')) return {};
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
