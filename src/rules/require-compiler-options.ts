import { ESLintUtils } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { isRecord } from '../is-record';
import { describeCompilerOptionValue, effectiveCompilerOption, isScalarOptionValue, parseRequirement, readTsconfig, type CompilerOptionRequirement } from './compiler-option-values';
import { relativeToCwd } from './file-scope';
import { createRunTracker, type RunTracker } from './run-tracker';
import { createTsconfigAttribution } from './tsconfig-attribution';
import { isEstreeSource } from './estree-source';

type MessageIds = 'differs';

const OPTION_NAME = 'exadev/require-compiler-options';

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

/* The finding belongs to the tsconfig, which governs every file of its program, and not to the file that happened to be linted first, so the rule reports once per tsconfig and option set per run. Runs are told apart by createRunTracker, one per tsconfig and option set, so the same tsconfig linted under two rule configurations reports once for each.
   The trackers are keyed by tsconfig path and not by the TypeScript program, because typescript-eslint replaces programs: it rebuilds a watch or project service program after an edit, and when it infers a single run (TSESTREE_SINGLE_RUN, or CI=true or the eslint binary without --fix) it parses a file it has already parsed in the process, as it would in a fix pass, with a single-file program that has no tsconfig. Keyed by program, that throwaway program looked like a new program with nothing linted yet and was judged on its own options; createTsconfigAttribution attributes it to the file's tsconfig instead. */
const trackersByTsconfig = new Map<string, Map<string, RunTracker>>();
// A program with no tsconfig behind it and none attributed to it is its own key. A WeakMap lets one that a long-running process has replaced be collected.
const trackersByProgram = new WeakMap<ts.Program, Map<string, RunTracker>>();
const governingTsconfig = createTsconfigAttribution();

function trackersFor(owner: string | ts.Program): Map<string, RunTracker> {
  const existing = typeof owner === 'string' ? trackersByTsconfig.get(owner) : trackersByProgram.get(owner);
  if (existing !== undefined) return existing;
  const created = new Map<string, RunTracker>();
  if (typeof owner === 'string') trackersByTsconfig.set(owner, created);
  else trackersByProgram.set(owner, created);

  return created;
}

/**
 * Reads the rule's option object into one requirement per compiler option. Each value is `true`, `false`, or a non-empty list of accepted values; an enum-valued option takes its tsconfig spelling (`"es2022"`). Throws naming the option for a malformed value, an unknown compiler option, or a value the compiler would reject.
 */
export function readCompilerOptionRequirements(options: unknown): readonly CompilerOptionRequirement[] {
  if (!isRecord(options)) throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" options must be an object mapping compiler option names to true, false or a list of accepted values.`);

  return Object.entries(options).map(([name, specification]) => {
    if (typeof specification === 'boolean') return parseRequirement(name, specification);
    if (Array.isArray(specification) && specification.length > 0 && specification.every(isScalarOptionValue)) return parseRequirement(name, specification);

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
      description: 'Require the effective compiler options of the tsconfig the program being linted was created from, after `extends` is resolved, to have the configured values. Reports once per tsconfig and run, and names the tsconfig it resolved.',
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
    if (!isEstreeSource(context.sourceCode)) return {};
    const { program } = ESLintUtils.getParserServices(context);
    const signature = JSON.stringify(requirements.map((requirement) => [requirement.name, requirement.spelled]));

    return {
      Program(node) {
        const tsconfig = governingTsconfig(program, context.filename);
        const trackers = trackersFor(tsconfig ?? program);
        const carries = trackers.get(signature) ?? createRunTracker();
        trackers.set(signature, carries);
        if (!carries(context.filename, context.sourceCode.text)) return;

        // A program with no tsconfig behind it has nothing to re-read and is judged on its own options.
        const compilerOptions = tsconfig === undefined ? program.getCompilerOptions() : readTsconfig(tsconfig).options;
        const differences = requirements.flatMap((requirement) => {
          const actual = effectiveCompilerOption(compilerOptions, requirement.name);
          if (requirement.accepted.includes(actual)) return [];

          return [`${requirement.name} is ${describeCompilerOptionValue(requirement.name, actual)}, required ${describeRequired(requirement)}`];
        });
        if (differences.length === 0) return;

        const label = tsconfig === undefined ? 'the default project' : relativeToCwd(tsconfig, context.cwd);
        context.report({ loc: { line: node.loc.start.line, column: node.loc.start.column }, messageId: 'differs', data: { tsconfig: label, differences: differences.join('; ') } });
      },
    };
  },
});

export default requireCompilerOptions;
