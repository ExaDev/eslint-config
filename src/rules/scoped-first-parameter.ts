import { AST_NODE_TYPES, ESLintUtils, type ParserServicesWithTypeInformation, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
import * as ts from 'typescript';
import { isRecord } from '../is-record';
import { assertOnlyKeys } from './file-entry';
import { isEstreeSource } from './estree-source';

const OPTION_NAME = 'scoped-first-parameter';

/**
 * The options of `exadev/scoped-first-parameter`.
 */
export interface ScopedFirstParameterOptions {
  // A regular expression source tested against the name of each interface and type alias. Only the members of a matching declaration are checked.
  readonly interfaces: string;
  readonly parameter: {
    // The name the first parameter must have. Omit it to accept any name.
    readonly name?: string;
    // The name of the type the first parameter must resolve to. Matched against the declared name of the resolved type, so an import rename (`import { TenantScope as Scope }`) or a second alias (`type Scope = TenantScope`) still counts.
    readonly type: string;
  };
}

/**
 * The rule's option schema. `readScopedFirstParameterOptions` adds the checks a schema cannot express.
 */
export const scopedFirstParameterSchema: JSONSchema4 = {
  type: 'object',
  properties: {
    interfaces: { type: 'string', minLength: 1 },
    parameter: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1 }, type: { type: 'string', minLength: 1 } },
      required: ['type'],
      additionalProperties: false,
    },
  },
  required: ['interfaces', 'parameter'],
  additionalProperties: false,
};

interface CompiledOptions {
  readonly interfaces: RegExp;
  readonly name: string | undefined;
  readonly type: string;
}

/**
 * Validates the options and compiles `interfaces`. Throws naming the option for anything the schema lets through that the rule cannot use: a missing option, an unknown key, or a `interfaces` that is not a valid regular expression.
 */
export function readScopedFirstParameterOptions(value: unknown): CompiledOptions {
  const prefix = `@exadev/eslint-config: "${OPTION_NAME}"`;
  if (!isRecord(value) || typeof value['interfaces'] !== 'string' || !isRecord(value['parameter'])) {
    throw new Error(`${prefix} needs an "interfaces" regular expression and a "parameter" object with a "type".`);
  }
  assertOnlyKeys(value, ['interfaces', 'parameter'], OPTION_NAME);
  const { interfaces, parameter } = value;
  assertOnlyKeys(parameter, ['name', 'type'], `${OPTION_NAME}.parameter`);
  const { name, type } = parameter;
  if (typeof type !== 'string' || type.length === 0) throw new Error(`${prefix} needs a non-empty string "parameter.type".`);
  if (name !== undefined && (typeof name !== 'string' || name.length === 0)) throw new Error(`${prefix} needs "parameter.name" to be a non-empty string when given.`);

  return { interfaces: compilePattern(interfaces, prefix), name, type };
}

