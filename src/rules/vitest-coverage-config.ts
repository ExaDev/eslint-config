import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { createEntryScope, entryFilesSchema, readEntryFiles } from './file-entry';
import { createStaticConfig, type StaticConfig } from './static-config';
import { readToolConfigRecord } from './tool-config-options';
import { vitestTestObjects } from './vitest-test-objects';

type MessageIds = 'incompleteCoverage';

const OPTION_NAME = 'exadev/vitest-coverage-config';
const OPTION_KEYS = ['files'] as const;

// The four metrics Vitest enforces under `coverage.thresholds`; `perFile` and `autoUpdate` change how they are applied and are not thresholds.
const THRESHOLD_METRICS = ['statements', 'branches', 'functions', 'lines'] as const;

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

/**
 * What a `coverage` block leaves unspelled: `provider`, `include`, `thresholds`, and each metric of a visible `thresholds` object. A `thresholds` that is not an object literal is not judged, because its keys are not visible.
 */
function missingCoverageSettings(config: StaticConfig, coverage: TSESTree.ObjectExpression): readonly string[] {
  const missing: string[] = [];
  if (config.lookup(coverage, 'provider').kind === 'absent') missing.push('provider');
  if (config.lookup(coverage, 'include').kind === 'absent') missing.push('include');
  const thresholds = config.lookup(coverage, 'thresholds');
  if (thresholds.kind === 'absent') missing.push('thresholds');
  const thresholdsObject = thresholds.kind === 'present' ? config.resolve(thresholds.value) : undefined;
  if (thresholdsObject?.type === AST_NODE_TYPES.ObjectExpression) {
    for (const metric of THRESHOLD_METRICS) {
      if (config.lookup(thresholdsObject, metric).kind === 'absent') missing.push(`thresholds.${metric}`);
    }
  }

  return missing;
}

const vitestCoverageConfig = createRule<[unknown], MessageIds>({
  name: 'vitest-coverage-config',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require the shared Vitest base config to spell out a complete `coverage` block: `provider`, `include` and all four `thresholds` keys. A no-op unless `files` names the base config files.',
    },
    schema: [{ type: 'object', properties: { files: entryFilesSchema }, additionalProperties: false }],
    messages: {
      incompleteCoverage:
        'This `coverage` block does not set {{ missing }}. Coverage with no thresholds cannot fail, and without `provider` and `include` the measured files depend on defaults. Set them in the shared base config that per-package configs merge.',
    },
    defaultOptions: [{}],
  },
  create(context, [options]) {
    const record = readToolConfigRecord(options, OPTION_NAME, OPTION_KEYS);
    // The base config files are named explicitly: a per-package config that merges the base and sets only `coverage.exclude` would otherwise be reported for what it inherits.
    if (record['files'] === undefined) return {};
    if (!createEntryScope(readEntryFiles(record['files'], `${OPTION_NAME} files`))(context.filename, context.cwd)) return {};

    return {
      Program(program) {
        const config = createStaticConfig(program);
        for (const test of vitestTestObjects(config)) {
          const coverage = config.lookup(test, 'coverage');
          if (coverage.kind !== 'present') continue;
          const coverageObject = config.resolve(coverage.value);
          if (coverageObject.type !== AST_NODE_TYPES.ObjectExpression) continue;
          const missing = missingCoverageSettings(config, coverageObject);
          if (missing.length > 0) context.report({ node: coverage.property, messageId: 'incompleteCoverage', data: { missing: missing.join(', ') } });
        }
      },
    };
  },
});

export default vitestCoverageConfig;
