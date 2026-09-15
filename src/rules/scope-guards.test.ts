import { RuleTester } from '@typescript-eslint/rule-tester';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { asIdentifierName } from './scope-guards';

function definedOrThrow<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Unreachable: expected the probe rule below to have captured this value.');
  }
  return value;
}

// Real, fully-populated TSESTree.BindingName nodes (range/loc/parent included) are only ever produced by a real parse — captured here via a genuine (throwaway) rule run rather than hand-constructed, so both fixtures below are exactly what a real Parameter's own `.name` field can structurally hold, even though only one of the two shapes is ever actually reachable through this codebase's own declarationDefinition.name call sites.
let identifierName: TSESTree.BindingName | undefined;
let patternName: TSESTree.BindingName | undefined;

const createRule = ESLintUtils.RuleCreator((name) => name);
const probe = createRule({
  name: 'probe',
  meta: { type: 'problem', schema: [], docs: { description: 'probe' }, messages: { hit: 'hit' } },
  defaultOptions: [],
  create() {
    return {
      FunctionDeclaration(node) {
        const [firstParam, secondParam] = node.params;
        if (firstParam?.type === AST_NODE_TYPES.Identifier) identifierName = firstParam;
        if (secondParam?.type === AST_NODE_TYPES.ObjectPattern) patternName = secondParam;
      },
    };
  },
});

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });

ruleTester.run('probe', probe, {
  valid: ['function f(plain, { destructured }) {}'],
  invalid: [],
});

describe('asIdentifierName', () => {
  it('captured both a plain identifier and a destructured pattern from the probe run', () => {
    expect(identifierName).toBeDefined();
    expect(patternName).toBeDefined();
  });

  it('returns the name unchanged when it genuinely is an Identifier', () => {
    const name = definedOrThrow(identifierName);
    expect(asIdentifierName(name)).toBe(name);
  });

  it('throws for a pattern-shaped name — a shape no Parameter/Variable Definition this codebase reads ever has, since destructuring creates one Definition per bound identifier, never one for the enclosing pattern as a whole', () => {
    const name = definedOrThrow(patternName);
    expect(() => asIdentifierName(name)).toThrow(/Unreachable/);
  });
});
