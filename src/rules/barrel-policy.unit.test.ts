import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Linter, RuleTester } from 'eslint';
import { afterEach, describe, expect, it } from 'vitest';
import tseslint from 'typescript-eslint';
import rule, { createBarrelPolicyRule, readEntries, readMode } from './barrel-policy';

describe('readMode', () => {
  it("returns 'auto' for missing options — an omitted mode is nothing stated, not a misconfiguration", () => {
    expect(readMode(undefined)).toBe('auto');
  });

  it("returns 'auto' for an object with no mode key — the same omission under a different spelling", () => {
    expect(readMode({})).toBe('auto');
  });

  it('throws for a non-object options value', () => {
    expect(() => readMode('banned')).toThrow(/exadev\/barrel-policy requires options/);
  });

  it('throws for an invalid mode value', () => {
    expect(() => readMode({ mode: 'nonsense' })).toThrow(/exadev\/barrel-policy requires options/);
  });

  it('returns the mode for valid options', () => {
    expect(readMode({ mode: 'single' })).toBe('single');
  });
});

// A fake package.json shaped like a genuine publish-shaped entry point (real exports) — resolves 'auto' to 'single'.
const autoResolvesToSingle = createBarrelPolicyRule({ readPackageJson: () => ({ exports: { '.': './dist/index.js' } }) });
// No ancestor package.json at all — resolves 'auto' to 'banned', the same conservative default a package with neither exports nor main gets.
const autoResolvesToBanned = createBarrelPolicyRule({ readPackageJson: () => undefined });

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

// The rule's own meta.schema is the FIRST line of defence against a bad `{ mode }` option — rejected by ESLint itself before create() ever runs, well ahead of readMode's own runtime throw (a safety net behind the schema, exercised directly in the readMode describe block above). These use a plain Linter instance rather than ruleTester.run: RuleTester.describe/.it are wired to Vitest's own (see vitest.setup.ts), and a schema-validation failure for an `invalid` case happens deep inside RuleTester's own nested, DEFERRED it() registration rather than as a synchronous throw back to the caller — so wrapping ruleTester.run in `expect(() => { ... }).toThrow()` can never observe it (confirmed directly: that pattern kept "passing" even with additionalProperties flipped to `true`, since the actual rejection surfaced only as a separate, unrelated nested test failure). Linter#verify has no such indirection: a schema violation throws synchronously, straight back to the caller.
const schemaLinter = new Linter();
const schemaLintConfig = [{ files: ['**'], plugins: { exadev: { rules: { 'barrel-policy': rule } } } }];

function lintWithOptions(options: unknown): void {
  schemaLinter.verify('export {};', [...schemaLintConfig, { rules: { 'exadev/barrel-policy': ['error', options] } }], 'src/index.ts');
}

describe('barrel-policy schema', () => {
  it('accepts an options object with no mode key at the schema level — the omission resolves to auto, so there is nothing to reject', () => {
    expect(() => {
      lintWithOptions({});
    }).not.toThrow();
  });

  it("accepts 'auto' itself at the schema level, like the three concrete literals", () => {
    expect(() => {
      lintWithOptions({ mode: 'auto' });
    }).not.toThrow();
  });

  it('rejects a mode value outside the banned/single/siblings/auto enum at the schema level, before create() ever runs', () => {
    expect(() => {
      lintWithOptions({ mode: 'nonsense' });
    }).toThrow(/should be equal to one of the allowed values/);
  });

  it('rejects an unrecognised property alongside mode at the schema level', () => {
    // additionalProperties: false is the only thing standing between an unrecognised 'extra' key and a rule run that would otherwise complete normally (mode is still valid) — so unlike the checks above, a permissive mutant here rejects nothing at all rather than producing a different schema message.
    expect(() => {
      lintWithOptions({ mode: 'banned', extra: true });
    }).toThrow(/should NOT have additional properties/);
  });

  it('rejects a non-object options value at the schema level, before create() ever runs', () => {
    expect(() => {
      lintWithOptions('banned');
    }).toThrow(/should be object/);
  });

  it('accepts an entries list beside a mode that permits barrels', () => {
    expect(() => {
      lintWithOptions({ mode: 'single', entries: ['src/*.ts'] });
    }).not.toThrow();
  });

  it('rejects an empty entries list at the schema level, since it would declare nothing', () => {
    expect(() => {
      lintWithOptions({ mode: 'single', entries: [] });
    }).toThrow(/should NOT have fewer than 1 items/);
  });

  it('rejects entries beside mode banned when the rule is created, naming both', () => {
    expect(() => {
      lintWithOptions({ mode: 'banned', entries: ['src/*.ts'] });
    }).toThrow(/"entries" declares barrels, which mode 'banned' forbids/);
  });
});

