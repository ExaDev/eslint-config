import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import jsonCanonicalConfig from './json-canonical';
import { toPublicConfigArray } from './to-public-config-array';

// `jsonCanonicalConfig` is typed as `ConfigArrayValue` (typescript-eslint's own flat-config type, needed for `...exadev`'s own type-checking elsewhere) -- see config-types.ts's own comment on why that type isn't nominally assignable to a plain `Linter.Config[]` the real `Linter` class expects. `toPublicConfigArray` is this codebase's own single, isolated, justified cast for exactly this gap.
const publicJsonCanonicalConfig = toPublicConfigArray(jsonCanonicalConfig);

describe('jsonCanonicalConfig', () => {
  it('is exactly one config block, scoped to plain JSON, excluding JSONC-shaped families and package.json', () => {
    expect(jsonCanonicalConfig).toHaveLength(1);
    const [block] = jsonCanonicalConfig;
    expect(block?.files).toStrictEqual(['**/*.json']);
    expect(block?.ignores).toStrictEqual(['**/tsconfig*.json', '**/turbo.json', '**/package.json']);
    expect(block?.language).toBe('json/json');
  });

  it('enables sort-keys (plain UTF-16 code-unit order), number-format, and string-escaping', () => {
    const [block] = jsonCanonicalConfig;
    expect(block?.rules?.['json/sort-keys']).toStrictEqual(['error', 'asc', { caseSensitive: true, natural: false }]);
    expect(block?.rules?.['json-canonical/number-format']).toBe('error');
    expect(block?.rules?.['json-canonical/string-escaping']).toBe('error');
  });

  it('does not enable no-insignificant-whitespace: the recommended config it bundles deliberately leaves it opt-in', () => {
    const [block] = jsonCanonicalConfig;
    expect(block?.rules?.['json-canonical/no-insignificant-whitespace']).toBeUndefined();
  });

  it('driven through a real Linter, canonicalizes a non-canonical plain JSON file', () => {
    const linter = new Linter();
    const result = linter.verifyAndFix('{"b": 1.0, "a": "\\u0041"}', publicJsonCanonicalConfig, 'data.json');
    expect(result.output).toBe('{"a": "A", "b": 1}');
  });

  it('driven through a real Linter, leaves package.json alone entirely (excluded, key-order concerns live elsewhere)', () => {
    const linter = new Linter();
    const original = '{"b": 1.0, "a": "\\u0041"}';
    const result = linter.verifyAndFix(original, publicJsonCanonicalConfig, 'package.json');
    expect(result.fixed).toBe(false);
    expect(result.output).toBe(original);
  });
});
