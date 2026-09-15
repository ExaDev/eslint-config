import { Linter, RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import tseslint from 'typescript-eslint';
import rule, { readMode } from './barrel-policy';

describe('readMode', () => {
  it('throws for missing options — a safety net behind the rule schema, which real linting always enforces first', () => {
    expect(() => readMode(undefined)).toThrow(/exadev\/barrel-policy requires options/);
  });

  it('throws for a non-object options value', () => {
    expect(() => readMode('banned')).toThrow(/exadev\/barrel-policy requires options/);
  });

  it('throws for an object missing the mode key', () => {
    expect(() => readMode({})).toThrow(/exadev\/barrel-policy requires options/);
  });

  it('throws for an invalid mode value', () => {
    expect(() => readMode({ mode: 'nonsense' })).toThrow(/exadev\/barrel-policy requires options/);
  });

  it('returns the mode for valid options', () => {
    expect(readMode({ mode: 'single' })).toBe('single');
  });
});

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
  it('rejects an options object missing the required mode key at the schema level, before create() ever runs', () => {
    expect(() => {
      lintWithOptions({});
    }).toThrow(/required property 'mode'/);
  });

  it('rejects a mode value outside the banned/single/siblings enum at the schema level, before create() ever runs', () => {
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
