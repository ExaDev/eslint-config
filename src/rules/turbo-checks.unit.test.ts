import { describe, expect, it } from 'vitest';
import { BOUNDARIES_COMMAND, checkBoundariesScripts, checkConvention, checkTaskScripts, fixFlagsIn, isExemptTask, outputProblem, tagProblem } from './turbo-checks';
import type { TurboJson, TurboTask } from './turbo-json';
import type { TurboPackage } from './turbo-workspace';

function task(fields: Partial<TurboTask> = {}): TurboTask {
  return { dependsOn: [], with: [], cache: undefined, persistent: undefined, hasOutputs: false, inputs: undefined, keys: [], ...fields };
}

function turbo(fields: Partial<TurboJson> = {}): TurboJson {
  return { extends: undefined, schema: undefined, globalDependencies: [], globalPassThroughEnv: undefined, hasBoundaries: false, tags: [], tasks: new Map(), ...fields };
}

function pkg(name: string | undefined, scripts: Readonly<Record<string, string>>, dir = ''): TurboPackage {
  return { dir, name, scripts: new Map(Object.entries(scripts)) };
}

const NONE: ReadonlySet<string> = new Set();

describe('isExemptTask', () => {
  it('matches the full key or the unqualified name', () => {
    expect(isExemptTask('//#lint', new Set(['//#lint']))).toBe(true);
    expect(isExemptTask('//#lint', new Set(['lint']))).toBe(true);
    expect(isExemptTask('web#lint', new Set(['lint']))).toBe(true);
    expect(isExemptTask('lint', new Set(['test']))).toBe(false);
    expect(isExemptTask('lint', NONE)).toBe(false);
  });
});

describe('checkConvention', () => {
  const rootTasks = new Map([
    ['_lint', task()],
    ['_test', task()],
  ]);
  const base = { rootTasks, prefix: '_', delegate: 'turbo run', exempt: NONE } as const;

  function run(scripts: Readonly<Record<string, string | undefined>>, isRoot: boolean, overrides: Partial<Parameters<typeof checkConvention>[0]> = {}) {
    return checkConvention({ ...base, commands: new Map(Object.entries(scripts)), isRoot, ...overrides });
  }

  it('accepts a root package whose public scripts delegate', () => {
    expect(run({ _lint: 'eslint .', lint: 'turbo run _lint', _test: 'vitest', test: 'turbo run _test --force' }, true)).toEqual([]);
  });

  it('reports a prefixed root script with no public counterpart, on the prefixed script', () => {
    expect(run({ _lint: 'eslint .' }, true)).toEqual([{ kind: 'missingPublicScript', script: '_lint', expected: 'lint', actual: '' }]);
  });

  it('reports a public root script that runs the tool directly', () => {
    expect(run({ _lint: 'eslint .', lint: 'eslint .' }, true)).toEqual([{ kind: 'notDelegating', script: 'lint', expected: 'turbo run _lint', actual: 'eslint .' }]);
  });

  it('reports a public root script that mixes the tool with turbo', () => {
    expect(run({ _typecheck: 'tsc', typecheck: 'tsc --noEmit && turbo run _typecheck' }, true)).toEqual([
      { kind: 'notDelegating', script: 'typecheck', expected: 'turbo run _typecheck', actual: 'tsc --noEmit && turbo run _typecheck' },
    ]);
  });

  it('reports a public root script whose value is not a string as delegating nothing', () => {
    expect(run({ _lint: 'eslint .', lint: undefined }, true)).toEqual([{ kind: 'notDelegating', script: 'lint', expected: 'turbo run _lint', actual: '' }]);
  });

  it('honours the delegate form', () => {
    expect(run({ _lint: 'x', lint: 'turbo _lint' }, true, { delegate: 'turbo' })).toEqual([]);
    expect(run({ _lint: 'x', lint: 'turbo run _lint' }, true, { delegate: 'turbo' })).toEqual([
      { kind: 'notDelegating', script: 'lint', expected: 'turbo _lint', actual: 'turbo run _lint' },
    ]);
  });

  it('honours the prefix', () => {
    expect(run({ __lint: 'x', _other: 'y' }, true, { prefix: '__' })).toEqual([{ kind: 'missingPublicScript', script: '__lint', expected: 'lint', actual: '' }]);
  });

  it('ignores a script that is only the prefix', () => {
    expect(run({ _: 'x' }, true)).toEqual([]);
  });

  it('skips exempt tasks', () => {
    expect(run({ _lint: 'x', _test: 'y' }, true, { exempt: new Set(['_lint']) })).toEqual([{ kind: 'missingPublicScript', script: '_test', expected: 'test', actual: '' }]);
  });

  it('lets a non-root package keep prefixed scripts without a public counterpart', () => {
    expect(run({ _lint: 'eslint .', _test: 'vitest' }, false)).toEqual([]);
  });

  it('reports a bare script in a non-root package named after a task the root orchestrates', () => {
    expect(run({ lint: 'eslint .', build: 'tsc', _test: 'vitest' }, false)).toEqual([{ kind: 'bareTaskScript', script: 'lint', expected: '_lint', actual: 'eslint .' }]);
  });

  it('reports a bare script whose value is not a string with an empty command', () => {
    expect(run({ lint: undefined }, false)).toEqual([{ kind: 'bareTaskScript', script: 'lint', expected: '_lint', actual: '' }]);
  });

  it('does not report a bare script in the root package', () => {
    expect(run({ lint: 'turbo run _lint' }, true)).toEqual([]);
  });

  it('skips a shadowed task that is exempt', () => {
    expect(run({ lint: 'eslint .' }, false, { exempt: new Set(['_lint']) })).toEqual([]);
  });
});

