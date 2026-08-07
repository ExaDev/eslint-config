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
  ],
  invalid: [
    {
      code: 'export {};',
      filename: 'src/rules/index.ts',
      errors: [{ messageId: 'barrel' }],
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
