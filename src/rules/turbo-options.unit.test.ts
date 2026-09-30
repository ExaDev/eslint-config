import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DELEGATE, DEFAULT_FIX_FLAGS, DEFAULT_SCHEMA_HOSTS, DEFAULT_TASK_PREFIX, DEFAULT_TOOL_CONFIGS, loadTurboOptions, readTurboOptions, resolveTurboOptions, turboOptionsSchema } from './turbo-options';

const PREFIX = '@exadev/eslint-config: ';

describe('defaults', () => {
  it('name the conventional prefix, delegate and fixing flags', () => {
    expect(DEFAULT_TASK_PREFIX).toBe('_');
    expect(DEFAULT_DELEGATE).toBe('turbo run');
    expect(DEFAULT_FIX_FLAGS).toEqual(['--fix', '--write']);
  });

  it('pair the tools with the config files they read and name the hosts turbo publishes its schema under', () => {
    expect(DEFAULT_TOOL_CONFIGS).toEqual({ eslint: ['eslint.config.*'], tsc: ['tsconfig*.json'], vitest: ['vitest.config.*'] });
    expect(DEFAULT_SCHEMA_HOSTS).toEqual(['turborepo.com', 'turborepo.dev', 'turbo.build']);
  });
});

describe('turboOptionsSchema', () => {
  it('accepts exactly the keys the reader accepts', () => {
    expect(Object.keys(turboOptionsSchema.properties)).toEqual(['root', 'packages', 'prefix', 'delegate', 'exemptTasks', 'requireEmptyOutputs', 'fixFlags', 'toolConfigs', 'taskGraph', 'hygiene', 'boundaries']);
    expect(Object.keys(turboOptionsSchema.properties.boundaries.properties)).toEqual(['aggregateScript', 'groups', 'allowIgnore']);
    expect(Object.keys(turboOptionsSchema.properties.hygiene.properties)).toEqual(['schemaHosts', 'requireCiPassThrough', 'aggregateTask']);
    expect(Object.keys(turboOptionsSchema.properties.hygiene.properties.aggregateTask.properties)).toEqual(['name', 'includes']);
    expect(Object.keys(turboOptionsSchema.properties.taskGraph.items.properties)).toEqual(['task', 'dependsOn']);
    expect(turboOptionsSchema.properties.hygiene.additionalProperties).toBe(false);
    expect(turboOptionsSchema.properties.hygiene.properties.aggregateTask.additionalProperties).toBe(false);
    expect(turboOptionsSchema.properties.taskGraph.items.additionalProperties).toBe(false);
    expect(turboOptionsSchema.additionalProperties).toBe(false);
    expect(turboOptionsSchema.properties.boundaries.additionalProperties).toBe(false);
  });
});

