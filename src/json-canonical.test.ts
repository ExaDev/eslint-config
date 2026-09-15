import { Linter } from 'eslint';
import { describe, expect, it, vi } from 'vitest';
import { toPublicConfigArray } from './to-public-config-array';

// A plain static `import ... from './json-canonical'` at file scope, or a shared `beforeAll` importing it once, would run that module's own top-level `requireConfig()` calls — which can throw — outside any single test's own execution, so Vitest reports the failure as a suite-level/hook-level error rather than a specific test failing (confirmed directly: under a mutation that makes isSingleFlatConfig always reject a genuinely valid config, both a top-level static import and a shared beforeAll produce a "Failed Suite" that a mutation testing tool's own result parsing does not register as a kill). Every test below instead performs its own `await import('./json-canonical')` inside its own body: Node's module cache means this is a cheap, already-resolved lookup once the module has loaded successfully, but if the module's own top-level code throws, that throw happens during this specific test's own execution and is reported as an ordinary failed test, exactly like the mocked-failure cases already were.
async function loadJsonCanonicalConfig() {
  const jsonCanonicalModule = await import('./json-canonical');
  return jsonCanonicalModule.default;
}

async function loadIsSingleFlatConfig() {
  const jsonCanonicalModule = await import('./json-canonical');
  return jsonCanonicalModule.isSingleFlatConfig;
}

