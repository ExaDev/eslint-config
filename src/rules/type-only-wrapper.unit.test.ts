import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { isTypeOnlyWrapper, unwrapTypeOnly } from './type-only-wrapper';

function isProgram(node: unknown): node is TSESTree.Program {
  return typeof node === 'object' && node !== null && 'type' in node && node.type === AST_NODE_TYPES.Program;
}

function initOf(code: string): TSESTree.Node {
  const { ast } = tseslint.parser.parseForESLint(code);
  if (!isProgram(ast)) throw new Error('Unreachable: the TypeScript parser always returns a Program.');
  const [statement] = ast.body;
  if (statement?.type !== AST_NODE_TYPES.VariableDeclaration) throw new Error('expected a variable declaration');
  const [{ init }] = statement.declarations;
  if (init === null) throw new Error('expected an initialiser');

  return init;
}

describe('isTypeOnlyWrapper', () => {
  it.each(['const a = x as T;', 'const a = x satisfies T;', 'const a = <T>x;'])('accepts %s', (code) => {
    expect(isTypeOnlyWrapper(initOf(code))).toBe(true);
  });

  it.each(['const a = x;', 'const a = x!;', 'const a = f(x);', 'const a = (x);'])('rejects %s', (code) => {
    expect(isTypeOnlyWrapper(initOf(code))).toBe(false);
  });
});

describe('unwrapTypeOnly', () => {
  it('removes every nested wrapper', () => {
    const inner = unwrapTypeOnly(initOf('const a = (<T>(x as U)) satisfies V;'));
    expect(inner.type).toBe(AST_NODE_TYPES.Identifier);
  });

  it('returns a node that is not a wrapper unchanged', () => {
    const node = initOf('const a = x!;');
    expect(unwrapTypeOnly(node)).toBe(node);
  });
});