describe('readEntries', () => {
  it('returns undefined when the options carry no entries key', () => {
    expect(readEntries(undefined)).toBeUndefined();
    expect(readEntries({})).toBeUndefined();
    expect(readEntries({ mode: 'single' })).toBeUndefined();
  });

  it('returns the list as given', () => {
    expect(readEntries({ mode: 'siblings', entries: ['src/*.ts', '!src/internal.ts'] })).toEqual(['src/*.ts', '!src/internal.ts']);
  });

  it("accepts entries with mode 'auto' or with no mode, since auto can resolve to single", () => {
    expect(readEntries({ mode: 'auto', entries: ['src/*.ts'] })).toEqual(['src/*.ts']);
    expect(readEntries({ entries: ['src/*.ts'] })).toEqual(['src/*.ts']);
  });

  it("throws for entries beside mode 'banned'", () => {
    expect(() => readEntries({ mode: 'banned', entries: ['src/*.ts'] })).toThrow(/mode 'banned' forbids/);
  });

  it('throws, naming the option, for a list of exclusions alone', () => {
    expect(() => readEntries({ entries: ['!src/a.ts'] })).toThrow(/"exadev\/barrel-policy entries" must contain at least one glob that does not start with "!"/);
  });

  it('throws, naming the option, for a glob that starts with a slash', () => {
    expect(() => readEntries({ entries: ['/src/a.ts'] })).toThrow(/"exadev\/barrel-policy entries" has a file glob that starts or ends with a slash/);
  });
});

// The umbrella rule selects one of three complete index-file policies via { mode }. Each mode is exercised against the constructs that define it: which files may be barrels, what a barrel may contain, and where a barrel's re-exports may come from. The rule itself needs no type information — it walks plain import/export/declaration nodes — so no projectService/parserOptions.project is configured here.

