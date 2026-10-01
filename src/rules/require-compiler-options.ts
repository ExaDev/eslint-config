import { ESLintUtils } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { isRecord } from '../is-record';
import { describeCompilerOptionValue, effectiveCompilerOption, parseRequirement, type CompilerOptionRequirement } from './compiler-option-values';
import { relativeToCwd } from './file-scope';

type MessageIds = 'differs';

const OPTION_NAME = 'exadev/require-compiler-options';

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

// A program is shared by every file it contains, so the finding belongs to the program and not to the file that happened to be linted first. The key is the program plus the required options, so the same program linted under two different rule configurations reports once for each. A WeakMap lets a program that a long-running process has replaced be collected.
const reported = new WeakMap<ts.Program, Set<string>>();

function isAcceptedValue(value: unknown): value is boolean | number | string {
  return typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string';
}

/**
 * Reads the rule's option object into one requirement per compiler option. Each value is `true`, `false`, or a non-empty list of accepted values; an enum-valued option takes its tsconfig spelling (`"es2022"`). Throws naming the option for a malformed value, an unknown compiler option, or a value the compiler would reject.
 */
export function readCompilerOptionRequirements(options: unknown): readonly CompilerOptionRequirement[] {
  if (!isRecord(options)) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" options must be an object mapping compiler option names to true, false or a list of accepted values.`);

  return Object.entries(options).map(([name, specification]) => {
    if (typeof specification === 'boolean') return parseRequirement(name, specification);
    if (Array.isArray(specification) && specification.length > 0 && specification.every(isAcceptedValue)) return parseRequirement(name, specification);

    throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" needs "${name}" to be true, false or a non-empty list of accepted values.`);
  });
}

/**
 * The requirement text for a message: `true`, `false`, or `one of es2022, esnext`.
 */
function describeRequired(requirement: CompilerOptionRequirement): string {
  return requirement.spelled.length === 1 ? requirement.spelled.join('') : `one of ${requirement.spelled.join(', ')}`;
}

const requireCompilerOptions = createRule<[unknown], MessageIds>({
  name: 'require-compiler-options',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require the effective compiler options of the program being linted, after `extends` is resolved, to have the configured values. Reports once per program and names the tsconfig it resolved.',
    },
    schema: [
      {
        type: 'object',
        additionalProperties: {
          anyOf: [{ type: 'boolean' }, { type: 'array', items: { type: ['boolean', 'number', 'string'] }, minItems: 1, uniqueItems: true }],
        },
      },
    ],
    messages: {
      differs: 'The effective compiler options of {{ tsconfig }} differ from the required ones: {{ differences }}. This is the configuration ESLint type-checks against, so it must also be the one the build uses for the check to mean anything.',
    },
    defaultOptions: [{}],
  },
  create(context, [options]) {
    const requirements = readCompilerOptionRequirements(options);
    if (requirements.length === 0) return {};
    const { program } = ESLintUtils.getParserServices(context);
    const signature = JSON.stringify(requirements.map((requirement) => [requirement.name, requirement.spelled]));

    return {
      Program(node) {
        const claimed = reported.get(program) ?? new Set<string>();
        reported.set(program, claimed);
        if (claimed.has(signature)) return;
        claimed.add(signature);

        const compilerOptions = program.getCompilerOptions();
        const differences = requirements.flatMap((requirement) => {
          const actual = effectiveCompilerOption(compilerOptions, requirement.name);
          if (requirement.accepted.includes(actual)) return [];

          return [`${requirement.name} is ${describeCompilerOptionValue(requirement.name, actual)}, required ${describeRequired(requirement)}`];
        });
        if (differences.length === 0) return;

        const configFilePath = compilerOptions['configFilePath'];
        const tsconfig = typeof configFilePath === 'string' ? relativeToCwd(configFilePath, context.cwd) : 'the default project';
        context.report({ loc: { line: node.loc.start.line, column: node.loc.start.column }, messageId: 'differs', data: { tsconfig, differences: differences.join('; ') } });
      },
    };
  },
});

export default requireCompilerOptions;