describe('checkTaskScripts', () => {
  function taskMap(tasks: Readonly<Record<string, Partial<TurboTask>>>): ReadonlyMap<string, TurboTask> {
    return new Map(Object.entries(tasks).map(([key, fields]) => [key, task(fields)]));
  }

  function check(tasks: Readonly<Record<string, Partial<TurboTask>>>, root: TurboPackage, members: readonly TurboPackage[] = []) {
    return checkTaskScripts({ tasks: taskMap(tasks), root, members, exempt: NONE });
  }

  it('accepts a task a workspace member implements and a root script invokes', () => {
    const problems = check({ _lint: {} }, pkg('root', { lint: 'turbo run _lint' }), [pkg('a', { _lint: 'eslint' }, 'packages/a')]);
    expect(problems).toEqual([]);
  });

  it('reports a task no member implements', () => {
    expect(check({ _lint: {} }, pkg('root', { _lint: 'x' }), [pkg('a', { _test: 'y' }, 'packages/a')])).toEqual([{ kind: 'unimplementedTask', task: '_lint' }]);
  });

  it('counts the root package as the implementation only in a repository with no members', () => {
    expect(check({ _lint: {} }, pkg('root', { _lint: 'x' }))).toEqual([]);
    expect(check({ _lint: {} }, pkg('root', { _lint: 'x' }), [pkg('a', {}, 'packages/a')])).toEqual([{ kind: 'unimplementedTask', task: '_lint' }]);
  });

  it('exempts a junction task, which has dependsOn and no script anywhere', () => {
    expect(check({ check: { dependsOn: ['_lint'] }, _lint: {} }, pkg('root', { c: 'turbo run check' }), [pkg('a', { _lint: 'e' }, 'packages/a')])).toEqual([]);
  });

  it('resolves a // task against the root package scripts, whatever they hold', () => {
    const root = pkg('root', { 'test:coverage': 'vitest --coverage', noop: ':', run: 'turbo run //#test:coverage //#noop //#missing' });
    expect(check({ '//#test:coverage': {}, '//#noop': {}, '//#missing': {} }, root, [pkg('a', {}, 'packages/a')])).toEqual([{ kind: 'unimplementedTask', task: '//#missing' }]);
  });

  it('does not resolve a // task against a member script', () => {
    expect(check({ '//#lint': {} }, pkg('root', { r: 'turbo run //#lint' }), [pkg('a', { lint: 'x' }, 'packages/a')])).toEqual([{ kind: 'unimplementedTask', task: '//#lint' }]);
  });

  it('resolves a package-qualified task against the package of that name', () => {
    const members = [pkg('web', { build: 'x' }, 'apps/web'), pkg('api', { lint: 'y' }, 'apps/api')];
    const root = pkg('root', { r: 'turbo run web#build api#build web#lint' });
    expect(check({ 'web#build': {}, 'api#build': {}, 'web#lint': {} }, root, members)).toEqual([
      { kind: 'unimplementedTask', task: 'api#build' },
      { kind: 'unimplementedTask', task: 'web#lint' },
    ]);
  });

  it('resolves a scoped package-qualified task by splitting at the last #', () => {
    const members = [pkg('@s/web', { build: 'x' }, 'apps/web')];
    expect(check({ '@s/web#build': {} }, pkg('root', { r: 'turbo run @s/web#build' }), members)).toEqual([]);
  });

  it('does not treat a task name found only in an unnamed package as implemented by name', () => {
    expect(check({ 'web#build': {} }, pkg('root', { r: 'turbo run web#build' }), [pkg(undefined, { build: 'x' }, 'apps/web')])).toEqual([{ kind: 'unimplementedTask', task: 'web#build' }]);
  });

  it('reports a // task nothing depends on or invokes', () => {
    const root = pkg('root', { depcheck: 'depcheck', lint: 'turbo run _lint' });
    expect(check({ '//#depcheck': {}, _lint: {} }, root, [pkg('a', { _lint: 'e' }, 'packages/a')])).toEqual([{ kind: 'unreachableTask', task: '//#depcheck' }]);
  });

  it('accepts a // task that a root script runs by its bare name', () => {
    const root = pkg('root', { 'lint:root': 'eslint .', check: 'turbo run lint:root' });
    expect(check({ '//#lint:root': {} }, root, [pkg('a', {}, 'packages/a')])).toEqual([]);
  });

  it('accepts a // task that another // task lists by its bare name', () => {
    const root = pkg('root', { fmt: 'prettier .', check: 'c', verify: 'turbo run check' });
    const members = [pkg('a', {}, 'packages/a')];
    expect(check({ '//#fmt': {}, '//#check': { dependsOn: ['fmt'] } }, root, members)).toEqual([]);
    expect(check({ '//#fmt': {}, '//#check': { with: ['fmt'] } }, root, members)).toEqual([]);
  });

  it('does not read an unrelated bare entry of a // task as a reference to another // task', () => {
    const root = pkg('root', { fmt: 'prettier .', other: 'o', verify: 'turbo run other' });
    expect(check({ '//#fmt': {}, '//#other': { dependsOn: ['lint'] } }, root, [pkg('a', { lint: 'l' }, 'packages/a')])).toEqual([{ kind: 'unreachableTask', task: '//#fmt' }]);
  });

  it('does not read a bare dependsOn entry of a non-root task as a reference to a // task', () => {
    const root = pkg('root', { fmt: 'prettier .', verify: 'turbo run all' });
    const members = [pkg('a', {}, 'packages/a')];
    expect(check({ '//#fmt': {}, all: { dependsOn: ['fmt'] } }, root, members)).toEqual([{ kind: 'unreachableTask', task: '//#fmt' }]);
  });

  it('does not read the bare name of a // task as a reference to a package-qualified or unrelated task', () => {
    const root = pkg('root', { fmt: 'prettier .', verify: 'turbo run web#fmt' });
    expect(check({ '//#fmt': {} }, root, [pkg('a', {}, 'packages/a')])).toEqual([{ kind: 'unreachableTask', task: '//#fmt' }]);
  });

  it('accepts a // task another task depends on or runs alongside', () => {
    const root = pkg('root', { depcheck: 'd', cov: 'c', all: 'turbo run all' });
    const members = [pkg('a', { _lint: 'e' }, 'packages/a')];
    expect(check({ '//#depcheck': {}, '//#cov': {}, all: { dependsOn: ['//#depcheck', '_lint'], with: ['//#cov'] }, _lint: {} }, root, members)).toEqual([]);
  });

  it('reads the ^ prefix of a dependsOn entry as part of the dependency form, not the key', () => {
    const root = pkg('root', { r: 'turbo run all' });
    expect(check({ all: { dependsOn: ['^_build'] }, _build: {} }, root, [pkg('a', { _build: 'b' }, 'packages/a')])).toEqual([]);
  });

  it('reports an aggregate that only unrelated tasks depend on', () => {
    const members = [pkg('a', { _lint: 'e' }, 'packages/a')];
    const root = pkg('root', { r: 'turbo run other' });
    expect(check({ check: { dependsOn: ['_lint'] }, other: { dependsOn: ['_lint'] }, _lint: {} }, root, members)).toEqual([{ kind: 'unreachableTask', task: 'check' }]);
  });

  it('accepts an aggregate another task reaches through a ^ dependency', () => {
    const members = [pkg('a', { _lint: 'e' }, 'packages/a')];
    const root = pkg('root', { r: 'turbo run outer' });
    expect(check({ inner: { dependsOn: ['_lint'] }, outer: { dependsOn: ['^inner'] }, _lint: {} }, root, members)).toEqual([]);
  });

  it('reports an aggregate nothing depends on or invokes', () => {
    const problems = check({ check: { dependsOn: ['_lint'] }, _lint: {} }, pkg('root', { lint: 'turbo run _lint' }), [pkg('a', { _lint: 'e' }, 'packages/a')]);
    expect(problems).toEqual([{ kind: 'unreachableTask', task: 'check' }]);
  });

  it('accepts an aggregate a root script invokes, in any turbo form', () => {
    const members = [pkg('a', { _lint: 'e' }, 'packages/a')];
    expect(check({ check: { dependsOn: ['_lint'] }, _lint: {} }, pkg('root', { c: 'pnpm turbo run check --force' }), members)).toEqual([]);
    expect(check({ check: { dependsOn: ['_lint'] }, _lint: {} }, pkg('root', { c: 'turbo check' }), members)).toEqual([]);
  });

  it('does not let a task keep itself reachable', () => {
    const members = [pkg('a', { _lint: 'e' }, 'packages/a')];
    expect(check({ check: { dependsOn: ['check', '_lint'] }, _lint: {} }, pkg('root', {}), members)).toEqual([{ kind: 'unreachableTask', task: 'check' }]);
  });

  it('does not require a leaf task to be reachable', () => {
    expect(check({ _lint: {} }, pkg('root', {}), [pkg('a', { _lint: 'e' }, 'packages/a')])).toEqual([]);
  });

  it('reports both problems for a // task that is neither implemented nor reachable', () => {
    expect(check({ '//#gone': {} }, pkg('root', {}))).toEqual([
      { kind: 'unimplementedTask', task: '//#gone' },
      { kind: 'unreachableTask', task: '//#gone' },
    ]);
  });

  it('skips exempt tasks', () => {
    expect(checkTaskScripts({ tasks: taskMap({ '//#gone': {}, _x: {} }), root: pkg('root', {}), members: [], exempt: new Set(['gone']) })).toEqual([{ kind: 'unimplementedTask', task: '_x' }]);
  });
});

