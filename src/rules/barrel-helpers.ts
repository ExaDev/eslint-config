import { posix } from 'node:path';
import type { Rule } from 'eslint';

// Shared predicates and the split-statement re-export detector used by the standalone barrel rules (no-non-barrel-reexport, no-side-effects-in-index, no-non-barrel-index, no-index-files, barrel-direct-siblings-only) and the barrel-policy umbrella rule. Centralising these here means a fix to the "what counts as an index file" or "what counts as a direct sibling" question lands once rather than in each rule, and the umbrella composes the identical detection the standalone rules apply -- no behavioural drift between the convenience rule and its granular equivalents.

// The three modes the barrel-policy umbrella rule selects between, and that the isPermittedBarrel predicate below keys on. 'banned' = no index files at all; 'single' = exactly src/index.ts may be a barrel; 'siblings' = any index file may be a barrel but its re-exports must come from direct siblings.
export type BarrelMode = 'banned' | 'single' | 'siblings';

// Reusable across rules: the basename an index file has, matching ts/tsx/js/jsx/mjs/mts/cjs/cts. Identical to no-non-barrel-index's own INDEX_BASENAME -- deliberately duplicated as the single declared constant both modules import, rather than each rule re-deriving the regex.
export const INDEX_BASENAME = /^index\.[cm]?[tj]sx?$/;

export function basenameOf(filename: string): string {
  const slash = filename.lastIndexOf('/');
  return slash === -1 ? filename : filename.slice(slash + 1);
}

export function isIndexFile(filename: string): boolean {
  return INDEX_BASENAME.test(basenameOf(filename));
}

// The single designated barrel in 'single' mode. Mirrors no-non-barrel-index's own carve-out exactly (endsWith('/src/index.ts')), so the umbrella's 'single' mode and the standalone no-non-barrel-index rule agree on which file is the one permitted barrel.
export function isMainBarrel(filename: string): boolean {
  return filename.endsWith('/src/index.ts');
}

// True for re-export statements only: `export * from '...'` / `export { x } from '...'` / `export type { x } from '...'`. A file restricted to these cannot execute anything at import time -- no semantic "does this statement have a side effect" judgement needed, which matters because top-level schema construction (z.object/z.discriminatedUnion/z.codec) throughout every non-barrel module would need special-casing under any naive "no top-level function calls" heuristic.
export function isPureReexport(statement: { type: string; source?: unknown }): boolean {
  if (statement.type === 'ExportAllDeclaration') return true;
  return statement.type === 'ExportNamedDeclaration' && statement.source !== null && statement.source !== undefined;
}

// True when a re-export's source specifier resolves to a direct sibling of the barrel -- `./module` or `./module.ts` (a sibling file or a sibling folder, the latter resolving via its own index). Rejects nested paths (`./a/b`), parent traversal (`../x`, `./..`), bare package specifiers (`foo`, `document-schema.js`), and self (`.`/`./`). node:path's posix.normalize collapses the pathological-but-valid `./a/../b` to `b` (a genuine sibling) rather than rejecting it on a syntactic technicality, which a raw regex like `/^\.\/[^/]+$/` (the approach an earlier repo's selector took) could not do.
export function isDirectSibling(specifier: string): boolean {
  if (!specifier.startsWith('./')) return false; // bare package or ../ -> not a sibling of this barrel
  let rest = posix.normalize(specifier.slice(2)); // collapse ./a/../b, ./a/./b, double slashes
  if (rest.endsWith('/')) rest = rest.slice(0, -1); // tolerate a trailing slash on a sibling folder (./foo/)
  return rest !== '.' && rest !== '..' && rest !== '' && !rest.includes('/');
}

// Runtime type guard narrowing ESLint's `any`-typed context.options entry to BarrelMode without an assertion. ESLint validates the enum in a rule's meta.schema before the rule runs, so a well-configured caller never reaches the false branch; the guard exists to satisfy the type-aware lint rules (no-unsafe-argument) that a plain comparison against `any` does not, since comparing `any` to a string literal leaves the value typed as `any` rather than narrowing it.
export function isBarrelMode(value: unknown): value is BarrelMode {
  return value === 'banned' || value === 'single' || value === 'siblings';
}

// Whether the file at `filename` is a permitted barrel under the given mode. 'banned' permits none; 'single' permits only src/index.ts; 'siblings' permits any index file.
export function isPermittedBarrel(filename: string, mode: BarrelMode): boolean {
  if (mode === 'banned') return false;
  if (mode === 'single') return isMainBarrel(filename);
  return isIndexFile(filename);
}