ruleTester.run('barrel-policy', rule, {
  valid: [
    // ─── 'banned': no index files; non-index files with ordinary code are fine. ───
    { code: 'export const x = 1;', filename: './src/foo.ts', options: [{ mode: 'banned' }] },
    { code: 'export function f() { return 1; }', filename: './src/foo.ts', options: [{ mode: 'banned' }] },

    // ─── 'banned': a re-export written purely inside an ambient module declaration (declare module) is a type-only shim for an external package's or namespace's shape, not a real re-exporting ES module — no runtime import chain exists here for the rule to protect against. ───
    {
      code: 'declare module "untyped-pkg" { export * from "typed-pkg"; }',
      filename: './src/types/untyped-pkg.d.ts',
      options: [{ mode: 'banned' }],
    },
    {
      code: 'declare module "untyped-pkg" { export { Foo } from "typed-pkg"; }',
      filename: './src/types/untyped-pkg.d.ts',
      options: [{ mode: 'banned' }],
    },
    {
      code: 'declare module MyNamespace { export * from "./sibling"; }',
      filename: './src/foo.ts',
      options: [{ mode: 'banned' }],
    },

    // ─── 'single': src/index.ts may be a pure-reexport barrel. ───
    { code: "export { foo } from './foo';", filename: './src/index.ts', options: [{ mode: 'single' }] },
    { code: "export * from './foo';\nexport { bar } from './bar';", filename: './src/index.ts', options: [{ mode: 'single' }] },
    { code: 'export const x = 1;', filename: './src/foo.ts', options: [{ mode: 'single' }] },

    // ─── 'siblings': any index file may re-export from direct siblings. ───
    { code: "export { foo } from './sibling';", filename: './src/index.ts', options: [{ mode: 'siblings' }] },
    { code: "export * from './a';\nexport { b } from './b';", filename: './src/sub/index.ts', options: [{ mode: 'siblings' }] },
    { code: 'export const x = 1;', filename: './src/foo.ts', options: [{ mode: 'siblings' }] },
    // A default export outside a barrel is itself tracked by the same split-statement detector as every other export form — this exercises the detector actually being wired to ExportDefaultDeclaration at all, independent of whether a violation is ultimately reported for it (none is here, since `bar` was never imported).
    { code: 'const bar = 1;\nexport default bar;', filename: './src/foo.ts', options: [{ mode: 'banned' }] },

    // ─── 'single' mode carries no direct-sibling constraint at all — a nested source is fine, both for a single-statement re-export and for the split-statement form's underlying import. ───
    { code: "export { foo } from './a/b';", filename: './src/index.ts', options: [{ mode: 'single' }] },
    { code: "export * from './a/b';", filename: './src/index.ts', options: [{ mode: 'single' }] },
  ],
  invalid: [
    // ─── 'banned': any index file is flagged, and re-exports anywhere are banned. ───
    {
      code: 'export {};',
      filename: './src/index.ts',
      options: [{ mode: 'banned' }],
      errors: [{ message: 'Index (barrel) files are banned in this project — import directly from the module that owns the export instead. Rename this file to something descriptive.' }],
    },
    {
      code: 'export {};',
      filename: './src/sub/index.ts',
      options: [{ mode: 'banned' }],
      errors: [{ messageId: 'indexFileBanned' }],
    },
    {
      code: "export { foo } from './foo';",
      filename: './src/foo.ts',
      options: [{ mode: 'banned' }],
      errors: [{ messageId: 'reexportOutsideBarrel' }],
    },
    {
      code: "export * from './foo';",
      filename: './src/foo.ts',
      options: [{ mode: 'banned' }],
      errors: [{ messageId: 'reexportOutsideBarrel' }],
    },
    {
      code: "import { foo } from './foo';\nexport { foo };",
      filename: './src/foo.ts',
      options: [{ mode: 'banned' }],
      errors: [{ messageId: 'reexportOutsideBarrel' }],
    },
    // A split-statement DEFAULT re-export outside a permitted barrel: exercises the 'default' branch of the violation-node ternary, not just the 'named' one every other split-statement fixture above uses.
    {
      code: "import { foo } from './foo';\nexport default foo;",
      filename: './src/foo.ts',
      options: [{ mode: 'banned' }],
      errors: [{ messageId: 'reexportOutsideBarrel' }],
    },

    // ─── 'single': a non-main index file is flagged; src/index.ts must be pure re-exports; re-exports banned elsewhere. ───
    {
      code: 'export {};',
      filename: './src/sub/index.ts',
      options: [{ mode: 'single' }],
      errors: [{ message: 'Only src/index.ts may be a barrel in this project — this index file is not it. Move its contents into the module that owns them or give the file a descriptive name.' }],
    },
    {
      code: 'export const x = 1;',
      filename: './src/index.ts',
      options: [{ mode: 'single' }],
      errors: [
        {
          message:
            "A barrel may contain only re-export statements ('export * from ...' / 'export { x } from ...' / 'export type { x } from ...') — nothing else, so it can never have a side effect at import time by construction. Found: ExportNamedDeclaration.",
        },
      ],
    },
    {
      code: "export { foo } from './foo';",
      filename: './src/foo.ts',
      options: [{ mode: 'single' }],
      errors: [{ message: 'Re-exports belong only in a barrel (index) file — import this value directly in the file that uses it instead of re-exporting it through this one.' }],
    },
    {
      code: "import { foo } from './foo';\nexport { foo };",
      filename: './src/foo.ts',
      options: [{ mode: 'single' }],
      errors: [{ messageId: 'reexportOutsideBarrel' }],
    },
    // A split-statement re-export inside the permitted 'single' barrel itself: it is flagged as a side effect (neither statement is itself a pure re-export), but since 'single' mode carries no direct-sibling constraint at all, the split-detector's own Program:exit pass adds nothing further on top.
    {
      code: "import { foo } from './foo';\nexport { foo };",
      filename: './src/index.ts',
      options: [{ mode: 'single' }],
      errors: [
        { messageId: 'sideEffectInBarrel', data: { description: 'ImportDeclaration' } },
        { messageId: 'sideEffectInBarrel', data: { description: 'ExportNamedDeclaration' } },
      ],
    },
    // The same shape, but the underlying import points outside the barrel's own directory: 'single' mode still adds no notADirectSibling violation on top, unlike 'siblings' mode's own equivalent fixture below.
    {
      code: "import { foo } from '../up';\nexport { foo };",
      filename: './src/index.ts',
      options: [{ mode: 'single' }],
      errors: [
        { messageId: 'sideEffectInBarrel', data: { description: 'ImportDeclaration' } },
        { messageId: 'sideEffectInBarrel', data: { description: 'ExportNamedDeclaration' } },
      ],
    },

    // ─── 'siblings': a barrel's re-exports must come from direct siblings; re-exports banned in non-index files. ───
    {
      code: "export { foo } from './a/b';",
      filename: './src/index.ts',
      options: [{ mode: 'siblings' }],
      errors: [
        {
          message:
            "A barrel may re-export only from a direct sibling file or folder ('./module' or './module.ts') — found './a/b'. Move the source closer, or import it directly at the call site rather than re-exporting it through this barrel.",
        },
      ],
    },
    {
      code: "export { foo } from '../up';",
      filename: './src/sub/index.ts',
      options: [{ mode: 'siblings' }],
      errors: [{ messageId: 'notADirectSibling', data: { source: '../up' } }],
    },
    {
      code: 'export const x = 1;',
      filename: './src/sub/index.ts',
      options: [{ mode: 'siblings' }],
      errors: [{ messageId: 'sideEffectInBarrel' }],
    },
    {
      code: "export { foo } from './foo';",
      filename: './src/foo.ts',
      options: [{ mode: 'siblings' }],
      errors: [{ messageId: 'reexportOutsideBarrel' }],
    },
    {
      code: "import { foo } from './foo';\nexport { foo };",
      filename: './src/foo.ts',
      options: [{ mode: 'siblings' }],
      errors: [{ messageId: 'reexportOutsideBarrel' }],
    },
    {
      code: "export * from '../up';",
      filename: './src/sub/index.ts',
      options: [{ mode: 'siblings' }],
      errors: [{ messageId: 'notADirectSibling', data: { source: '../up' } }],
    },
    // A split-statement re-export is never itself a "pure re-export" (neither the import nor the bare export statement carries a source), so both are flagged as side effects inside a 'siblings' barrel regardless of where the underlying import points — but since it points at a genuine direct sibling, the split-detector's own Program:exit pass adds no further notADirectSibling violation on top.
    {
      code: "import { foo } from './sibling';\nexport { foo };",
      filename: './src/index.ts',
      options: [{ mode: 'siblings' }],
      errors: [
        { messageId: 'sideEffectInBarrel', data: { description: 'ImportDeclaration' } },
        { messageId: 'sideEffectInBarrel', data: { description: 'ExportNamedDeclaration' } },
      ],
    },
    // The same shape, but the underlying import points outside the barrel's own directory — the split-detector's own Program:exit pass adds a third, genuinely distinct notADirectSibling violation on top of the two side-effect ones.
    {
      code: "import { foo } from '../up';\nexport { foo };",
      filename: './src/index.ts',
      options: [{ mode: 'siblings' }],
      errors: [
        { messageId: 'sideEffectInBarrel', data: { description: 'ImportDeclaration' } },
        { messageId: 'sideEffectInBarrel', data: { description: 'ExportNamedDeclaration' } },
        { messageId: 'notADirectSibling', data: { source: '../up' } },
      ],
    },
    // The default-export split-statement form of the same shape — exercises the 'default' branch of the violation-node ternary inside a permitted barrel, not just the 'named' one every other 'siblings' fixture above uses.
    {
      code: "import { foo } from '../up';\nexport default foo;",
      filename: './src/index.ts',
      options: [{ mode: 'siblings' }],
      errors: [
        { messageId: 'sideEffectInBarrel', data: { description: 'ImportDeclaration' } },
        { messageId: 'sideEffectInBarrel', data: { description: 'ExportDefaultDeclaration' } },
        { messageId: 'notADirectSibling', data: { source: '../up' } },
      ],
    },
  ],
});

