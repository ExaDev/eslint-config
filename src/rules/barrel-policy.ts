import { dirname } from 'node:path';
import type { Rule } from 'eslint';
import { isRecord } from '../is-record';
import { findNearestPackageJson, findNearestPackageRoot, resolveAutoMode, type FindPackageRootFn, type ReadPackageJsonFn } from './barrel-auto-detect';
import {
  createSplitReexportDetector,
  hasSource,
  isDirectSibling,
  isIndexFile,
  isInsideAmbientModuleDeclaration,
  isPackageSpecifier,
  isPermittedBarrel,
  isPureReexport,
  isRawBarrelMode,
  moduleSpecifierValue,
  type RawBarrelMode,
} from './barrel-helpers';
import { createPathMatcher, fileGlobsSchema, readFileGlobs, relativeToCwd } from './file-scope';

/**
 * Extracts and validates the `mode` option, defaulting to 'auto' both when the options array has no item at all and when an item is present but carries no `mode` key — either way there is nothing invalid here, just nothing stated, so this returns rather than throws. A standalone function (not inline in create) so ESLint's `any`-typed `context.options[0]` is funneled through an `unknown` parameter boundary — passing `any` into `unknown` is safe, whereas inline member access on `any` (`options.mode`) propagates `any` through every later use and trips the type-aware lint rules. Inside the function `options` is `unknown`, so the narrowing composes cleanly without an assertion. A `mode` key that IS present but not one of the four raw literals still throws — that is a genuine misconfiguration, not an omission. Exported so that throw — a safety net behind the rule's schema, which ESLint's own Linter/RuleTester already enforce before create() is ever called with invalid options — can be exercised directly rather than left permanently unreachable through real linting.
 */