describe('jsonCanonicalConfig', () => {
  it('is exactly three config blocks: plain JSON, JSONC-shaped families, and a package.json override', async () => {
    const jsonCanonicalConfig = await loadJsonCanonicalConfig();
    const blockCount = 3;
    expect(jsonCanonicalConfig).toHaveLength(blockCount);
    const [plainJson, jsonc, packageJsonOverride] = jsonCanonicalConfig;
    expect(plainJson?.files).toStrictEqual(['**/*.json']);
    expect(plainJson?.ignores).toStrictEqual(['**/*.jsonc', '**/tsconfig*.json', '**/turbo.json']);
    expect(plainJson?.language).toBe('json/json');
    expect(jsonc?.files).toStrictEqual(['**/*.jsonc', '**/tsconfig*.json', '**/turbo.json']);
    expect(jsonc?.language).toBe('json/jsonc');
    expect(packageJsonOverride?.files).toStrictEqual(['**/package.json']);
  });

  it('the plain-JSON block enables sort-keys (plain UTF-16 code-unit order), number-format, string-escaping, and pretty-format', async () => {
    const [plainJson] = await loadJsonCanonicalConfig();
    expect(plainJson?.rules?.['json/sort-keys']).toStrictEqual(['error', 'asc', { caseSensitive: true, natural: false }]);
    expect(plainJson?.rules?.['json-canonical/number-format']).toBe('error');
    expect(plainJson?.rules?.['json-canonical/string-escaping']).toBe('error');
    expect(plainJson?.rules?.['json-canonical/pretty-format']).toBe('error');
  });

  it('does not enable no-insignificant-whitespace: configs.recommended deliberately leaves it opt-in', async () => {
    const [plainJson] = await loadJsonCanonicalConfig();
    expect(plainJson?.rules?.['json-canonical/no-insignificant-whitespace']).toBeUndefined();
  });

  it('the package.json override turns off only json/sort-keys, leaving every other rule from the plain-JSON block active', async () => {
    const [, , packageJsonOverride] = await loadJsonCanonicalConfig();
    expect(packageJsonOverride?.rules).toStrictEqual({ 'json/sort-keys': 'off' });
  });

  it('driven through a real Linter, canonicalizes and pretty-prints a non-canonical plain JSON file', async () => {
    const publicJsonCanonicalConfig = toPublicConfigArray(await loadJsonCanonicalConfig());
    const linter = new Linter();
    const result = linter.verifyAndFix('{"b": 1.0, "a": "\\u0041"}', publicJsonCanonicalConfig, 'data.json');
    expect(result.fixed).toBe(true);
    expect(result.output).toBe('{\n  "a": "A",\n  "b": 1\n}\n');
  });

  it('driven through a real Linter, package.json gets content canonicalization and pretty-printing but keeps its own key order', async () => {
    const publicJsonCanonicalConfig = toPublicConfigArray(await loadJsonCanonicalConfig());
    const linter = new Linter();
    const result = linter.verifyAndFix('{"b": 1.0, "a": "\\u0041"}', publicJsonCanonicalConfig, 'package.json');
    expect(result.fixed).toBe(true);
    // "b" stays before "a": only json/sort-keys is turned off for package.json, and reordering is the only thing that rule does.
    expect(result.output).toBe('{\n  "b": 1,\n  "a": "A"\n}\n');
  });

  it('driven through a real Linter, tsconfig.json gets content canonicalization only (json/jsonc, no layout rewriting)', async () => {
    const publicJsonCanonicalConfig = toPublicConfigArray(await loadJsonCanonicalConfig());
    const linter = new Linter();
    const input = '{\n  // a comment\n  "b": 1.0,\n  "a": "\\u0041"\n}\n';
    const result = linter.verifyAndFix(input, publicJsonCanonicalConfig, 'tsconfig.json');
    // number-format/string-escaping still fix (neither touches layout, so the comment is untouched), but sort-keys can't safely reorder a member with an attached comment, so the members stay in their original order.
    expect(result.fixed).toBe(true);
    expect(result.output).toBe('{\n  // a comment\n  "b": 1,\n  "a": "A"\n}\n');
  });

  it('throws at module load if eslint-plugin-json-canonical stops exporting a single flat config object', async () => {
    vi.resetModules();
    vi.doMock('eslint-plugin-json-canonical', () => ({
      default: { configs: { recommended: [], contentOnlyJsonc: {} } },
    }));
    await expect(import('./json-canonical')).rejects.toThrow(
      'eslint-plugin-json-canonical: expected configs.recommended to be a single flat config object, got an array or undefined',
    );
    vi.doUnmock('eslint-plugin-json-canonical');
    vi.resetModules();
  });

  it('rejects a plain object lacking the flat-config-only "language" field, even if it happens to carry an empty-string key', async () => {
    vi.resetModules();
    vi.doMock('eslint-plugin-json-canonical', () => ({
      default: { configs: { recommended: { '': true }, contentOnlyJsonc: {} } },
    }));
    await expect(import('./json-canonical')).rejects.toThrow(
      'eslint-plugin-json-canonical: expected configs.recommended to be a single flat config object, got an array or undefined',
    );
    vi.doUnmock('eslint-plugin-json-canonical');
    vi.resetModules();
  });

  it('rejects an array even if it happens to carry a "language" own property — an array is never a single flat config', async () => {
    vi.resetModules();
    const arrayWithLanguageProp: unknown[] & { language?: string } = [];
    arrayWithLanguageProp.language = 'json/json';
    vi.doMock('eslint-plugin-json-canonical', () => ({
      default: { configs: { recommended: arrayWithLanguageProp, contentOnlyJsonc: {} } },
    }));
    await expect(import('./json-canonical')).rejects.toThrow(
      'eslint-plugin-json-canonical: expected configs.recommended to be a single flat config object, got an array or undefined',
    );
    vi.doUnmock('eslint-plugin-json-canonical');
    vi.resetModules();
  });

  it('does not throw for the real eslint-plugin-json-canonical package on a fresh import (isSingleFlatConfig correctly accepts a genuine flat config)', async () => {
    vi.resetModules();
    const blockCount = 3;
    await expect(loadJsonCanonicalConfig()).resolves.toHaveLength(blockCount);
  });
});

// Direct unit tests, distinct from the module-reimport cases above: these call the already-loaded isSingleFlatConfig directly with deliberately malformed inputs, proving each of its own boolean sub-conditions individually rather than only through the one genuine flat-config shape the real eslint-plugin-json-canonical package happens to produce.
describe('isSingleFlatConfig', () => {
  it('rejects null, a non-object, and an array', async () => {
    const isSingleFlatConfig = await loadIsSingleFlatConfig();
    const nonObjectValue = 42;
    expect(isSingleFlatConfig(null)).toBe(false);
    expect(isSingleFlatConfig(nonObjectValue)).toBe(false);
    expect(isSingleFlatConfig([])).toBe(false);
  });

  it('rejects a plain object lacking the flat-config-only "language" field, even one carrying an empty-string key', async () => {
    const isSingleFlatConfig = await loadIsSingleFlatConfig();
    expect(isSingleFlatConfig({})).toBe(false);
    expect(isSingleFlatConfig({ '': true })).toBe(false);
  });

  it('accepts a plain object carrying a real "language" own property', async () => {
    const isSingleFlatConfig = await loadIsSingleFlatConfig();
    expect(isSingleFlatConfig({ language: 'json/json' })).toBe(true);
  });
});