// 'auto' (and its two spellings of "unset": no options item at all, and an options object present with no `mode` key) resolves per file via the injected ReadPackageJsonFn — exercised here against a resolver standing in for a publish-shaped package (real exports, so 'single'). Mirrors the 'single'-mode cases above one-for-one, since that is the concrete policy 'auto' resolves to for this resolver.
ruleTester.run('barrel-policy (auto -> single)', autoResolvesToSingle, {
  valid: [
    { code: "export { foo } from './foo';", filename: './src/index.ts' },
    { code: "export { foo } from './foo';", filename: './src/index.ts', options: [{}] },
    { code: "export { foo } from './foo';", filename: './src/index.ts', options: [{ mode: 'auto' }] },
    { code: 'export const x = 1;', filename: './src/foo.ts' },
  ],
  invalid: [
    {
      code: 'export {};',
      filename: './src/sub/index.ts',
      errors: [{ messageId: 'nonMainIndexFile' }],
    },
    {
      code: 'export const x = 1;',
      filename: './src/index.ts',
      options: [{}],
      errors: [{ messageId: 'sideEffectInBarrel' }],
    },
    {
      code: "export { foo } from './foo';",
      filename: './src/foo.ts',
      options: [{ mode: 'auto' }],
      errors: [{ messageId: 'reexportOutsideBarrel' }],
    },
  ],
});

