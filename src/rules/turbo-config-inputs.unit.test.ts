import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import { cacheKeyIncludes, checkConfigInputs, toolsRunBy, TURBO_DEFAULT, TURBO_ROOT_PREFIX } from './turbo-config-inputs';
import { readTurboJson, type TurboTask } from './turbo-json';
import { DEFAULT_TOOL_CONFIGS } from './turbo-options';
import { listTurboPackages } from './turbo-workspace';

const TOOL_CONFIGS: ReadonlyMap<string, readonly string[]> = new Map(Object.entries(DEFAULT_TOOL_CONFIGS));

function task(fields: Partial<TurboTask> = {}): TurboTask {
  return { dependsOn: [], with: [], cache: undefined, persistent: undefined, hasOutputs: false, inputs: undefined, keys: [], ...fields };
}

describe('constants', () => {
  it('name the default-inputs entry and the repository-root prefix', () => {
    expect(TURBO_DEFAULT).toBe('$TURBO_DEFAULT$');
    expect(TURBO_ROOT_PREFIX).toBe('$TURBO_ROOT$/');
  });
});

describe('toolsRunBy', () => {
  const tools = ['eslint', 'tsc', 'vitest'];

  it.each([
    ['eslint . --cache', ['eslint']],
    ['pnpm exec eslint .', ['eslint']],
    ['./node_modules/.bin/eslint .', ['eslint']],
    ['tsc -p tsconfig.json && vitest run', ['tsc', 'vitest']],
    ['eslint . && tsc', ['eslint', 'tsc']],
    ["'vitest' run", ['vitest']],
  ])('finds the tools in %s', (command, expected) => {
    expect(toolsRunBy(command, tools)).toEqual(expected);
  });

  it.each([['pnpm run lint'], ['tsdown'], ['eslint.config.ts'], ['echo my-eslint'], ['']])('finds no tool in %j, since it cannot be classified', (command) => {
    expect(toolsRunBy(command, tools)).toEqual([]);
  });

  it('keeps the order of the tools it was given', () => {
    expect(toolsRunBy('tsc && eslint', ['eslint', 'tsc'])).toEqual(['eslint', 'tsc']);
  });
});

