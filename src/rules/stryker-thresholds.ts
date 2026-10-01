import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { StaticConfig } from './static-config';

/**
 * The built-in filename scope of the Stryker rules: the names Stryker itself searches for (`stryker.conf.*`, `stryker.config.*`, with or without a leading dot) plus any `stryker*.config.*` variant, such as a mutation profile for one package.
 */
export const STRYKER_FILE_GLOBS: readonly string[] = ['**/stryker*.{conf,config}.*', '**/.stryker.{conf,config}.*'];

/**
 * The default of `thresholds.high` in Stryker's own option schema (`mutationScoreThresholds` in the `@stryker-mutator/api` core schema).
 */
export const STRYKER_DEFAULT_HIGH = 80;

/**
 * The default of `thresholds.low` in the same schema. `thresholds.break` defaults to `null`, which never fails a run.
 */
export const STRYKER_DEFAULT_LOW = 60;

/**
 * No config helper wraps a Stryker config: it is a plain object (optionally with a type annotation), so only the default export's own literal is a candidate.
 */
export const STRYKER_HELPERS: ReadonlySet<string> = new Set();

/**
 * The `thresholds` of one Stryker config object as the source states it: `unseen` when the key may exist but is not visible (a spread, or a value that is not an object literal), `absent` when it is spelled nowhere, otherwise the object and the property that declares it.
 */
export type StrykerThresholds =
  | { readonly kind: 'unseen' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'object'; readonly object: TSESTree.ObjectExpression; readonly property: TSESTree.Property };

export function strykerThresholds(config: StaticConfig, configObject: TSESTree.ObjectExpression): StrykerThresholds {
  const found = config.lookup(configObject, 'thresholds');
  if (found.kind === 'absent') return { kind: 'absent' };
  if (found.kind === 'opaque') return { kind: 'unseen' };
  const object = config.resolve(found.value);

  return object.type === AST_NODE_TYPES.ObjectExpression ? { kind: 'object', object, property: found.property } : { kind: 'unseen' };
}
