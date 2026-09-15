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
    // Self-scoped away from any index file (not just src/index.ts, after the generalisation): the split-statement pattern is a no-op in a barrel, since a real single-statement re-export there is the intended, normal shape this rule exists to push everything else towards.
    { code: "import { foo } from './foo';\nexport { foo };", filename: './src/index.ts' },
    { code: "import { foo } from './foo';\nexport default foo;", filename: './src/index.ts' },
    { code: "import { foo } from './foo';\nexport { foo };", filename: './src/sub/index.ts' },
    // A default export whose declaration isn't a plain identifier (nothing was imported and handed straight back out) is never a split-statement re-export, regardless of what else the file imports.
    { code: "import { foo } from './foo';\nexport default { foo };", filename: 'src/other.ts' },
    // A default export of an identifier that was never imported (declared locally) isn't a re-export of anything.
    { code: 'const bar = 1;\nexport default bar;', filename: 'src/other.ts' },
  ],
  invalid: [
    {
      code: "import { foo } from './foo';\nexport { foo };",
      filename: 'src/other.ts',
      output: '\n',
      errors: [
        {
          message:
            "'foo' is imported here and handed straight back out via a bare export — the identical re-export 'export { foo } from ...' would be, just split across two statements. Re-exports belong only in the public barrel.",
        },
      ],
    },
    {
      code: "import { foo } from './foo';\nexport default foo;",
      filename: 'src/other.ts',
      output: '\n',
      errors: [
        {
          message:
            "'foo' is imported here and handed straight back out via `export default` — the identical re-export 'export { foo as default } from ...' would be, just split across two statements. Re-exports belong only in the public barrel.",
        },
      ],
    },
    {
      code: "import { foo } from './foo';\nconsole.log(foo);\nexport { foo };",
      filename: 'src/other.ts',
      output: "import { foo } from './foo';\nconsole.log(foo);\n",
      errors: [{ messageId: 'splitStatementReexport', data: { name: 'foo' } }],
    },
    {
      code: "import { foo } from './foo';\nconsole.log(foo);\nexport default foo;",
      filename: 'src/other.ts',
      output: "import { foo } from './foo';\nconsole.log(foo);\n",
      errors: [{ messageId: 'splitStatementDefaultReexport', data: { name: 'foo' } }],
    },
    // A multi-specifier export list where the split-reexported name is NOT the last member: only "foo, " is removed from the list, leaving "bar" behind, exercising removeListMember's not-last branch.
    {
      code: "import { foo } from './foo';\nconst bar = 1;\nexport { foo, bar };",
      filename: 'src/other.ts',
      output: '\nconst bar = 1;\nexport { bar };',
      errors: [{ messageId: 'splitStatementReexport', data: { name: 'foo' } }],
    },
    // The same shape with the split-reexported name LAST in the list: ", foo" is removed instead, exercising removeListMember's is-last branch.
    {
      code: "import { foo } from './foo';\nconst bar = 1;\nexport { bar, foo };",
      filename: 'src/other.ts',
      output: '\nconst bar = 1;\nexport { bar };',
      errors: [{ messageId: 'splitStatementReexport', data: { name: 'foo' } }],
    },
  ],
});