describe('readTurboOptions', () => {
  it('reads no options as an empty object', () => {
    expect(readTurboOptions(undefined)).toEqual({});
    expect(readTurboOptions({})).toEqual({});
  });

  it('returns every valid option unchanged', () => {
    const options = {
      root: '/repo',
      packages: ['packages/*'],
      prefix: '__',
      delegate: 'turbo',
      exemptTasks: ['//#depcheck'],
      requireEmptyOutputs: true,
      fixFlags: ['--fix'],
      toolConfigs: { eslint: ['eslint.config.*', '.eslintrc.*'], stylelint: [], tsc: ['tsconfig.base.json'] },
      taskGraph: [{ task: '_build', dependsOn: ['_typecheck', '^_build'] }, { task: 'web#_build', dependsOn: ['gen'] }],
      hygiene: { schemaHosts: ['turborepo.dev'], requireCiPassThrough: true, aggregateTask: { name: '_prepush', includes: ['_lint', '_test'] } },
      boundaries: {
        aggregateScript: 'check',
        groups: [{ name: 'core' }, { name: 'app', path: 'apps' }],
        allowIgnore: [{ files: ['scripts/**'], reason: 'generated' }],
      },
    };
    expect(readTurboOptions(options)).toEqual(options);
  });

  it('accepts an empty boundaries object and an empty packages list', () => {
    expect(readTurboOptions({ boundaries: {}, packages: [] })).toEqual({ boundaries: {}, packages: [] });
  });

  it('accepts a false requireEmptyOutputs', () => {
    expect(readTurboOptions({ requireEmptyOutputs: false })).toEqual({ requireEmptyOutputs: false });
  });

  it('lists the accepted keys in the message', () => {
    expect(() => readTurboOptions('x')).toThrow(
      `${PREFIX}"turbo options" must be an object with only the keys "root", "packages", "prefix", "delegate", "exemptTasks", "requireEmptyOutputs", "fixFlags", "toolConfigs", "taskGraph", "hygiene", "boundaries".`,
    );
    expect(() => readTurboOptions({ taskGraph: [{ task: 'a', extra: 1 }] })).toThrow(`${PREFIX}"taskGraph entry" must be an object with only the keys "task", "dependsOn".`);
    expect(() => readTurboOptions({ hygiene: { nope: 1 } })).toThrow(`${PREFIX}"hygiene" must be an object with only the keys "schemaHosts", "requireCiPassThrough", "aggregateTask".`);
    expect(() => readTurboOptions({ hygiene: { aggregateTask: { name: 'a', extra: 1 } } })).toThrow(`${PREFIX}"hygiene.aggregateTask" must be an object with only the keys "name", "includes".`);
    expect(() => readTurboOptions({ boundaries: { groups: [{ nope: 1 }] } })).toThrow(`${PREFIX}"boundaries.groups entry" must be an object with only the keys "name", "path".`);
  });

  it('accepts both delegate forms', () => {
    expect(readTurboOptions({ delegate: 'turbo run' })).toEqual({ delegate: 'turbo run' });
    expect(readTurboOptions({ delegate: 'turbo' })).toEqual({ delegate: 'turbo' });
  });

  it.each([
    ['a non-object', 'x', 'turbo options'],
    ['null', null, 'turbo options'],
    ['an array', [], 'turbo options'],
    ['an unknown key', { prefx: '_' }, 'turbo options'],
    ['an unknown boundaries key', { boundaries: { group: [] } }, 'boundaries'],
    ['a non-object boundaries', { boundaries: [] }, 'boundaries'],
    ['an unknown group key', { boundaries: { groups: [{ name: 'a', rank: 1 }] } }, 'boundaries.groups entry'],
    ['a non-object group', { boundaries: { groups: ['a'] } }, 'boundaries.groups entry'],
    ['an unknown allowIgnore key', { boundaries: { allowIgnore: [{ files: ['a'], reason: 'r', extra: 1 }] } }, 'boundaries.allowIgnore entry'],
  ])('rejects %s naming %s', (_label, value, name) => {
    expect(() => readTurboOptions(value)).toThrow(new RegExp(`^${PREFIX}"${name.replaceAll('.', '\\.')}" must be an object`, 'u'));
  });

  it.each([
    ['root', { root: '' }, 'root', 'must be a non-empty string.'],
    ['root type', { root: 1 }, 'root', 'must be a non-empty string.'],
    ['prefix', { prefix: '' }, 'prefix', 'must be a non-empty string.'],
    ['packages type', { packages: 'a' }, 'packages', 'must be an array of non-empty strings.'],
    ['packages entry', { packages: [''] }, 'packages', 'must be a non-empty string.'],
    ['exemptTasks type', { exemptTasks: 'a' }, 'exemptTasks', 'must be an array of non-empty strings.'],
    ['exemptTasks entry', { exemptTasks: [1] }, 'exemptTasks', 'must be a non-empty string.'],
    ['fixFlags type', { fixFlags: '--fix' }, 'fixFlags', 'must be an array of non-empty strings.'],
    ['fixFlags empty', { fixFlags: [] }, 'fixFlags', 'must name at least one flag.'],
    ['delegate', { delegate: 'pnpm' }, 'delegate', 'must be "turbo run" or "turbo".'],
    ['requireEmptyOutputs', { requireEmptyOutputs: 'yes' }, 'requireEmptyOutputs', 'must be a boolean.'],
    ['aggregateScript', { boundaries: { aggregateScript: '' } }, 'boundaries.aggregateScript', 'must be a non-empty string.'],
    ['groups type', { boundaries: { groups: 'core' } }, 'boundaries.groups', 'must be an array.'],
    ['group name', { boundaries: { groups: [{ name: '' }] } }, 'boundaries.groups name', 'must be a non-empty string.'],
    ['group path', { boundaries: { groups: [{ name: 'a', path: '' }] } }, 'boundaries.groups path', 'must be a non-empty string.'],
    ['duplicate group', { boundaries: { groups: [{ name: 'a' }, { name: 'a' }] } }, 'boundaries.groups', 'declares more than one group named "a"'],
    ['allowIgnore type', { boundaries: { allowIgnore: {} } }, 'boundaries.allowIgnore', 'must be an array.'],
    ['allowIgnore reason', { boundaries: { allowIgnore: [{ files: ['a'], reason: '' }] } }, 'boundaries.allowIgnore reason', 'must be a non-empty string.'],
    ['toolConfigs type', { toolConfigs: [] }, 'toolConfigs', 'must be an object mapping a tool command word to its config file globs.'],
    ['toolConfigs null', { toolConfigs: null }, 'toolConfigs', 'must be an object mapping a tool command word to its config file globs.'],
    ['toolConfigs empty tool', { toolConfigs: { '': ['x'] } }, 'toolConfigs', 'must not name a tool with an empty command word.'],
    ['toolConfigs globs type', { toolConfigs: { eslint: 'eslint.config.*' } }, 'toolConfigs.eslint', 'must be an array of glob strings.'],
    ['toolConfigs duplicate', { toolConfigs: { eslint: ['a', 'a'] } }, 'toolConfigs.eslint', 'must not contain duplicate globs.'],
    ['toolConfigs path', { toolConfigs: { eslint: ['config/eslint.*'] } }, 'toolConfigs.eslint', 'must hold file name globs without "/"'],
    ['toolConfigs mixed path', { toolConfigs: { eslint: ['eslint.config.*', 'config/eslint.*'] } }, 'toolConfigs.eslint', 'must hold file name globs without "/"'],
    ['schemaHosts mixed', { hygiene: { schemaHosts: ['turborepo.com', 'https://x.io'] } }, 'hygiene.schemaHosts', 'must hold bare host names'],
    ['taskGraph type', { taskGraph: {} }, 'taskGraph', 'must be an array.'],
    ['taskGraph task', { taskGraph: [{ task: '', dependsOn: ['a'] }] }, 'taskGraph task', 'must be a non-empty string.'],
    ['taskGraph dependsOn type', { taskGraph: [{ task: 'a', dependsOn: 'b' }] }, 'taskGraph dependsOn', 'must be an array of non-empty strings.'],
    ['taskGraph dependsOn empty', { taskGraph: [{ task: 'a', dependsOn: [] }] }, 'taskGraph dependsOn', 'must name at least one entry.'],
    ['taskGraph dependsOn duplicate', { taskGraph: [{ task: 'a', dependsOn: ['b', 'b'] }] }, 'taskGraph dependsOn', 'must not name an entry twice.'],
    ['taskGraph duplicate task', { taskGraph: [{ task: 'a', dependsOn: ['b'] }, { task: 'a', dependsOn: ['c'] }] }, 'taskGraph', 'declares more than one entry for task "a"'],
    ['schemaHosts empty', { hygiene: { schemaHosts: [] } }, 'hygiene.schemaHosts', 'must name at least one entry.'],
    ['schemaHosts scheme', { hygiene: { schemaHosts: ['https://turborepo.com'] } }, 'hygiene.schemaHosts', 'must hold bare host names'],
    ['schemaHosts path', { hygiene: { schemaHosts: ['turborepo.com/schema.json'] } }, 'hygiene.schemaHosts', 'must hold bare host names'],
    ['schemaHosts space', { hygiene: { schemaHosts: ['turborepo .com'] } }, 'hygiene.schemaHosts', 'must hold bare host names'],
    ['requireCiPassThrough', { hygiene: { requireCiPassThrough: 1 } }, 'hygiene.requireCiPassThrough', 'must be a boolean.'],
    ['aggregateTask name', { hygiene: { aggregateTask: { name: '', includes: ['a'] } } }, 'hygiene.aggregateTask name', 'must be a non-empty string.'],
    ['aggregateTask includes', { hygiene: { aggregateTask: { name: 'a', includes: [] } } }, 'hygiene.aggregateTask includes', 'must name at least one entry.'],
    ['allowIgnore files', { boundaries: { allowIgnore: [{ files: [], reason: 'r' }] } }, 'boundaries.allowIgnore files', 'must contain at least one glob that does not start with "!".'],
  ])('rejects a bad %s', (_label, value, name, detail) => {
    expect(() => readTurboOptions(value)).toThrow(`${PREFIX}"${name}" ${detail}`);
  });
});

