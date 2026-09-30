import { AST_NODE_TYPES, ESLintUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { assertOnlyKeys, createEntryScope, entryFilesSchema, readEntryFiles, readEntryRecords, readRequiredStrings } from './file-entry';
import { createSpecifierMatcher } from './specifier-match';

const OPTION_NAME = 'exadev/required-imports';

/**
 * One entry of the rule's option list: files whose path matches `files` must import at least one binding from a module whose specifier matches `from`, and with `call` must also call it.
 */
export interface RequiredImportsEntry {
  readonly files: string | readonly string[];
  readonly from: string | readonly string[];
  readonly call?: boolean;
}

export interface ReadEntry {
  readonly inScope: ReturnType<typeof createEntryScope>;
  readonly fromMatcher: ReturnType<typeof createSpecifierMatcher>;
  readonly from: readonly string[];
  readonly call: boolean;
}

function readFrom(entry: Readonly<Record<string, unknown>>): readonly string[] {
  const { from } = entry;

  return readRequiredStrings({ from: typeof from === 'string' ? [from] : from }, 'from', OPTION_NAME);
}

/**
 * Validates the rule's option list, compiling each entry's scope and specifier matcher. Throws naming the offending field.
 */
export function readRequiredImportsEntries(value: unknown): readonly ReadEntry[] {
  return readEntryRecords(value, OPTION_NAME).map((entry) => {
    assertOnlyKeys(entry, ['files', 'from', 'call'], OPTION_NAME);
    const from = readFrom(entry);
    const { call = false } = entry;
    if (typeof call !== 'boolean') throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" needs "call" to be a boolean.`);

    return { inScope: createEntryScope(readEntryFiles(entry['files'], `${OPTION_NAME}.files`)), fromMatcher: createSpecifierMatcher(from), from, call };
  });
}

/**
 * Whether the identifier is invoked: as the callee of a call (`kit()`), a construction (`new Kit()`) or the tag of a tagged template, directly or through property access (`kit.run()`, for a namespace or default import that is an object) and non-null assertions (`kit!()`). Only the identifier's own invocation counts; passing it as an argument does not.
 */
function isCalled(identifier: TSESTree.Node): boolean {
  let current: TSESTree.Node = identifier;
  while (current.parent !== undefined) {
    const { parent } = current;
    const isMemberObject = parent.type === AST_NODE_TYPES.MemberExpression && parent.object === current;
    if (!isMemberObject && parent.type !== AST_NODE_TYPES.TSNonNullExpression) break;
    current = parent;
  }
  const { parent } = current;
  if (parent === undefined) return false;
  if (parent.type === AST_NODE_TYPES.CallExpression || parent.type === AST_NODE_TYPES.NewExpression) return parent.callee === current;

  return parent.type === AST_NODE_TYPES.TaggedTemplateExpression && parent.tag === current;
}

function isTypeOnly(declaration: TSESTree.ImportDeclaration): boolean {
  return declaration.importKind === 'type' || (declaration.specifiers.length > 0 && declaration.specifiers.every((specifier) => specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.importKind === 'type'));
}

/**
 * Whether the declaration binds a runtime value and, when `call` is set, calls one of its bindings. A side-effect import (`import 'x'`) binds nothing and a type-only import is erased, so neither is an import of the module in this rule's sense.
 */
function satisfies(declaration: TSESTree.ImportDeclaration, call: boolean, sourceCode: Readonly<TSESLint.SourceCode>): boolean {
  if (declaration.specifiers.length === 0 || isTypeOnly(declaration)) return false;
  if (!call) return true;

  return sourceCode
    .getDeclaredVariables(declaration)
    .some((variable) => variable.references.some((reference) => isCalled(reference.identifier)));
}

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

const requiredImports = createRule<[unknown], 'missingImport' | 'missingCall'>({
  name: 'required-imports',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require files matching a glob to import, and optionally call, a module matching the configured specifier pattern.',
    },
    schema: [
      {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            files: entryFilesSchema,
            from: entryFilesSchema,
            call: { type: 'boolean' },
          },
          required: ['files', 'from'],
          additionalProperties: false,
        },
      },
    ],
    messages: {
      missingImport: 'This file must import a binding from a module matching: {{ from }}.',
      missingCall: 'This file imports from a module matching {{ from }} but never calls it.',
    },
  },
  defaultOptions: [[]],
  create(context, [options]) {
    const entries = readRequiredImportsEntries(options).filter((entry) => entry.inScope(context.filename, context.cwd));
    if (entries.length === 0) return {};

    return {
      Program(node) {
        for (const entry of entries) {
          const matching = node.body.filter(
            (statement): statement is TSESTree.ImportDeclaration =>
              statement.type === AST_NODE_TYPES.ImportDeclaration && entry.fromMatcher(statement.source.value, context.filename, context.cwd),
          );
          const from = entry.from.join(', ');
          if (!matching.some((declaration) => satisfies(declaration, false, context.sourceCode))) {
            context.report({ node, messageId: 'missingImport', data: { from } });
          } else if (entry.call && !matching.some((declaration) => satisfies(declaration, true, context.sourceCode))) {
            context.report({ node, messageId: 'missingCall', data: { from } });
          }
        }
      },
    };
  },
});

export default requiredImports;
