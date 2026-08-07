import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-non-barrel-reexport';

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

ruleTester.run('no-non-barrel-reexport', rule, {
  valid: [
    { code: "export { foo } from './foo';" },
    { code: "import { foo } from './foo';\nconsole.log(foo);" },
    { code: "import { foo } from './foo';\nconst bar = 1;\nexport { bar };\nconsole.log(foo);" },
  ],
  invalid: [
    {
      code: "import { foo } from './foo';\nexport { foo };",
      output: '\n',
      errors: [{ messageId: 'splitStatementReexport', data: { name: 'foo' } }],
    },
    {
      code: "import { foo } from './foo';\nexport default foo;",
      output: '\n',
      errors: [{ messageId: 'splitStatementDefaultReexport', data: { name: 'foo' } }],
    },
    {
      code: "import { foo } from './foo';\nconsole.log(foo);\nexport { foo };",
      output: "import { foo } from './foo';\nconsole.log(foo);\n",
      errors: [{ messageId: 'splitStatementReexport', data: { name: 'foo' } }],
    },
  ],
});