describe('cacheKeyIncludes', () => {
  const dirs = { root: '/repo', pkg: '/repo/packages/web' };
  const includesWithGlobal = (file: string, fields: Partial<TurboTask>, globalDependencies: readonly string[]) => cacheKeyIncludes({ file, task: task(fields), globalDependencies, dirs });
  const includes = (file: string, fields: Partial<TurboTask> = {}) => includesWithGlobal(file, fields, []);

  it('covers the package own files when inputs is unset or lists $TURBO_DEFAULT$, but not a file outside the package', () => {
    expect(includes('/repo/packages/web/vitest.config.ts')).toBe(true);
    expect(includes('/repo/packages/web/vitest.config.ts', { inputs: [TURBO_DEFAULT, 'other'] })).toBe(true);
    expect(includes('/repo/vitest.config.ts')).toBe(false);
    expect(includes('/repo/packages/webby/vitest.config.ts')).toBe(false);
  });

  it('covers only the listed files when inputs replaces the default', () => {
    expect(includes('/repo/packages/web/vitest.config.ts', { inputs: ['src/**'] })).toBe(false);
    expect(includes('/repo/packages/web/vitest.config.ts', { inputs: [] })).toBe(false);
    expect(includes('/repo/packages/web/vitest.config.ts', { inputs: ['vitest.config.ts'] })).toBe(true);
    expect(includes('/repo/packages/web/vitest.config.ts', { inputs: ['vitest.*'] })).toBe(true);
  });

  it('reads a glob relative to the package, and a $TURBO_ROOT$ glob relative to the repository root', () => {
    expect(includes('/repo/tsconfig.base.json', { inputs: ['tsconfig.base.json'] })).toBe(false);
    expect(includes('/repo/tsconfig.base.json', { inputs: [`${TURBO_ROOT_PREFIX}tsconfig.base.json`] })).toBe(true);
    expect(includes('/repo/tsconfig.base.json', { inputs: [`${TURBO_ROOT_PREFIX}tsconfig.*.json`] })).toBe(true);
    expect(includes('/repo/packages/web/x.ts', { inputs: [`${TURBO_ROOT_PREFIX}x.ts`] })).toBe(false);
  });

  it('reads leading ../ segments as moving up from the package', () => {
    expect(includes('/repo/tsconfig.base.json', { inputs: ['../../tsconfig.base.json'] })).toBe(true);
    expect(includes('/repo/tsconfig.base.json', { inputs: ['../tsconfig.base.json'] })).toBe(false);
    expect(includes('/repo/packages/shared.json', { inputs: ['../shared.json'] })).toBe(true);
  });

  it('honours a ! glob, relative to the package or to the repository root', () => {
    expect(includes('/repo/packages/web/vitest.config.ts', { inputs: [TURBO_DEFAULT, '!vitest.config.ts'] })).toBe(false);
    expect(includes('/repo/tsconfig.base.json', { inputs: [`${TURBO_ROOT_PREFIX}*.json`, `!${TURBO_ROOT_PREFIX}tsconfig.base.json`] })).toBe(false);
    expect(includes('/repo/packages/web/a.ts', { inputs: [TURBO_DEFAULT, '!b.ts'] })).toBe(true);
  });

  it('covers a file that globalDependencies lists, whatever the inputs say', () => {
    expect(includesWithGlobal('/repo/tsconfig.base.json', {}, ['tsconfig.base.json'])).toBe(true);
    expect(includesWithGlobal('/repo/tsconfig.base.json', { inputs: [] }, ['tsconfig.*.json'])).toBe(true);
    expect(includesWithGlobal('/repo/tsconfig.base.json', { inputs: [`!${TURBO_ROOT_PREFIX}tsconfig.base.json`] }, ['tsconfig.base.json'])).toBe(true);
    expect(includesWithGlobal('/repo/tsconfig.base.json', {}, ['other.json'])).toBe(false);
    expect(includesWithGlobal('/repo/tsconfig.base.json', {}, [])).toBe(false);
  });
});

