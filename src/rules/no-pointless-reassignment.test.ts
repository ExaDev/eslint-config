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
  ],
});
