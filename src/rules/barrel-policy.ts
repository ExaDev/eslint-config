import type { Rule } from 'eslint';
import { findNearestPackageJson, resolveAutoMode, type ReadPackageJsonFn } from './barrel-auto-detect';
import {
  createSplitReexportDetector,
  isDirectSibling,
  isIndexFile,
  isInsideAmbientModuleDeclaration,
  isMainBarrel,
  isPermittedBarrel,
  isPureReexport,
  isRawBarrelMode,
  type ExportNamedDeclarationNode,
  type RawBarrelMode,
} from './barrel-helpers';

// Extracts and validates the `mode` option, defaulting to 'auto' both when the options array has no item at all and when an item is present but carries no `mode` key -- either way there is nothing invalid here, just nothing stated, so this returns rather than throws. A standalone function (not inline in create) so ESLint's `any`-typed `context.options[0]` is funneled through an `unknown` parameter boundary -- passing `any` into `unknown` is safe, whereas inline member access on `any` (`options.mode`) propagates `any` through every later use and trips the type-aware lint rules. Inside the function `options` is `unknown`, so the narrowing composes cleanly without an assertion. A `mode` key that IS present but not one of the four raw literals still throws -- that is a genuine misconfiguration, not an omission.
function readMode(options: unknown): RawBarrelMode {
  if (options === undefined) return 'auto';
  if (typeof options !== 'object' || options === null) {
    throw new Error("exadev/barrel-policy requires options: { mode: 'banned' | 'single' | 'siblings' | 'auto' }.");
  }
  if (!('mode' in options)) return 'auto';
  if (!isRawBarrelMode(options.mode)) {
    throw new Error("exadev/barrel-policy requires options: { mode: 'banned' | 'single' | 'siblings' | 'auto' }.");
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
//
// A factory, not a plain object, specifically so a test can inject a stub ReadPackageJsonFn (see barrel-auto-detect.ts) without that resolver becoming part of the rule's public JSON options schema -- ESLint validates context.options against meta.schema with additionalProperties: false, so there is no options-based channel to smuggle a function through even if one were wanted. The default export below is this factory called with the real, filesystem-backed default; barrel-policy.test.ts imports createBarrelPolicyRule directly to exercise 'auto' against fabricated package.json data with zero real filesystem I/O. Mirrors the requireFn-as-parameter-with-a-real-default shape optional-plugin.ts's tryRequire already establishes for the same "injectable in tests, defaulted in production" problem.
export function createBarrelPolicyRule(readPackageJsonFn: ReadPackageJsonFn = findNearestPackageJson): Rule.RuleModule {
  return {
    meta: {
      type: 'problem',
      schema: [
        {
          type: 'object',
          properties: { mode: { type: 'string', enum: ['banned', 'single', 'siblings', 'auto'] } },
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
      const filename = context.filename;
      const rawMode = readMode(context.options[0]);
      // The filesystem walk in resolveAutoMode only ever runs for 'auto' -- the three concrete literals pass straight through with zero I/O, exactly as before this option existed.
      const mode = rawMode === 'auto' ? resolveAutoMode(filename, readPackageJsonFn) : rawMode;
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
        ImportDeclaration: (node) => { detector.visitImport(node); },
        ExportNamedDeclaration(node) {
          detector.visitExportNamed(node);
          if (hasSource(node) && !isInsideAmbientModuleDeclaration(node)) {
            const source = node.source === null || node.source === undefined ? undefined : node.source.value;
            if (!isPermittedBarrel(filename, mode)) {
              context.report({ node, messageId: 'reexportOutsideBarrel' });
            } else if (mode === 'siblings' && typeof source === 'string' && !isDirectSibling(source)) {
              context.report({ node, messageId: 'notADirectSibling', data: { source } });
            }
          }
        },
        ExportAllDeclaration(node) {
          if (isInsideAmbientModuleDeclaration(node)) return;
          const source = node.source.value;
          if (!isPermittedBarrel(filename, mode)) {
            context.report({ node, messageId: 'reexportOutsideBarrel' });
          } else if (mode === 'siblings' && typeof source === 'string' && !isDirectSibling(source)) {
            context.report({ node, messageId: 'notADirectSibling', data: { source } });
          }
        },
        ExportDefaultDeclaration: (node) => { detector.visitExportDefault(node); },
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
}

export default createBarrelPolicyRule();
