import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { StaticConfig } from './static-config';

/**
 * The helpers whose arguments are config objects in a Vitest config or workspace file.
 */
export const VITEST_HELPERS: ReadonlySet<string> = new Set(['defineConfig', 'defineProject', 'defineWorkspace', 'mergeConfig']);

/**
 * The built-in filename scope of the Vitest rules: any `vitest*.config.*` (so `vitest.mutation.config.ts` is covered) and any `vitest.workspace.*`.
 */
export const VITEST_FILE_GLOBS: readonly string[] = ['**/vitest*.config.*', '**/vitest.workspace.*'];

/**
 * Every `test` options object a Vitest config or workspace file spells out: the `test` of each config object in the default export, and, recursively, the `test` of each inline project in `test.projects`. A `test` that is not an object literal, or a project that is a path or glob string, is not visible and contributes nothing.
 */
export function vitestTestObjects(config: StaticConfig): readonly TSESTree.ObjectExpression[] {
  const visited = new Set<TSESTree.ObjectExpression>();

  function testObjectsOf(configObject: TSESTree.ObjectExpression): readonly TSESTree.ObjectExpression[] {
    if (visited.has(configObject)) return [];
    visited.add(configObject);
    const found = config.lookup(configObject, 'test');
    if (found.kind !== 'present') return [];
    const test = config.resolve(found.value);
    if (test.type !== AST_NODE_TYPES.ObjectExpression) return [];
    const projects = config.lookup(test, 'projects');
    const nested = projects.kind === 'present' ? config.objectsOf(projects.value, VITEST_HELPERS).flatMap(testObjectsOf) : [];

    return [test, ...nested];
  }

  return config.configObjects(VITEST_HELPERS).flatMap(testObjectsOf);
}
