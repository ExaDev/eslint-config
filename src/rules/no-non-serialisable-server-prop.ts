import { AST_NODE_TYPES, ESLintUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
import { isRecord } from '../is-record';
import { assertOnlyKeys, readRequiredStrings } from './file-entry';
import { isTypeOnlyWrapper } from './type-only-wrapper';
import { isEstreeSource } from './estree-source';
import { hasUseClientDirective } from './use-client-directive';

const OPTION_NAME = 'no-non-serialisable-server-prop';

/**
 * The prop names checked when `names` is not given.
 */
export const DEFAULT_PROP_NAMES: readonly string[] = ['component'];

/**
 * The options of `exadev/no-non-serialisable-server-prop`.
 */
export interface NoNonSerialisableServerPropOptions {
  // Prop names whose value must be serialisable data. Defaults to `component`.
  readonly names?: readonly string[];
  // JSX element names, as written (`Link`, `Lib.Icon`), whose props are not checked: elements known to be server components, which take a function or component reference without a boundary in between.
  readonly allowElements?: readonly string[];
}

/**
 * The rule's option schema. `readNoNonSerialisableServerPropOptions` adds the checks a schema cannot express.
 */
export const noNonSerialisableServerPropSchema: JSONSchema4 = {
  type: 'object',
  properties: {
    names: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, uniqueItems: true },
    allowElements: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
  },
  additionalProperties: false,
};

interface ReadOptions {
  readonly names: ReadonlySet<string>;
  readonly allowElements: ReadonlySet<string>;
}

/**
 * Validates the options and applies the defaults. Throws naming the option for anything the schema lets through that the rule cannot use.
 */
export function readNoNonSerialisableServerPropOptions(value: unknown): ReadOptions {
  if (!isRecord(value)) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" must be an object.`);
  assertOnlyKeys(value, ['names', 'allowElements'], OPTION_NAME);
  const names = value['names'] === undefined ? DEFAULT_PROP_NAMES : readRequiredStrings(value, 'names', OPTION_NAME);
  const allowElements = value['allowElements'] === undefined ? [] : readRequiredStrings(value, 'allowElements', OPTION_NAME);

  return { names: new Set(names), allowElements: new Set(allowElements) };
}

/**
 * Whether an expression is data that survives serialisation whatever it is bound to: a literal (not a regular expression), a template literal or object or array of such data, `undefined`, a unary expression, which always yields a primitive whatever its operand is (`-x`, `!x`, `typeof x`), or a JSX element, which React serialises as an element. A type assertion around one changes nothing at runtime. Anything else (an identifier, a member access, a call, a function, a class, a spread, or an object member whose value is a function, which a method, getter and setter all are) might be a function or component reference, so it is not data.
 */
export function isSerialisableData(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Literal) return !('regex' in node);
  if (node.type === AST_NODE_TYPES.JSXElement || node.type === AST_NODE_TYPES.JSXFragment) return true;
  if (node.type === AST_NODE_TYPES.Identifier) return node.name === 'undefined';
  if (node.type === AST_NODE_TYPES.TemplateLiteral) return node.expressions.every(isSerialisableData);
  if (node.type === AST_NODE_TYPES.UnaryExpression) return true;
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return node.elements.every((element) => element === null || (element.type !== AST_NODE_TYPES.SpreadElement && isSerialisableData(element)));
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return node.properties.every((property) => property.type === AST_NODE_TYPES.Property && (!property.computed || isSerialisableData(property.key)) && isSerialisableData(property.value));
  }
  if (isTypeOnlyWrapper(node) || node.type === AST_NODE_TYPES.TSNonNullExpression) return isSerialisableData(node.expression);

  return false;
}

type MessageIds = 'nonSerialisable';

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

function elementName(sourceCode: Readonly<TSESLint.SourceCode>, attribute: TSESTree.JSXAttribute): string {
  const opening = attribute.parent;

  return sourceCode.getText(opening.name);
}

/**
 * In a file without a top-level `"use client"` directive, requires the configured props (default `component`) to be serialisable data. Props a server component passes to a client component cross the server/client boundary and must be serialisable; a function or component reference is not, and the mistake surfaces only at runtime in a production build. The check is syntactic and deliberately over-broad: it cannot tell whether the receiving element is a client component, so a target known to be a server component is listed in `allowElements`, and a file that is only ever imported by client code should carry the directive. Needs no type information.
 */
const noNonSerialisableServerProp = createRule<[unknown], MessageIds>({
  name: 'no-non-serialisable-server-prop',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require the configured props of JSX elements in a file without "use client" to be serialisable data, since a function or component reference cannot cross the server component boundary.',
    },
    schema: [noNonSerialisableServerPropSchema],
    messages: {
      nonSerialisable:
        'The "{{ name }}" prop of <{{ element }}> is not serialisable data. In a file without "use client" a function or component reference cannot be serialised across the server component boundary. Pass a string key or an element instead, or add "use client" if this file only runs on the client.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const { names, allowElements } = readNoNonSerialisableServerPropOptions(options);
    const { sourceCode } = context;
    if (!isEstreeSource(sourceCode) || hasUseClientDirective(sourceCode.ast)) return {};

    return {
      JSXAttribute(node) {
        if (node.name.type !== AST_NODE_TYPES.JSXIdentifier || !names.has(node.name.name)) return;
        if (node.value?.type !== AST_NODE_TYPES.JSXExpressionContainer || node.value.expression.type === AST_NODE_TYPES.JSXEmptyExpression) return;
        if (isSerialisableData(node.value.expression)) return;
        const element = elementName(sourceCode, node);
        if (allowElements.has(element)) return;
        context.report({ node: node.value, messageId: 'nonSerialisable', data: { name: node.name.name, element } });
      },
    };
  },
});

export default noNonSerialisableServerProp;