describe('outputProblem', () => {
  const off = { requireEmptyOutputs: false };
  const on = { requireEmptyOutputs: true };

  it('accepts a cached task that declares outputs, empty or not', () => {
    expect(outputProblem(task({ hasOutputs: true }), off)).toBeUndefined();
  });

  it('reports a cached task with no outputs key', () => {
    expect(outputProblem(task(), off)).toBe('missingOutputs');
    expect(outputProblem(task({ cache: true }), off)).toBe('missingOutputs');
    expect(outputProblem(task({ persistent: false, keys: ['persistent'] }), off)).toBe('missingOutputs');
  });

  it('exempts an uncached task and a graph-only task by default', () => {
    expect(outputProblem(task({ cache: false }), off)).toBeUndefined();
    expect(outputProblem(task({ dependsOn: ['a'], keys: ['dependsOn'] }), off)).toBeUndefined();
  });

  it('requires the list on every task when asked', () => {
    expect(outputProblem(task({ cache: false }), on)).toBe('missingOutputs');
    expect(outputProblem(task({ dependsOn: ['a'], keys: ['dependsOn'] }), on)).toBe('missingOutputs');
    expect(outputProblem(task({ hasOutputs: true, cache: false }), on)).toBeUndefined();
  });

  it('reports a persistent task that is cached, before anything about outputs', () => {
    expect(outputProblem(task({ persistent: true }), off)).toBe('persistentCached');
    expect(outputProblem(task({ persistent: true, cache: true, hasOutputs: true }), off)).toBe('persistentCached');
  });

  it('accepts a persistent task that disables caching', () => {
    expect(outputProblem(task({ persistent: true, cache: false }), off)).toBeUndefined();
  });
});

