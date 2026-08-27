import { describe, expect, it } from 'vitest';
import { readFlatConfig, tryRequire } from './optional-plugin';

describe('tryRequire', () => {
  it('returns the resolved module on real, successful resolution', () => {
    // 'eslint' is a genuine, always-present peer/dev dependency of this repo -- proves the real success path end-to-end, not just an injected stand-in.
    expect(tryRequire('eslint')).toBeDefined();
  });

  it('returns undefined for a real, genuinely unresolvable specifier -- no uninstalling required', () => {
    expect(tryRequire('@exadev/definitely-not-a-real-package')).toBeUndefined();
  });

  it('returns the injected requireFn result on success', () => {
    const fakeModule = { configs: { recommended: {} } };
    expect(tryRequire('anything', () => fakeModule)).toBe(fakeModule);
  });

  it('returns undefined when the injected requireFn throws', () => {
    expect(
      tryRequire('anything', () => {
        throw new Error('simulated missing package');
      }),
    ).toBeUndefined();
  });
});

describe('readFlatConfig', () => {
  it('returns the value at a fully-present path', () => {
    const module = { configs: { flat: { recommended: { rules: { 'some-rule': 'error' } } } } };
    expect(readFlatConfig(module, ['configs', 'flat', 'recommended'])).toEqual({ rules: { 'some-rule': 'error' } });
  });

  it('returns undefined when the path is missing partway through', () => {
    const module = { configs: {} };
    expect(readFlatConfig(module, ['configs', 'flat', 'recommended'])).toBeUndefined();
  });

  it('returns undefined when the leaf is not object-shaped', () => {
    const module = { configs: { recommended: 'not an object' } };
    expect(readFlatConfig(module, ['configs', 'recommended'])).toBeUndefined();
  });

  it('returns undefined for a non-object module', () => {
    expect(readFlatConfig(undefined, ['configs', 'recommended'])).toBeUndefined();
    expect(readFlatConfig('a string', ['configs', 'recommended'])).toBeUndefined();
  });

  it('returns the value at the root when path is empty', () => {
    const module = { rules: {} };
    expect(readFlatConfig(module, [])).toEqual(module);
  });
});
