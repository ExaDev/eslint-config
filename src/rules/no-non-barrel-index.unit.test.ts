import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-non-barrel-index';

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

ruleTester.run('no-non-barrel-index', rule, {
  valid: [
    { code: 'export {};', filename: './src/index.ts' },
    { code: 'export {};', filename: 'packages/foo/src/index.ts' },
    { code: 'const x = 1;', filename: 'src/rules/no-foo.ts' },
    // The basename must START with "index", not merely end with it — a de-anchored regex would wrongly match "myindex.ts" as a suffix.
    { code: 'const x = 1;', filename: 'src/rules/myindex.ts' },
    // The basename must END at the extension — a regex missing its trailing "$" would wrongly match "index.ts" as a mere prefix.
    { code: 'const x = 1;', filename: 'index.ts.bak' },
  ],
  invalid: [
    {
      code: 'export {};',
      filename: 'src/rules/index.ts',
      errors: [{ message: 'Only src/index.ts may be named index.* (the public convenience barrel); give any other module a descriptive filename.' }],
    },
    {
      code: 'export {};',
      filename: 'src/index.js',
      errors: [{ messageId: 'barrel' }],
    },
    {
      code: 'export {};',
      filename: 'index.cjs',
      errors: [{ messageId: 'barrel' }],
    },
  ],
});
