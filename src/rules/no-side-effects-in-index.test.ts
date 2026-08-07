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
    // Self-scoped to any index file: the identical offending code is a no-op in a non-index file, since this rule has no legitimate target outside a barrel. Any index file is a barrel after the self-scope generalisation, not just src/index.ts.
    { code: "export * from './foo';", filename: './src/sub/index.ts' },
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
    // A non-main index file is still an index file after the generalisation -- a side effect there is flagged just as it is in src/index.ts.
    {
      code: 'export const x = 1;',
      filename: './src/sub/index.ts',
      errors: [{ messageId: 'notAPureReexport', data: { description: 'ExportNamedDeclaration' } }],
    },
  ],
});
