import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { createStaticConfig, type StaticConfig } from './static-config';
import { STRYKER_DEFAULT_HIGH, STRYKER_DEFAULT_LOW, STRYKER_FILE_GLOBS, STRYKER_HELPERS, strykerThresholds } from './stryker-thresholds';
import { readToolConfigRecord, readToolConfigScope, toolConfigFilesSchema } from './tool-config-options';

type MessageIds = 'breakAboveLow' | 'lowAboveHigh';

const OPTION_NAME = 'exadev/stryker-thresholds-order';
const OPTION_KEYS = ['files'] as const;

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

interface Threshold {
  // The number, and the property to report on when the property is spelled out. A default has no property.
  readonly value: number;
  readonly property: TSESTree.Property | undefined;
  readonly text: string;
}

/**
 * The numeric value of a threshold key: the literal when the key is a number, the documented default when the key is absent, and `undefined` when the value cannot be read (not a number literal, or hidden behind a spread), so no comparison involving it is made.
 */
function thresholdOf(config: StaticConfig, thresholds: TSESTree.ObjectExpression, key: string, fallback: number | undefined): Threshold | undefined {
  const found = config.lookup(thresholds, key);
  if (found.kind === 'opaque') return undefined;
  if (found.kind === 'absent') return fallback === undefined ? undefined : { value: fallback, property: undefined, text: `${String(fallback)}, the default` };
  const literal = config.literal(found.value);

  return literal.known && typeof literal.value === 'number' ? { value: literal.value, property: found.property, text: String(literal.value) } : undefined;
}

const strykerThresholdsOrder = createRule<[unknown], MessageIds>({
  name: 'stryker-thresholds-order',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require Stryker `thresholds` to satisfy `break <= low <= high`, using the documented defaults for a key the config leaves out. Judges only the numbers the file spells out.',
    },
    schema: [{ type: 'object', properties: toolConfigFilesSchema, additionalProperties: false }],
    messages: {
      breakAboveLow:
        '`thresholds.break` ({{ break }}) must not exceed `thresholds.low` ({{ low }}). A break above the low mark makes the low and high marks unreachable on a passing run, which usually means they were left at their defaults when the break was raised.',
      lowAboveHigh: '`thresholds.low` ({{ low }}) must not exceed `thresholds.high` ({{ high }}). Stryker rejects a low above the high when it reads the config.',
    },
    defaultOptions: [{}],
  },
  create(context, [options]) {
    const record = readToolConfigRecord(options, OPTION_NAME, OPTION_KEYS);
    if (!readToolConfigScope(record, OPTION_NAME, STRYKER_FILE_GLOBS)(context.filename, context.cwd)) return {};

    return {
      Program(program) {
        const config = createStaticConfig(program);
        for (const configObject of config.configObjects(STRYKER_HELPERS)) {
          const thresholds = strykerThresholds(config, configObject);
          if (thresholds.kind !== 'object') continue;
          const breakThreshold = thresholdOf(config, thresholds.object, 'break', undefined);
          const low = thresholdOf(config, thresholds.object, 'low', STRYKER_DEFAULT_LOW);
          const high = thresholdOf(config, thresholds.object, 'high', STRYKER_DEFAULT_HIGH);
          if (breakThreshold !== undefined && low !== undefined && breakThreshold.value > low.value) {
            context.report({ node: breakThreshold.property ?? thresholds.property, messageId: 'breakAboveLow', data: { break: breakThreshold.text, low: low.text } });
          }
          if (low !== undefined && high !== undefined && low.value > high.value) {
            context.report({ node: low.property ?? high.property ?? thresholds.property, messageId: 'lowAboveHigh', data: { low: low.text, high: high.text } });
          }
        }
      },
    };
  },
});

export default strykerThresholdsOrder;
