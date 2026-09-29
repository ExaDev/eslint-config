import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import {
  baseTaskName,
  findTurboRoot,
  isGraphOnly,
  mergeTask,
  readTurboJson,
  readTurboJsonAt,
  resolveScriptTask,
  ROOT_PACKAGE_QUALIFIER,
  ROOT_TASK_PREFIX,
  TURBO_JSON,
  type TurboJson,
  type TurboTask,
} from './turbo-json';

function task(fields: Partial<TurboTask> = {}): TurboTask {
  return { dependsOn: [], with: [], cache: undefined, persistent: undefined, hasOutputs: false, keys: [], ...fields };
}

function config(fields: Partial<TurboJson> = {}): TurboJson {
  return { extends: undefined, hasBoundaries: false, tags: [], tasks: new Map(), ...fields };
}

describe('constants', () => {
  it('name the file, the root task prefix and the root package qualifier', () => {
    expect(TURBO_JSON).toBe('turbo.json');
    expect(ROOT_TASK_PREFIX).toBe('//#');
    expect(ROOT_PACKAGE_QUALIFIER).toBe('//');
  });
});

describe('readTurboJson', () => {
  it('reads a task with every field the rules use', () => {
    const { tasks } = readTurboJson({ tasks: { build: { dependsOn: ['^build', 'gen'], with: ['watch'], cache: false, persistent: true, outputs: [], inputs: ['src/**'] } } });
    expect(tasks.get('build')).toEqual({
      dependsOn: ['^build', 'gen'],
      with: ['watch'],
      cache: false,
      persistent: true,
      hasOutputs: true,
      keys: ['dependsOn', 'with', 'cache', 'persistent', 'outputs', 'inputs'],
    });
  });

  it('reads an empty task as defaults', () => {
    expect(readTurboJson({ tasks: { build: {} } }).tasks.get('build')).toEqual({ dependsOn: [], with: [], cache: undefined, persistent: undefined, hasOutputs: false, keys: [] });
  });

  it('treats a task that is not an object as an empty one', () => {
    expect(readTurboJson({ tasks: { build: null } }).tasks.get('build')).toEqual(task());
  });

  it('keeps only string entries of a list and only boolean flags', () => {
    const entry = readTurboJson({ tasks: { build: { dependsOn: ['a', 1, null], with: 'x', cache: 'no', persistent: 1 } } }).tasks.get('build');
    expect(entry?.dependsOn).toEqual(['a']);
    expect(entry?.with).toEqual([]);
    expect(entry?.cache).toBeUndefined();
    expect(entry?.persistent).toBeUndefined();
  });

  it('counts an outputs key of any value as declared', () => {
    expect(readTurboJson({ tasks: { a: { outputs: null } } }).tasks.get('a')?.hasOutputs).toBe(true);
  });

  it('reads no tasks when tasks is missing or not an object', () => {
    expect(readTurboJson({}).tasks.size).toBe(0);
    expect(readTurboJson({ tasks: [] }).tasks.size).toBe(0);
  });

  it('reads extends as undefined when absent and as the string entries when present', () => {
    expect(readTurboJson({}).extends).toBeUndefined();
    expect(readTurboJson({ extends: ['//', 'web'] }).extends).toEqual(['//', 'web']);
    expect(readTurboJson({ extends: '//' }).extends).toEqual([]);
  });

  it('reads boundaries as present only when it is an object', () => {
    expect(readTurboJson({ boundaries: {} }).hasBoundaries).toBe(true);
    expect(readTurboJson({ boundaries: null }).hasBoundaries).toBe(false);
    expect(readTurboJson({}).hasBoundaries).toBe(false);
  });

  it('reads tags as the string entries, empty when absent', () => {
    expect(readTurboJson({ tags: ['core', 1] }).tags).toEqual(['core']);
    expect(readTurboJson({}).tags).toEqual([]);
  });

  it.each([[null], [[]], ['text'], [1]])('reads a top-level %j that is not an object as an empty configuration', (value) => {
    const read = readTurboJson(value);
    expect(read.extends).toBeUndefined();
    expect(read.hasBoundaries).toBe(false);
    expect(read.tags).toEqual([]);
    expect(read.tasks.size).toBe(0);
  });
});

