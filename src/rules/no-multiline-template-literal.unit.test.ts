import { RuleTester } from '@typescript-eslint/rule-tester';
import { Linter } from 'eslint';
import { runInNewContext } from 'node:vm';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { publicPlugin } from '../plugin';
import rule, { cookedLineFeeds, readNoMultilineTemplateLiteralOptions } from './no-multiline-template-literal';

describe('rule metadata', () => {
  it('carries the docs url built from the rule name', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-multiline-template-literal.ts');
  });
});

describe('cookedLineFeeds', () => {
  it('counts the line feeds of a cooked value', () => {
    expect(cookedLineFeeds({ value: { cooked: 'a\nb\n' } })).toBe(2);
  });

  it('throws for a null cooked value, which only a tagged template can have', () => {
    expect(() => cookedLineFeeds({ value: { cooked: null } })).toThrow(/Unreachable/);
  });
});

describe('readNoMultilineTemplateLiteralOptions', () => {
  it('returns no scope when allowFiles is absent', () => {
    expect(readNoMultilineTemplateLiteralOptions({})).toBeUndefined();
  });

  it('compiles allowFiles into a scope relative to the working directory', () => {
    const scope = readNoMultilineTemplateLiteralOptions({ allowFiles: ['fixtures/**'] });
    expect(scope?.('/repo/fixtures/a.ts', '/repo')).toBe(true);
    expect(scope?.('/repo/src/a.ts', '/repo')).toBe(false);
  });

  it('rejects a non-object option', () => {
    expect(() => readNoMultilineTemplateLiteralOptions('x')).toThrow('@exadev/eslint-config: "no-multiline-template-literal" must be an object.');
  });

  it('rejects an unknown key', () => {
    expect(() => readNoMultilineTemplateLiteralOptions({ files: [] })).toThrow('unknown key "files"');
  });

  it('rejects a glob list with no include', () => {
    expect(() => readNoMultilineTemplateLiteralOptions({ allowFiles: ['!a.ts'] })).toThrow('"no-multiline-template-literal.allowFiles" must contain at least one glob that does not start with "!"');
  });
});

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });

ruleTester.run('no-multiline-template-literal', rule, {
  valid: [
    'const a = `one line`;',
    'const a = `${b} and ${c}`;',
    'const a = "one\\ntwo";',
    // A tagged template hands its pieces to the tag, so joining them would change the call.
    'const a = sql`\nselect 1\n`;',
    'const a = String.raw`a\nb`;',
    'const a = css`\n  color: red;\n`;',
    // A type-level template literal is a different node and has no value to join.
    'type A = `a${string}`;',
    // The line feed is in the substitution's source, not in the template's own text.
    'const a = `${\nb}`;',
    // A line continuation removes the line break from the value.
    'const a = `one \\\ntwo`;',
    { code: 'const a = `one\ntwo`;', options: [{ allowFiles: ['**/allowed.ts'] }], filename: 'allowed.ts' },
  ],
  invalid: [
    {
      code: 'const a = `one\ntwo`;',
      output: "const a = [\n  'one',\n  'two'\n].join('\\n');",
      errors: [{ messageId: 'multiline' }],
    },
    {
      code: 'const a = `one\ntwo`;',
      options: [{ allowFiles: ['**/allowed.ts'] }],
      filename: 'other.ts',
      output: "const a = [\n  'one',\n  'two'\n].join('\\n');",
      errors: [{ messageId: 'multiline' }],
    },
    // Leading and trailing line breaks are empty lines, not dropped.
    {
      code: 'const a = `\none\n`;',
      output: "const a = [\n  '',\n  'one',\n  ''\n].join('\\n');",
      errors: [{ messageId: 'multiline' }],
    },
    // An `\n` escape is a line break in the value, so it splits like a real one.
    {
      code: 'const a = `one\\ntwo`;',
      output: "const a = [\n  'one',\n  'two'\n].join('\\n');",
      errors: [{ messageId: 'multiline' }],
    },
    // A line with a substitution stays a template literal; the substitution is copied verbatim, comments and all.
    {
      code: 'const a = `head ${ /* keep */ b + 1 }\ntail ${c}`;',
      output: "const a = [\n  `head ${ /* keep */ b + 1 }`,\n  `tail ${c}`\n].join('\\n');",
      errors: [{ messageId: 'multiline' }],
    },
    // A substitution that spans lines in the source is not a break in the value.
    {
      code: 'const a = `x ${f(\n1,\n2)}\ny`;',
      output: "const a = [\n  `x ${f(\n1,\n2)}`,\n  'y'\n].join('\\n');",
      errors: [{ messageId: 'multiline' }],
    },
    // Quotes, backticks, dollars and backslashes are re-spelled for the literal that now holds them.
    {
      code: "const a = `it's \\`x\\` \\${y}\nback\\\\slash`;",
      output: "const a = [\n  'it\\'s `x` ${y}',\n  'back\\\\slash'\n].join('\\n');",
      errors: [{ messageId: 'multiline' }],
    },
    {
      code: "const a = `it's \\`x\\` ${y}\nz`;",
      output: "const a = [\n  `it's \\`x\\` ${y}`,\n  'z'\n].join('\\n');",
      errors: [{ messageId: 'multiline' }],
    },
    // Other escapes are carried over unchanged.
    {
      code: 'const a = `tab\\there \\u00e9 \\x41 \\u{1F600} \\0\nnext`;',
      output: "const a = [\n  'tab\\there \\u00e9 \\x41 \\u{1F600} \\0',\n  'next'\n].join('\\n');",
      errors: [{ messageId: 'multiline' }],
    },
    // The array is indented one level deeper than the line the template starts on, with that line's own indentation style.
    {
      code: 'function f() {\n\treturn `a\nb`;\n}',
      output: "function f() {\n\treturn [\n\t\t'a',\n\t\t'b'\n\t].join('\\n');\n}",
      errors: [{ messageId: 'multiline' }],
    },
    // Reported without a fix: a line continuation next to a real break.
    {
      code: 'const a = `one \\\ntwo\nthree`;',
      output: null,
      errors: [{ messageId: 'multiline' }],
    },
    // Reported without a fix: an escape that spells a line feed.
    {
      code: 'const a = `one\\x0Atwo`;',
      output: null,
      errors: [{ messageId: 'multiline' }],
    },
    {
      code: 'const a = `one\\u000Atwo`;',
      output: null,
      errors: [{ messageId: 'multiline' }],
    },
    {
      code: 'const a = `one\\u{a}two`;',
      output: null,
      errors: [{ messageId: 'multiline' }],
    },
    // Reported without a fix: a carriage return in the source (the cooked value normalises CRLF, so the source line ending is not the value's).
    {
      code: 'const a = `one\r\ntwo`;',
      output: null,
      errors: [{ messageId: 'multiline' }],
    },
    // Reported without a fix: a Unicode line separator in the source.
    {
      code: 'const a = `one\u2028\ntwo`;',
      output: null,
      errors: [{ messageId: 'multiline' }],
    },
    // Reported without a fix: the joined string is a plain string, which loses the literal type these positions need.
    {
      code: 'const a = `x\ny` as const;',
      output: null,
      errors: [{ messageId: 'multiline' }],
    },
    {
      code: 'const a = { b: [`x\ny`] } as const;',
      output: null,
      errors: [{ messageId: 'multiline' }],
    },
    {
      code: 'enum E { A = `x\ny` }',
      output: null,
      errors: [{ messageId: 'multiline' }],
    },
    {
      code: "const a: 'x\\ny' = `x\ny`;",
      output: null,
      errors: [{ messageId: 'multiline' }],
    },
    {
      code: "class C { readonly a: 'x\\ny' = `x\ny`; }",
      output: null,
      errors: [{ messageId: 'multiline' }],
    },
    {
      code: 'const a = `x\ny` satisfies string;',
      output: null,
      errors: [{ messageId: 'multiline' }],
    },
    {
      code: 'const a = <const>`x\ny`;',
      output: null,
      errors: [{ messageId: 'multiline' }],
    },
    // Still fixed: a plain declaration and a call argument have no literal-type requirement the rule can see.
    {
      code: 'f(`x\ny`);',
      output: "f([\n  'x',\n  'y'\n].join('\\n'));",
      errors: [{ messageId: 'multiline' }],
    },
    // The outer template is rewritten on the first pass and the nested one, reported by its own node, on the second.
    {
      code: 'const a = `x ${`p\nq`}\ny`;',
      output: [
        "const a = [\n  `x ${`p\nq`}`,\n  'y'\n].join('\\n');",
        "const a = [\n  `x ${[\n    'p',\n    'q'\n  ].join('\\n')}`,\n  'y'\n].join('\\n');",
      ],
      errors: [{ messageId: 'multiline' }, { messageId: 'multiline' }],
    },
  ],
});

const linter = new Linter();

function fix(code: string): string {
  const result = linter.verifyAndFix(
    code,
    [{ files: ['**/*.ts'], languageOptions: { parser: tseslint.parser }, plugins: { exadev: publicPlugin }, rules: { 'exadev/no-multiline-template-literal': 'error' } }],
    { filename: 'a.ts' },
  );

  return result.output;
}

describe('the fix preserves the string', () => {
  const scope = { name: 'World', n: 3, items: ['x', 'y'] };
  const sources: readonly string[] = [
    '`one\ntwo`',
    '`\n\n`',
    '`a\\nb\\n`',
    "`it's a \\`test\\` with $ and \\${x}\n'quoted'`",
    '`hello ${name}\n  indented ${n + 1}\n${items.join(",")}`',
    '`tab\\t\\u00e9\\x41\\u{1F600}\\0\\r\nnext \\\\ back`',
    '`${name}\n${name}`',
    '`$\n{`',
    '`$${n}\n${n}$`',
    '`nested ${`inner\nline ${name}`}\nouter`',
    '`\\\\n\nreal`',
    '`emoji \u{1F600}\ncafe\u0301`',
  ];

  it.each(sources)('%j evaluates to the same value after the rewrite', (source) => {
    const fixed = fix(`const value = ${source};`);
    expect(runInNewContext(`${fixed.replace('const value = ', 'value = ')}\nvalue`, { ...scope })).toBe(runInNewContext(source, { ...scope }));
  });
});