// Same three "unset" spellings, this time against a resolver standing in for a package with no ancestor package.json at all — 'auto' resolves to 'banned', identical to the pre-'auto' hardcoded default. Mirrors the 'banned'-mode cases above one-for-one.
ruleTester.run('barrel-policy (auto -> banned)', autoResolvesToBanned, {
  valid: [
    { code: 'export const x = 1;', filename: './src/foo.ts' },
    { code: 'export const x = 1;', filename: './src/foo.ts', options: [{}] },
    { code: 'export const x = 1;', filename: './src/foo.ts', options: [{ mode: 'auto' }] },
  ],
  invalid: [
    {
      code: 'export {};',
      filename: './src/index.ts',
      options: [{}],
      errors: [{ messageId: 'indexFileBanned' }],
    },
    {
      code: "export { foo } from './foo';",
      filename: './src/foo.ts',
      options: [{ mode: 'auto' }],
      errors: [{ messageId: 'reexportOutsideBarrel' }],
    },
  ],
});

// ─── entries: a package's declared entry files are barrels beside src/index.ts. ─── The package root is the test's working directory, so a fixture filename such as './src/layout.ts' is 'src/layout.ts' relative to it. The globs mirror a package that publishes subpath exports: a flat module per subpath, a nested one, and an index file one level down.
const packageRoot = process.cwd();
const entries = ['src/layout.ts', 'src/store/wasm/worker.ts', 'src/*/index.ts'];
const withEntries = createBarrelPolicyRule({ readPackageJson: () => ({ exports: { '.': './dist/index.js', './layout': './dist/layout.js' } }), findPackageRoot: () => packageRoot });