describe('readTurboJsonAt', () => {
  const fs = createMemoryFs({
    '/repo/turbo.json': '// root\n{"tasks": {"build": {"outputs": ["dist/**"],},},}',
    '/repo/broken/turbo.json': '{"tasks": ',
  });

  it('parses the JSONC file in the directory', () => {
    expect(readTurboJsonAt(fs, '/repo')?.tasks.get('build')?.hasOutputs).toBe(true);
  });

  it('is undefined when the directory has no turbo.json', () => {
    expect(readTurboJsonAt(fs, '/repo/none')).toBeUndefined();
  });

  it('throws naming the file when it is not valid JSONC', () => {
    expect(() => readTurboJsonAt(fs, '/repo/broken')).toThrow('"/repo/broken/turbo.json"');
  });
});

describe('findTurboRoot', () => {
  const fs = createMemoryFs({
    '/repo/turbo.json': '{"tasks": {"build": {}}}',
    '/repo/packages/a/turbo.json': '{"extends": ["//"], "tags": ["core"]}',
    '/repo/packages/a/src/x.ts': '',
    '/repo/packages/b/package.json': '{}',
    '/other/package.json': '{}',
    '/nested/turbo.json': '{"extends": ["//"]}',
    '/explicit/turbo.json': '{"tasks": {"lint": {}}}',
    '/mono/turbo.json': '{"tasks": {"build": {}}}',
    '/mono/pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
    '/mono/packages/broken/turbo.json': '{"tags": ["core"]}',
    '/npmmono/turbo.json': '{"tasks": {}}',
    '/npmmono/package.json': '{"workspaces": ["apps/*"]}',
    '/npmmono/apps/x/turbo.json': '{}',
  });

  it('finds the root configuration from the directory holding it', () => {
    const found = findTurboRoot(fs, '/repo', undefined);
    expect(found?.dir).toBe('/repo');
    expect(found?.turbo.tasks.has('build')).toBe(true);
  });

  it('walks past a package configuration that extends the root', () => {
    expect(findTurboRoot(fs, '/repo/packages/a', undefined)?.dir).toBe('/repo');
    expect(findTurboRoot(fs, '/repo/packages/a/src', undefined)?.dir).toBe('/repo');
  });

  it('finds the root from a package that has no turbo.json of its own', () => {
    expect(findTurboRoot(fs, '/repo/packages/b', undefined)?.dir).toBe('/repo');
  });

  it('prefers the configuration in a workspace root over a nearer one that forgot to extend', () => {
    expect(findTurboRoot(fs, '/mono/packages/broken', undefined)?.dir).toBe('/mono');
    expect(findTurboRoot(fs, '/npmmono/apps/x', undefined)?.dir).toBe('/npmmono');
  });

  it('falls back to the nearest configuration that does not extend when no workspace root holds one', () => {
    const lone = createMemoryFs({ '/a/turbo.json': '{}', '/a/b/turbo.json': '{}', '/a/b/c/package.json': '{}' });
    expect(findTurboRoot(lone, '/a/b/c', undefined)?.dir).toBe('/a/b');
  });

  it('considers the filesystem root itself', () => {
    const atRoot = createMemoryFs({ '/turbo.json': '{}', '/a/package.json': '{}' });
    expect(findTurboRoot(atRoot, '/a', undefined)?.dir).toBe('/');
  });

  it('is undefined when no directory above holds a root configuration', () => {
    expect(findTurboRoot(fs, '/other', undefined)).toBeUndefined();
    expect(findTurboRoot(fs, '/nested', undefined)).toBeUndefined();
  });

  it('uses the directory given by the root option, resolved, instead of searching', () => {
    const found = findTurboRoot(fs, '/repo/packages/a', '/explicit');
    expect(found?.dir).toBe('/explicit');
    expect(found?.turbo.tasks.has('lint')).toBe(true);
  });

  it('is undefined when the root option names a directory without a turbo.json', () => {
    expect(findTurboRoot(fs, '/repo', '/other')).toBeUndefined();
  });
});

describe('baseTaskName', () => {
  it.each([
    ['lint', 'lint'],
    ['//#lint', 'lint'],
    ['web#lint', 'lint'],
    ['@scope/web#lint:fix', 'lint:fix'],
  ])('reads %s as %s', (key, expected) => {
    expect(baseTaskName(key)).toBe(expected);
  });
});

describe('isGraphOnly', () => {
  it('is true for a task that only wires others together', () => {
    expect(isGraphOnly(task({ dependsOn: ['a'], keys: ['dependsOn'] }))).toBe(true);
    expect(isGraphOnly(task({ dependsOn: ['a'], keys: ['dependsOn', 'description'] }))).toBe(true);
  });

  it('is false without dependencies', () => {
    expect(isGraphOnly(task({ keys: [] }))).toBe(false);
    expect(isGraphOnly(task({ keys: ['description'] }))).toBe(false);
  });

  it('is false when the task configures anything else', () => {
    expect(isGraphOnly(task({ dependsOn: ['a'], keys: ['dependsOn', 'inputs'] }))).toBe(false);
    expect(isGraphOnly(task({ dependsOn: ['a'], keys: ['outputs'] }))).toBe(false);
  });
});

