import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './barrel-policy';

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

// The umbrella rule selects one of three complete index-file policies via { mode }. Each mode is exercised against the constructs that define it: which files may be barrels, what a barrel may contain, and where a barrel's re-exports may come from. The rule itself needs no type information -- it walks plain import/export/declaration nodes -- so no projectService/parserOptions.project is configured here.

ruleTester.run('barrel-policy', rule, {
  valid: [
    // ─── 'banned': no index files; non-index files with ordinary code are fine. ───
    { code: 'export const x = 1;', filename: './src/foo.ts', options: [{ mode: 'banned' }] },
    { code: 'export function f() { return 1; }', filename: './src/foo.ts', options: [{ mode: 'banned' }] },

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
