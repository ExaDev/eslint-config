import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-control-flow';

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

ruleTester.run('no-control-flow', rule, {
  valid: [
    // Lookup tables, declarative array methods, and short-circuiting operators are all unaffected -- only real branches and loops are banned.
    { code: 'const x = { a: 1, b: 2 }[key];' },
    { code: 'const x = table[key]();' },
    { code: 'const x = value ?? fallback;' },
    { code: 'const x = value && other;' },
    { code: 'const x = value || other;' },
    { code: 'items.map((item) => item.value);' },
    { code: 'items.filter((item) => item.active);' },
    { code: 'Object.entries(record).map(([key, value]) => key + value);' },
  ],
  invalid: [
    {
      code: 'if (a) { b(); }',
      errors: [{ messageId: 'ifStatement' }],
    },
    {
      code: 'if (a) { b(); } else { c(); }',
      errors: [{ messageId: 'ifStatement' }],
    },
    {
      code: 'switch (a) { case 1: b(); break; }',
      errors: [{ messageId: 'switchStatement' }],
    },
    {
      code: 'for (let i = 0; i < 10; i++) { b(); }',
      errors: [{ messageId: 'forStatement' }],
    },
    {
      code: 'for (const key in obj) { b(key); }',
      errors: [{ messageId: 'forInStatement' }],
    },
    {
      code: 'for (const item of items) { b(item); }',
      errors: [{ messageId: 'forOfStatement' }],
    },
    {
      code: 'while (a) { b(); }',
      errors: [{ messageId: 'whileStatement' }],
    },
    {
      code: 'do { b(); } while (a);',
      errors: [{ messageId: 'doWhileStatement' }],
    },
    {
      code: 'const x = a ? b : c;',
      errors: [{ messageId: 'conditionalExpression' }],
    },
  ],
});
