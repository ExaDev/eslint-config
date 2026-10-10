import { AST_NODE_TYPES, ASTUtils, ESLintUtils, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
import { isRecord } from '../is-record';
import { assertOnlyKeys, readRequiredStrings, readSpecifierPatterns } from './file-entry';
import { isEstreeSource } from './estree-source';
import { createSpecifierMatcher, isRelativeSpecifier, type SpecifierMatcher } from './specifier-match';
import { hasUseClientDirective } from './use-client-directive';

const OPTION_NAME = 'no-external-member-jsx-tag';

/**
 * The options of `exadev/no-external-member-jsx-tag`.
 */
export interface NoExternalMemberJsxTagOptions {
  // Import specifiers, in the form `import-policy` reads (minimatch globs; each also selects everything beneath it), whose member tags are not reported: packages known to attach nothing that fails to cross the boundary.
  readonly allowSources?: readonly string[];
  // Tags as written (`Lib.Icon`, `Ctx.Provider`) that are not reported.
  readonly allowTags?: readonly string[];
}

/**
 * The rule's option schema. `readNoExternalMemberJsxTagOptions` adds the checks a schema cannot express.
 */
export const noExternalMemberJsxTagSchema: JSONSchema4 = {
  type: 'object',
  properties: {
    allowSources: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
    allowTags: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
  },
  additionalProperties: false,
};

interface ReadOptions {
  readonly allowSource: SpecifierMatcher | undefined;
  readonly allowTags: ReadonlySet<string>;
}

/**
 * Validates the options and compiles `allowSources`. Throws naming the option for anything the schema lets through that the rule cannot use.
 */
export function readNoExternalMemberJsxTagOptions(value: unknown): ReadOptions {
  if (!isRecord(value)) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" must be an object.`);
  assertOnlyKeys(value, ['allowSources', 'allowTags'], OPTION_NAME);
  const allowSources = value['allowSources'] === undefined ? undefined : readSpecifierPatterns(value, 'allowSources', OPTION_NAME);
  const allowTags = value['allowTags'] === undefined ? [] : readRequiredStrings(value, 'allowTags', OPTION_NAME);

  return { allowSource: allowSources === undefined ? undefined : createSpecifierMatcher(allowSources), allowTags: new Set(allowTags) };
}

/**
 * The leftmost identifier of a member tag: `Lib` for `<Lib.Icons.Home>`. `undefined` for a namespaced root, which the JSX grammar does not allow in a member tag.
 */
function rootOf(name: TSESTree.JSXMemberExpression): TSESTree.JSXIdentifier | undefined {
  if (name.object.type === AST_NODE_TYPES.JSXMemberExpression) return rootOf(name.object);

  return name.object.type === AST_NODE_TYPES.JSXIdentifier ? name.object : undefined;
}

/**
 * The module specifier an import binding comes from: the source of an `import` declaration, or the string of `import Lib = require('lib')`. `undefined` for `import Lib = Namespace.Member`, which names a local binding.
 */
function importSource(declaration: TSESTree.ImportDeclaration | TSESTree.TSImportEqualsDeclaration): string | undefined {
  if (declaration.type === AST_NODE_TYPES.ImportDeclaration) return declaration.source.value;
  const reference = declaration.moduleReference;
  if (reference.type !== AST_NODE_TYPES.TSExternalModuleReference) return undefined;

  return reference.expression.value;
}

type MessageIds = 'externalMemberTag';

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

/**
 * In a file without a top-level `"use client"` directive, reports every member tag (`<Lib.Icon>`) whose root identifier is an import from a non-relative source. A component reached as a property of an imported namespace or object may rely on statics attached after export, and those do not survive the server/client boundary; whether a given library does so cannot be worked out from one file, so the rule is deliberately over-broad. A source known to be safe is listed in `allowSources`, a single tag in `allowTags`, and a file that is only ever imported by client code should carry the directive. A relative import is the project's own code and is not reported. Needs no type information.
 */
const noExternalMemberJsxTag = createRule<[unknown], MessageIds>({
  name: 'no-external-member-jsx-tag',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow a member JSX tag rooted at an import from a package in a file without "use client", whose statics may not survive the server component boundary.',
    },
    schema: [noExternalMemberJsxTagSchema],
    messages: {
      externalMemberTag:
        '<{{ tag }}> is a property of "{{ root }}", imported from "{{ source }}". In a file without "use client" a component reached this way may depend on statics that do not survive the server component boundary. Import the component by name from a module marked "use client", or add "use client" if this file only runs on the client.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const { allowSource, allowTags } = readNoExternalMemberJsxTagOptions(options);
    const { sourceCode } = context;
    if (!isEstreeSource(sourceCode) || hasUseClientDirective(sourceCode.ast)) return {};

    return {
      JSXOpeningElement(node) {
        if (node.name.type !== AST_NODE_TYPES.JSXMemberExpression) return;
        const tag = sourceCode.getText(node.name);
        if (allowTags.has(tag)) return;
        const root = rootOf(node.name);
        if (root === undefined) return;
        const definition = ASTUtils.findVariable(sourceCode.getScope(node), root.name)?.defs[0];
        if (definition?.type !== TSESLint.Scope.DefinitionType.ImportBinding) return;
        const source = importSource(definition.parent);
        if (source === undefined || isRelativeSpecifier(source) || allowSource?.(source, context.filename, context.cwd) === true) return;
        context.report({ node: node.name, messageId: 'externalMemberTag', data: { tag, root: root.name, source } });
      },
    };
  },
});

export default noExternalMemberJsxTag;