ruleTester.run('barrel-policy (single, entries)', withEntries, {
  valid: [
    // An entry file re-exporting a workspace or third-party package, the case that motivated the option.
    { code: "export * from '@exadev/process-graph-layout';", filename: './src/layout.ts', options: [{ mode: 'single', entries }] },
    // A nested entry path.
    { code: "export { createWorker } from '@exadev/process-graph-store-wasm';", filename: './src/store/wasm/worker.ts', options: [{ mode: 'single', entries }] },
    // An entry that is an index file below src: not reported as a second index file.
    { code: "export * from './view';", filename: './src/ui/index.ts', options: [{ mode: 'single', entries }] },
    // 'single' puts no constraint on where a barrel's re-exports come from, for an entry as for src/index.ts.
    { code: "export * from '../shared/thing';", filename: './src/store/wasm/worker.ts', options: [{ mode: 'single', entries }] },
    { code: "import { a } from 'pkg';\nexport const b = a;", filename: './src/other.ts', options: [{ mode: 'single', entries }] },
    { code: "export { foo } from './foo';", filename: './src/index.ts', options: [{ mode: 'single', entries }] },
    // The 'auto' default resolves to 'single' for a package with exports, so the entries apply there too.
    { code: "export * from '@exadev/process-graph-layout';", filename: './src/layout.ts', options: [{ entries }] },
  ],
  invalid: [
    // A file the list does not match keeps the existing behaviour: no re-exports outside a barrel.
    {
      code: "export * from '@exadev/process-graph-layout';",
      filename: './src/layout-helpers.ts',
      options: [{ mode: 'single', entries }],
      errors: [{ messageId: 'reexportOutsideBarrel' }],
    },
    {
      code: "import { a } from 'pkg';\nexport { a };",
      filename: './src/other.ts',
      options: [{ mode: 'single', entries }],
      errors: [{ messageId: 'reexportOutsideBarrel' }],
    },
    // 'src/*/index.ts' matches one level only, so a deeper index file is still not a permitted barrel.
    {
      code: "export * from './view';",
      filename: './src/ui/deep/index.ts',
      options: [{ mode: 'single', entries }],
      errors: [{ messageId: 'nonMainIndexFile' }, { messageId: 'reexportOutsideBarrel' }],
    },
    // An entry file is a barrel, so logic beside its re-exports is reported, as in src/index.ts.
    {
      code: "export * from '@exadev/process-graph-layout';\nexport const extra = 1;",
      filename: './src/layout.ts',
      options: [{ mode: 'single', entries }],
      errors: [{ messageId: 'sideEffectInBarrel', data: { description: 'ExportNamedDeclaration' } }],
    },
    {
      code: "import { a } from 'pkg';\nexport { a };",
      filename: './src/layout.ts',
      options: [{ mode: 'single', entries }],
      errors: [
        { messageId: 'sideEffectInBarrel', data: { description: 'ImportDeclaration' } },
        { messageId: 'sideEffectInBarrel', data: { description: 'ExportNamedDeclaration' } },
      ],
    },
  ],
});

ruleTester.run('barrel-policy (siblings, entries)', withEntries, {
  valid: [
    { code: "export * from '@exadev/process-graph-layout';", filename: './src/layout.ts', options: [{ mode: 'siblings', entries }] },
    { code: "export { a } from 'pkg/sub';\nexport * from 'node:fs';", filename: './src/store/wasm/worker.ts', options: [{ mode: 'siblings', entries }] },
    { code: "export * from './sibling';", filename: './src/layout.ts', options: [{ mode: 'siblings', entries }] },
    // A split-statement re-export of a package from an entry file is impure, but names a permitted source, so only the impurity is reported (see the invalid case below); here the plain form passes.
    { code: "export { default } from 'pkg';", filename: './src/layout.ts', options: [{ mode: 'siblings', entries }] },
    // A non-entry index file keeps the siblings behaviour.
    { code: "export * from './a';", filename: './src/sub/deeper/index.ts', options: [{ mode: 'siblings', entries }] },
  ],
  invalid: [
    {
      code: "export * from '../up';",
      filename: './src/layout.ts',
      options: [{ mode: 'siblings', entries }],
      errors: [
        {
          message:
            "A package entry point may re-export only from a package ('pkg', '@scope/pkg/sub') or a direct sibling file or folder ('./module'); found '../up'. Re-export it through the package that owns it, move the source beside this entry point, or import it directly at the call site.",
        },
      ],
    },
    {
      code: "export { a } from './a/b';",
      filename: './src/store/wasm/worker.ts',
      options: [{ mode: 'siblings', entries }],
      errors: [{ messageId: 'notAPackageOrSibling', data: { source: './a/b' } }],
    },
    {
      code: "export * from '#internal';",
      filename: './src/layout.ts',
      options: [{ mode: 'siblings', entries }],
      errors: [{ messageId: 'notAPackageOrSibling', data: { source: '#internal' } }],
    },
    // A package re-export from an index file the list does not match stays a siblings violation.
    {
      code: "export * from 'pkg';",
      filename: './src/sub/deeper/index.ts',
      options: [{ mode: 'siblings', entries }],
      errors: [{ messageId: 'notADirectSibling', data: { source: 'pkg' } }],
    },
    // A matched index file is an entry, so it gets the entry message.
    {
      code: "export * from '../up';",
      filename: './src/ui/index.ts',
      options: [{ mode: 'siblings', entries }],
      errors: [{ messageId: 'notAPackageOrSibling', data: { source: '../up' } }],
    },
    {
      code: "export * from 'pkg';",
      filename: './src/layout-helpers.ts',
      options: [{ mode: 'siblings', entries }],
      errors: [{ messageId: 'reexportOutsideBarrel' }],
    },
    {
      code: 'export const x = 1;',
      filename: './src/layout.ts',
      options: [{ mode: 'siblings', entries }],
      errors: [{ messageId: 'sideEffectInBarrel', data: { description: 'ExportNamedDeclaration' } }],
    },
    // The split-statement form: both statements are impure, and its import source is checked like a single-statement re-export's.
    {
      code: "import { a } from '../up';\nexport { a };",
      filename: './src/layout.ts',
      options: [{ mode: 'siblings', entries }],
      errors: [
        { messageId: 'sideEffectInBarrel', data: { description: 'ImportDeclaration' } },
        { messageId: 'sideEffectInBarrel', data: { description: 'ExportNamedDeclaration' } },
        { messageId: 'notAPackageOrSibling', data: { source: '../up' } },
      ],
    },
    {
      code: "import a from 'pkg';\nexport default a;",
      filename: './src/layout.ts',
      options: [{ mode: 'siblings', entries }],
      errors: [
        { messageId: 'sideEffectInBarrel', data: { description: 'ImportDeclaration' } },
        { messageId: 'sideEffectInBarrel', data: { description: 'ExportDefaultDeclaration' } },
      ],
    },
  ],
});