describe('resolveTurboOptions', () => {
  it('applies every default to empty options', () => {
    expect(resolveTurboOptions({})).toEqual({
      root: undefined,
      packages: undefined,
      prefix: '_',
      delegate: 'turbo run',
      exemptTasks: new Set(),
      requireEmptyOutputs: false,
      fixFlags: ['--fix', '--write'],
      toolConfigs: new Map([
        ['eslint', ['eslint.config.*']],
        ['tsc', ['tsconfig*.json']],
        ['vitest', ['vitest.config.*']],
      ]),
      taskGraph: [],
      schemaHosts: ['turborepo.com', 'turborepo.dev', 'turbo.build'],
      requireCiPassThrough: false,
      aggregateTask: undefined,
      boundaries: undefined,
    });
  });

  it('keeps every given option', () => {
    const boundaries = { aggregateScript: 'check' };
    const taskGraph = [{ task: '_build', dependsOn: ['_typecheck'] }];
    const aggregateTask = { name: '_prepush', includes: ['_lint'] };
    const given = {
      root: '/r',
      packages: ['a'],
      prefix: '__',
      delegate: 'turbo',
      exemptTasks: ['x', 'y'],
      requireEmptyOutputs: true,
      fixFlags: ['--apply'],
      toolConfigs: { eslint: ['.eslintrc.*'] },
      taskGraph,
      hygiene: { schemaHosts: ['turborepo.dev'], requireCiPassThrough: true, aggregateTask },
      boundaries,
    } as const;
    expect(resolveTurboOptions(given)).toEqual({
      root: '/r',
      packages: ['a'],
      prefix: '__',
      delegate: 'turbo',
      exemptTasks: new Set(['x', 'y']),
      requireEmptyOutputs: true,
      fixFlags: ['--apply'],
      toolConfigs: new Map([
        ['eslint', ['.eslintrc.*']],
        ['tsc', ['tsconfig*.json']],
        ['vitest', ['vitest.config.*']],
      ]),
      taskGraph,
      schemaHosts: ['turborepo.dev'],
      requireCiPassThrough: true,
      aggregateTask,
      boundaries,
    });
  });

  it('lays given tool configs over the defaults and drops a tool given an empty list', () => {
    const { toolConfigs } = resolveTurboOptions({ toolConfigs: { vitest: [], jest: ['jest.config.*'] } });
    expect([...toolConfigs]).toEqual([
      ['eslint', ['eslint.config.*']],
      ['tsc', ['tsconfig*.json']],
      ['jest', ['jest.config.*']],
    ]);
  });
});

describe('loadTurboOptions', () => {
  it('validates then resolves', () => {
    expect(loadTurboOptions({ prefix: '__' }).prefix).toBe('__');
    expect(loadTurboOptions(undefined).prefix).toBe('_');
    expect(() => loadTurboOptions({ nope: 1 })).toThrow(`${PREFIX}"turbo options" must be an object`);
  });
});

describe('turboOptionsSchema', () => {
  // ESLint validates a rule's options against its meta.schema before the rule runs.
  const verifyWith = (options: unknown) =>
    new Linter().verify('', [{ plugins: { t: { rules: { r: { meta: { schema: [turboOptionsSchema] }, create: () => ({}) } } } }, rules: { 't/r': ['error', options] } }]);

  it('accepts a named tool and rejects one with an empty command word', () => {
    expect(verifyWith({ toolConfigs: { eslint: ['eslint.config.*'] } })).toEqual([]);
    expect(() => verifyWith({ toolConfigs: { '': ['x'] } })).toThrow(/property name '' is invalid/u);
  });
});