// ─── Node types ─── Derived from ESLint's own Rule.RuleListener via Parameters<>, never hand-written and never imported from @types/estree directly (this package does not otherwise depend on it). Pulling them out of no-non-barrel-reexport.ts into this shared module so the umbrella rule and the standalone rules share one source of truth for the ESTree shapes they walk.
export type ExportNamedDeclarationNode = Parameters<NonNullable<Rule.RuleListener['ExportNamedDeclaration']>>[0];
export type ExportSpecifierNode = ExportNamedDeclarationNode['specifiers'][number];
export type ExportDefaultDeclarationNode = Parameters<NonNullable<Rule.RuleListener['ExportDefaultDeclaration']>>[0];
export type ImportDeclarationNode = Parameters<NonNullable<Rule.RuleListener['ImportDeclaration']>>[0];
export type ImportSpecifierNode = ImportDeclarationNode['specifiers'][number];

export interface TrackedImport {
  declaration: ImportDeclarationNode;
  specifier: ImportSpecifierNode;
}

// The bare ESTree node types above carry no `.parent`, so they don't satisfy Rule.Node -- but fixer.remove/sourceCode.getRange need only their own parameter type, derived here from the real methods (the same "don't hand-type it" convention every rule in this package follows).
export type SyntaxElement = Parameters<Rule.RuleFixer['remove']>[0];
export type ReferenceIdentifier = ReturnType<Rule.RuleContext['sourceCode']['getDeclaredVariables']>[number]['references'][number]['identifier'];

// ─── Split-statement re-export detector ─── The single-statement re-export forms (`export { x } from '...'`, `export * from '...'`) are caught directly by walking ExportNamedDeclaration[source] / ExportAllDeclaration. The split-statement form -- `import { x } from './y'; export { x };` or `import { x } from './y'; export default x;` -- binds x locally and hands it back out under its own name, achieving the identical coupling across two statements that neither a source-bearing export nor an AST selector can match. This detector tracks every name an ImportDeclaration binds, then at flush() (called from Program:exit so an import written below its export is still seen) returns each split-statement re-export it found, carrying enough about the originating import for a caller that wants to fix it (no-non-barrel-reexport) or merely report it (the umbrella).
export type SplitReexportViolation =
  | { readonly kind: 'named'; readonly specifier: ExportSpecifierNode; readonly declaration: ExportNamedDeclarationNode; readonly name: string; readonly trackedImport: TrackedImport }
  | { readonly kind: 'default'; readonly declaration: ExportDefaultDeclarationNode; readonly name: string; readonly trackedImport: TrackedImport };

export function createSplitReexportDetector(): {
  visitImport(node: ImportDeclarationNode): void;
  visitExportNamed(node: ExportNamedDeclarationNode): void;
  visitExportDefault(node: ExportDefaultDeclarationNode): void;
  violations(): readonly SplitReexportViolation[];
} {
  const importsByName = new Map<string, TrackedImport>();
  const bareExportSpecifiers: { declaration: ExportNamedDeclarationNode; specifier: ExportSpecifierNode }[] = [];
  const defaultExportDeclarations: ExportDefaultDeclarationNode[] = [];

  return {
    visitImport(node) {
      for (const specifier of node.specifiers) {
        importsByName.set(specifier.local.name, { declaration: node, specifier });
      }
    },
    visitExportNamed(node) {
      if (node.source !== null && node.source !== undefined) return; // the single-statement form -- detected separately, not here.
      for (const specifier of node.specifiers) {
        bareExportSpecifiers.push({ declaration: node, specifier });
      }
    },
    visitExportDefault(node) {
      defaultExportDeclarations.push(node);
    },
    violations() {
      const out: SplitReexportViolation[] = [];
      for (const { declaration, specifier } of bareExportSpecifiers) {
        const name = specifier.local.type === 'Identifier' ? specifier.local.name : undefined;
        if (name === undefined) continue;
        const trackedImport = importsByName.get(name);
        if (trackedImport === undefined) continue;
        out.push({ kind: 'named', specifier, declaration, name, trackedImport });
      }
      for (const declarationNode of defaultExportDeclarations) {
        const name = declarationNode.declaration.type === 'Identifier' ? declarationNode.declaration.name : undefined;
        if (name === undefined) continue;
        const trackedImport = importsByName.get(name);
        if (trackedImport === undefined) continue;
        out.push({ kind: 'default', declaration: declarationNode, name, trackedImport });
      }
      return out;
    },
  };
}