// Under 'auto', a package with neither exports nor main resolves to 'banned', which has no barrels; the entries then select nothing, rather than making a file a barrel that the package does not publish.
ruleTester.run('barrel-policy (auto -> banned, entries)', createBarrelPolicyRule({ readPackageJson: () => ({ name: 'internal' }), findPackageRoot: () => packageRoot }), {
  valid: [{ code: 'export const x = 1;', filename: './src/layout.ts', options: [{ entries }] }],
  invalid: [
    { code: "export * from 'pkg';", filename: './src/layout.ts', options: [{ entries }], errors: [{ messageId: 'reexportOutsideBarrel' }] },
    { code: "export * from './view';", filename: './src/ui/index.ts', options: [{ entries }], errors: [{ messageId: 'indexFileBanned' }, { messageId: 'reexportOutsideBarrel' }] },
  ],
});

// The globs are relative to the package the file belongs to, not to the working directory.
ruleTester.run('barrel-policy (entries relative to the package)', createBarrelPolicyRule({ findPackageRoot: () => join(packageRoot, 'packages', 'app') }), {
  valid: [{ code: "export * from 'pkg';", filename: './packages/app/src/layout.ts', options: [{ mode: 'single', entries }] }],
  invalid: [{ code: "export * from 'pkg';", filename: './src/layout.ts', options: [{ mode: 'single', entries }], errors: [{ messageId: 'reexportOutsideBarrel' }] }],
});

// A file with no package.json above it belongs to no package, so it is no package's entry point.
ruleTester.run('barrel-policy (entries outside any package)', createBarrelPolicyRule({ findPackageRoot: () => undefined }), {
  valid: [],
  invalid: [{ code: "export * from 'pkg';", filename: './src/layout.ts', options: [{ mode: 'single', entries }], errors: [{ messageId: 'reexportOutsideBarrel' }] }],
});

describe('barrel-policy entries against the real filesystem', () => {
  let root: string;

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function lintFile(filename: string): readonly string[] {
    const linter = new Linter({ cwd: root });

    return linter
      .verify(
        "export * from 'pkg';",
        [{ files: ['**/*.ts'], languageOptions: { parser: tseslint.parser }, plugins: { exadev: { rules: { 'barrel-policy': rule } } }, rules: { 'exadev/barrel-policy': ['error', { mode: 'single', entries: ['src/*.ts'] }] } }],
        filename,
      )
      .map((message) => message.message);
  }

  it('matches the globs against the path below the nearest package.json the default rule finds', () => {
    root = mkdtempSync(join(tmpdir(), 'barrel-policy-entries-'));
    const packageDir = join(root, 'packages', 'app');
    mkdirSync(join(packageDir, 'src', 'nested'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'workspace' }));
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'app', exports: { './layout': './dist/layout.js' } }));

    expect(lintFile(join(packageDir, 'src', 'layout.ts'))).toEqual([]);
    expect(lintFile(join(packageDir, 'src', 'nested', 'layout.ts'))).toEqual([expect.stringMatching(/^Re-exports belong only in a barrel/)]);
  });
});
