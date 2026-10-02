import { AST_NODE_TYPES, ESLintUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { createFileScope, relativeToCwd, type FileScope } from './file-scope';
import { importPoliciesSchema, readImportPolicies, type ImportDeny, type ImportPolicy } from './import-policy-options';
import { createSpecifierMatcher, type SpecifierMatcher } from './specifier-match';

/**
 * One place a module is pulled in, whatever the syntax. `names` are the imported binding names (`default` for a default import, `*` for the whole module, which a namespace import, dynamic import, `require`, `export *` and a type query all take), empty for a side-effect import.
 */
export interface ModuleReference {
  readonly node: TSESTree.Node;
  readonly specifier: string;
  readonly names: readonly string[];
  // Erased at compile time: `import type`, `export type ... from`, a specifier list whose every entry is inline `type`, and a type query.
  readonly typeOnly: boolean;
}

function moduleName(name: TSESTree.Identifier | TSESTree.StringLiteral): string {
  return name.type === AST_NODE_TYPES.Identifier ? name.name : name.value;
}

function staticString(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') return node.value;
  if (node.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? undefined;

  return undefined;
}

function importedName(specifier: TSESTree.ImportClause): string {
  if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) return 'default';
  if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) return '*';

  return moduleName(specifier.imported);
}

function isInlineTypeOnly(kinds: readonly (string | undefined)[]): boolean {
  return kinds.length > 0 && kinds.every((kind) => kind === 'type');
}

function importReference(node: TSESTree.ImportDeclaration): ModuleReference {
  const inlineKinds = node.specifiers.map((specifier) => (specifier.type === AST_NODE_TYPES.ImportSpecifier ? specifier.importKind : undefined));

  return { node, specifier: node.source.value, names: node.specifiers.map(importedName), typeOnly: node.importKind === 'type' || isInlineTypeOnly(inlineKinds) };
}

function reexportReference(node: TSESTree.ExportNamedDeclaration, specifier: string): ModuleReference {
  return {
    node,
    specifier,
    names: node.specifiers.map((exported) => moduleName(exported.local)),
    typeOnly: node.exportKind === 'type' || isInlineTypeOnly(node.specifiers.map((exported) => exported.exportKind)),
  };
}

function wholeModule(node: TSESTree.Node, specifier: string | undefined, typeOnly: boolean): ModuleReference | undefined {
  return specifier === undefined ? undefined : { node, specifier, names: ['*'], typeOnly };
}

/**
 * The module reference a declaration or expression makes, or `undefined` when the node is not one or its specifier is not a static string (a computed `import(name)` cannot be judged syntactically). Covers `import`, `export ... from`, `export * from`, `import x = require()`, dynamic `import()`, `require()` and `import("x")` type queries. `isRequireGlobal` says whether `require` at that call is the module-system global rather than a local binding.
 */
export function moduleReferenceOf(node: TSESTree.Node, isRequireGlobal: (call: TSESTree.CallExpression) => boolean): ModuleReference | undefined {
  if (node.type === AST_NODE_TYPES.ImportDeclaration) return importReference(node);
  if (node.type === AST_NODE_TYPES.ExportNamedDeclaration) return node.source === null ? undefined : reexportReference(node, node.source.value);
  if (node.type === AST_NODE_TYPES.ExportAllDeclaration) return wholeModule(node, node.source.value, node.exportKind === 'type');
  if (node.type === AST_NODE_TYPES.TSImportEqualsDeclaration) {
    return node.moduleReference.type === AST_NODE_TYPES.TSExternalModuleReference ? wholeModule(node, staticString(node.moduleReference.expression), node.importKind === 'type') : undefined;
  }
  if (node.type === AST_NODE_TYPES.ImportExpression) return wholeModule(node, staticString(node.source), false);
  if (node.type === AST_NODE_TYPES.TSImportType) return wholeModule(node, node.source.value, true);
  const argument = requireArgument(node, isRequireGlobal);

  return argument === undefined ? undefined : wholeModule(node, staticString(argument), false);
}

// The single argument of a call to the module-system `require`, or `undefined` when the node is not one.
function requireArgument(node: TSESTree.Node, isRequireGlobal: (call: TSESTree.CallExpression) => boolean): TSESTree.CallExpressionArgument | undefined {
  if (node.type !== AST_NODE_TYPES.CallExpression) return undefined;
  const [argument] = node.arguments;
  if (node.callee.type !== AST_NODE_TYPES.Identifier || node.callee.name !== 'require' || node.arguments.length !== 1 || argument === undefined || !isRequireGlobal(node)) return undefined;

  return argument;
}

/**
 * Whether the node pulls a module in by a specifier that is not a static string, so no specifier pattern can judge it: a dynamic `import()` or a global `require()` whose argument is anything but a string literal or a substitution-free template. The static-specifier forms are `moduleReferenceOf`'s; a node is never both.
 */
