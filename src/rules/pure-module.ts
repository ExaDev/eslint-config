import { AST_NODE_TYPES, ESLintUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { moduleReferenceOf } from './import-policy';
import { BANNED_GLOBALS, BANNED_MEMBERS, BANNED_MODULES, pureModuleSchema, readPureModuleOptions, type PureModuleOptions } from './pure-module-options';
import { createSpecifierMatcher } from './specifier-match';

type MessageIds = 'importedModule' | 'ambientGlobal' | 'nondeterministicMember' | 'clockRead' | 'asyncFunction' | 'awaitExpression' | 'forAwait';

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

const bannedModule = createSpecifierMatcher(BANNED_MODULES);
const bannedGlobals: ReadonlySet<string> = new Set(BANNED_GLOBALS);

/**
 * Whether `name` at `node` resolves to no declaration in the file: a global the environment provides (or one nothing declares at all), as opposed to a local binding, an import or a parameter of the same name. A binding the linter adds for a configured global has no definitions, so it still counts as global.
 */
function isGlobalBinding(sourceCode: Readonly<TSESLint.SourceCode>, node: TSESTree.Node, name: string): boolean {
  for (let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(node); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(name);
    if (variable !== undefined) return variable.defs.length === 0;
  }

  return true;
}

/**
 * Whether the identifier names the operand of a `typeof x` type query, which is erased and reads nothing at runtime (`typeof fetch`, `typeof process.env`).
 */
function isTypeQueryOperand(identifier: TSESTree.Node): boolean {
  let node = identifier;
  while (node.parent?.type === AST_NODE_TYPES.TSQualifiedName) node = node.parent;

  return node.parent?.type === AST_NODE_TYPES.TSTypeQuery;
}

function propertyName(node: TSESTree.MemberExpression): string | undefined {
  if (!node.computed) return node.property.type === AST_NODE_TYPES.Identifier ? node.property.name : undefined;

  return node.property.type === AST_NODE_TYPES.Literal && typeof node.property.value === 'string' ? node.property.value : undefined;
}

/**
 * `Date()` and `new Date()` with no argument read the clock; `new Date(value)` converts a value the caller supplied and is pure.
 */
function readsClock(node: TSESTree.CallExpression | TSESTree.NewExpression): boolean {
  return node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'Date' && node.arguments.length === 0;
}

/**
 * Bans, in the files it is wired onto, everything that makes a module impure: importing a Node I/O module, using an I/O or scheduling global, reading the clock or a source of randomness, and `async`/`await`. The bans are syntactic, so they see a direct read (`Math.random()`, `fetch(url)`, `globalThis.fetch`) but not one through an alias (`const { random } = Math`) or a value passed in; they keep a module from reaching for ambient state, they do not prove it is deterministic. A type-only import of a banned module is left alone, since it is erased before the module runs. Unscoped by design: which files are pure is a per-repository decision, so it is wired through a `files` glob (see the `pureModules` option of `exadevConfig`).
 */
const pureModule = createRule<[PureModuleOptions], MessageIds>({
  name: 'pure-module',
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban I/O modules, I/O and scheduling globals, clock and random reads, and async functions in a module that is meant to be a pure functional core.',
    },
    schema: [pureModuleSchema],
    messages: {
      importedModule: '"{{ specifier }}" cannot be imported in a pure module: it performs I/O or reads process state.',
      ambientGlobal: '"{{ name }}" cannot be used in a pure module: it performs I/O, schedules work or reads ambient state. Take what you need as a parameter.',
      nondeterministicMember: '"{{ name }}" cannot be used in a pure module: its result differs between calls. Take the value as a parameter.',
      clockRead: 'A pure module cannot read the clock with an argument-less Date. Take the time as a parameter.',
      asyncFunction: 'A pure module cannot declare an async function. Return the value, and let the caller do the waiting.',
      awaitExpression: 'A pure module cannot await. Return the value, and let the caller do the waiting.',
      forAwait: 'A pure module cannot iterate asynchronously. Take the values as a parameter.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const { sourceCode } = context;
    const { allowImports } = readPureModuleOptions(options);
    const allowed = allowImports === undefined ? undefined : createSpecifierMatcher(allowImports);

    const checkModule = (node: TSESTree.Node): void => {
      const reference = moduleReferenceOf(node, (call) => isGlobalBinding(sourceCode, call, 'require'));
      if (reference === undefined || reference.typeOnly) return;
      if (!bannedModule(reference.specifier, context.filename, context.cwd)) return;
      if (allowed?.(reference.specifier, context.filename, context.cwd) === true) return;
      context.report({ node: reference.node, messageId: 'importedModule', data: { specifier: reference.specifier } });
    };

    const checkFunction = (node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration | TSESTree.FunctionExpression): void => {
      if (node.async) context.report({ node, messageId: 'asyncFunction' });
    };

    const checkClock = (node: TSESTree.CallExpression | TSESTree.NewExpression): void => {
      if (readsClock(node) && isGlobalBinding(sourceCode, node, 'Date')) context.report({ node, messageId: 'clockRead' });
    };

    return {
      Program(node) {
        // A global the environment declares is a variable with no definitions and carries its references; one nothing declares has no variable at all and is left in `through`.
        const globalScope = sourceCode.getScope(node);
        const references = [...globalScope.variables.filter((variable) => variable.defs.length === 0).flatMap((variable) => variable.references), ...globalScope.through];
        for (const reference of references) {
          if (bannedGlobals.has(reference.identifier.name) && !isTypeQueryOperand(reference.identifier)) {
            context.report({ node: reference.identifier, messageId: 'ambientGlobal', data: { name: reference.identifier.name } });
          }
        }
      },
      MemberExpression(node) {
        if (node.object.type !== AST_NODE_TYPES.Identifier) return;
        const object = node.object.name;
        const property = propertyName(node);
        if (property === undefined || !isGlobalBinding(sourceCode, node, object)) return;
        if (object === 'globalThis' && bannedGlobals.has(property)) {
          context.report({ node, messageId: 'ambientGlobal', data: { name: property } });

          return;
        }
        if (BANNED_MEMBERS.some((member) => member.object === object && member.property === property)) {
          context.report({ node, messageId: 'nondeterministicMember', data: { name: `${object}.${property}` } });
        }
      },
      CallExpression(node) {
        checkModule(node);
        checkClock(node);
      },
      NewExpression: checkClock,
      ImportDeclaration: checkModule,
      ExportNamedDeclaration: checkModule,
      ExportAllDeclaration: checkModule,
      TSImportEqualsDeclaration: checkModule,
      ImportExpression: checkModule,
      ArrowFunctionExpression: checkFunction,
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      AwaitExpression(node) {
        context.report({ node, messageId: 'awaitExpression' });
      },
      ForOfStatement(node) {
        if (node.await) context.report({ node, messageId: 'forAwait' });
      },
    };
  },
});

export default pureModule;
