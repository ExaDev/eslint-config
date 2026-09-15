import { Linter } from 'eslint';
import { describe, expect, it, vi } from 'vitest';
import jsonCanonicalConfig from './json-canonical';
import { toPublicConfigArray } from './to-public-config-array';

// `jsonCanonicalConfig` is typed as `ConfigArrayValue` (typescript-eslint's own flat-config type, needed for `...exadev`'s own type-checking elsewhere) — see config-types.ts's own comment on why that type isn't nominally assignable to a plain `Linter.Config[]` the real `Linter` class expects. `toPublicConfigArray` is this codebase's own single, isolated, justified cast for exactly this gap.
const publicJsonCanonicalConfig = toPublicConfigArray(jsonCanonicalConfig);

describe('jsonCanonicalConfig', () => {
  it('is exactly three config blocks: plain JSON, JSONC-shaped families, and a package.json override', () => {
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

  it('the plain-JSON block enables sort-keys (plain UTF-16 code-unit order), number-format, string-escaping, and pretty-format', () => {
    const [plainJson] = jsonCanonicalConfig;
    expect(plainJson?.rules?.['json/sort-keys']).toStrictEqual(['error', 'asc', { caseSensitive: true, natural: false }]);
    expect(plainJson?.rules?.['json-canonical/number-format']).toBe('error');
    expect(plainJson?.rules?.['json-canonical/string-escaping']).toBe('error');
    expect(plainJson?.rules?.['json-canonical/pretty-format']).toBe('error');
  });

  it('does not enable no-insignificant-whitespace: configs.recommended deliberately leaves it opt-in', () => {
    const [plainJson] = jsonCanonicalConfig;
    expect(plainJson?.rules?.['json-canonical/no-insignificant-whitespace']).toBeUndefined();
  });

  it('the package.json override turns off only json/sort-keys, leaving every other rule from the plain-JSON block active', () => {
    const [, , packageJsonOverride] = jsonCanonicalConfig;
    expect(packageJsonOverride?.rules).toStrictEqual({ 'json/sort-keys': 'off' });
  });

  it('driven through a real Linter, canonicalizes and pretty-prints a non-canonical plain JSON file', () => {
    const linter = new Linter();
    const result = linter.verifyAndFix('{"b": 1.0, "a": "\\u0041"}', publicJsonCanonicalConfig, 'data.json');
    expect(result.fixed).toBe(true);
    expect(result.output).toBe('{\n  "a": "A",\n  "b": 1\n}\n');
  });

  it('driven through a real Linter, package.json gets content canonicalization and pretty-printing but keeps its own key order', () => {
    const linter = new Linter();
    const result = linter.verifyAndFix('{"b": 1.0, "a": "\\u0041"}', publicJsonCanonicalConfig, 'package.json');
    expect(result.fixed).toBe(true);
    // "b" stays before "a": only json/sort-keys is turned off for package.json, and reordering is the only thing that rule does.
    expect(result.output).toBe('{\n  "b": 1,\n  "a": "A"\n}\n');
  });

  it('driven through a real Linter, tsconfig.json gets content canonicalization only (json/jsonc, no layout rewriting)', () => {
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
    const freshModule = await import('./json-canonical');
    const blockCount = 3;
    expect(freshModule.default).toHaveLength(blockCount);
  });
});
