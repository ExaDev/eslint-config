import { describe, expect, it } from 'vitest';
import { buildOptionalPluginConfig, readFlatConfig, tryRequire } from './optional-plugin';

describe('tryRequire', () => {
  it('returns the resolved module on real, successful resolution', () => {
    // 'eslint' is a genuine, always-present peer/dev dependency of this repo — proves the real success path end-to-end, not just an injected stand-in.
    expect(tryRequire('eslint')).toBeDefined();
  });

  it('returns undefined for a real, genuinely unresolvable specifier — no uninstalling required', () => {
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

  it('returns undefined for a null module, without throwing — typeof null === "object", so the explicit null check is load-bearing, not redundant', () => {
    expect(() => readFlatConfig(null, ['configs'])).not.toThrow();
    expect(readFlatConfig(null, ['configs'])).toBeUndefined();
  });

  it('returns undefined when an intermediate path segment is null, without throwing', () => {
    const module = { configs: null };
    expect(() => readFlatConfig(module, ['configs', 'recommended'])).not.toThrow();
    expect(readFlatConfig(module, ['configs', 'recommended'])).toBeUndefined();
  });

  it('returns the value at the root when path is empty', () => {
    const module = { rules: {} };
    expect(readFlatConfig(module, [])).toEqual(module);
  });

  it('relocates a legacy top-level parserOptions into languageOptions.parserOptions', () => {
    const module = { configs: { recommended: { parserOptions: { ecmaFeatures: { jsx: true } }, rules: {} } } };
    expect(readFlatConfig(module, ['configs', 'recommended'])).toEqual({
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      rules: {},
    });
  });

  it('merges a legacy top-level parserOptions into an already-present languageOptions rather than overwriting it', () => {
    const module = {
      configs: {
        recommended: {
          parserOptions: { ecmaFeatures: { jsx: true } },
          languageOptions: { sourceType: 'module' },
          rules: {},
        },
      },
    };
    expect(readFlatConfig(module, ['configs', 'recommended'])).toEqual({
      languageOptions: { sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
      rules: {},
    });
  });
});

describe('buildOptionalPluginConfig', () => {
  const preset = { packageName: 'some-plugin', configPath: ['configs', 'flat/recommended'], feature: 'Some feature' };
  const upstream = { rules: { 'some/rule': 'error' } };
  const present = () => ({ configs: { 'flat/recommended': upstream } });
  const absent = () => {
    throw new Error('simulated missing package');
  };

  it('returns the config at the path when the package resolves, and [] when it does not', () => {
    expect(buildOptionalPluginConfig(preset, { requireFn: present })).toEqual([upstream]);
    expect(buildOptionalPluginConfig(preset, { requireFn: absent })).toEqual([]);
  });

  it('returns [] for enabled: false even when the package resolves', () => {
    expect(buildOptionalPluginConfig(preset, { enabled: false, requireFn: present })).toEqual([]);
  });

  it('treats enabled: undefined, given explicitly, as auto-detect', () => {
    expect(buildOptionalPluginConfig(preset, { enabled: undefined, requireFn: present })).toEqual([upstream]);
    expect(buildOptionalPluginConfig(preset, { enabled: undefined, requireFn: absent })).toEqual([]);
  });

  it('throws with the feature, package and install command for enabled: true when the package or the config path is missing', () => {
    const message = "@exadev/eslint-config: Some feature was explicitly requested but 'some-plugin' could not be resolved. Install it with: pnpm add -D some-plugin";
    expect(() => buildOptionalPluginConfig(preset, { enabled: true, requireFn: absent })).toThrow(message);
    expect(() => buildOptionalPluginConfig(preset, { enabled: true, requireFn: () => ({ configs: {} }) })).toThrow(message);
    expect(buildOptionalPluginConfig(preset, { enabled: true, requireFn: present })).toEqual([upstream]);
  });

  it('replaces the upstream files with a copy of the preset files, leaving the upstream config untouched', () => {
    const files = ['**/*.ts'];
    const [config] = buildOptionalPluginConfig({ ...preset, files }, { requireFn: present });
    expect(config).toEqual({ ...upstream, files: ['**/*.ts'] });
    expect(config?.files).not.toBe(files);
    expect(upstream).not.toHaveProperty('files');
    expect(buildOptionalPluginConfig({ ...preset, files }, { requireFn: () => ({ configs: { 'flat/recommended': { files: ['x'] } } }) })).toEqual([{ files: ['**/*.ts'] }]);
  });
});