export function hasComputedSpecifier(node: TSESTree.Node, isRequireGlobal: (call: TSESTree.CallExpression) => boolean): boolean {
  if (node.type === AST_NODE_TYPES.ImportExpression) return staticString(node.source) === undefined;
  const argument = requireArgument(node, isRequireGlobal);

  return argument !== undefined && staticString(argument) === undefined;
}

interface CompiledRestriction {
  readonly matches: SpecifierMatcher;
  readonly allowTypeImports: boolean;
  // Whether the reference is a violation, given the file's path; the deny and confine differences live here.
  readonly forbids: (reference: ModuleReference, relativePath: string) => boolean;
  readonly message: string;
}

interface CompiledPolicy {
  readonly inScope: FileScope;
  readonly restrictions: readonly CompiledRestriction[];
  readonly exceptEdges: readonly { readonly file: string; readonly specifier: string }[];
  readonly reportsComputed: boolean;
}

// Whether a reference takes a name the deny entry bans. A whole-module reference takes every name and carries `*`, which no allow list names and every ban list selects.
function takesBannedName(deny: ImportDeny, referenceNames: readonly string[]): boolean {
  const { importNames, allowImportNames } = deny;
  if (allowImportNames !== undefined) return referenceNames.some((name) => !allowImportNames.includes(name));
  if (importNames === undefined) return true;

  return referenceNames.includes('*') || referenceNames.some((name) => importNames.includes(name));
}

function compilePolicy(policy: ImportPolicy): CompiledPolicy {
  const deny = (policy.deny ?? []).map((entry): CompiledRestriction => {
    const { specifiers, allowTypeImports = false, message } = entry;

    return { matches: createSpecifierMatcher(specifiers), allowTypeImports, forbids: (reference) => takesBannedName(entry, reference.names), message };
  });
  const confine = (policy.confine ?? []).map(({ specifiers, onlyIn, allowTypeImports = false, message }): CompiledRestriction => {
    const allowedHere = createFileScope(onlyIn);

    return {
      matches: createSpecifierMatcher(specifiers),
      allowTypeImports,
      forbids: (_reference, relativePath) => !allowedHere(`/${relativePath}`, '/'),
      message: message ?? `it may only be imported in: ${onlyIn.join(', ')}.`,
    };
  });

  return {
    inScope: createFileScope([...policy.files, ...(policy.ignores ?? []).map((glob) => `!${glob}`)]),
    restrictions: [...deny, ...confine],
    exceptEdges: policy.exceptEdges ?? [],
    reportsComputed: policy.computedSpecifiers === 'report',
  };
}

function isShadowed(sourceCode: Readonly<TSESLint.SourceCode>, call: TSESTree.CallExpression): boolean {
  for (let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(call); scope !== null; scope = scope.upper) {
    const variable = scope.set.get('require');
    if (variable !== undefined) return variable.defs.length > 0;
  }

  return false;
}

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

const importPolicy = createRule<[unknown], 'restricted' | 'computed'>({
  name: 'import-policy',
  meta: {
    type: 'problem',
    docs: {
      description: 'Restrict which modules the files matching a glob may import: deny lists, confinement to named files, and exact exception edges.',
    },
    schema: [importPoliciesSchema],
    messages: {
      restricted: '"{{ specifier }}" cannot be imported here: {{ message }}',
      computed: 'This module specifier is computed at runtime, so the import policy for this file cannot check it. Write it as a string literal.',
    },
  },
  defaultOptions: [[]],
  create(context, [options]) {
    const { filename, cwd, sourceCode } = context;
    const policies = readImportPolicies(options)
      .map(compilePolicy)
      .filter((policy) => policy.inScope(filename, cwd));
    if (policies.length === 0) return {};
    const relativePath = relativeToCwd(filename, cwd);
    const reportsComputed = policies.some((policy) => policy.reportsComputed);
    const isRequireGlobal = (call: TSESTree.CallExpression): boolean => !isShadowed(sourceCode, call);

    const check = (node: TSESTree.Node): void => {
      if (reportsComputed && hasComputedSpecifier(node, isRequireGlobal)) {
        context.report({ node, messageId: 'computed' });

        return;
      }
      const reference = moduleReferenceOf(node, isRequireGlobal);
      if (reference === undefined) return;
      for (const policy of policies) {
        if (policy.exceptEdges.some((edge) => edge.file === relativePath && edge.specifier === reference.specifier)) continue;
        for (const restriction of policy.restrictions) {
          if (restriction.allowTypeImports && reference.typeOnly) continue;
          if (!restriction.matches(reference.specifier, filename, cwd) || !restriction.forbids(reference, relativePath)) continue;
          context.report({ node: reference.node, messageId: 'restricted', data: { specifier: reference.specifier, message: restriction.message } });
        }
      }
    };

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      TSImportEqualsDeclaration: check,
      ImportExpression: check,
      CallExpression: check,
      TSImportType: check,
    };
  },
});

export default importPolicy;
