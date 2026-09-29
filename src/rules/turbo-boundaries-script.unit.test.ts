import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import turboBoundariesScript, { createTurboBoundariesScriptRule } from './turbo-boundaries-script';
import { turboOptionsSchema } from './turbo-options';

const fs = createMemoryFs({
  '/repo/turbo.json': '{"boundaries": {}}',
  '/repo/packages/a/package.json': '{}',
  '/lonely/package.json': '{}',
});

const rule = createTurboBoundariesScriptRule({ fs });
const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

const ROOT = '/repo/package.json';
const CHECK = { boundaries: { aggregateScript: 'check' } };

function manifest(scripts: Readonly<Record<string, unknown>> | undefined): string {
  return JSON.stringify({ name: 'root', ...(scripts !== undefined && { scripts }) }, null, 2);
}

// manifest() writes the name first, so the scripts entry is on line 3 and its first script on line 4.
const SCRIPTS_LINE = 3;
const FIRST_SCRIPT_LINE = 4;

describe('turbo-boundaries-script meta', () => {
  it('carries the documented languages, docs and messages', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: the rule always defines its own meta object literal.');
    expect(meta.type).toBe('problem');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.schema).toEqual([turboOptionsSchema]);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Require the root package to define a boundaries script equal to turbo boundaries and to invoke it from the configured aggregate script.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-boundaries-script.ts');
    expect(meta.messages).toEqual({
      missingBoundariesScript: 'The root package has no "boundaries" script. Add "boundaries": "turbo boundaries".',
      boundariesScriptMismatch: 'Script "boundaries" must be exactly "turbo boundaries", but is "{{actual}}".',
      missingAggregateScript: 'The aggregate script "{{script}}" named by the "boundaries.aggregateScript" option does not exist in the root package.',
      aggregateSkipsBoundaries: 'Script "{{script}}" does not run boundary checking, so "turbo boundaries" is not exercised wherever it runs. Invoke the "boundaries" script from it.',
    });
  });

  it('is exported as a ready-made rule', () => {
    expect(turboBoundariesScript.meta?.docs?.url).toBe(rule.meta?.docs?.url);
  });
});

ruleTester.run('turbo-boundaries-script', rule, {
  valid: [
    { code: manifest({ boundaries: 'turbo boundaries' }), filename: ROOT },
    { code: manifest({ boundaries: 'turbo boundaries', check: 'pnpm lint && pnpm boundaries' }), filename: ROOT, options: [CHECK] },
    { code: manifest({ boundaries: 'turbo boundaries', check: 'turbo boundaries && pnpm test' }), filename: ROOT, options: [CHECK] },
    // Only the root package is checked.
    { code: manifest({ test: 'vitest' }), filename: '/repo/packages/a/package.json' },
    // Not part of a turbo repository.
    { code: manifest({}), filename: '/lonely/package.json' },
    // A nested object is not the manifest.
    { code: JSON.stringify({ boundaries: 'x', nested: { scripts: {} } }), filename: '/repo/packages/a/package.json' },
  ],
  invalid: [
    { code: manifest(undefined), filename: ROOT, errors: [{ message: 'The root package has no "boundaries" script. Add "boundaries": "turbo boundaries".', line: 1, column: 1 }] },
    { code: manifest({ test: 'vitest' }), filename: ROOT, errors: [{ messageId: 'missingBoundariesScript', line: SCRIPTS_LINE }] },
    {
      code: manifest({ boundaries: 'turbo boundaries --ignore=all' }),
      filename: ROOT,
      errors: [{ message: 'Script "boundaries" must be exactly "turbo boundaries", but is "turbo boundaries --ignore=all".', line: FIRST_SCRIPT_LINE }],
    },
    { code: manifest({ boundaries: 5 }), filename: ROOT, errors: [{ messageId: 'boundariesScriptMismatch', data: { actual: '' } }] },
    {
      code: manifest({ boundaries: 'turbo boundaries', check: 'pnpm lint' }),
      filename: ROOT,
      options: [CHECK],
      errors: [
        {
          message: 'Script "check" does not run boundary checking, so "turbo boundaries" is not exercised wherever it runs. Invoke the "boundaries" script from it.',
          line: FIRST_SCRIPT_LINE + 1,
        },
      ],
    },
    {
      code: manifest({ boundaries: 'turbo boundaries' }),
      filename: ROOT,
      options: [CHECK],
      errors: [{ message: 'The aggregate script "check" named by the "boundaries.aggregateScript" option does not exist in the root package.', line: SCRIPTS_LINE }],
    },
    // The script and the aggregate are reported together.
    {
      code: manifest({ start: 'node .' }),
      filename: ROOT,
      options: [CHECK],
      errors: [{ messageId: 'missingBoundariesScript' }, { messageId: 'missingAggregateScript' }],
    },
  ],
});
