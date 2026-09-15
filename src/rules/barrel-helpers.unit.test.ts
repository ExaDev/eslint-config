import { RuleTester } from 'eslint';
import type { Rule } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import {
  basenameOf,
  createSplitReexportDetector,
  hasSource,
  isDirectSibling,
  isIndexFile,
  isInsideAmbientModuleDeclaration,
  isPermittedBarrel,
  isPureReexport,
  moduleSpecifierValue,
} from './barrel-helpers';
import type { ExportNamedDeclarationNode, ExportSpecifierNode, ImportDeclarationNode } from './barrel-helpers';

function definedOrThrow<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Unreachable: expected the probe rule below to have captured this value.');
  }
  return value;
}

describe('moduleSpecifierValue', () => {
  it("throws for a non-string literal value — a shape a module specifier's own grammar never produces", () => {
    expect(() => moduleSpecifierValue({ value: 42 })).toThrow(/Unreachable/);
  });
});

describe('basenameOf', () => {
  it('returns the filename itself when it has no slash', () => {
    expect(basenameOf('index.ts')).toBe('index.ts');
  });

  it('returns the segment after the last slash', () => {
    expect(basenameOf('a/b.ts')).toBe('b.ts');
  });
});

describe('isIndexFile', () => {
  it('requires the basename to start with "index", not merely end with it', () => {
    expect(isIndexFile('src/myindex.ts')).toBe(false);
  });

  it('requires the basename to end at the extension, with nothing trailing', () => {
    expect(isIndexFile('index.ts.bak')).toBe(false);
  });
});

describe('isPureReexport', () => {
  it('is true for an ExportAllDeclaration regardless of source', () => {
    expect(isPureReexport({ type: 'ExportAllDeclaration' })).toBe(true);
  });

  it('is false for a named export whose source is undefined rather than a real specifier', () => {
    expect(isPureReexport({ type: 'ExportNamedDeclaration' })).toBe(false);
  });
});

describe('isDirectSibling', () => {
  it('tolerates a trailing slash on a sibling folder', () => {
    expect(isDirectSibling('./foo/')).toBe(true);
  });

  it('rejects a sibling folder specifier that normalizes down to a nested path', () => {
    expect(isDirectSibling('./foo/bar/')).toBe(false);
  });

  it('rejects the barrel itself (".")', () => {
    expect(isDirectSibling('./')).toBe(false);
  });

  it('rejects parent traversal ("..")', () => {
    expect(isDirectSibling('./..')).toBe(false);
  });

  it('rejects a specifier that normalizes to the empty string', () => {
    expect(isDirectSibling('.//')).toBe(false);
  });

  it('normalizes the sliced remainder, not the specifier with its leading "./" still attached', () => {
    // Slicing off the leading "./" before normalizing matters specifically when what follows is itself a slash: normalizing the un-sliced specifier collapses the redundant slash away, while normalizing the sliced remainder on its own treats the leading slash as an absolute path and correctly rejects it as containing a "/".
    expect(isDirectSibling('.//a')).toBe(false);
  });
});

describe('isPermittedBarrel', () => {
  it("'banned' mode permits no file, even a real index file", () => {
    expect(isPermittedBarrel('index.ts', 'banned')).toBe(false);
  });

  it("'single' mode permits only the main barrel, not every index file", () => {
    expect(isPermittedBarrel('/foo/index.ts', 'single')).toBe(false);
  });

  it("'single' mode permits the main barrel itself", () => {
    expect(isPermittedBarrel('/repo/src/index.ts', 'single')).toBe(true);
  });

  it("'siblings' mode permits any index file", () => {
    expect(isPermittedBarrel('/foo/index.ts', 'siblings')).toBe(true);
  });

  it("'siblings' mode does not permit a non-index file", () => {
    expect(isPermittedBarrel('foo.ts', 'siblings')).toBe(false);
  });
});

describe('isInsideAmbientModuleDeclaration', () => {
  it('returns false once the ancestor chain reaches an object with no type property at all', () => {
    // A real ESTree/TSESTree node's own `.parent` is always another real node (or null at the root), so this shape — an ancestor object present but missing `type` entirely — can never occur while walking a genuine AST. It proves the walk fails closed rather than throwing if it ever did.
    const malformedAncestor = { parent: null };
    expect(isInsideAmbientModuleDeclaration(malformedAncestor)).toBe(false);
  });

  it('stops walking at a malformed ancestor rather than continuing past it to a real TSModuleDeclaration further up', () => {
    // If the malformed node were (incorrectly) treated as a valid ancestor, the walk would continue past it to the real TSModuleDeclaration one level up and return true; failing closed at the malformed node itself is what keeps this false.
    const malformedAncestorWithRealGrandparent = { parent: { type: 'TSModuleDeclaration', parent: null } };
    expect(isInsideAmbientModuleDeclaration(malformedAncestorWithRealGrandparent)).toBe(false);
  });

  it('stops walking at an ancestor whose own type is not a string, rather than continuing past it', () => {
    const nonStringTypeWithRealGrandparent = { type: 123, parent: { type: 'TSModuleDeclaration', parent: null } };
    expect(isInsideAmbientModuleDeclaration(nonStringTypeWithRealGrandparent)).toBe(false);
  });
});

