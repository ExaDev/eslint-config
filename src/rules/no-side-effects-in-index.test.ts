import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-side-effects-in-index';

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

ruleTester.run('no-side-effects-in-index', rule, {
  valid: [
    { code: "export * from './foo';", filename: './src/index.ts' },
    { code: "export { foo } from './foo';", filename: './src/index.ts' },
    { code: "export type { Foo } from './foo';", filename: './src/index.ts' },
    { code: "export * from './foo';\nexport { bar } from './bar';", filename: './src/index.ts' },
    // Self-scoped to src/index.ts: the identical offending code is a no-op everywhere else, since this rule has no legitimate target outside the one designated barrel.
    { code: 'export const x = 1;', filename: 'src/other.ts' },
    { code: "console.log('side effect');", filename: 'src/other.ts' },
    { code: 'export const x = 1;' },
  ],
  invalid: [
    {
      code: 'export default 1;',
      filename: './src/index.ts',
      errors: [{ messageId: 'notAPureReexport', data: { description: 'ExportDefaultDeclaration' } }],
    },
    {
      code: 'export const x = 1;',
      filename: './src/index.ts',
      errors: [{ messageId: 'notAPureReexport', data: { description: 'ExportNamedDeclaration' } }],
    },
    {
      code: "console.log('side effect');",
      filename: './src/index.ts',
      errors: [{ messageId: 'notAPureReexport', data: { description: 'ExpressionStatement' } }],
    },
  ],
});
