import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import type { FileScope } from './file-scope';
import { readToolConfigFlag, readToolConfigRecord, readToolConfigScope, toolConfigFilesSchema } from './tool-config-options';
import { createStaticConfig, keyName, type StaticConfig } from './static-config';
import { VITEST_FILE_GLOBS, vitestTestObjects } from './vitest-test-objects';

type MessageIds = 'passWithNoTests' | 'allowOnly' | 'bareNodeModules' | 'unknownThresholdKey' | 'numericMaxWorkers';

const OPTION_NAME = 'exadev/vitest-config';
const OPTION_KEYS = ['files', 'forbidNumericMaxWorkers'] as const;

// The keys Vitest reads under `coverage.thresholds` itself: the four metrics, `perFile`, `autoUpdate` and the `100` shorthand. Every other key is treated as a file glob (checked against the Vitest source: coverage.resolveThresholds skips exactly these and builds a matcher from the rest).
const DOCUMENTED_THRESHOLD_KEYS: ReadonlySet<string> = new Set(['statements', 'branches', 'functions', 'lines', 'perFile', 'autoUpdate', '100']);

// A key is clearly meant as a glob or a file when it holds a path separator, a glob metacharacter or a dot (a file name such as `index.ts` is a valid glob for that file at the root). A bare word such as `global` has none, so it would be matched as a literal file name and match nothing.
const GLOB_CHARACTERS = /[/*?[\]{}!.]/u;

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

function isBareNodeModules(value: string): boolean {
  return value.replace(/\/+$/u, '') === 'node_modules';
}

/**
 * Reports every bare `node_modules` entry in `test.exclude`: Vitest matches it with tinyglobby, where a bare name ignores only a top-level directory of that name, so a nested copy (a workspace package's own `node_modules`) is still collected. `test.coverage.exclude` is not checked, because coverage filtering matches with `contains: true` and a bare name there also ignores nested copies.
 */
function reportBareNodeModules(config: StaticConfig, test: TSESTree.ObjectExpression, report: (node: TSESTree.Node) => void): void {
  const exclude = config.lookup(test, 'exclude');
  if (exclude.kind !== 'present') return;
  const list = config.resolve(exclude.value);
  if (list.type !== AST_NODE_TYPES.ArrayExpression) return;
  for (const element of list.elements) {
    if (element === null || element.type === AST_NODE_TYPES.SpreadElement) continue;
    const entry = config.literal(element);
    if (entry.known && typeof entry.value === 'string' && isBareNodeModules(entry.value)) report(element);
  }
}

/**
 * Whether `property` is a `thresholds` key that enforces nothing: not one Vitest documents and not clearly a glob or a file name.
 */
function isInertThresholdKey(key: string): boolean {
  return !DOCUMENTED_THRESHOLD_KEYS.has(key) && !GLOB_CHARACTERS.test(key);
}

export interface VitestConfigOptions {
  readonly inScope: FileScope;
  readonly forbidNumericMaxWorkers: boolean;
}

/**
 * Reads the rule options: `files` replaces the built-in Vitest filename scope and `forbidNumericMaxWorkers` also reports a numeric `maxWorkers`. Throws naming the option for anything malformed.
 */
export function readVitestConfigOptions(options: unknown): VitestConfigOptions {
  const record = readToolConfigRecord(options, OPTION_NAME, OPTION_KEYS);

  return {
    inScope: readToolConfigScope(record, OPTION_NAME, VITEST_FILE_GLOBS),
    forbidNumericMaxWorkers: readToolConfigFlag(record, 'forbidNumericMaxWorkers', OPTION_NAME),
  };
}

const vitestConfig = createRule<[unknown], MessageIds>({
  name: 'vitest-config',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Vitest config settings that stop the test run from failing: `passWithNoTests: true`, `allowOnly: true`, a bare `node_modules` exclude, and coverage thresholds under a key Vitest does not read. Judges only what the file spells out.',
    },
    schema: [
      {
        type: 'object',
        properties: { ...toolConfigFilesSchema, forbidNumericMaxWorkers: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    messages: {
      passWithNoTests:
        '`passWithNoTests: true` makes the run pass when no test file is found, so a mistyped include glob or a deleted suite goes unnoticed. Remove it.',
      allowOnly:
        '`allowOnly: true` lets a focused test (`.only`) through, so the rest of the suite is skipped without failing the run. Vitest already allows `.only` outside CI by default; remove this or set it to false.',
      bareNodeModules:
        'The bare string "node_modules" in `test.exclude` excludes only a top-level directory of that name and misses nested copies. Use "**/node_modules/**".',
      unknownThresholdKey:
        'The key "{{ key }}" under `coverage.thresholds` is not one Vitest reads (statements, branches, functions, lines, perFile, autoUpdate, 100), so it is treated as a file glob and matches no file; the threshold enforces nothing. Move the values up a level, or use a glob such as "src/**".',
      numericMaxWorkers:
        '`maxWorkers` is a number here, which fixes the worker count regardless of how many packages the task runner already runs in parallel. Remove it or express it as a percentage string.',
    },
    defaultOptions: [{}],
  },
  create(context, [options]) {
    const { inScope, forbidNumericMaxWorkers } = readVitestConfigOptions(options);
    if (!inScope(context.filename, context.cwd)) return {};

    return {
      Program(program) {
        const config = createStaticConfig(program);
        for (const test of vitestTestObjects(config)) {
          const passWithNoTests = config.literalProperty(test, 'passWithNoTests');
          if (passWithNoTests?.value.known === true && passWithNoTests.value.value === true) context.report({ node: passWithNoTests.property, messageId: 'passWithNoTests' });

          const allowOnly = config.literalProperty(test, 'allowOnly');
          if (allowOnly?.value.known === true && allowOnly.value.value === true) context.report({ node: allowOnly.property, messageId: 'allowOnly' });

          const maxWorkers = forbidNumericMaxWorkers ? config.literalProperty(test, 'maxWorkers') : undefined;
          if (maxWorkers?.value.known === true && typeof maxWorkers.value.value === 'number') context.report({ node: maxWorkers.property, messageId: 'numericMaxWorkers' });

          const coverage = config.lookup(test, 'coverage');
          const coverageObject = coverage.kind === 'present' ? config.resolve(coverage.value) : undefined;
          reportBareNodeModules(config, test, (node) => {
            context.report({ node, messageId: 'bareNodeModules' });
          });
          if (coverageObject?.type !== AST_NODE_TYPES.ObjectExpression) continue;

          const thresholds = config.lookup(coverageObject, 'thresholds');
          const thresholdsObject = thresholds.kind === 'present' ? config.resolve(thresholds.value) : undefined;
          if (thresholdsObject?.type !== AST_NODE_TYPES.ObjectExpression) continue;
          for (const member of thresholdsObject.properties) {
            if (member.type === AST_NODE_TYPES.SpreadElement) continue;
            const key = keyName(member);
            if (key !== undefined && isInertThresholdKey(key)) context.report({ node: member.key, messageId: 'unknownThresholdKey', data: { key } });
          }
        }
      },
    };
  },
});

export default vitestConfig;
