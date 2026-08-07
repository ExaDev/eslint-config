import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './barrel-direct-siblings-only';

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

ruleTester.run('barrel-direct-siblings-only', rule, {
  valid: [
    // A direct sibling file or folder is permitted, with or without an extension, in any index file.
    { code: "export { foo } from './sibling';", filename: './src/index.ts' },
    { code: "export { foo } from './sibling.ts';", filename: './src/index.ts' },
    { code: "export * from './sibling';", filename: './src/index.ts' },
    { code: "export type { Foo } from './sibling';", filename: './src/sub/index.ts' },
    // A non-index file is never this rule's target -- it no-ops there (a barrel-policy umbrella or no-non-barrel-reexport handles re-exports outside barrels).
    { code: "export { foo } from './a/b/c';", filename: './src/other.ts' },
    { code: "export { foo } from '../up';", filename: './src/other.ts' },
  ],
  invalid: [
    // Nested path (two segments) in a barrel.
    { code: "export { foo } from './a/b';", filename: './src/index.ts', errors: [{ messageId: 'notADirectSibling', data: { source: './a/b' } }] },
    // Parent traversal.
    { code: "export { foo } from '../up';", filename: './src/index.ts', errors: [{ messageId: 'notADirectSibling', data: { source: '../up' } }] },
    // A bare package specifier.
    { code: "export { Box } from 'document-schema.js';", filename: './src/index.ts', errors: [{ messageId: 'notADirectSibling', data: { source: 'document-schema.js' } }] },
    // export * form with a nested source.
    { code: "export * from './nested/deep';", filename: './src/sub/index.ts', errors: [{ messageId: 'notADirectSibling', data: { source: './nested/deep' } }] },
  ],
});