describe('checkConfigInputs', () => {
  const ROOT = '/repo';

  function check(
    files: Readonly<Record<string, string>>,
    turbo: Readonly<Record<string, unknown>>,
    key: string,
    toolConfigs: ReadonlyMap<string, readonly string[]> = TOOL_CONFIGS,
  ) {
    const fs = createMemoryFs({ '/repo/pnpm-workspace.yaml': 'packages:\n  - packages/*\n', ...files });
    const config = readTurboJson(turbo, '/repo/turbo.json');
    const entry = config.tasks.get(key);
    if (entry === undefined) throw new Error(`the fixture defines no task "${key}"`);

    return checkConfigInputs({ fs, rootDir: ROOT, config, key, entry, packages: listTurboPackages(fs, ROOT, undefined), toolConfigs });
  }

  const web = { '/repo/packages/web/package.json': JSON.stringify({ name: 'web', scripts: { _lint: 'eslint .', _typecheck: 'tsc -p tsconfig.json', _test: 'vitest run', _build: 'tsdown' } }) };

  it('reports a root config that neither globalDependencies nor inputs list', () => {
    const problems = check({ ...web, '/repo/eslint.config.ts': '' }, { tasks: { _lint: {} } }, '_lint');
    expect(problems).toEqual([{ kind: 'missingRootConfig', tool: 'eslint', file: 'eslint.config.ts', packages: ['web'] }]);
  });

  it('accepts a root config listed in globalDependencies or through $TURBO_ROOT$', () => {
    const files = { ...web, '/repo/eslint.config.ts': '' };
    expect(check(files, { globalDependencies: ['eslint.config.*'], tasks: { _lint: {} } }, '_lint')).toEqual([]);
    expect(check(files, { tasks: { _lint: { inputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/eslint.config.ts'] } } }, '_lint')).toEqual([]);
  });

  it('reports a package config that explicit inputs leave out, and accepts one the default or a glob covers', () => {
    const files = { ...web, '/repo/packages/web/tsconfig.json': '' };
    expect(check(files, { tasks: { _typecheck: { inputs: ['src/**'] } } }, '_typecheck')).toEqual([{ kind: 'missingPackageConfig', tool: 'tsc', file: 'tsconfig.json', packages: ['web'] }]);
    expect(check(files, { tasks: { _typecheck: { inputs: ['$TURBO_DEFAULT$'] } } }, '_typecheck')).toEqual([]);
    expect(check(files, { tasks: { _typecheck: { inputs: ['src/**', 'tsconfig.json'] } } }, '_typecheck')).toEqual([]);
    expect(check(files, { tasks: { _typecheck: {} } }, '_typecheck')).toEqual([]);
  });

  it('reads every file the tool globs match, in the package and at the root', () => {
    const files = { ...web, '/repo/tsconfig.base.json': '', '/repo/tsconfig.json': '', '/repo/packages/web/tsconfig.json': '', '/repo/packages/web/tsconfig.build.json': '' };
    expect(check(files, { tasks: { _typecheck: { inputs: [] } } }, '_typecheck')).toEqual([
      { kind: 'missingPackageConfig', tool: 'tsc', file: 'tsconfig.build.json', packages: ['web'] },
      { kind: 'missingPackageConfig', tool: 'tsc', file: 'tsconfig.json', packages: ['web'] },
      { kind: 'missingRootConfig', tool: 'tsc', file: 'tsconfig.base.json', packages: ['web'] },
      { kind: 'missingRootConfig', tool: 'tsc', file: 'tsconfig.json', packages: ['web'] },
    ]);
  });

  it('ignores a directory whose name matches a config glob', () => {
    const files = { ...web, '/repo/eslint.config.d/x': '' };
    expect(check(files, { tasks: { _lint: {} } }, '_lint')).toEqual([]);
  });

  it('checks the root package against its own files only', () => {
    const root = { '/repo/package.json': JSON.stringify({ name: 'root', scripts: { lint: 'eslint .' } }), '/repo/eslint.config.ts': '' };
    expect(check(root, { tasks: { '//#lint': {} } }, '//#lint')).toEqual([]);
    expect(check(root, { tasks: { '//#lint': { inputs: ['src/**'] } } }, '//#lint')).toEqual([{ kind: 'missingPackageConfig', tool: 'eslint', file: 'eslint.config.ts', packages: ['//'] }]);
    expect(check(root, { tasks: { '//#lint': { inputs: ['src/**'] } }, globalDependencies: ['eslint.config.ts'] }, '//#lint')).toEqual([]);
  });

  it('checks the root package for a bare task in a repository with no members', () => {
    const single = { '/repo/package.json': JSON.stringify({ name: 'root', scripts: { _lint: 'eslint .' } }), '/repo/eslint.config.ts': '', '/repo/pnpm-workspace.yaml': 'packages: []\n' };
    expect(check(single, { tasks: { _lint: { inputs: [] } } }, '_lint')).toEqual([{ kind: 'missingPackageConfig', tool: 'eslint', file: 'eslint.config.ts', packages: ['//'] }]);
  });

  it('skips an uncached task, a script that runs no known tool and a tool that has no config file', () => {
    const files = { ...web, '/repo/eslint.config.ts': '', '/repo/tsdown.config.ts': '' };
    expect(check(files, { tasks: { _lint: { cache: false } } }, '_lint')).toEqual([]);
    expect(check(files, { tasks: { _build: {} } }, '_build')).toEqual([]);
    expect(check(web, { tasks: { _test: {} } }, '_test')).toEqual([]);
  });

  it('honours a tool config map: another tool, other globs, and a tool left out', () => {
    const files = { ...web, '/repo/eslint.config.ts': '', '/repo/vitest.config.ts': '', '/repo/vitest.workspace.ts': '' };
    expect(check(files, { tasks: { _lint: {} } }, '_lint', new Map([['eslint', ['.eslintrc.*']]]))).toEqual([]);
    expect(check(files, { tasks: { _test: {} } }, '_test', new Map([['vitest', ['vitest.*']]])).map(({ file }) => file)).toEqual(['vitest.config.ts', 'vitest.workspace.ts']);
    expect(check(files, { tasks: { _lint: {} } }, '_lint', new Map([['vitest', ['vitest.config.*']]]))).toEqual([]);
  });

  it('merges the same missing file across packages, naming each package', () => {
    const files = {
      ...web,
      '/repo/packages/api/package.json': JSON.stringify({ name: 'api', scripts: { _lint: 'eslint .' } }),
      '/repo/packages/anon/package.json': JSON.stringify({ scripts: { _lint: 'eslint .' } }),
      '/repo/eslint.config.ts': '',
    };
    expect(check(files, { tasks: { _lint: {} } }, '_lint')).toEqual([{ kind: 'missingRootConfig', tool: 'eslint', file: 'eslint.config.ts', packages: ['api', 'packages/anon', 'web'] }]);
  });

  it('checks each package with its own turbo.json laid over the task', () => {
    const files = {
      ...web,
      '/repo/packages/api/package.json': JSON.stringify({ name: 'api', scripts: { _lint: 'eslint .' } }),
      '/repo/packages/api/turbo.json': JSON.stringify({ extends: ['//'], tasks: { _lint: { inputs: ['src/**'] } } }),
      '/repo/packages/web/turbo.json': JSON.stringify({ extends: ['//'], tasks: { _lint: { cache: false } } }),
      '/repo/eslint.config.ts': '',
    };
    expect(check(files, { tasks: { _lint: { inputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/eslint.config.ts'] } } }, '_lint')).toEqual([
      { kind: 'missingRootConfig', tool: 'eslint', file: 'eslint.config.ts', packages: ['api'] },
    ]);
  });

  it('lets a package own turbo.json extend the root inputs', () => {
    const files = {
      ...web,
      '/repo/packages/web/turbo.json': JSON.stringify({ extends: ['//'], tasks: { _lint: { inputs: ['$TURBO_EXTENDS$', 'extra.json'] } } }),
      '/repo/eslint.config.ts': '',
    };
    expect(check(files, { tasks: { _lint: { inputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/eslint.config.ts'] } } }, '_lint')).toEqual([]);
  });

  it('leaves a package that has a package#task entry to that entry', () => {
    const files = { ...web, '/repo/eslint.config.ts': '' };
    const turbo = { tasks: { _lint: {}, 'web#_lint': { inputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/eslint.config.ts'] } } };
    expect(check(files, turbo, '_lint')).toEqual([]);
    expect(check(files, turbo, 'web#_lint')).toEqual([]);
    expect(check(files, { tasks: { _lint: {}, 'web#_lint': {} } }, 'web#_lint')).toEqual([{ kind: 'missingRootConfig', tool: 'eslint', file: 'eslint.config.ts', packages: ['web'] }]);
  });

  it('checks the root package under its // key rather than the generic one', () => {
    const files = { '/repo/package.json': JSON.stringify({ name: 'root', scripts: { _lint: 'eslint .' } }), '/repo/eslint.config.ts': '', '/repo/pnpm-workspace.yaml': 'packages: []\n' };
    expect(check(files, { tasks: { _lint: { inputs: [] }, '//#_lint': {} } }, '_lint')).toEqual([]);
  });

  it('names a nameless package by its directory', () => {
    const files = { '/repo/packages/anon/package.json': JSON.stringify({ scripts: { _lint: 'eslint .' } }), '/repo/eslint.config.ts': '' };
    expect(check(files, { tasks: { _lint: {} } }, '_lint')).toEqual([{ kind: 'missingRootConfig', tool: 'eslint', file: 'eslint.config.ts', packages: ['packages/anon'] }]);
  });
});
