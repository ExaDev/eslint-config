import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { unwrapTypeOnly } from './type-only-wrapper';

/**
 * What a property lookup on a config object literal can say. `absent` means the key is spelled nowhere and nothing in the object could supply it; `opaque` means it might exist but is not visible in the source (a spread, or a computed key that is not a string literal, that comes after the last explicit spelling); `present` carries the property that decides the value.
 */
export type PropertyLookup =
  | { readonly kind: 'absent' }
  | { readonly kind: 'opaque' }
  | { readonly kind: 'present'; readonly property: TSESTree.Property; readonly value: TSESTree.Node };

/**
 * A value that is known from the source alone: a boolean, number, string, `null` or `undefined` written out. Anything computed is `{ known: false }`.
 */
export type StaticLiteral = { readonly known: true; readonly value: boolean | number | string | null | undefined } | { readonly known: false };

/**
 * The arguments of one call to a config helper, in order, which the helper merges with later arguments overriding earlier ones. A member is the object literal an argument stands for, or `undefined` for an argument whose value is not visible in the source (an import, a call, a spread, or anything that stands for more than one object). A configuration that is not a helper call is a group of its one object literal.
 */
export type ConfigGroup = readonly (TSESTree.ObjectExpression | undefined)[];

/**
 * A read-only view of one config file's top-level structure, answering only what the source states. A rule built on it stays silent about everything else, because a value produced by a call, a spread or an import cannot be judged without running the file.
 */
export interface StaticConfig {
  /**
   * The expression `node` stands for once type-only wrappers are removed and an identifier naming a top-level `const` is replaced by its initialiser, repeatedly. Returns the node itself when it is neither.
   */
  readonly resolve: (node: TSESTree.Node) => TSESTree.Node;
  /**
   * Every object literal that is a candidate config in the file's default export (`export default`, `export =` or `module.exports =`): the literal itself, the elements of an array, the arguments of a call to one of `helpers` (`defineConfig`, `mergeConfig`), the returned value of a function, and either branch of a conditional. A call to any other function contributes nothing, because its result is not visible.
   */
  readonly configObjects: (helpers: ReadonlySet<string>) => readonly TSESTree.ObjectExpression[];
  /**
   * The same candidates as `configObjects`, grouped by the helper call that merges them, so a rule can judge what the merged configuration sets instead of each literal alone.
   */
  readonly configGroups: (helpers: ReadonlySet<string>) => readonly ConfigGroup[];
  /**
   * Looks `name` up in the configuration `group` merges to: the last member that spells it decides, and a member that is not visible after the last spelling makes the answer `opaque`, since it may override the value or supply it.
   */
  readonly lookupGroup: (group: ConfigGroup, name: string) => PropertyLookup;
  /**
   * The object literals `node` stands for, followed the same way as `configObjects` follows the default export.
   */
  readonly objectsOf: (node: TSESTree.Node, helpers: ReadonlySet<string>) => readonly TSESTree.ObjectExpression[];
  /**
   * Looks `name` up in `object`, honouring that a later spread or non-literal computed key may override an earlier spelling.
   */
  readonly lookup: (object: TSESTree.ObjectExpression, name: string) => PropertyLookup;
  /**
   * The literal a node stands for, or `{ known: false }`.
   */
  readonly literal: (node: TSESTree.Node) => StaticLiteral;
  /**
   * The property `name` of `object` together with the literal it is set to, or `undefined` when the key is absent or not visible.
   */
  readonly literalProperty: (object: TSESTree.ObjectExpression, name: string) => { readonly property: TSESTree.Property; readonly value: StaticLiteral } | undefined;
}

function topLevelConstants(program: TSESTree.Program): ReadonlyMap<string, TSESTree.Node> {
  const constants = new Map<string, TSESTree.Node>();
  for (const statement of program.body) {
    const declaration = statement.type === AST_NODE_TYPES.ExportNamedDeclaration ? statement.declaration : statement;
    if (declaration?.type !== AST_NODE_TYPES.VariableDeclaration || declaration.kind !== 'const') continue;
    for (const declarator of declaration.declarations) {
      if (declarator.id.type === AST_NODE_TYPES.Identifier && declarator.init !== null) constants.set(declarator.id.name, declarator.init);
    }
  }

  return constants;
}

