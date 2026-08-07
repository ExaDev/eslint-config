import type { Rule } from 'eslint';
import { createSplitReexportDetector, isIndexFile } from './barrel-helpers';
import type { ReferenceIdentifier, SyntaxElement, TrackedImport } from './barrel-helpers';

// The single-statement re-export ban (`export { x } from '...'`, `export * from '...'`) is caught directly by walking ExportNamedDeclaration[source] / ExportAllDeclaration. This rule closes the split-statement gap: `import { foo } from './bar'; export { foo };` binds foo locally and hands it back out under its own name -- exactly what `export { foo } from './bar'` does directly -- but neither statement carries a source on the export, so no AST selector alone matches it. The same split applies to `export default`: `import { foo } from './bar'; export default foo;` is the split form of `export { foo as default } from './bar';`. Detection runs at Program:exit (see createSplitReexportDetector) so an import written below its export is still seen.
//
// The fixer only ever does two things, both single-file and behaviour-preserving: delete the offending export (specifier or whole statement), and -- only when that export was the import's ONLY use anywhere in the file, proven via the real scope-manager Variable rather than guessed from the AST shape -- delete the now-pointless import alongside it. It never touches another file, so it never redirects a consumer (e.g. src/index.ts) to import from the real source module; that decision is a human's, since the fixer has no way to know from this file alone whether anything imports the removed name from this file's own path. If something does, deleting the export surfaces as an immediate, loud TypeScript "has no exported member" error at that consumer -- never a silent behaviour change -- which is exactly the fail-loud outcome this codebase's own conventions call for, and the fix from there is the same one this rule's git history already applied by hand repeatedly: point the consumer at the real source module directly.
//
// Self-scoped away from ANY index file via isIndexFile (context.filename), not just src/index.ts -- this rule's point is banning the split-statement re-export shape OUTSIDE a barrel, so a barrel (where a real, single-statement `export { x } from '...'` re-export is the normal, intended shape) is exempt whatever it is called. In a 'single'-mode repo, no-non-barrel-index guarantees src/index.ts is the only index file, so this collapses to the historical behaviour; in a 'siblings'-mode repo any index file is a legitimate barrel and this rule no-ops there too.

// Removes one member from a comma-separated specifier list, collapsing the whole surrounding declaration instead when that member is the only one left -- `import {} from 'x'` and a bare `export {};` are both legal but pointless, so a fully-drained list takes its declaration with it rather than leaving debris behind.
function removeListMember(fixer: Rule.RuleFixer, sourceCode: Rule.RuleContext['sourceCode'], declaration: SyntaxElement, members: readonly SyntaxElement[], target: SyntaxElement): Rule.Fix {
  if (members.length === 1) {
    return fixer.remove(declaration);
  }
  const targetIndex = members.indexOf(target);
  const isLast = targetIndex === members.length - 1;
  const neighbor = members[isLast ? targetIndex - 1 : targetIndex + 1];
  if (neighbor === undefined) {
    throw new Error('Unreachable: a list with more than one member always has a neighbor either side of any member within it.');
  }
  // Not the last specifier: remove from this specifier's own start to the next one's start -- eats the trailing ", ". The last specifier: remove from the previous one's end to this one's end -- eats the leading ", ".
  return isLast
    ? fixer.removeRange([sourceCode.getRange(neighbor)[1], sourceCode.getRange(target)[1]])
    : fixer.removeRange([sourceCode.getRange(target)[0], sourceCode.getRange(neighbor)[0]]);
}

// True only when the imported binding's sole use anywhere in the file is the one bare re-export being fixed -- the narrow, single-file-provable case where deleting the import alongside the export is unquestionably safe. Resolved via the real scope-manager Variable (getDeclaredVariables), not by re-deriving usage from the AST by hand, so this is exactly as accurate as the identical check no-unused-vars already relies on. When the import is also used for real work elsewhere, this returns false and the fixer leaves the import alone, removing only the re-export itself.
function importIsOnlyUsedByThisExport(sourceCode: Rule.RuleContext['sourceCode'], trackedImport: TrackedImport, usageIdentifier: ReferenceIdentifier): boolean {
  const variable = sourceCode.getDeclaredVariables(trackedImport.declaration).find((candidate) => candidate.defs.some((def) => def.node === trackedImport.specifier));
  if (variable === undefined) {
    return false; // Not expected to happen -- every import specifier declares exactly one variable -- but false is the safe default: skip removing the import rather than risk deleting a binding still in use.
  }
  if (variable.references.length !== 1) {
    return false;
  }
  const [onlyReference] = variable.references;
  if (onlyReference === undefined) {
    throw new Error('Unreachable: the length check above guarantees exactly one element.');
  }
  return onlyReference.identifier === usageIdentifier;
}

const noNonBarrelReexport: Rule.RuleModule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: {
      // Plain literal braces, not an escaped placeholder -- ESLint's message interpolation only treats a `{{ name }}` pair specially when `name` is a real key in `data`; a lone `{`/`}` passes through untouched, so writing it directly is both correct and simpler.
      splitStatementReexport:
        "'{{ name }}' is imported here and handed straight back out via a bare export -- the identical re-export 'export { {{ name }} } from ...' would be, just split across two statements. Re-exports belong only in the public barrel.",
      splitStatementDefaultReexport:
        "'{{ name }}' is imported here and handed straight back out via `export default` -- the identical re-export 'export { {{ name }} as default } from ...' would be, just split across two statements. Re-exports belong only in the public barrel.",
    },
  },
  create(context) {
    if (isIndexFile(context.filename)) return {};
    const detector = createSplitReexportDetector();

    return {
      ImportDeclaration: (node) => detector.visitImport(node),
      ExportNamedDeclaration: (node) => detector.visitExportNamed(node),
      ExportDefaultDeclaration: (node) => detector.visitExportDefault(node),
      'Program:exit'() {
        const { sourceCode } = context;
        for (const violation of detector.violations()) {
          if (violation.kind === 'named') {
            const { specifier, declaration, name, trackedImport } = violation;
            context.report({
              node: specifier,
              messageId: 'splitStatementReexport',
              data: { name },
              fix(fixer) {
                const fixes = [removeListMember(fixer, sourceCode, declaration, declaration.specifiers, specifier)];
                if (specifier.local.type === 'Identifier' && importIsOnlyUsedByThisExport(sourceCode, trackedImport, specifier.local)) {
                  fixes.push(removeListMember(fixer, sourceCode, trackedImport.declaration, trackedImport.declaration.specifiers, trackedImport.specifier));
                }
                return fixes;
              },
            });
          } else {
            const { declaration, name, trackedImport } = violation;
            context.report({
              node: declaration,
              messageId: 'splitStatementDefaultReexport',
              data: { name },
              fix(fixer) {
                const fixes: Rule.Fix[] = [fixer.remove(declaration)];
                if (declaration.declaration.type === 'Identifier' && importIsOnlyUsedByThisExport(sourceCode, trackedImport, declaration.declaration)) {
                  fixes.push(removeListMember(fixer, sourceCode, trackedImport.declaration, trackedImport.declaration.specifiers, trackedImport.specifier));
                }
                return fixes;
              },
            });
          }
        }
      },
    };
  },
};

export default noNonBarrelReexport;
