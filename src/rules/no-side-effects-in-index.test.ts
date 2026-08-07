import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-side-effects-in-index';

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

ruleTester.run('no-side-effects-in-index', rule, {
  valid: [
    { code: "export * from './foo';" },
    { code: "export { foo } from './foo';" },
    { code: "export type { Foo } from './foo';" },
    { code: "export * from './foo';\nexport { bar } from './bar';" },
  ],
  invalid: [
    {
      code: 'export default 1;',
      errors: [{ messageId: 'notAPureReexport', data: { description: 'ExportDefaultDeclaration' } }],
    },
    {
      code: 'export const x = 1;',
      errors: [{ messageId: 'notAPureReexport', data: { description: 'ExportNamedDeclaration' } }],
    },
    {
      code: "console.log('side effect');",
      errors: [{ messageId: 'notAPureReexport', data: { description: 'ExpressionStatement' } }],
    },
  ],
});
