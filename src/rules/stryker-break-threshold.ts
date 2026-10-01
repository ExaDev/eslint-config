import { ESLintUtils } from '@typescript-eslint/utils';
import { parse } from '@typescript-eslint/typescript-estree';
import { fileReferenceSchema, readFileReference, resolveFileReference, type FileReference } from './file-reference';
import { createStaticConfig, type StaticLiteral } from './static-config';
import { STRYKER_FILE_GLOBS, STRYKER_HELPERS, strykerThresholds } from './stryker-thresholds';
import { readToolConfigRecord, readToolConfigScope, toolConfigFilesSchema } from './tool-config-options';
import { realWorkspaceFs, type WorkspaceFs } from './workspace-fs';

type MessageIds = 'missingBreak' | 'belowFloor';

const OPTION_NAME = 'exadev/stryker-break-threshold';
const OPTION_KEYS = ['files', 'min', 'base'] as const;

// Stryker's schema types every threshold as a percentage.
const MAX_PERCENTAGE = 100;

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

export type StrykerBreakThresholdRule = ReturnType<typeof createRule<[unknown], MessageIds>>;

export interface BreakThresholdOptions {
  readonly inScope: (filename: string, cwd: string) => boolean;
  readonly min: number | undefined;
  readonly base: FileReference | undefined;
}

/**
 * Reads the rule options: `files` replaces the built-in Stryker filename scope, `min` is a floor for `thresholds.break` between 0 and 100, and `base` names the shared Stryker config whose `thresholds.break` is a second floor. Throws naming the option for anything malformed.
 */
export function readBreakThresholdOptions(options: unknown): BreakThresholdOptions {
  const record = readToolConfigRecord(options, OPTION_NAME, OPTION_KEYS);
  const { min, base } = record;
  if (min !== undefined && (typeof min !== 'number' || !(min >= 0 && min <= MAX_PERCENTAGE))) {
    throw new Error(`@exadev/eslint-config: "${OPTION_NAME}" needs "min" to be a number from 0 to ${String(MAX_PERCENTAGE)}.`);
  }

  return {
    inScope: readToolConfigScope(record, OPTION_NAME, STRYKER_FILE_GLOBS),
    min,
    base: base === undefined ? undefined : readFileReference(base, `${OPTION_NAME} base`),
  };
}

/**
 * The numeric `thresholds.break` the shared base config states. Throws when the file does not exist or spells out no numeric `break`: a base the rule was told to compare against but cannot read is a configuration error, and passing silently would let every package undercut it unnoticed.
 */
function readBaseBreak(reference: FileReference, fs: WorkspaceFs, filename: string): { readonly value: number; readonly path: string } {
  const path = resolveFileReference(reference, { fs, filename });
  if (!fs.existsSync(path)) throw new Error(`@exadev/eslint-config: "${OPTION_NAME} base" names "${path}", which does not exist.`);
  const config = createStaticConfig(parse(fs.readFileSync(path), { filePath: path, loc: true, range: true }));
  for (const configObject of config.configObjects(STRYKER_HELPERS)) {
    const thresholds = strykerThresholds(config, configObject);
    if (thresholds.kind !== 'object') continue;
    const value = config.literalProperty(thresholds.object, 'break')?.value;
    if (value?.known === true && typeof value.value === 'number') return { value: value.value, path };
  }

  throw new Error(`@exadev/eslint-config: "${OPTION_NAME} base" names "${path}", which does not spell out a numeric thresholds.break.`);
}

/**
 * Why a statically known `break` value is not a number, or `undefined` when it is a number or cannot be read.
 */
function nonNumericState(value: StaticLiteral): string | undefined {
  if (!value.known) return undefined;
  if (value.value === null || value.value === undefined) return 'null';

  return typeof value.value === 'number' ? undefined : 'not a number';
}

/**
 * Builds the rule over a filesystem, so a test can supply the shared base config from memory.
 */
export function createStrykerBreakThresholdRule(fs: WorkspaceFs = realWorkspaceFs): StrykerBreakThresholdRule {
  return createRule<[unknown], MessageIds>({
    name: 'stryker-break-threshold',
    meta: {
      type: 'problem',
      docs: {
        description: 'Require a Stryker config to set `thresholds.break` to a number, optionally no lower than a minimum and no lower than the shared base config. Judges only what the file spells out.',
      },
      schema: [
        {
          type: 'object',
          properties: { ...toolConfigFilesSchema, min: { type: 'number', minimum: 0, maximum: MAX_PERCENTAGE }, base: fileReferenceSchema },
          additionalProperties: false,
        },
      ],
      messages: {
        missingBreak:
          '`thresholds.break` is {{ state }}, so a mutation run never fails however low the score falls. Set it to the lowest mutation score the suite is allowed to reach.',
        belowFloor:
          '`thresholds.break` is {{ value }}, below the floor of {{ floor }} {{ source }}. A lower value lets this config fall further than the floor allows without failing the run.',
      },
      defaultOptions: [{}],
    },
    create(context, [options]) {
      const { inScope, min, base } = readBreakThresholdOptions(options);
      if (!inScope(context.filename, context.cwd)) return {};
      const baseBreak = base === undefined ? undefined : readBaseBreak(base, fs, context.filename);
      const floors = [
        ...(min === undefined ? [] : [{ floor: min, source: 'set by the "min" option' }]),
        ...(baseBreak === undefined ? [] : [{ floor: baseBreak.value, source: `declared in the shared base config ${baseBreak.path}` }]),
      ];
      const strictest = floors.reduce<(typeof floors)[number] | undefined>((highest, candidate) => (highest === undefined || candidate.floor > highest.floor ? candidate : highest), undefined);

      return {
        Program(program) {
          const config = createStaticConfig(program);
          for (const configObject of config.configObjects(STRYKER_HELPERS)) {
            const thresholds = strykerThresholds(config, configObject);
            if (thresholds.kind === 'unseen') continue;
            if (thresholds.kind === 'absent') {
              context.report({ node: configObject, messageId: 'missingBreak', data: { state: 'not set' } });
              continue;
            }
            const breakLookup = config.lookup(thresholds.object, 'break');
            if (breakLookup.kind === 'opaque') continue;
            if (breakLookup.kind === 'absent') {
              context.report({ node: thresholds.property, messageId: 'missingBreak', data: { state: 'not set' } });
              continue;
            }
            const value = config.literal(breakLookup.value);
            const state = nonNumericState(value);
            if (state !== undefined) {
              context.report({ node: breakLookup.property, messageId: 'missingBreak', data: { state } });
              continue;
            }
            if (value.known && typeof value.value === 'number' && strictest !== undefined && value.value < strictest.floor) {
              context.report({
                node: breakLookup.property,
                messageId: 'belowFloor',
                data: { value: String(value.value), floor: String(strictest.floor), source: strictest.source },
              });
            }
          }
        },
      };
    },
  });
}

export default createStrykerBreakThresholdRule();
