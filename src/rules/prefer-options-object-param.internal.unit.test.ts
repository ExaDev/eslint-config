import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import { describeFunctionKind, hasOptionsNameCollision, isOptionalParam } from './prefer-options-object-param';

function definedOrThrow<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Unreachable: expected the probe rule below to have captured this value.');
  }
  return value;
}

// isOptionalParam and hasOptionsNameCollision each need a real TSESTree parameter node or a real TSESLint.Scope.Scope, neither of which is worth hand-fabricating (a partial stand-in risks silently drifting from the real node/scope shape ESLint itself produces). Captures both from a genuine (throwaway) rule run instead, the same technique no-mutable-union-array-param.internal.unit.test.ts uses for a real TypeNode and RuleFixer.
let optionalIdentifierParam: TSESTree.Parameter | undefined;
let requiredIdentifierParam: TSESTree.Parameter | undefined;
let bareDestructuredParam: TSESTree.Parameter | undefined;
let optionalObjectPatternParam: TSESTree.Parameter | undefined;
let optionalArrayPatternParam: TSESTree.Parameter | undefined;
let restParam: TSESTree.Parameter | undefined;
let capturedScope: TSESLint.Scope.Scope | undefined;
let constructorFunctionNode: TSESTree.FunctionExpression | TSESTree.TSEmptyBodyFunctionExpression | undefined;
let regularMethodFunctionNode: TSESTree.FunctionExpression | TSESTree.TSEmptyBodyFunctionExpression | undefined;

const createRule = ESLintUtils.RuleCreator((name) => name);
const probe = createRule({
  name: 'probe',
  meta: { type: 'problem', schema: [], docs: { description: 'probe' }, messages: { hit: 'hit' } },
  defaultOptions: [],
  create(context) {
    return {
      FunctionDeclaration(node) {
        if (node.id?.name !== 'paramsProbe') return;
        [
          optionalIdentifierParam,
          requiredIdentifierParam,
          bareDestructuredParam,
          optionalObjectPatternParam,
          optionalArrayPatternParam,
          restParam,
        ] = node.params;
        capturedScope = context.sourceCode.getScope(node);
        context.report({ node, messageId: 'hit' });
      },
      MethodDefinition(node) {
        if (node.kind === 'constructor') constructorFunctionNode = node.value;
        else if (node.key.type === AST_NODE_TYPES.Identifier && node.key.name === 'regularMethod') regularMethodFunctionNode = node.value;
      },
    };
  },
});

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });
ruleTester.run('probe', probe, {
  valid: [],
  invalid: [
    {
      // Two `var options;` declarations in the same function scope are the same real Variable with two distinct identifier occurrences (JS `var` re-declaration), the one natural way to get a Variable with more than one identifier without hand-fabricating one. The class alongside it supplies a real constructor and a real regular method, both captured by the MethodDefinition visitor above, for describeFunctionKind's own direct tests below. `{ d }?: { d: number }` and `[e]?: number[]` are an optional ObjectPattern and ArrayPattern: syntactically valid even in a real function body (confirmed by parsing this fixture at all), and the one way to capture real optional-pattern nodes for isOptionalParam's own direct tests below. The trailing `...rest: number[]` captures a real RestElement: isOptionalParam is never called on one through the rule's own traversal (getTrailingOptionalRun always skips a trailing rest parameter before calling it), so its own direct test below is the only thing that exercises isOptionalParam's final fallback at all.
      code:
        'function paramsProbe(a?: number, b: number, { c }: { c: number }, { d }?: { d: number }, [e]?: number[], ...rest: number[]): void {\n  var options;\n  var options;\n}\nclass ProbeClass {\n  constructor(a: number) {}\n  regularMethod(a: number) {}\n}',
      errors: [{ messageId: 'hit' }],
    },
  ],
});

describe('isOptionalParam', () => {
  it('returns true for an optional (?-marked) Identifier', () => {
    expect(isOptionalParam(definedOrThrow(optionalIdentifierParam))).toBe(true);
  });

  it('returns false for a required Identifier', () => {
    expect(isOptionalParam(definedOrThrow(requiredIdentifierParam))).toBe(false);
  });

  it('returns false, never undefined, for a bare (non-optional, no default) destructured ObjectPattern parameter', () => {
    // The distinguishing case: an ObjectPattern has no `optional` property at all, so a mutant that reaches the Identifier branch's `return param.optional` regardless of type would return `undefined` here, not `false`. Every real call site treats the two as equivalent (`!isOptionalParam(...)`, where `!undefined === !false`), so only a strict `toBe(false)` assertion, not real rule behaviour, can tell them apart.
    expect(isOptionalParam(definedOrThrow(bareDestructuredParam))).toBe(false);
  });

  it('returns true for an optional (?-marked) ObjectPattern', () => {
    expect(isOptionalParam(definedOrThrow(optionalObjectPatternParam))).toBe(true);
  });

  it('returns true for an optional (?-marked) ArrayPattern', () => {
    expect(isOptionalParam(definedOrThrow(optionalArrayPatternParam))).toBe(true);
  });

  it('returns false for a RestElement, the one Parameter variant none of the earlier branches match', () => {
    expect(isOptionalParam(definedOrThrow(restParam))).toBe(false);
  });
});

describe('describeFunctionKind', () => {
  it('labels a real class constructor "constructor"', () => {
    expect(describeFunctionKind(definedOrThrow(constructorFunctionNode))).toBe('constructor');
  });

  it('labels a real, non-constructor class method "method", not "constructor"', () => {
    expect(describeFunctionKind(definedOrThrow(regularMethodFunctionNode))).toBe('method');
  });
});

describe('hasOptionsNameCollision', () => {
  // RuleTester.run's own nested it() (registered above, before this describe block) is what actually populates capturedScope, and Vitest only executes it once this file's own top-level synchronous registration has finished. These are read inside beforeAll, not at this describe body's own top level, the same deferred-read shape no-mutable-union-array-param.internal.unit.test.ts's own describe blocks already use for stringKeywordNode/capturedFixer.
  let scope: TSESLint.Scope.Scope;
  let firstIdentifier: TSESTree.Identifier;
  let secondIdentifier: TSESTree.Identifier;

  beforeAll(() => {
    scope = definedOrThrow(capturedScope);
    const optionsVariable = scope.variables.find((variable) => variable.name === 'options');
    if (optionsVariable === undefined) throw new Error('Unreachable: the probe fixture always declares two `var options;` bindings.');
    const [first, second] = optionsVariable.identifiers;
    if (first === undefined || second === undefined) {
      throw new Error('Unreachable: `var options; var options;` always yields two identifier nodes for the one variable.');
    }
    firstIdentifier = first;
    secondIdentifier = second;
  });

  it('returns false when every identifier bound to "options" is exempt', () => {
    expect(hasOptionsNameCollision(scope, new Set([firstIdentifier, secondIdentifier]))).toBe(false);
  });

  it('returns true when only one of two identifiers bound to "options" is exempt, not both (every, not some)', () => {
    // Exempting only firstIdentifier: a mutant weakening `.every` to `.some` would see the ONE exempt identifier and wrongly conclude there is no collision.
    expect(hasOptionsNameCollision(scope, new Set([firstIdentifier]))).toBe(true);
  });

  it('returns true when no identifier bound to "options" is exempt', () => {
    // A mutant replacing the per-identifier exemption check with a function that always returns a falsy value regardless of its argument cannot be distinguished from the real check by this case alone (both already report a collision here), but combined with the "every identifier exempt" case above, only the real per-identifier check passes both.
    expect(hasOptionsNameCollision(scope, new Set())).toBe(true);
  });
});
