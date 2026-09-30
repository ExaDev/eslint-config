import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { assertOnlyKeys, createEntryScope, entryFilesSchema, readEntryFiles, readEntryRecords, readRequiredStrings } from './file-entry';

const OPTION_NAME = 'exadev/required-exports';

/**
 * One entry of the rule's option list: files whose path matches `files` must export every name in `exports`.
 */
export interface RequiredExportsEntry {
  readonly files: string | readonly string[];
  readonly exports: readonly string[];
}

export interface ReadEntry {
  readonly inScope: ReturnType<typeof createEntryScope>;
  readonly exports: readonly string[];
}

/**
 * Validates the rule's option list, compiling each entry's scope. Throws naming the offending field, for the misspelt key, empty or duplicated export list, or missing `files` that the JSON schema alone cannot phrase usefully.
 */
export function readRequiredExportsEntries(value: unknown): readonly ReadEntry[] {
  return readEntryRecords(value, OPTION_NAME).map((entry) => {
    assertOnlyKeys(entry, ['files', 'exports'], OPTION_NAME);

    return { inScope: createEntryScope(readEntryFiles(entry['files'], `${OPTION_NAME}.files`)), exports: readRequiredStrings(entry, 'exports', OPTION_NAME) };
  });
}

function moduleExportName(name: TSESTree.Identifier | TSESTree.StringLiteral): string {
  return name.type === AST_NODE_TYPES.Identifier ? name.name : name.value;
}

function collectBoundNames(pattern: TSESTree.Node, names: Set<string>): void {
  if (pattern.type === AST_NODE_TYPES.Identifier) {
    names.add(pattern.name);

    return;
  }
  if (pattern.type === AST_NODE_TYPES.ObjectPattern) {
    for (const property of pattern.properties) collectBoundNames(property.type === AST_NODE_TYPES.Property ? property.value : property, names);

    return;
  }
  if (pattern.type === AST_NODE_TYPES.ArrayPattern) {
    for (const element of pattern.elements) if (element !== null) collectBoundNames(element, names);

    return;
  }
  if (pattern.type === AST_NODE_TYPES.AssignmentPattern) {
    collectBoundNames(pattern.left, names);

    return;
  }
  if (pattern.type === AST_NODE_TYPES.RestElement) collectBoundNames(pattern.argument, names);
}

function collectDeclarationNames(declaration: TSESTree.NamedExportDeclarations, names: Set<string>): void {
  if (declaration.type === AST_NODE_TYPES.VariableDeclaration) {
    for (const declarator of declaration.declarations) collectBoundNames(declarator.id, names);

    return;
  }
  if (declaration.type === AST_NODE_TYPES.TSModuleDeclaration) {
    // `declare module 'x'` and `declare global` do not export a name; `namespace A.B` exports `A`.
    if (declaration.id.type === AST_NODE_TYPES.Identifier) names.add(declaration.id.name);

    return;
  }
  if (declaration.type === AST_NODE_TYPES.ClassDeclaration || declaration.type === AST_NODE_TYPES.FunctionDeclaration || declaration.type === AST_NODE_TYPES.TSDeclareFunction) {
    if (declaration.id !== null) names.add(declaration.id.name);

    return;
  }
  names.add(declaration.id.name);
}

/**
 * The names a module exports, read from its top-level export statements without type information: `export const`, function, class, enum, interface, type and namespace declarations (destructuring included), `export { a, b as c }` with or without a `from`, `export * as ns from`, and `export default` as `default`. A bare `export * from` contributes nothing, because the names it forwards live in another file this rule does not read.
 */
export function collectExportedNames(program: TSESTree.Program): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of program.body) {
    if (statement.type === AST_NODE_TYPES.ExportDefaultDeclaration) names.add('default');
    else if (statement.type === AST_NODE_TYPES.ExportAllDeclaration) {
      if (statement.exported !== null) names.add(moduleExportName(statement.exported));
    } else if (statement.type === AST_NODE_TYPES.ExportNamedDeclaration) {
      if (statement.declaration !== null) collectDeclarationNames(statement.declaration, names);
      for (const specifier of statement.specifiers) names.add(moduleExportName(specifier.exported));
    }
  }

  return names;
}

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

const requiredExports = createRule<[unknown], 'missingExports'>({
  name: 'required-exports',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require files matching a glob to export the configured names.',
    },
    schema: [
      {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            files: entryFilesSchema,
            exports: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, uniqueItems: true },
          },
          required: ['files', 'exports'],
          additionalProperties: false,
        },
      },
    ],
    messages: {
      missingExports: 'This file must export: {{ names }}.',
    },
  },
  defaultOptions: [[]],
  create(context, [options]) {
    const required = readRequiredExportsEntries(options)
      .filter((entry) => entry.inScope(context.filename, context.cwd))
      .flatMap((entry) => entry.exports);
    if (required.length === 0) return {};

    return {
      Program(node) {
        const exported = collectExportedNames(node);
        const missing = [...new Set(required)].filter((name) => !exported.has(name));
        if (missing.length === 0) return;
        context.report({ node, messageId: 'missingExports', data: { names: missing.join(', ') } });
      },
    };
  },
});

export default requiredExports;