describe('fixFlagsIn', () => {
  it('returns the listed flags the command passes', () => {
    expect(fixFlagsIn('eslint . --fix --cache', ['--fix', '--write'])).toEqual(['--fix']);
    expect(fixFlagsIn('prettier --write . && eslint --fix .', ['--fix', '--write'])).toEqual(['--fix', '--write']);
  });

  it('compares whole tokens', () => {
    expect(fixFlagsIn('eslint . --fix-type problem', ['--fix'])).toEqual([]);
    expect(fixFlagsIn('eslint . --fixed', ['--fix'])).toEqual([]);
  });

  it('reads a flag with a value however it is written', () => {
    expect(fixFlagsIn('tool --apply=all', ['--apply all'])).toEqual(['--apply all']);
  });

  it('returns nothing for a command without them', () => {
    expect(fixFlagsIn('eslint . --cache', ['--fix'])).toEqual([]);
    expect(fixFlagsIn('', ['--fix'])).toEqual([]);
  });
});

describe('tagProblem', () => {
  const good = turbo({ extends: ['//'], tags: ['core'] });

  it('accepts a package configuration that extends the root and is tagged', () => {
    expect(tagProblem(good, undefined)).toBeUndefined();
    expect(tagProblem(good, 'core')).toBeUndefined();
    expect(tagProblem(turbo({ extends: ['//', 'web'], tags: ['core', 'extra'] }), 'core')).toBeUndefined();
  });

  it('reports a missing turbo.json', () => {
    expect(tagProblem(undefined, 'core')).toBe('missingTurboJson');
  });

  it('reports a configuration that does not extend the root', () => {
    expect(tagProblem(turbo({ tags: ['core'] }), undefined)).toBe('notExtendingRoot');
    expect(tagProblem(turbo({ extends: [], tags: ['core'] }), undefined)).toBe('notExtendingRoot');
    expect(tagProblem(turbo({ extends: ['web'], tags: ['core'] }), undefined)).toBe('notExtendingRoot');
  });

  it('reports empty tags', () => {
    expect(tagProblem(turbo({ extends: ['//'] }), undefined)).toBe('missingTags');
  });

  it('reports tags that lack the group name', () => {
    expect(tagProblem(turbo({ extends: ['//'], tags: ['other'] }), 'core')).toBe('missingGroupTag');
  });

  it('reports problems in order of severity', () => {
    expect(tagProblem(turbo({ tags: [] }), 'core')).toBe('notExtendingRoot');
  });
});