export function readMode(options: unknown): RawBarrelMode {
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

/**
 * Extracts and validates the `entries` option: the package's declared entry files, as globs relative to the directory of the nearest `package.json`. Returns `undefined` when the options carry no `entries` key, since an absent list declares no entry files at all. Throws, naming the option, for a list `readFileGlobs` rejects (not an array of non-empty strings, a duplicate glob, no include, or a glob minimatch cannot compile), and for `entries` beside `mode: 'banned'`, which permits no barrel for an entry to be. Call it after readMode, which has already rejected an options value that is not an object.
 */
export function readEntries(options: unknown): readonly string[] | undefined {
  if (!isRecord(options) || !('entries' in options)) return undefined;
  if (options['mode'] === 'banned') {
    throw new Error("exadev/barrel-policy: \"entries\" declares barrels, which mode 'banned' forbids; use 'single', 'siblings' or 'auto' with entries.");
  }

  return readFileGlobs(options['entries'], 'exadev/barrel-policy entries');
}

/**
 * The seams `createBarrelPolicyRule` resolves the linted file's package through, each defaulting to its filesystem-backed implementation in barrel-auto-detect.ts. `readPackageJson` supplies the manifest `'auto'` reads `exports`/`main` from; `findPackageRoot` supplies the directory `entries` globs are relative to.
 */
export interface BarrelPolicySeams {
  readonly readPackageJson?: ReadPackageJsonFn;
  readonly findPackageRoot?: FindPackageRootFn;
}

/**
 * The node a report is anchored on, derived from ESLint's own report descriptor rather than written by hand: a re-export statement, or the specifier or default export of a split-statement re-export, which as bare ESTree nodes carry no `.parent` and so are not `Rule.Node`.
 */
type ReportedNode = Extract<Parameters<Rule.RuleContext['report']>[0], { node: unknown }>['node'];

/**
 * Whether `filename` matches one of the `entries` globs, matched against its forward-slash path relative to the directory of its nearest package.json. A file with no package.json above it belongs to no package, so it declares no entry point.
 */
function isDeclaredEntry(filename: string, entries: readonly string[], findPackageRoot: FindPackageRootFn): boolean {
  const root = findPackageRoot(dirname(filename));
  if (root === undefined) return false;

  return createPathMatcher(entries)(relativeToCwd(filename, root));
}

/**
 * The convenience layer over this package's barrel rules: one rule id, one `{ mode }` option selecting one of three complete index-file policies, so a consumer writes a single config entry instead of wiring several rules together. The three modes are the orthogonal combinations of "which files may be barrels", "what a barrel may contain", and "where a barrel's re-exports may come from":
 *
 * 'banned'   — no index files at all; re-exports banned everywhere. 'single'   — exactly src/index.ts may be a barrel; it contains only re-exports; re-exports banned everywhere else. 'siblings' — any index file may be a barrel; each contains only re-exports; each re-export comes from a direct sibling (./module); re-exports banned in every non-index file.
 *
 * Implemented self-contained (its own visitor + message ids) over the shared predicates in barrel-helpers.ts, so the standalone rules and this umbrella share one source of truth for "what is an index file", "what is a pure re-export", "what is a direct sibling", and "what is a split-statement re-export" — no behavioural drift between the granular rules and the convenience one. A consumer uses EITHER this umbrella (one line, opinionated) OR the individual rules (full control, e.g. 'single' plus one extra cross-package re-export exception); not both, since they would double-report the same violations.
 *
 * The `entries` option adds a package's own declared entry files to the permitted barrels of 'single' and 'siblings' (and of 'auto' where it resolves to 'single'): a package that publishes several subpath exports has one module behind each, and each such module is an entry point exactly as src/index.ts is. An entry file is held to the barrel contents rule (only re-exports). In 'single' its re-exports may come from anywhere, as src/index.ts's may; in 'siblings' each must name a package or a direct sibling, since an entry point's job is to publish another package's surface or its own directory's. Every file the list does not match keeps the behaviour its mode gives it. The entries are listed, not derived from package.json's `exports`, because an exports target names the built file (`./dist/layout.js`), and mapping that back to its source depends on the build tool's own configuration, which this rule cannot read.
 *
 * Unlike the standalone no-non-barrel-reexport, this umbrella is non-fixable: the autofix belongs on the granular rule, and a policy-level rule that sometimes fixes and sometimes doesn't would surface that inconsistency under one rule id. Consumers who want the autofix use no-non-barrel-reexport directly.
 *
 * A factory, not a plain object, specifically so a test can inject stub BarrelPolicySeams (see barrel-auto-detect.ts) without those resolvers becoming part of the rule's public JSON options schema: ESLint validates context.options against meta.schema with additionalProperties: false, so there is no options-based channel to pass a function through even if one were wanted. The default export below is this factory called with the real, filesystem-backed defaults; barrel-policy.unit.test.ts imports createBarrelPolicyRule directly to exercise 'auto' and `entries` against fabricated package data with no real filesystem I/O. Mirrors the requireFn-as-parameter-with-a-real-default shape optional-plugin.ts's tryRequire already establishes for the same "injectable in tests, defaulted in production" problem.
 */
export function createBarrelPolicyRule({ readPackageJson = findNearestPackageJson, findPackageRoot = findNearestPackageRoot }: BarrelPolicySeams = {}): Rule.RuleModule {
  return {
    meta: {
      type: 'problem',
      schema: [
        {
          type: 'object',
          properties: { mode: { type: 'string', enum: ['banned', 'single', 'siblings', 'auto'] }, entries: fileGlobsSchema },
          additionalProperties: false,
        },
      ],
      messages: {
        indexFileBanned:
          "Index (barrel) files are banned in this project — import directly from the module that owns the export instead. Rename this file to something descriptive.",
        nonMainIndexFile:
          "Only src/index.ts may be a barrel in this project — this index file is not it. Move its contents into the module that owns them or give the file a descriptive name.",
        sideEffectInBarrel:
          "A barrel may contain only re-export statements ('export * from ...' / 'export { x } from ...' / 'export type { x } from ...') — nothing else, so it can never have a side effect at import time by construction. Found: {{ description }}.",
        reexportOutsideBarrel:
          "Re-exports belong only in a barrel (index) file — import this value directly in the file that uses it instead of re-exporting it through this one.",
        notADirectSibling:
          "A barrel may re-export only from a direct sibling file or folder ('./module' or './module.ts') — found '{{ source }}'. Move the source closer, or import it directly at the call site rather than re-exporting it through this barrel.",
        notAPackageOrSibling:
          "A package entry point may re-export only from a package ('pkg', '@scope/pkg/sub') or a direct sibling file or folder ('./module'); found '{{ source }}'. Re-export it through the package that owns it, move the source beside this entry point, or import it directly at the call site.",
      },
    },
    create(context) {
      const filename = context.filename;
      const rawMode = readMode(context.options[0]);
      const entries = readEntries(context.options[0]);
      // The filesystem walk in resolveAutoMode only ever runs for 'auto'; the three concrete literals pass straight through with no I/O.
      const mode = rawMode === 'auto' ? resolveAutoMode(filename, readPackageJson) : rawMode;
      // 'banned' permits no barrel, so under 'auto' resolved to 'banned' (a package with no exports or main, and so no entry points) the list selects nothing; readEntries has already rejected it beside an explicit 'banned'.
      const isEntry = mode !== 'banned' && entries !== undefined && isDeclaredEntry(filename, entries, findPackageRoot);
      const isBarrel = isEntry || isPermittedBarrel(filename, mode);
      const detector = createSplitReexportDetector();

      /**
       * Reports a re-export whose source `source` this file may not name: any re-export outside a barrel, and, in 'siblings' mode, a barrel's re-export that is not from a direct sibling (or, in a declared entry file, from a package either).
       */
      function checkReexportSource(node: ReportedNode, source: string): void {
        if (!isBarrel) {
          context.report({ node, messageId: 'reexportOutsideBarrel' });

          return;
        }
        if (mode !== 'siblings' || isDirectSibling(source)) return;
        if (!isEntry) {
          context.report({ node, messageId: 'notADirectSibling', data: { source } });
        } else if (!isPackageSpecifier(source)) {
          context.report({ node, messageId: 'notAPackageOrSibling', data: { source } });
        }
      }

      return {
        Program(node) {
          if (mode === 'banned') {
            if (isIndexFile(filename)) context.report({ node, messageId: 'indexFileBanned' });

            return;
          }
          // Only 'single' limits which index files may be barrels; in 'siblings' every index file is one, so isBarrel already holds for it.
          if (isIndexFile(filename) && !isBarrel) {
            context.report({ node, messageId: 'nonMainIndexFile' });

            return;
          }
          if (!isBarrel) return;
          for (const statement of node.body) {
            if (!isPureReexport(statement)) context.report({ node: statement, messageId: 'sideEffectInBarrel', data: { description: statement.type } });
          }
        },
        ImportDeclaration: (node) => { detector.visitImport(node); },
        ExportNamedDeclaration(node) {
          detector.visitExportNamed(node);
          if (hasSource(node) && !isInsideAmbientModuleDeclaration(node)) checkReexportSource(node, moduleSpecifierValue(node.source));
        },
        ExportAllDeclaration(node) {
          if (isInsideAmbientModuleDeclaration(node)) return;
          checkReexportSource(node, moduleSpecifierValue(node.source));
        },
        ExportDefaultDeclaration: (node) => { detector.visitExportDefault(node); },
        'Program:exit'() {
          // Inside a barrel the split-statement re-export is already reported as impure by Program above; checkReexportSource adds what its import source breaks on top of that, and outside a barrel reports the re-export itself.
          for (const violation of detector.violations()) {
            checkReexportSource(violation.kind === 'named' ? violation.specifier : violation.declaration, moduleSpecifierValue(violation.trackedImport.declaration.source));
          }
        },
      };
    },
  };
}

export default createBarrelPolicyRule();
