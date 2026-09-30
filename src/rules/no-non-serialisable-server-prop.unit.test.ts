import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import { RuleTester } from '@typescript-eslint/rule-tester';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { publicPlugin } from '../plugin';
import rule, { DEFAULT_PROP_NAMES, isSerialisableData, readNoNonSerialisableServerPropOptions } from './no-non-serialisable-server-prop';

describe('rule metadata', () => {
  it('carries the docs url built from the rule name', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-non-serialisable-server-prop.ts');
  });

  it('checks the component prop by default', () => {
    expect(DEFAULT_PROP_NAMES).toStrictEqual(['component']);
  });
});

describe('readNoNonSerialisableServerPropOptions', () => {
  it('defaults the names and allows no element', () => {
    const { names, allowElements } = readNoNonSerialisableServerPropOptions({});
    expect([...names]).toStrictEqual(['component']);
    expect(allowElements.size).toBe(0);
  });

  it('replaces the default names with the given ones', () => {
    expect([...readNoNonSerialisableServerPropOptions({ names: ['icon', 'as'] }).names]).toStrictEqual(['icon', 'as']);
  });

  it('reads the allowed elements', () => {
    expect([...readNoNonSerialisableServerPropOptions({ allowElements: ['Link', 'Lib.Icon'] }).allowElements]).toStrictEqual(['Link', 'Lib.Icon']);
  });

  it.each([
    ['a non-object', 'x', /must be an object/u],
    ['an unknown key', { name: ['a'] }, /unknown key "name"/u],
    ['an empty names list', { names: [] }, /"names" to be a non-empty array/u],
    ['a duplicated name', { names: ['a', 'a'] }, /"names" to be a non-empty array of distinct/u],
    ['a non-string name', { names: [1] }, /"names" to be a non-empty array/u],
    ['an empty allowElements list', { allowElements: [] }, /"allowElements" to be a non-empty array/u],
  ])('rejects %s', (_label, value, message) => {
    expect(() => readNoNonSerialisableServerPropOptions(value)).toThrow(message);
  });
});

// A probe rule reporting what isSerialisableData says about the single argument of each `x(...)` call.
const dataProbe = ESLintUtils.RuleCreator((name) => name)<[], 'data' | 'notData'>({
  name: 'data-probe',
  meta: { type: 'problem', docs: { description: 'probe' }, schema: [], messages: { data: 'data', notData: 'notData' } },
  defaultOptions: [],
  create(context) {
    return {
      [AST_NODE_TYPES.CallExpression](node) {
        const [argument] = node.arguments;
        if (argument !== undefined) context.report({ node: argument, messageId: isSerialisableData(argument) ? 'data' : 'notData' });
      },
    };
  },
});

const probeTester = new RuleTester({ languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } }, sourceType: 'module' } });

const DATA = ['"a"', '1', 'true', 'null', '10n', '-1', '!0', '`a`', '`a${1}`', 'undefined', '[1, "a", , [2]]', '({ a: 1, "b": [2], [`c`]: 3 })', '({ a: 1 } as const)', '(1 satisfies number)', '<A />', '<></>', '`${undefined}`', '-Icon', '!Icon', 'typeof Icon', 'void Icon', '~Icon'];
const NOT_DATA = ['Icon', 'lib.Icon', 'make()', '() => 1', '(function () {})', '(class {})', '/x/u', '`a${Icon}`', '[...items]', '[Icon]', '({ ...rest })', '({ a: Icon })', '({ a() {} })', '({ get a() { return 1; } })', '({ [key]: 1 })', 'a ? 1 : 2', 'new Icon()', '(Icon!)', '(Icon as unknown)', 'null ?? Icon'];

probeTester.run('isSerialisableData', dataProbe, {
  valid: [],
  invalid: [
    ...DATA.map((source) => ({ code: `x(${source});`, errors: [{ messageId: 'data' as const }] })),
    ...NOT_DATA.map((source) => ({ code: `x(${source});`, errors: [{ messageId: 'notData' as const }] })),
  ],
});

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } }, sourceType: 'module' } });

const message = (name: string, element: string) => ({ messageId: 'nonSerialisable' as const, data: { name, element } });

