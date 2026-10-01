import { ESLintUtils } from '@typescript-eslint/utils';
import type { FileScope } from './file-scope';
import { createStaticConfig, type StaticLiteral } from './static-config';
import { readToolConfigFlag, readToolConfigRecord, readToolConfigScope, toolConfigFilesSchema } from './tool-config-options';

type MessageIds = 'forbidOnlyNotSet' | 'forbidOnlyFalse' | 'fullyParallelNotSet' | 'fullyParallelFalse' | 'workersNotSet';

const OPTION_NAME = 'exadev/playwright-config';
const OPTION_KEYS = ['files', 'fullyParallel', 'workers'] as const;

// Any `playwright*.config.*`, so a profile such as `playwright.ci.config.ts` is covered.
const PLAYWRIGHT_FILE_GLOBS: readonly string[] = ['**/playwright*.config.*'];

// `defineConfig` is the only helper Playwright documents for its config.
const PLAYWRIGHT_HELPERS: ReadonlySet<string> = new Set(['defineConfig']);

/**
 * Whether a statically known value switches the setting off: `false`, or `undefined`/`null`, which set nothing.
 */
function isOff(value: StaticLiteral): boolean {
  return value.known && (value.value === false || value.value === undefined || value.value === null);
}

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

export interface PlaywrightConfigOptions {
  readonly inScope: FileScope;
  readonly requireFullyParallel: boolean;
  readonly requireWorkers: boolean;
}

/**
 * Reads the rule options: `files` replaces the built-in Playwright filename scope, and `fullyParallel` and `workers` turn on the checks that those settings are present. Throws naming the option for anything malformed.
 */
export function readPlaywrightConfigOptions(options: unknown): PlaywrightConfigOptions {
  const record = readToolConfigRecord(options, OPTION_NAME, OPTION_KEYS);

  return {
    inScope: readToolConfigScope(record, OPTION_NAME, PLAYWRIGHT_FILE_GLOBS),
    requireFullyParallel: readToolConfigFlag(record, 'fullyParallel', OPTION_NAME),
    requireWorkers: readToolConfigFlag(record, 'workers', OPTION_NAME),
  };
}

const playwrightConfig = createRule<[unknown], MessageIds>({
  name: 'playwright-config',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a Playwright config to set `forbidOnly` so a committed `test.only` fails CI, and optionally to set `fullyParallel` and `workers`. A non-literal value such as `!!process.env.CI` is accepted. Judges only what the file spells out.',
    },
    schema: [
      {
        type: 'object',
        properties: { ...toolConfigFilesSchema, fullyParallel: { type: 'boolean' }, workers: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    messages: {
      forbidOnlyNotSet:
        '`forbidOnly` is not set. Playwright defaults it to false, so a committed `test.only` runs one test and still passes. Set it to `true` or to an expression such as `!!process.env.CI`.',
      forbidOnlyFalse: '`forbidOnly` is false, so a committed `test.only` runs one test and still passes. Set it to `true` or to an expression such as `!!process.env.CI`.',
      fullyParallelNotSet:
        '`fullyParallel` is not set. Playwright defaults it to false, which runs the tests of one file in order on one worker. Set it to `true`, or to false deliberately if the tests share state.',
      fullyParallelFalse: '`fullyParallel` is false, so the tests of one file run in order on one worker.',
      workersNotSet:
        '`workers` is not set, so the worker count follows the machine. State it, for example `process.env.CI ? 1 : undefined`, so CI and local runs are chosen deliberately.',
    },
    defaultOptions: [{}],
  },
  create(context, [options]) {
    const { inScope, requireFullyParallel, requireWorkers } = readPlaywrightConfigOptions(options);
    if (!inScope(context.filename, context.cwd)) return {};

    return {
      Program(program) {
        const config = createStaticConfig(program);
        // `defineConfig` merges all its arguments, so each call is judged as the one configuration they make together.
        for (const group of config.configGroups(PLAYWRIGHT_HELPERS)) {
          const last = group.at(-1);
          if (last === undefined) continue;
          const forbidOnly = config.lookupGroup(group, 'forbidOnly');
          if (forbidOnly.kind === 'absent') context.report({ node: last, messageId: 'forbidOnlyNotSet' });
          if (forbidOnly.kind === 'present') {
            if (isOff(config.literal(forbidOnly.value))) context.report({ node: forbidOnly.property, messageId: 'forbidOnlyFalse' });
          }

          if (requireFullyParallel) {
            const fullyParallel = config.lookupGroup(group, 'fullyParallel');
            if (fullyParallel.kind === 'absent') context.report({ node: last, messageId: 'fullyParallelNotSet' });
            if (fullyParallel.kind === 'present') {
              if (isOff(config.literal(fullyParallel.value))) context.report({ node: fullyParallel.property, messageId: 'fullyParallelFalse' });
            }
          }

          if (requireWorkers && config.lookupGroup(group, 'workers').kind === 'absent') context.report({ node: last, messageId: 'workersNotSet' });
        }
      },
    };
  },
});

export default playwrightConfig;
