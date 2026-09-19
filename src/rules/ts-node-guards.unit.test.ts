import { RuleTester } from '@typescript-eslint/rule-tester';
import { ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { asExpression, asTypeReference, firstTokenOrThrow, lastTokenOrThrow } from './ts-node-guards';

function definedOrThrow<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Unreachable: expected the probe rule below to have captured this value.');
  }
  return value;
}

describe('asExpression', () => {
  it('returns the node unchanged when it genuinely is a ts.Expression', () => {
    const identifier = ts.factory.createIdentifier('x');
    expect(asExpression(identifier)).toBe(identifier);
  });

  it('throws for a ts.Node that is not an expression at all — a shape no real esTreeNodeToTSNodeMap lookup in this codebase has ever been found to produce', () => {
    const emptyStatement = ts.factory.createEmptyStatement();
    expect(() => asExpression(emptyStatement)).toThrow(/Unreachable/);
  });
});

describe('asTypeReference', () => {
  // Captures a real ts.Type via a genuine (throwaway) rule run, rather than trying to hand-construct one — ts.Type objects are only ever produced by a real TypeChecker.
  let numberType: ts.Type | undefined;
  let arrayType: ts.Type | undefined;

  const createRule = ESLintUtils.RuleCreator((name) => name);
  const probe = createRule({
    name: 'probe',
    meta: { type: 'problem', schema: [], docs: { description: 'probe' }, messages: { hit: 'hit' } },
    defaultOptions: [],
    create(context) {
      const services = ESLintUtils.getParserServices(context);
      const checker = services.program.getTypeChecker();
      return {
        VariableDeclarator(node) {
          const tsNode = services.esTreeNodeToTSNodeMap.get(node.id);
          const type = checker.getTypeAtLocation(tsNode);
          if (checker.isArrayType(type)) {
            arrayType = type;
          } else {
            numberType = type;
          }
        },
      };
    },
  });

  const ruleTester = new RuleTester({
    languageOptions: { parserOptions: { projectService: { allowDefaultProject: ['*.ts*'] }, tsconfigRootDir: import.meta.dirname } },
  });

  ruleTester.run('probe', probe, {
    valid: ['declare const n: number; declare const arr: number[]; void n; void arr;'],
    invalid: [],
  });

  it('captured both a plain (non-reference) type and a genuine array type reference from the probe run', () => {
    expect(numberType).toBeDefined();
    expect(arrayType).toBeDefined();
  });

  it('returns the type unchanged when it genuinely is backed by a ts.TypeReference', () => {
    const type = definedOrThrow(arrayType);
    expect(asTypeReference(type)).toBe(type);
  });

  it('throws for a type not backed by a ts.TypeReference — a shape no real array/tuple type this codebase checks against ever has', () => {
    const type = definedOrThrow(numberType);
    expect(() => asTypeReference(type)).toThrow(/Unreachable/);
  });
});

describe('lastTokenOrThrow', () => {
  it('returns the token when getLastToken genuinely finds one', () => {
    const fakeSourceCode = { getLastToken: () => 'token' };
    expect(lastTokenOrThrow(fakeSourceCode, {})).toBe('token');
  });

  it('throws when getLastToken returns null — never true of a real, parsed AST node', () => {
    const fakeSourceCode = { getLastToken: () => null };
    expect(() => lastTokenOrThrow(fakeSourceCode, {})).toThrow(/Unreachable/);
  });
});

describe('firstTokenOrThrow', () => {
  it('returns the token when getFirstToken genuinely finds one', () => {
    const fakeSourceCode = { getFirstToken: () => 'token' };
    expect(firstTokenOrThrow(fakeSourceCode, {})).toBe('token');
  });

  it('throws when getFirstToken returns null — never true of a real, parsed AST node', () => {
    const fakeSourceCode = { getFirstToken: () => null };
    expect(() => firstTokenOrThrow(fakeSourceCode, {})).toThrow(/Unreachable/);
  });
});