describe('checkBoundariesScripts', () => {
  it('names the one command', () => {
    expect(BOUNDARIES_COMMAND).toBe('turbo boundaries');
  });

  function check(scripts: Readonly<Record<string, string | undefined>>, aggregate?: string) {
    return checkBoundariesScripts(new Map(Object.entries(scripts)), aggregate);
  }

  it('accepts the exact script, however it is spaced', () => {
    expect(check({ boundaries: 'turbo boundaries' })).toEqual([]);
    expect(check({ boundaries: ' turbo   boundaries ' })).toEqual([]);
  });

  it('reports a missing boundaries script', () => {
    expect(check({})).toEqual([{ kind: 'missingBoundariesScript', script: 'boundaries', actual: '' }]);
  });

  it('reports a boundaries script that is anything else', () => {
    expect(check({ boundaries: 'turbo boundaries --ignore=all' })).toEqual([{ kind: 'boundariesScriptMismatch', script: 'boundaries', actual: 'turbo boundaries --ignore=all' }]);
    expect(check({ boundaries: 'true' })).toEqual([{ kind: 'boundariesScriptMismatch', script: 'boundaries', actual: 'true' }]);
    expect(check({ boundaries: undefined })).toEqual([{ kind: 'boundariesScriptMismatch', script: 'boundaries', actual: '' }]);
  });

  it('checks nothing about an aggregate unless one is named', () => {
    expect(check({ boundaries: 'turbo boundaries', check: 'pnpm lint' })).toEqual([]);
  });

  it('accepts an aggregate that runs the check', () => {
    expect(check({ boundaries: 'turbo boundaries', check: 'pnpm lint && pnpm boundaries' }, 'check')).toEqual([]);
    expect(check({ boundaries: 'turbo boundaries', check: 'turbo boundaries' }, 'check')).toEqual([]);
  });

  it('reports an aggregate that does not run the check', () => {
    expect(check({ boundaries: 'turbo boundaries', check: 'pnpm lint' }, 'check')).toEqual([{ kind: 'aggregateSkipsBoundaries', script: 'check', actual: 'pnpm lint' }]);
    expect(check({ boundaries: 'turbo boundaries', check: undefined }, 'check')).toEqual([{ kind: 'aggregateSkipsBoundaries', script: 'check', actual: '' }]);
  });

  it('reports a named aggregate that does not exist', () => {
    expect(check({ boundaries: 'turbo boundaries' }, 'check')).toEqual([{ kind: 'missingAggregateScript', script: 'check', actual: '' }]);
  });

  it('reports the script and the aggregate problems together', () => {
    expect(check({}, 'check').map((problem) => problem.kind)).toEqual(['missingBoundariesScript', 'missingAggregateScript']);
  });
});
