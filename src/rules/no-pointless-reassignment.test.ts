import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-pointless-reassignment';

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

ruleTester.run('no-pointless-reassignment', rule, {
  valid: [
    { code: 'const foo = bar + 1;' },
    { code: 'let foo = bar;' },
    { code: 'const _foo = bar;' },
    { code: 'let bar = 1;\nconst foo = bar;\nbar = 2;\nconsole.log(foo);' },
  ],
  invalid: [
    {
      code: 'let bar = 1;\nconst foo = bar;\nconsole.log(foo);',
      output: 'let bar = 1;\n\nconsole.log(bar);',
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    {
      code: 'let bar = 1;\nconst foo = bar,\n  other = 2;\nconsole.log(foo, other);',
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    {
      code: 'const bar = 1;\nconst foo = bar;\nconst obj = { foo };\nconsole.log(obj);',
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // An exported alias must have its whole `export` statement removed. Removing only the inner VariableDeclaration left a bare `export` keyword behind, which does not parse.
    {
      code: 'const bar = 1;\nexport const foo = bar;\nconsole.log(foo);',
      output: 'const bar = 1;\n\nconsole.log(bar);',
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    {
      code: "import { bar } from './bar';\nexport const foo = bar;\nconsole.log(foo);",
      output: "import { bar } from './bar';\n\nconsole.log(bar);",
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // An exported alias with no other read still collapses to valid syntax.
    {
      code: 'const bar = 1;\nexport const foo = bar;\n',
      output: 'const bar = 1;\n\n',
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // An explicit type annotation is load-bearing -- still reported, never auto-fixed.
    {
      code: 'function f(item: never) {\n  const exhaustive: never = item;\n  throw new Error(String(exhaustive));\n}',
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'exhaustive', value: 'item' } }],
    },
    {
      code: 'const bar = 1;\nexport const foo: number = bar;\nconsole.log(foo);',
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // Shadowing: rewriting the read to `bar` would bind to the parameter, not the outer constant.
    {
      code: 'const bar = 1;\nconst foo = bar;\nexport function g(bar: number) {\n  return foo + bar;\n}',
      output: null,
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // The shadow guard is scoped to the read sites: a shadowing binding in a block the read is not inside does not block the fix.
    {
      code: 'const bar = 1;\nconst foo = bar;\n{\n  const bar = 2;\n  console.log(bar);\n}\nconsole.log(foo);',
      output: 'const bar = 1;\n\n{\n  const bar = 2;\n  console.log(bar);\n}\nconsole.log(bar);',
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
    // A read from inside a closure is still safely collapsible: the rule already refuses to report when the source is ever written, and a never-written source keeps both its runtime value and its narrowed type when read directly.
    {
      code: 'const bar = 1;\nconst foo = bar;\nexport const h = () => foo;',
      output: 'const bar = 1;\n\nexport const h = () => bar;',
      errors: [{ messageId: 'pointlessReassignment', data: { name: 'foo', value: 'bar' } }],
    },
  ],
});
