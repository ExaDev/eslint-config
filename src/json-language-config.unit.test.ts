import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { buildJsonLanguageBlock, JSONC_FILE_GLOBS, requireJsonPlugin, tryResolveJsonPlugin } from './json-language-config';
import plugin from './plugin';
import { toPublicConfigArray } from './to-public-config-array';

const throwingRequireFn = () => {
  throw new Error('simulated missing package');
};

function realJsonPlugin(): Record<string, unknown> {
  const resolved = tryResolveJsonPlugin();
  if (resolved === undefined) throw new Error('Unreachable: @eslint/json is a devDependency of this repo.');

  return resolved;
}

describe('JSONC_FILE_GLOBS', () => {
  it('names the files whose tools accept comments', () => {
    expect(JSONC_FILE_GLOBS).toStrictEqual(['**/*.jsonc', '**/tsconfig*.json', '**/turbo.json']);
  });
});

describe('tryResolveJsonPlugin', () => {
  it('resolves the real @eslint/json plugin object', () => {
    expect(realJsonPlugin()).toHaveProperty('languages.jsonc');
  });

  it('returns undefined when resolution throws', () => {
    expect(tryResolveJsonPlugin(throwingRequireFn)).toBeUndefined();
  });

  it('returns undefined when the module is not a json-language plugin', () => {
    expect(tryResolveJsonPlugin(() => ({ notAPlugin: true }))).toBeUndefined();
  });
});

describe('requireJsonPlugin', () => {
  it('returns the resolved plugin object', () => {
    const directPlugin = { languages: { json: {} } };
    expect(requireJsonPlugin('anything', () => directPlugin)).toBe(directPlugin);
  });

  it('throws naming the feature and the real install command', () => {
    expect(() => requireJsonPlugin('turbo.json rules', throwingRequireFn)).toThrow(
      "@exadev/eslint-config: turbo.json rules needs '@eslint/json' but it could not be resolved. Install it with: pnpm add -D @eslint/json",
    );
  });
});

describe('buildJsonLanguageBlock', () => {
  const jsonPlugin = { languages: { json: {} } };

  it('registers this package as exadev and @eslint/json as json on the given files and language', () => {
    const block = buildJsonLanguageBlock({ jsonPlugin, language: 'json/jsonc', files: ['**/turbo.json'], rules: { 'exadev/x': 'error' } });
    expect(block).toStrictEqual({
      files: ['**/turbo.json'],
      language: 'json/jsonc',
      languageOptions: { allowTrailingCommas: true },
      plugins: { exadev: plugin, json: jsonPlugin },
      rules: { 'exadev/x': 'error' },
    });
  });

  it('sets no language options under json/json, where allowTrailingCommas is invalid', () => {
    const block = buildJsonLanguageBlock({ jsonPlugin, language: 'json/json', files: ['**/package.json'], rules: {} });
    expect(block).not.toHaveProperty('languageOptions');
  });

  it('includes ignores only when given', () => {
    const block = buildJsonLanguageBlock({ jsonPlugin, language: 'json/json', files: ['**/*.json'], ignores: ['**/a.json'], rules: {} });
    expect(block).toHaveProperty('ignores', ['**/a.json']);
  });

  it('copies the file lists so later mutation of the block cannot reach the caller', () => {
    const files = ['**/turbo.json'];
    const ignores = ['**/a.json'];
    const block = buildJsonLanguageBlock({ jsonPlugin, language: 'json/jsonc', files, ignores, rules: {} });
    expect(block.files).not.toBe(files);
    expect(block.ignores).not.toBe(ignores);
  });
});

describe('a block built for json/jsonc, run through ESLint', () => {
  const rules = { 'json/no-empty-keys': 'error' } as const;
  const source = '{\n  // a comment\n  "compilerOptions": { "": 1, },\n}\n';

  function lint(language: 'json/json' | 'json/jsonc'): Linter.LintMessage[] {
    const block = buildJsonLanguageBlock({ jsonPlugin: realJsonPlugin(), language, files: ['**/tsconfig.json'], rules });

    return new Linter().verify(source, toPublicConfigArray([block]), 'tsconfig.json');
  }

  it('parses comments and trailing commas and reports rule findings under json/jsonc', () => {
    expect(lint('json/jsonc').map((message) => message.ruleId)).toStrictEqual(['json/no-empty-keys']);
  });

  it('fails to parse the same text under json/json, proving the language id is what enables comments', () => {
    const [message] = lint('json/json');
    expect(message?.fatal).toBe(true);
  });
});