ruleTester.run('no-non-serialisable-server-prop', rule, {
  valid: [
    'const a = <Card component="div" />;',
    "const a = <Card component={'div'} />;",
    'const a = <Card component />;',
    'const a = <Card component={{ name: "x", size: 2 }} />;',
    'const a = <Card component={<Icon />} />;',
    'const a = <Card component={undefined} />;',
    // Not the configured prop.
    'const a = <Card title={Icon} />;',
    'const a = <Card {...props} />;',
    'const a = <Card {...{ component: Icon }} />;',
    'const a = <ns:Card component="x" />;',
    'const a = <Card ns:component={Icon} />;',
    // A file marked as client code is out of scope.
    '"use client";\nconst a = <Card component={Icon} />;',
    '"use strict";\n"use client";\nconst a = <Card component={Icon} />;',
    { code: 'const a = <Card title={Icon} />;', options: [{ names: ['icon'] }] },
    { code: 'const a = <Card component={Icon} />;', options: [{ names: ['icon'] }] },
    // An element known to be a server component may take anything.
    { code: 'const a = <Link component={Icon} />;', options: [{ allowElements: ['Link'] }] },
    { code: 'const a = <Lib.Icon component={Icon} />;', options: [{ allowElements: ['Lib.Icon'] }] },
    // An empty expression container has no value to check.
    'const a = <Card component={/* comment */} />;',
  ],
  invalid: [
    { code: 'const a = <Card component={Icon} />;', errors: [message('component', 'Card')] },
    { code: 'const a = <Card component={lib.Icon} />;', errors: [message('component', 'Card')] },
    { code: 'const a = <Card component={() => <div />} />;', errors: [message('component', 'Card')] },
    { code: 'const a = <Card component={function Inner() { return null; }} />;', errors: [message('component', 'Card')] },
    { code: 'const a = <Card component={make()} />;', errors: [message('component', 'Card')] },
    { code: 'const a = <Card component={cond ? Icon : Other} />;', errors: [message('component', 'Card')] },
    { code: 'const a = <Card component={{ render: Icon }} />;', errors: [message('component', 'Card')] },
    { code: 'const a = <Card component={[Icon]} />;', errors: [message('component', 'Card')] },
    { code: 'const a = <Card component={`${Icon}`} />;', errors: [message('component', 'Card')] },
    { code: 'const a = <Card component={Icon as ComponentType} />;', errors: [message('component', 'Card')] },
    { code: 'const a = <Card component={Icon!} />;', errors: [message('component', 'Card')] },
    // The element name is written as the source writes it.
    { code: 'const a = <Lib.Card component={Icon} />;', errors: [message('component', 'Lib.Card')] },
    // An allow list of another element does not help.
    { code: 'const a = <Card component={Icon} />;', options: [{ allowElements: ['Link'] }], errors: [message('component', 'Card')] },
    // Configured names replace the default.
    { code: 'const a = <Card icon={Icon} component={Other} />;', options: [{ names: ['icon'] }], errors: [message('icon', 'Card')] },
    { code: 'const a = <Card icon={Icon} as={Other} />;', options: [{ names: ['icon', 'as'] }], errors: [message('icon', 'Card'), message('as', 'Card')] },
    // A directive that is not in the prologue marks nothing.
    { code: 'import a from "a";\n"use client";\nconst b = <Card component={Icon} />;', errors: [message('component', 'Card')] },
    // Each offending attribute is reported once, on the value.
    { code: 'const a = <A component={X}><B component={Y} /></A>;', errors: [message('component', 'A'), message('component', 'B')] },
  ],
});

describe('linted through the plugin', () => {
  it('reports at the value of the attribute', () => {
    const [report] = new Linter().verify(
      'const a = <Card component={Icon} />;',
      [{ files: ['**/*.tsx'], languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } }, plugins: { exadev: publicPlugin }, rules: { 'exadev/no-non-serialisable-server-prop': 'error' } }],
      'a.tsx',
    );
    // The value of the attribute, braces included: `{Icon}`.
    expect(report).toMatchObject({ line: 1, column: 'const a = <Card component='.length + 1, endColumn: 'const a = <Card component={Icon}'.length + 1 });
  });
});
