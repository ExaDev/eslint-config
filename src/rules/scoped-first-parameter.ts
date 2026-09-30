import { AST_NODE_TYPES, ESLintUtils, type ParserServicesWithTypeInformation, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
import type * as ts from 'typescript';
import { isRecord } from '../is-record';
import { assertOnlyKeys } from './file-entry';

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
 * The names a resolved type is declared under: its alias when it has one, and its own symbol (an interface, class or enum name). Matching either is what lets a second alias or an import rename of the same type count. A type parameter stands for its constraint, so `<S extends TenantScope>(scope: S)` resolves to `TenantScope`.
 */
function declaredNames(checker: ts.TypeChecker, type: ts.Type): readonly string[] {
  const resolved = type.isTypeParameter() ? (checker.getBaseConstraintOfType(type) ?? type) : type;

  return [resolved.aliasSymbol?.getName(), resolved.getSymbol()?.getName()].filter((name): name is string => name !== undefined);
}

function typeOfParameter(services: ParserServicesWithTypeInformation, parameter: TSESTree.Parameter): ts.Type | undefined {
  const annotation = 'typeAnnotation' in parameter ? parameter.typeAnnotation?.typeAnnotation : undefined;

  return annotation === undefined ? undefined : services.getTypeAtLocation(annotation);
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
 * Requires every method of the configured repository-like interfaces to take a scope (a tenant, an account) as its first parameter, so a call cannot be written without one. It checks the signature only: a method can accept a `TenantScope` and ignore it, so a passing run does not show that tenants are isolated. That takes conformance tests run against each implementation, which is why `required-imports` and the conformance-test presets exist. Type-aware, since the parameter's type is resolved through aliases and imports rather than read from its spelling.
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
        const type = typeOfParameter(services, first);
        if (type === undefined || !declaredNames(checker, type).includes(requiredType)) {
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
