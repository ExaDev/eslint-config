import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { buildReadonlyArrayFix } from './no-mutable-union-array-param';

function definedOrThrow<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Unreachable: expected the probe rule below to have captured this value.');
  }
  return value;
}

// buildReadonlyArrayFix is only ever called (from no-mutable-union-array-param's own create()) with an `annotated` node isUnionArrayType already confirmed to be a TSArrayType or TSTypeReference — real ES/TS syntax never reaches its own throw branch through that rule. Captures a real, unrelated TypeNode (a bare TSStringKeyword) and a real RuleFixer from a genuine (throwaway) rule run to exercise it directly, rather than a hand-built stand-in for either.
let stringKeywordNode: TSESTree.TypeNode | undefined;
let capturedFixer: TSESLint.RuleFixer | undefined;

const createRule = ESLintUtils.RuleCreator((name) => name);
const probe = createRule({
  name: 'probe',
  meta: { type: 'problem', schema: [], docs: { description: 'probe' }, fixable: 'code', messages: { hit: 'hit' } },
  defaultOptions: [],
  create(context) {
    return {
      Identifier(node) {
        if (node.typeAnnotation?.typeAnnotation.type === AST_NODE_TYPES.TSStringKeyword) {
          stringKeywordNode = node.typeAnnotation.typeAnnotation;
          context.report({
            node,
            messageId: 'hit',
            fix(fixer) {
              capturedFixer = fixer;
              return null;
            },
          });
        }
      },
    };
  },
});

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });
ruleTester.run('probe', probe, {
  valid: [],
  invalid: [{ code: 'function f(s: string): void {}', errors: [{ messageId: 'hit' }] }],
});

describe('buildReadonlyArrayFix', () => {
  it('captured both a real non-array TypeNode and a real RuleFixer from the probe run', () => {
    expect(stringKeywordNode).toBeDefined();
    expect(capturedFixer).toBeDefined();
  });

  it('throws for a TypeNode that is neither a TSArrayType nor a TSTypeReference — a shape isUnionArrayType never lets through to the only real caller of this function', () => {
    const annotated = definedOrThrow(stringKeywordNode);
    const fixer = definedOrThrow(capturedFixer);
    expect(() => buildReadonlyArrayFix(annotated, fixer)).toThrow(/Unreachable/);
  });
});