function calleeName(callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) return callee.name;
  if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed && callee.property.type === AST_NODE_TYPES.Identifier) return callee.property.name;

  return undefined;
}

/**
 * The statically known name of a property key: an identifier or string literal key, or a computed key that is a string literal or an untagged template without substitutions. `undefined` for any key that is computed at run time.
 */
function keyName(property: TSESTree.Property): string | undefined {
  const { key } = property;
  if (!property.computed && key.type === AST_NODE_TYPES.Identifier) return key.name;
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') return key.value;
  if (key.type === AST_NODE_TYPES.TemplateLiteral && key.expressions.length === 0) return key.quasis.map((quasi) => quasi.value.cooked).join('');

  return undefined;
}

function returnedExpressions(statements: readonly TSESTree.Node[]): readonly TSESTree.Node[] {
  return statements.flatMap((statement) => {
    if (statement.type === AST_NODE_TYPES.ReturnStatement) return statement.argument === null ? [] : [statement.argument];
    if (statement.type === AST_NODE_TYPES.BlockStatement) return returnedExpressions(statement.body);
    if (statement.type === AST_NODE_TYPES.IfStatement) return returnedExpressions([statement.consequent, ...(statement.alternate === null ? [] : [statement.alternate])]);

    return [];
  });
}

function isFunctionNode(node: TSESTree.Node): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration {
  return node.type === AST_NODE_TYPES.ArrowFunctionExpression || node.type === AST_NODE_TYPES.FunctionExpression || node.type === AST_NODE_TYPES.FunctionDeclaration;
}

/**
 * Builds the static view of a parsed config file. Identifier resolution and the default-export search look only at top-level statements: a binding inside a function body is not followed, and a `let`, a parameter or an import is never resolved, since any of them may hold something other than what the file spells out.
 */
