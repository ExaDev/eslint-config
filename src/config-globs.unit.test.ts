import { describe, expect, it } from 'vitest';
import { scopeBlock, scopeOfValidated } from './config-globs';

describe('scopeBlock', () => {
  it('selects the given globs and ignores nothing when nothing is excluded', () => {
    const scope = scopeBlock(['src/**', 'lib/**'], 'option');
    expect(scope.files).toStrictEqual(['src/**', 'lib/**']);
    expect(scope).not.toHaveProperty('ignores');
  });

  it('turns each ! glob into an ignore with the ! removed', () => {
    expect(scopeBlock(['src/**', '!src/gen/**', '!**/*.d.ts'], 'option')).toStrictEqual({ files: ['src/**'], ignores: ['src/gen/**', '**/*.d.ts'] });
  });

  it('validates the list, naming the option', () => {
    expect(() => scopeBlock('src/**', 'thing.files')).toThrow('"thing.files" must be an array of glob strings.');
    expect(() => scopeBlock(['!src/**'], 'thing.files')).toThrow('"thing.files" must contain at least one glob that does not start with "!".');
  });
});

describe('scopeOfValidated', () => {
  it('splits an already validated list without validating it again', () => {
    expect(scopeOfValidated(['src/**', '!src/gen/**'])).toStrictEqual({ files: ['src/**'], ignores: ['src/gen/**'] });
    expect(scopeOfValidated(['src/**'])).not.toHaveProperty('ignores');
  });
});
