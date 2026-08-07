import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-non-barrel-reexport';

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

ruleTester.run('no-non-barrel-reexport', rule, {
  valid: [
    { code: "export { foo } from './foo';", filename: 'src/other.ts' },
    { code: "import { foo } from './foo';\nconsole.log(foo);", filename: 'src/other.ts' },
    { code: "import { foo } from './foo';\nconst bar = 1;\nexport { bar };\nconsole.log(foo);", filename: 'src/other.ts' },
    // Self-scoped away from src/index.ts: the identical split-statement pattern is a no-op in the barrel itself, since a real single-statement re-export there is the intended, normal shape this rule exists to push everything else towards.
    { code: "import { foo } from './foo';\nexport { foo };", filename: './src/index.ts' },
    { code: "import { foo } from './foo';\nexport default foo;", filename: './src/index.ts' },
  ],
  invalid: [
    {
      code: "import { foo } from './foo';\nexport { foo };",
      filename: 'src/other.ts',
      output: '\n',
      errors: [{ messageId: 'splitStatementReexport', data: { name: 'foo' } }],
    },
    {
      code: "import { foo } from './foo';\nexport default foo;",
      filename: 'src/other.ts',
      output: '\n',
      errors: [{ messageId: 'splitStatementDefaultReexport', data: { name: 'foo' } }],
    },
    {
      code: "import { foo } from './foo';\nconsole.log(foo);\nexport { foo };",
      filename: 'src/other.ts',
      output: "import { foo } from './foo';\nconsole.log(foo);\n",
      errors: [{ messageId: 'splitStatementReexport', data: { name: 'foo' } }],
    },
  ],
});