export function createStaticConfig(program: TSESTree.Program): StaticConfig {
  const constants = topLevelConstants(program);

  function resolve(node: TSESTree.Node): TSESTree.Node {
    const seen = new Set<TSESTree.Node>();
    let current = unwrapTypeOnly(node);
    while (current.type === AST_NODE_TYPES.Identifier && !seen.has(current)) {
      seen.add(current);
      const initialiser = constants.get(current.name);
      if (initialiser === undefined) break;
      current = unwrapTypeOnly(initialiser);
    }

    return current;
  }

  function groupsOf(node: TSESTree.Node, helpers: ReadonlySet<string>, visited: Set<TSESTree.Node>): readonly ConfigGroup[] {
    const target = resolve(node);
    if (visited.has(target)) return [];
    visited.add(target);
    const follow = (next: TSESTree.Node): readonly ConfigGroup[] => groupsOf(next, helpers, visited);

    if (target.type === AST_NODE_TYPES.ObjectExpression) return [[target]];
    if (target.type === AST_NODE_TYPES.ArrayExpression) {
      return target.elements.flatMap((element) => (element === null || element.type === AST_NODE_TYPES.SpreadElement ? [] : follow(element)));
    }
    if (target.type === AST_NODE_TYPES.ConditionalExpression) return [...follow(target.consequent), ...follow(target.alternate)];
    if (target.type === AST_NODE_TYPES.AwaitExpression) return follow(target.argument);
    if (target.type === AST_NODE_TYPES.CallExpression) {
      const name = calleeName(target.callee);
      if (name === undefined || !helpers.has(name)) return [];

      // An argument that stands for alternatives (a conditional, several returns) multiplies the groups: each combination is one possible merged configuration.
      return target.arguments.reduce<readonly ConfigGroup[]>(
        (combined, argument) => {
          const alternatives: readonly ConfigGroup[] = argument.type === AST_NODE_TYPES.SpreadElement ? [] : follow(argument);
          const options: readonly ConfigGroup[] = alternatives.length === 0 ? [[undefined]] : alternatives;

          return combined.flatMap((prefix) => options.map((option): ConfigGroup => [...prefix, ...option]));
        },
        [[]],
      );
    }
    if (!isFunctionNode(target)) return [];
    if (target.body.type !== AST_NODE_TYPES.BlockStatement) return follow(target.body);

    return returnedExpressions(target.body.body).flatMap(follow);
  }

  function objectsOf(node: TSESTree.Node, helpers: ReadonlySet<string>, visited: Set<TSESTree.Node>): readonly TSESTree.ObjectExpression[] {
    const objects = new Set(groupsOf(node, helpers, visited).flatMap((group) => group.flatMap((member) => (member === undefined ? [] : [member]))));

    return [...objects];
  }

  function defaultExports(): readonly TSESTree.Node[] {
    return program.body.flatMap((statement): readonly TSESTree.Node[] => {
      if (statement.type === AST_NODE_TYPES.ExportDefaultDeclaration) return [statement.declaration];
      if (statement.type === AST_NODE_TYPES.TSExportAssignment) return [statement.expression];
      if (statement.type !== AST_NODE_TYPES.ExpressionStatement || statement.expression.type !== AST_NODE_TYPES.AssignmentExpression) return [];
      const { left, operator, right } = statement.expression;
      const isModuleExports =
        left.type === AST_NODE_TYPES.MemberExpression &&
        !left.computed &&
        left.object.type === AST_NODE_TYPES.Identifier &&
        left.object.name === 'module' &&
        left.property.type === AST_NODE_TYPES.Identifier &&
        left.property.name === 'exports';

      return operator === '=' && isModuleExports ? [right] : [];
    });
  }

  function lookup(object: TSESTree.ObjectExpression, name: string): PropertyLookup {
    let match: { readonly index: number; readonly property: TSESTree.Property } | undefined;
    let lastUnknownIndex = -1;
    for (const [index, member] of object.properties.entries()) {
      const memberName = member.type === AST_NODE_TYPES.SpreadElement ? undefined : keyName(member);
      if (member.type === AST_NODE_TYPES.SpreadElement || memberName === undefined) lastUnknownIndex = index;
      else if (memberName === name) match = { index, property: member };
    }
    if (match === undefined) return lastUnknownIndex === -1 ? { kind: 'absent' } : { kind: 'opaque' };
    if (lastUnknownIndex > match.index) return { kind: 'opaque' };

    return { kind: 'present', property: match.property, value: match.property.value };
  }

  function lookupGroup(group: ConfigGroup, name: string): PropertyLookup {
    for (const member of group.toReversed()) {
      if (member === undefined) return { kind: 'opaque' };
      const found = lookup(member, name);
      if (found.kind !== 'absent') return found;
    }

    return { kind: 'absent' };
  }

  function literal(node: TSESTree.Node): StaticLiteral {
    const target = resolve(node);
    if (target.type === AST_NODE_TYPES.Literal) {
      const { value } = target;
      if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' || value === null) return { known: true, value };

      return { known: false };
    }
    if (target.type === AST_NODE_TYPES.Identifier && target.name === 'undefined') return { known: true, value: undefined };
    if (target.type === AST_NODE_TYPES.TemplateLiteral && target.expressions.length === 0) {
      return { known: true, value: target.quasis.map((quasi) => quasi.value.cooked).join('') };
    }
    if (target.type === AST_NODE_TYPES.UnaryExpression && (target.operator === '-' || target.operator === '+')) {
      const operand = literal(target.argument);
      if (operand.known && typeof operand.value === 'number') return { known: true, value: target.operator === '-' ? -operand.value : operand.value };
    }

    return { known: false };
  }

  function literalProperty(object: TSESTree.ObjectExpression, name: string): { readonly property: TSESTree.Property; readonly value: StaticLiteral } | undefined {
    const found = lookup(object, name);

    return found.kind === 'present' ? { property: found.property, value: literal(found.value) } : undefined;
  }

  return {
    resolve,
    configObjects: (helpers) => {
      const visited = new Set<TSESTree.Node>();

      return defaultExports().flatMap((exported) => objectsOf(exported, helpers, visited));
    },
    configGroups: (helpers) => {
      const visited = new Set<TSESTree.Node>();

      return defaultExports().flatMap((exported) => groupsOf(exported, helpers, visited));
    },
    lookupGroup,
    objectsOf: (node, helpers) => objectsOf(node, helpers, new Set()),
    lookup,
    literal,
    literalProperty,
  };
}
