import { describe, expect, it } from 'vitest';
import { DEFAULT_DELEGATE, DEFAULT_FIX_FLAGS, DEFAULT_TASK_PREFIX, loadTurboOptions, readTurboOptions, resolveTurboOptions, turboOptionsSchema } from './turbo-options';

const PREFIX = '@exadev/eslint-config: ';

describe('defaults', () => {
  it('name the conventional prefix, delegate and fixing flags', () => {
    expect(DEFAULT_TASK_PREFIX).toBe('_');
    expect(DEFAULT_DELEGATE).toBe('turbo run');
    expect(DEFAULT_FIX_FLAGS).toEqual(['--fix', '--write']);
  });
});

describe('turboOptionsSchema', () => {
  it('accepts exactly the keys the reader accepts', () => {
    expect(Object.keys(turboOptionsSchema.properties)).toEqual(['root', 'packages', 'prefix', 'delegate', 'exemptTasks', 'requireEmptyOutputs', 'fixFlags', 'boundaries']);
    expect(Object.keys(turboOptionsSchema.properties.boundaries.properties)).toEqual(['aggregateScript', 'groups', 'allowIgnore']);
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
      boundaries: undefined,
    });
  });

  it('keeps every given option', () => {
    const boundaries = { aggregateScript: 'check' };
    expect(resolveTurboOptions({ root: '/r', packages: ['a'], prefix: '__', delegate: 'turbo', exemptTasks: ['x', 'y'], requireEmptyOutputs: true, fixFlags: ['--apply'], boundaries })).toEqual({
      root: '/r',
      packages: ['a'],
      prefix: '__',
      delegate: 'turbo',
      exemptTasks: new Set(['x', 'y']),
      requireEmptyOutputs: true,
      fixFlags: ['--apply'],
      boundaries,
    });
  });
});

describe('loadTurboOptions', () => {
  it('validates then resolves', () => {
    expect(loadTurboOptions({ prefix: '__' }).prefix).toBe('__');
    expect(loadTurboOptions(undefined).prefix).toBe('_');
    expect(() => loadTurboOptions({ nope: 1 })).toThrow(`${PREFIX}"turbo options" must be an object`);
  });
});
