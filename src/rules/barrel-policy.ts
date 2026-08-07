import type { Rule } from 'eslint';
import {
  createSplitReexportDetector,
  isDirectSibling,
  isIndexFile,
  isBarrelMode,
  isMainBarrel,
  isPermittedBarrel,
  isPureReexport,
  type BarrelMode,
  type ExportNamedDeclarationNode,
} from './barrel-helpers';

// Extracts and validates the `mode` option. A standalone function (not inline in create) so ESLint's `any`-typed `context.options[0]` is funneled through an `unknown` parameter boundary -- passing `any` into `unknown` is safe, whereas inline member access on `any` (`options.mode`) propagates `any` through every later use and trips the type-aware lint rules. Inside the function `options` is `unknown`, so the narrowing composes cleanly without an assertion.
function readMode(options: unknown): BarrelMode {
  if (options === undefined || typeof options !== 'object' || options === null || !('mode' in options) || !isBarrelMode(options.mode)) {
    throw new Error("exadev/barrel-policy requires options: { mode: 'banned' | 'single' | 'siblings' }.");
  }
  return options.mode;
}

// The convenience layer over this package's barrel rules: one rule id, one `{ mode }` option selecting one of three complete index-file policies, so a consumer writes a single config entry instead of wiring several rules together. The three modes are the orthogonal combinations of "which files may be barrels", "what a barrel may contain", and "where a barrel's re-exports may come from":
//
// 'banned'   -- no index files at all; re-exports banned everywhere. 'single'   -- exactly src/index.ts may be a barrel; it contains only re-exports; re-exports banned everywhere else. 'siblings' -- any index file may be a barrel; each contains only re-exports; each re-export comes from a direct sibling (./module); re-exports banned in every non-index file.
//
// Implemented self-contained (its own visitor + message ids) over the shared predicates in barrel-helpers.ts, so the standalone rules and this umbrella share one source of truth for "what is an index file", "what is a pure re-export", "what is a direct sibling", and "what is a split-statement re-export" -- no behavioural drift between the granular rules and the convenience one. A consumer uses EITHER this umbrella (one line, opinionated) OR the individual rules (full control, e.g. 'single' plus one extra cross-package re-export exception); not both, since they would double-report the same violations.
//
// Unlike the standalone no-non-barrel-reexport, this umbrella is non-fixable: the autofix belongs on the granular rule, and a policy-level rule that sometimes fixes and sometimes doesn't would surface that inconsistency under one rule id. Consumers who want the autofix use no-non-barrel-reexport directly.
const barrelPolicy: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: { mode: { type: 'string', enum: ['banned', 'single', 'siblings'] } },
        required: ['mode'],
        additionalProperties: false,
      },
    ],
    messages: {
      indexFileBanned:
        "Index (barrel) files are banned in this project -- import directly from the module that owns the export instead. Rename this file to something descriptive.",
      nonMainIndexFile:
        "Only src/index.ts may be a barrel in this project -- this index file is not it. Move its contents into the module that owns them or give the file a descriptive name.",
      sideEffectInBarrel:
        "A barrel may contain only re-export statements ('export * from ...' / 'export { x } from ...' / 'export type { x } from ...') -- nothing else, so it can never have a side effect at import time by construction. Found: {{ description }}.",
      reexportOutsideBarrel:
        "Re-exports belong only in a barrel (index) file -- import this value directly in the file that uses it instead of re-exporting it through this one.",
      notADirectSibling:
        "A barrel may re-export only from a direct sibling file or folder ('./module' or './module.ts') -- found '{{ source }}'. Move the source closer, or import it directly at the call site rather than re-exporting it through this barrel.",
    },
  },
  create(context) {
    const mode = readMode(context.options[0]);
    const filename = context.filename;
    const detector = createSplitReexportDetector();

    function hasSource(node: ExportNamedDeclarationNode): boolean {
      return node.source !== null && node.source !== undefined;
    }

    return {
      Program(node) {
        if (mode === 'banned') {
          if (isIndexFile(filename)) context.report({ node, messageId: 'indexFileBanned' });
          return;
        }
        if (mode === 'single') {
          if (isIndexFile(filename) && !isMainBarrel(filename)) {
            context.report({ node, messageId: 'nonMainIndexFile' });
            return;
          }
          if (isMainBarrel(filename)) {
            for (const statement of node.body) {
              if (!isPureReexport(statement)) context.report({ node: statement, messageId: 'sideEffectInBarrel', data: { description: statement.type } });
            }
          }
          return;
        }
        // mode === 'siblings': any index file is a barrel; enforce purity on each.
        if (isIndexFile(filename)) {
          for (const statement of node.body) {
            if (!isPureReexport(statement)) context.report({ node: statement, messageId: 'sideEffectInBarrel', data: { description: statement.type } });
          }
        }
      },
      ImportDeclaration: (node) => detector.visitImport(node),
      ExportNamedDeclaration(node) {
        detector.visitExportNamed(node);
        if (hasSource(node)) {
          const source = node.source === null || node.source === undefined ? undefined : node.source.value;
          if (!isPermittedBarrel(filename, mode)) {
            context.report({ node, messageId: 'reexportOutsideBarrel' });
          } else if (mode === 'siblings' && typeof source === 'string' && !isDirectSibling(source)) {
            context.report({ node, messageId: 'notADirectSibling', data: { source } });
          }
        }
      },
      ExportAllDeclaration(node) {
        const source = node.source.value;
        if (!isPermittedBarrel(filename, mode)) {
          context.report({ node, messageId: 'reexportOutsideBarrel' });
        } else if (mode === 'siblings' && typeof source === 'string' && !isDirectSibling(source)) {
          context.report({ node, messageId: 'notADirectSibling', data: { source } });
        }
      },
      ExportDefaultDeclaration: (node) => detector.visitExportDefault(node),
      'Program:exit'() {
        for (const violation of detector.violations()) {
          if (isPermittedBarrel(filename, mode)) {
            // Inside a barrel the split-statement re-export is allowed, but in 'siblings' mode its import source must still be a direct sibling.
            if (mode === 'siblings') {
              const importSource = violation.trackedImport.declaration.source.value;
              if (typeof importSource === 'string' && !isDirectSibling(importSource)) {
                context.report({ node: violation.kind === 'named' ? violation.specifier : violation.declaration, messageId: 'notADirectSibling', data: { source: importSource } });
              }
            }
          } else {
            context.report({ node: violation.kind === 'named' ? violation.specifier : violation.declaration, messageId: 'reexportOutsideBarrel' });
          }
        }
      },
    };
  },
};

export default barrelPolicy;