function compilePattern(source: string, prefix: string): RegExp {
  try {
    return new RegExp(source, 'u');
  } catch (error) {
    throw new Error(`${prefix} "interfaces" is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

type Member = TSESTree.TypeElement;

interface Signature {
  readonly node: TSESTree.Node;
  readonly params: readonly TSESTree.Parameter[];
  readonly name: string;
}

function memberName(sourceCode: Readonly<TSESLint.SourceCode>, member: TSESTree.TSMethodSignature | TSESTree.TSPropertySignature): string {
  if (!member.computed && member.key.type === AST_NODE_TYPES.Identifier) return member.key.name;
  if (member.key.type === AST_NODE_TYPES.Literal) return String(member.key.value);

  return sourceCode.getText(member.key);
}

/**
 * The call signature a member declares, or `undefined` for a member that is not a method: a method signature (`find(scope: S): R`), or a property whose type is a function type (`find: (scope: S) => R`, the form `@typescript-eslint/method-signature-style` prefers). A getter or setter signature and a property of any other type are not methods.
 */
function signatureOf(sourceCode: Readonly<TSESLint.SourceCode>, member: Member): Signature | undefined {
  if (member.type === AST_NODE_TYPES.TSMethodSignature) {
    return member.kind === 'method' ? { node: member, params: member.params, name: memberName(sourceCode, member) } : undefined;
  }
  if (member.type !== AST_NODE_TYPES.TSPropertySignature) return undefined;
  const annotation = member.typeAnnotation?.typeAnnotation;

  return annotation?.type === AST_NODE_TYPES.TSFunctionType ? { node: member, params: annotation.params, name: memberName(sourceCode, member) } : undefined;
}

/**
 * The members declared directly in a type alias's body: an object type literal, or the object type literals of an intersection (`type OrderStore = Base & { find(...): ... }`). Anything else (a union, a reference, a mapped type) declares no members here.
 */
function aliasMembers(annotation: TSESTree.TypeNode): readonly Member[] {
  if (annotation.type === AST_NODE_TYPES.TSTypeLiteral) return annotation.members;
  if (annotation.type === AST_NODE_TYPES.TSIntersectionType) return annotation.types.flatMap(aliasMembers);

  return [];
}

/**
 * The names a type reference is declared under, following it the way a reader would: an import alias to the declaration it renames, and a type alias whose body is itself a reference (`type Scope = TenantScope`) to the type it names. Every declaration reached contributes its own name, so both `type TenantScope = Readonly<{ id: string }>` and `type TenantId = string` are named by the alias that declares them, which the resolved type no longer records (TypeScript keeps the alias of a generic instantiation as `Readonly`, and drops the alias of a primitive). An import alias's own local name is not a declaration and contributes nothing, so renaming an unrelated type to the required name does not satisfy the rule. A type parameter contributes nothing, since its constraint is read from the resolved type.
 */
function referenceNames(checker: ts.TypeChecker, start: ts.Symbol | undefined): readonly string[] {
  const names: string[] = [];
  const seen = new Set<ts.Symbol>();
  for (let symbol = start; symbol !== undefined && !seen.has(symbol); ) {
    seen.add(symbol);
    if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
      symbol = checker.getAliasedSymbol(symbol);
    } else if ((symbol.flags & ts.SymbolFlags.TypeParameter) !== 0) {
      break;
    } else {
      names.push(symbol.getName());
      symbol = aliasTarget(checker, symbol);
    }
  }

  return names;
}

/**
 * The symbol a type alias's body names, when the body is itself a type reference (`type Scope = TenantScope`); `undefined` for any other symbol or body (`type Scope = string`, `type Scope = { ... }`).
 */
function aliasTarget(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol | undefined {
  const declaration = symbol.declarations?.find(ts.isTypeAliasDeclaration);
  if (declaration === undefined || !ts.isTypeReferenceNode(declaration.type)) return undefined;
  const { typeName } = declaration.type;

  return checker.getSymbolAtLocation(ts.isIdentifier(typeName) ? typeName : typeName.right);
}

/**
 * The names a parameter's declared type answers to: the declarations its annotation reaches (`referenceNames`), and, from the resolved type, its alias and its own symbol (an interface, class or enum name). A type parameter stands for its constraint, so `<S extends TenantScope>(scope: S)` resolves to `TenantScope`.
 */
function declaredNames(services: ParserServicesWithTypeInformation, checker: ts.TypeChecker, annotation: TSESTree.TypeNode, type: ts.Type): readonly string[] {
  const resolved = type.isTypeParameter() ? (checker.getBaseConstraintOfType(type) ?? type) : type;
  const reference = annotation.type === AST_NODE_TYPES.TSTypeReference ? annotation.typeName : undefined;
  const identifier = reference?.type === AST_NODE_TYPES.TSQualifiedName ? reference.right : reference;
  const referenced = identifier?.type === AST_NODE_TYPES.Identifier ? referenceNames(checker, services.getSymbolAtLocation(identifier)) : [];

  return [...referenced, resolved.aliasSymbol?.getName(), resolved.getSymbol()?.getName()].filter((name): name is string => name !== undefined);
}

function annotationOf(parameter: TSESTree.Parameter): TSESTree.TypeNode | undefined {
  return 'typeAnnotation' in parameter ? parameter.typeAnnotation?.typeAnnotation : undefined;
}

/**
 * The first parameter of a signature that a caller actually passes: TypeScript's `this` pseudo-parameter is not one.
 */
function firstArgumentParameter(params: readonly TSESTree.Parameter[]): TSESTree.Parameter | undefined {
  const [first, second] = params;

  return first?.type === AST_NODE_TYPES.Identifier && first.name === 'this' ? second : first;
}

type MessageIds = 'missingParameter' | 'wrongType' | 'wrongName' | 'notRequired';

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

/**
 * Requires every method of the configured repository-like interfaces to take a scope (a tenant, an account) as its first parameter, so a call cannot be written without one. It checks the signature only: a method can accept a `TenantScope` and ignore it, so a passing run does not show that tenants are isolated. Showing that takes conformance tests run against each implementation, which `required-imports` can require every implementation to wire in. Type-aware, since the parameter's type is resolved through aliases and imports rather than read from its spelling.
 */
const scopedFirstParameter = createRule<[unknown], MessageIds>({
  name: 'scoped-first-parameter',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require every method of the configured interfaces to take a scope parameter first. Checks the signature, not that the scope is used or that data is isolated.',
    },
    schema: [scopedFirstParameterSchema],
    messages: {
      missingParameter: '"{{ owner }}.{{ method }}" takes no parameters. Its first parameter must be a {{ type }}.',
      wrongType: 'The first parameter of "{{ owner }}.{{ method }}" must be a {{ type }}, not {{ actual }}.',
      wrongName: 'The first parameter of "{{ owner }}.{{ method }}" must be named "{{ name }}".',
      notRequired: 'The first parameter of "{{ owner }}.{{ method }}" must be a required, non-rest parameter, so a call cannot leave the {{ type }} out.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const { interfaces, name: requiredName, type: requiredType } = readScopedFirstParameterOptions(options);
    const { sourceCode } = context;
    if (!isEstreeSource(context.sourceCode)) return {};
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    const checkMembers = (owner: string, members: readonly Member[]): void => {
      for (const member of members) {
        const signature = signatureOf(sourceCode, member);
        if (signature === undefined) continue;
        const data = { owner, method: signature.name, type: requiredType };
        const first = firstArgumentParameter(signature.params);
        if (first === undefined) {
          context.report({ node: signature.node, messageId: 'missingParameter', data });
          continue;
        }
        if (first.type === AST_NODE_TYPES.RestElement || ('optional' in first && first.optional)) {
          context.report({ node: first, messageId: 'notRequired', data });
          continue;
        }
        const annotation = annotationOf(first);
        const type = annotation === undefined ? undefined : services.getTypeAtLocation(annotation);
        if (annotation === undefined || type === undefined || !declaredNames(services, checker, annotation, type).includes(requiredType)) {
          context.report({ node: first, messageId: 'wrongType', data: { ...data, actual: type === undefined ? 'untyped' : checker.typeToString(type) } });
          continue;
        }
        if (requiredName !== undefined && !(first.type === AST_NODE_TYPES.Identifier && first.name === requiredName)) {
          context.report({ node: first, messageId: 'wrongName', data: { ...data, name: requiredName } });
        }
      }
    };

    return {
      TSInterfaceDeclaration(node) {
        if (interfaces.test(node.id.name)) checkMembers(node.id.name, node.body.body);
      },
      TSTypeAliasDeclaration(node) {
        if (interfaces.test(node.id.name)) checkMembers(node.id.name, aliasMembers(node.typeAnnotation));
      },
    };
  },
});

export default scopedFirstParameter;
