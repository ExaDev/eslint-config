import { Linter, RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule, { createBarrelPolicyRule } from './barrel-policy';

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

// A fake package.json shaped like a genuine publish-shaped entry point (real exports) -- resolves 'auto' to 'single'.
const autoResolvesToSingle = createBarrelPolicyRule(() => ({ exports: { '.': './dist/index.js' } }));
// No ancestor package.json at all -- resolves 'auto' to 'banned', the same conservative default a package with neither exports nor main gets.
const autoResolvesToBanned = createBarrelPolicyRule(() => undefined);

// The umbrella rule selects one of three complete index-file policies via { mode }. Each mode is exercised against the constructs that define it: which files may be barrels, what a barrel may contain, and where a barrel's re-exports may come from. The rule itself needs no type information -- it walks plain import/export/declaration nodes -- so no projectService/parserOptions.project is configured here.

ruleTester.run('barrel-policy', rule, {
  valid: [
    // ─── 'banned': no index files; non-index files with ordinary code are fine. ───
    { code: 'export const x = 1;', filename: './src/foo.ts', options: [{ mode: 'banned' }] },
    { code: 'export function f() { return 1; }', filename: './src/foo.ts', options: [{ mode: 'banned' }] },

    // ─── 'banned': a re-export written purely inside an ambient module declaration (declare module) is a type-only shim for an external package's or namespace's shape, not a real re-exporting ES module -- no runtime import chain exists here for the rule to protect against. ───
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
  ],
  invalid: [
    // ─── 'banned': any index file is flagged, and re-exports anywhere are banned. ───
    {
      code: 'export {};',
      filename: './src/index.ts',
      options: [{ mode: 'banned' }],
      errors: [{ messageId: 'indexFileBanned' }],
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
      code: "import { foo } from './foo';\nexport { foo };",
      filename: './src/foo.ts',
      options: [{ mode: 'banned' }],
      errors: [{ messageId: 'reexportOutsideBarrel' }],
    },

    // ─── 'single': a non-main index file is flagged; src/index.ts must be pure re-exports; re-exports banned elsewhere. ───
    {
      code: 'export {};',
      filename: './src/sub/index.ts',
      options: [{ mode: 'single' }],
      errors: [{ messageId: 'nonMainIndexFile' }],
    },
    {
      code: 'export const x = 1;',
      filename: './src/index.ts',
      options: [{ mode: 'single' }],
      errors: [{ messageId: 'sideEffectInBarrel' }],
    },
    {
      code: "export { foo } from './foo';",
      filename: './src/foo.ts',
      options: [{ mode: 'single' }],
      errors: [{ messageId: 'reexportOutsideBarrel' }],
    },
    {
      code: "import { foo } from './foo';\nexport { foo };",
      filename: './src/foo.ts',
      options: [{ mode: 'single' }],
      errors: [{ messageId: 'reexportOutsideBarrel' }],
    },

    // ─── 'siblings': a barrel's re-exports must come from direct siblings; re-exports banned in non-index files. ───
    {
      code: "export { foo } from './a/b';",
      filename: './src/index.ts',
      options: [{ mode: 'siblings' }],
      errors: [{ messageId: 'notADirectSibling', data: { source: './a/b' } }],
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
  ],
});

// 'auto' (and its two spellings of "unset": no options item at all, and an options object present with no `mode` key) resolves per file via the injected ReadPackageJsonFn -- exercised here against a resolver standing in for a publish-shaped package (real exports -> 'single'). Mirrors the 'single'-mode cases above one-for-one, since that is the concrete policy 'auto' resolves to for this resolver.
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

// Same three "unset" spellings, this time against a resolver standing in for a package with no ancestor package.json at all -- 'auto' resolves to 'banned', identical to the pre-'auto' hardcoded default. Mirrors the 'banned'-mode cases above one-for-one.
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

describe('barrel-policy invalid mode option', () => {
  it('throws when mode is present but not one of the recognized raw literals', () => {
    const linter = new Linter();
    expect(() =>
      linter.verify('export {};', {
        plugins: { exadev: { rules: { 'barrel-policy': rule } } },
        rules: { 'exadev/barrel-policy': ['error', { mode: 'nonsense' }] },
        languageOptions: { parser: tseslint.parser, sourceType: 'module' },
      }),
    ).toThrow();
  });
});