describe('mergeTask', () => {
  it('is the override alone when there is no base', () => {
    const override = task({ cache: false });
    expect(mergeTask(undefined, override)).toBe(override);
  });

  it('lets a key the override sets replace the base and inherits the rest', () => {
    const base = task({ dependsOn: ['^build'], with: ['w'], cache: true, persistent: false, hasOutputs: true, keys: ['dependsOn', 'with', 'cache', 'persistent', 'outputs'] });
    const override = task({ dependsOn: [], cache: false, keys: ['dependsOn', 'cache'] });
    expect(mergeTask(base, override)).toEqual({
      dependsOn: [],
      with: ['w'],
      cache: false,
      persistent: false,
      hasOutputs: true,
      keys: ['dependsOn', 'with', 'cache', 'persistent', 'outputs'],
    });
  });

  it('takes dependsOn and with from the base unless the override names the key', () => {
    const base = task({ dependsOn: ['a'], with: ['b'], keys: ['dependsOn', 'with'] });
    expect(mergeTask(base, task({ dependsOn: ['c'], with: ['d'], keys: ['dependsOn', 'with'] }))).toMatchObject({ dependsOn: ['c'], with: ['d'] });
    expect(mergeTask(base, task({ dependsOn: ['c'], with: ['d'], keys: [] }))).toMatchObject({ dependsOn: ['a'], with: ['b'] });
  });

  it('declares outputs when either side does, and lets persistent come from either side', () => {
    expect(mergeTask(task({ hasOutputs: true }), task()).hasOutputs).toBe(true);
    expect(mergeTask(task(), task({ hasOutputs: true })).hasOutputs).toBe(true);
    expect(mergeTask(task(), task()).hasOutputs).toBe(false);
    expect(mergeTask(task({ persistent: true }), task()).persistent).toBe(true);
    expect(mergeTask(task({ persistent: true }), task({ persistent: false })).persistent).toBe(false);
  });

  it('lists each key once', () => {
    expect(mergeTask(task({ keys: ['cache', 'outputs'] }), task({ keys: ['outputs', 'inputs'] })).keys).toEqual(['cache', 'outputs', 'inputs']);
  });
});

describe('resolveScriptTask', () => {
  const root = config({
    tasks: new Map([
      ['lint', task({ hasOutputs: true, keys: ['outputs'] })],
      ['//#lint', task({ cache: false, keys: ['cache'] })],
      ['web#lint', task({ persistent: true, keys: ['persistent'] })],
    ]),
  });

  it('prefers the root package qualifier for the root package', () => {
    expect(resolveScriptTask({ script: 'lint', root, qualifier: ROOT_PACKAGE_QUALIFIER, own: undefined })?.cache).toBe(false);
  });

  it('prefers the package qualifier for a named package', () => {
    expect(resolveScriptTask({ script: 'lint', root, qualifier: 'web', own: undefined })?.persistent).toBe(true);
  });

  it('falls back to the unqualified task', () => {
    expect(resolveScriptTask({ script: 'lint', root, qualifier: 'api', own: undefined })?.hasOutputs).toBe(true);
    expect(resolveScriptTask({ script: 'lint', root, qualifier: undefined, own: undefined })?.hasOutputs).toBe(true);
  });

  it('does not read a nameless package as a package called undefined', () => {
    const tricky = config({ tasks: new Map([['undefined#lint', task({ cache: false, keys: ['cache'] })]]) });
    expect(resolveScriptTask({ script: 'lint', root: tricky, qualifier: undefined, own: undefined })).toBeUndefined();
  });

  it('is undefined when nothing configures the script', () => {
    expect(resolveScriptTask({ script: 'test', root, qualifier: 'web', own: undefined })).toBeUndefined();
  });

  it('lays the package configuration over the resolved task', () => {
    const own = config({ extends: ['//'], tasks: new Map([['lint', task({ cache: false, keys: ['cache'] })]]) });
    expect(resolveScriptTask({ script: 'lint', root, qualifier: 'api', own })).toMatchObject({ cache: false, hasOutputs: true });
  });

  it('uses a package-only task when the root has none', () => {
    const own = config({ tasks: new Map([['test', task({ hasOutputs: true, keys: ['outputs'] })]]) });
    expect(resolveScriptTask({ script: 'test', root, qualifier: 'api', own })?.hasOutputs).toBe(true);
  });
});
