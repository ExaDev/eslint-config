import { ESLintUtils } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { isRecord } from '../is-record';
import { describeCompilerOptionValue, effectiveCompilerOption, parseRequirement, resolveCompilerOptions, type CompilerOptionRequirement } from './compiler-option-values';
import { relativeToCwd } from './file-scope';

type MessageIds = 'differs';

const OPTION_NAME = 'exadev/require-compiler-options';

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

// A program is shared by every file it contains, so the finding belongs to the program and not to the file that happened to be linted first. The key is the program plus the required options, so the same program linted under two different rule configurations reports once for each. A WeakMap lets a program that a long-running process has replaced be collected.
// The value is the files linted since the last report. ESLint gives a rule no signal that a run has started, but a program that outlives a run (an editor integration, a long-lived ESLint instance) meets the same file again in the next one, so a file seen twice marks a new run and the finding is reported again. A run that lints only files the previous run did not lint cannot be told apart from the same run and stays silent.
const lintedSinceReport = new WeakMap<ts.Program, Map<string, Set<string>>>();

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
      description: 'Require the effective compiler options of the tsconfig the program being linted was created from, after `extends` is resolved, to have the configured values. Reports once per program and names the tsconfig it resolved.',
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
      differs: 'The effective compiler options of {{ tsconfig }} differ from the required ones: {{ differences }}. ESLint type-checks against this tsconfig, so the build must use the same one for the check to mean anything.',
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
        const bySignature = lintedSinceReport.get(program) ?? new Map<string, Set<string>>();
        lintedSinceReport.set(program, bySignature);
        const linted = bySignature.get(signature) ?? new Set<string>();
        bySignature.set(signature, linted);
        const isNewRun = linted.has(context.filename);
        if (isNewRun) linted.clear();
        const isFirstOfRun = linted.size === 0;
        linted.add(context.filename);
        if (!isFirstOfRun) return;

        const compilerOptions = resolveCompilerOptions(program);
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
