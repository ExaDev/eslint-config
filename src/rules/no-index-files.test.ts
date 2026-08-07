import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-index-files';

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

ruleTester.run('no-index-files', rule, {
  valid: [
    // Any non-index file is unaffected, whatever it contains -- this rule only targets index/barrel files.
    { code: 'export const x = 1;', filename: './src/foo.ts' },
    { code: "export { foo } from './foo';", filename: './src/foo.ts' },
    { code: 'export const x = 1;', filename: './src/sub/foo.ts' },
    { code: 'const x = 1;', filename: './lib/utils.js' },
  ],
  invalid: [
    { code: 'export {};', filename: './src/index.ts', errors: [{ messageId: 'indexFileBanned' }] },
    { code: 'export {};', filename: './src/index.tsx', errors: [{ messageId: 'indexFileBanned' }] },
    { code: 'export {};', filename: './src/sub/index.ts', errors: [{ messageId: 'indexFileBanned' }] },
    { code: 'export {};', filename: 'index.cjs', errors: [{ messageId: 'indexFileBanned' }] },
  ],
});
