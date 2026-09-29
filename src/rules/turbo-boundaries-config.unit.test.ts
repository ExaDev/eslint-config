import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { turboOptionsSchema } from './turbo-options';
import turboBoundariesConfig, { turboBoundariesConfigRule } from './turbo-boundaries-config';

const ruleTester = new RuleTester({ language: 'json/jsonc', languageOptions: { allowTrailingCommas: true }, plugins: { json } });

describe('turbo-boundaries-config meta', () => {
  it('carries the documented languages, docs and message', () => {
    const { meta } = turboBoundariesConfigRule;
    if (meta === undefined) throw new Error('Unreachable: the rule always defines its own meta object literal.');
    expect(meta.type).toBe('problem');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.schema).toEqual([turboOptionsSchema]);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Require the root turbo.json to configure turbo boundaries.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-boundaries-config.ts');
    expect(meta.messages).toEqual({
      missingBoundaries: 'The root turbo.json has no "boundaries" key, so "turbo boundaries" applies no tag rules. Add "boundaries" (an empty object is enough to opt in).',
    });
  });

  it('is the default export', () => {
    expect(turboBoundariesConfig).toBe(turboBoundariesConfigRule);
  });
});

ruleTester.run('turbo-boundaries-config', turboBoundariesConfigRule, {
  valid: [
    { code: '{"boundaries": {}, "tasks": {}}', filename: '/repo/turbo.json' },
    { code: '// opted in\n{"boundaries": {"tags": {"core": {"dependencies": {"allow": ["core"]}}}},}', filename: '/repo/turbo.json' },
    // A package configuration does not carry the key.
    { code: '{"extends": ["//"], "tags": ["core"]}', filename: '/repo/packages/a/turbo.json' },
    // A nested object is not the document.
    { code: '{"boundaries": {}, "nested": {"tasks": {}}}', filename: '/repo/turbo.json' },
  ],
  invalid: [
    { code: '{\n  "tasks": {}\n}', filename: '/repo/turbo.json', errors: [{ messageId: 'missingBoundaries', line: 1, column: 1 }] },
    { code: '{"boundaries": null}', filename: '/repo/turbo.json', errors: [{ messageId: 'missingBoundaries' }] },
    { code: '{"boundaries": []}', filename: '/repo/turbo.json', errors: [{ messageId: 'missingBoundaries' }] },
    { code: '{"nested": {"boundaries": {}}}', filename: '/repo/turbo.json', errors: [{ messageId: 'missingBoundaries' }] },
  ],
});