// Real, fully-populated nodes (range/loc/parent included) are only ever produced by a real parse — captured here via a genuine (throwaway) rule run rather than hand-constructed, so every fixture below is a real AST fragment, never a stand-in built to merely satisfy the type checker.
let bareNamedExport: ExportNamedDeclarationNode | undefined;
let identifierSpecifier: ExportSpecifierNode | undefined;
let literalLocalSpecifier: ExportSpecifierNode | undefined;
let importWithFooSpecifier: ImportDeclarationNode | undefined;
let withSourceIdentifierExport: ExportNamedDeclarationNode | undefined;

const probe: Rule.RuleModule = {
  meta: { schema: [] },
  create() {
    return {
      ImportDeclaration(node) {
        importWithFooSpecifier = node;
      },
      ExportNamedDeclaration(node) {
        if (node.source === null || node.source === undefined) {
          bareNamedExport = node;
          const [specifier] = node.specifiers;
          identifierSpecifier = specifier;
        } else {
          const [specifier] = node.specifiers;
          if (specifier?.local.type === 'Identifier') {
            withSourceIdentifierExport = node;
          } else {
            literalLocalSpecifier = specifier;
          }
        }
      },
    };
  },
};

const tester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });

tester.run('probe', probe, {
  valid: [
    { code: "import { foo } from './foo';\nexport { foo };" },
    { code: "export { \"str\" as x } from './mod';" },
    { code: "export { foo } from './other';" },
  ],
  invalid: [],
});

describe('hasSource', () => {
  it('captured a real with-source export from the probe run', () => {
    expect(withSourceIdentifierExport).toBeDefined();
  });

  it('is true for a real export with a source specifier', () => {
    expect(hasSource(definedOrThrow(withSourceIdentifierExport))).toBe(true);
  });

  it('is false for a bare export whose source is null, the shape a real parser always produces', () => {
    expect(hasSource(definedOrThrow(bareNamedExport))).toBe(false);
  });

  it('is false for an export whose source is undefined rather than null — a shape the type allows but a real parser never produces', () => {
    const declarationWithUndefinedSource: ExportNamedDeclarationNode = { ...definedOrThrow(bareNamedExport), source: undefined };
    expect(hasSource(declarationWithUndefinedSource)).toBe(false);
  });
});

describe('createSplitReexportDetector', () => {
  it('captured every real fixture the tests below rely on', () => {
    expect(bareNamedExport).toBeDefined();
    expect(identifierSpecifier).toBeDefined();
    expect(literalLocalSpecifier).toBeDefined();
    expect(importWithFooSpecifier).toBeDefined();
  });

  it('ignores a bare named export specifier whose local binding is not a plain identifier', () => {
    const detector = createSplitReexportDetector();
    const declaration = definedOrThrow(bareNamedExport);
    // A bare (source-less) export specifier's own `local` is always an Identifier in real syntax — the Literal-local shape only ever arises on a WITH-source re-export (`export { "str" as x } from '...'`), captured separately above. Recombined here into an otherwise-real, source-less declaration to prove the detector's own narrowing behaves correctly on a shape neither this codebase's own rules nor a real parser ever pairs together, without needing a hand-built, partially-typed fake node.
    const declarationWithLiteralLocal: ExportNamedDeclarationNode = { ...declaration, specifiers: [definedOrThrow(literalLocalSpecifier)] };
    detector.visitExportNamed(declarationWithLiteralLocal);
    expect(detector.violations()).toStrictEqual([]);
  });

  it('ignores a bare named export specifier whose local identifier was never imported', () => {
    const detector = createSplitReexportDetector();
    detector.visitExportNamed(definedOrThrow(bareNamedExport));
    expect(detector.violations()).toStrictEqual([]);
  });

  it('reports a named specifier whose local identifier was tracked from an import', () => {
    const detector = createSplitReexportDetector();
    const importNode = definedOrThrow(importWithFooSpecifier);
    detector.visitImport(importNode);
    const declaration = definedOrThrow(bareNamedExport);
    detector.visitExportNamed(declaration);
    const specifier = definedOrThrow(identifierSpecifier);
    expect(detector.violations()).toStrictEqual([
      { kind: 'named', specifier, declaration, name: 'foo', trackedImport: { declaration: importNode, specifier: importNode.specifiers[0] } },
    ]);
  });

  it('ignores a real with-source export — it is not a split-statement candidate at all', () => {
    const detector = createSplitReexportDetector();
    const importNode = definedOrThrow(importWithFooSpecifier);
    detector.visitImport(importNode);
    detector.visitExportNamed(definedOrThrow(withSourceIdentifierExport));
    expect(detector.violations()).toStrictEqual([]);
  });

  it('treats a source of undefined the same as a source of null — both mean "no source", so both are bare-export candidates', () => {
    const detector = createSplitReexportDetector();
    const importNode = definedOrThrow(importWithFooSpecifier);
    detector.visitImport(importNode);
    const declaration = definedOrThrow(bareNamedExport);
    const declarationWithUndefinedSource: ExportNamedDeclarationNode = { ...declaration, source: undefined };
    detector.visitExportNamed(declarationWithUndefinedSource);
    const specifier = definedOrThrow(identifierSpecifier);
    expect(detector.violations()).toStrictEqual([
      { kind: 'named', specifier, declaration: declarationWithUndefinedSource, name: 'foo', trackedImport: { declaration: importNode, specifier: importNode.specifiers[0] } },
    ]);
  });
});
