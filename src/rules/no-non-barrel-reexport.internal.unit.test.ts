import type { Rule } from 'eslint';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import type { ExportSpecifierNode, ImportDeclarationNode, ReferenceIdentifier, SyntaxElement } from './barrel-helpers';
import { importIsOnlyUsedByThisExport, removeListMember } from './no-non-barrel-reexport';

// A bare (source-less) export specifier's own `local` is always an Identifier in real syntax; this narrows the wider ExportSpecifierNode['local'] type (Identifier | Literal, the latter only ever produced by a WITH-source re-export) down to what this specific probe fixture always actually captures.
function asIdentifierOrThrow(node: ExportSpecifierNode['local']): ReferenceIdentifier {
  if (node.type !== 'Identifier') {
    throw new Error(`Unreachable: expected an Identifier, got ${node.type} instead.`);
  }
  return node;
}

function definedOrThrow<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Unreachable: expected the probe rule below to have captured this value.');
  }
  return value;
}

// removeListMember/importIsOnlyUsedByThisExport each guard an array-index access that TypeScript's own noUncheckedIndexedAccess types as possibly undefined even though the surrounding logic (a >1-length list always has a neighbor; a references array reported as length 1 always has an element at index 0) makes them provably safe for any input real ES syntax and real ESLint scope analysis can ever produce. These tests deliberately violate those invariants (an empty member list, a fabricated Variable a real scope manager never returns) to prove the defensive branches behave correctly if they were ever wrong, since no real fixture can reach them — using real, fully-populated AST nodes captured from an actual parse throughout, never a hand-built stand-in for one.

// Real, fully-populated AST nodes AND a real Rule.RuleFixer/SourceCode pair (range/loc/parent included, and the actual fixer ESLint hands a real fix() callback) are only ever produced by a real parse and a real lint pass — captured here via a genuine (throwaway) rule run rather than hand-constructed, so every fixture below is exactly what removeListMember/importIsOnlyUsedByThisExport are really called with, never a partial stand-in for either.
let realImportNode: ImportDeclarationNode | undefined;
let realSpecifierNode: ExportSpecifierNode | undefined;
let realDeclarationNode: SyntaxElement | undefined;
let realFixer: Rule.RuleFixer | undefined;
let realSourceCode: Rule.RuleContext['sourceCode'] | undefined;

const probe: Rule.RuleModule = {
  meta: { schema: [], fixable: 'code' },
  create(context) {
    return {
      ImportDeclaration(node) {
        realImportNode = node;
      },
      ExportNamedDeclaration(node) {
        realDeclarationNode = node;
        const [specifier] = node.specifiers;
        realSpecifierNode = specifier;
        realSourceCode = context.sourceCode;
        context.report({
          node,
          message: 'probe',
          fix(fixer) {
            realFixer = fixer;
            return null;
          },
        });
      },
    };
  },
};

const tester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });
tester.run('probe', probe, {
  valid: [],
  invalid: [{ code: "import { foo } from './foo';\nexport { foo };", errors: [{ message: 'probe' }] }],
});

describe('removeListMember', () => {
  it('captured a real declaration, specifier, fixer, and sourceCode from the probe run', () => {
    expect(realDeclarationNode).toBeDefined();
    expect(realSpecifierNode).toBeDefined();
    expect(realFixer).toBeDefined();
    expect(realSourceCode).toBeDefined();
  });

  it('removes the sole member by removing the whole declaration', () => {
    const declaration = definedOrThrow(realDeclarationNode);
    const target = definedOrThrow(realSpecifierNode);
    const fixer = definedOrThrow(realFixer);
    const sourceCode = definedOrThrow(realSourceCode);
    expect(removeListMember(fixer, sourceCode, declaration, [target], target)).toStrictEqual({ range: declaration.range, text: '' });
  });

  it('throws for a member list that does not actually contain the target — an empty specifier list is not something real ES syntax can pair with a tracked split re-export', () => {
    const declaration = definedOrThrow(realDeclarationNode);
    const target = definedOrThrow(realSpecifierNode);
    const fixer = definedOrThrow(realFixer);
    const sourceCode = definedOrThrow(realSourceCode);
    expect(() => removeListMember(fixer, sourceCode, declaration, [], target)).toThrow(/Unreachable/);
  });
});

describe('importIsOnlyUsedByThisExport', () => {
  it('returns false when no declared variable matches the tracked import specifier — real ESLint scope analysis always declares exactly one variable per import specifier', () => {
    const importNode = definedOrThrow(realImportNode);
    const trackedSpecifier = importNode.specifiers[0];
    if (trackedSpecifier === undefined) throw new Error('Unreachable: the probe import always has at least one specifier.');
    const usageIdentifier = asIdentifierOrThrow(definedOrThrow(realSpecifierNode).local);
    const sourceCode = { getDeclaredVariables: () => [] };
    expect(importIsOnlyUsedByThisExport(sourceCode, { declaration: importNode, specifier: trackedSpecifier }, usageIdentifier)).toBe(false);
  });

  it('returns false when the matched variable has more than one reference', () => {
    const importNode = definedOrThrow(realImportNode);
    const trackedSpecifier = importNode.specifiers[0];
    if (trackedSpecifier === undefined) throw new Error('Unreachable: the probe import always has at least one specifier.');
    const usageIdentifier = asIdentifierOrThrow(definedOrThrow(realSpecifierNode).local);
    const variable = { defs: [{ node: trackedSpecifier }], references: [{ identifier: usageIdentifier }, { identifier: usageIdentifier }] };
    const sourceCode = { getDeclaredVariables: () => [variable] };
    expect(importIsOnlyUsedByThisExport(sourceCode, { declaration: importNode, specifier: trackedSpecifier }, usageIdentifier)).toBe(false);
  });

  it('throws when the matched variable reports exactly one reference but that reference is itself absent — the real scope manager never returns a references array shaped this way', () => {
    const importNode = definedOrThrow(realImportNode);
    const trackedSpecifier = importNode.specifiers[0];
    if (trackedSpecifier === undefined) throw new Error('Unreachable: the probe import always has at least one specifier.');
    const usageIdentifier = asIdentifierOrThrow(definedOrThrow(realSpecifierNode).local);
    const variable = { defs: [{ node: trackedSpecifier }], references: [undefined] };
    const sourceCode = { getDeclaredVariables: () => [variable] };
    expect(() => importIsOnlyUsedByThisExport(sourceCode, { declaration: importNode, specifier: trackedSpecifier }, usageIdentifier)).toThrow(/Unreachable/);
  });

  it('returns true only when the sole reference is the exact usage identifier being checked', () => {
    const importNode = definedOrThrow(realImportNode);
    const trackedSpecifier = importNode.specifiers[0];
    if (trackedSpecifier === undefined) throw new Error('Unreachable: the probe import always has at least one specifier.');
    const usageIdentifier = asIdentifierOrThrow(definedOrThrow(realSpecifierNode).local);
    const variable = { defs: [{ node: trackedSpecifier }], references: [{ identifier: usageIdentifier }] };
    const sourceCode = { getDeclaredVariables: () => [variable] };
    expect(importIsOnlyUsedByThisExport(sourceCode, { declaration: importNode, specifier: trackedSpecifier }, usageIdentifier)).toBe(true);
  });
});
