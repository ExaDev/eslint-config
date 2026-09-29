import json from '@eslint/json';
import { Linter, RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createMemoryFs } from './memory-fs';
import turboScriptConvention, { createTurboScriptConventionRule } from './turbo-script-convention';

const ROOT_TURBO = JSON.stringify({ tasks: { _lint: {}, _test: {} } });

const fs = createMemoryFs({
  '/repo/turbo.json': ROOT_TURBO,
  '/repo/packages/a/package.json': '{}',
  '/repo/packages/a/turbo.json': '{"extends": ["//"]}',
  '/lonely/package.json': '{}',
  '/other/turbo.json': ROOT_TURBO,
});

const rule = createTurboScriptConventionRule({ fs });
const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

function manifest(scripts: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({ name: 'pkg', scripts }, null, 2);
}

// manifest() writes the name first, then the scripts object, so the first script sits on the fourth line.
const FIRST_SCRIPT_LINE = 4;
const SECOND_SCRIPT_LINE = 5;
const ROOT = '/repo/package.json';
const PACKAGE = '/repo/packages/a/package.json';

describe('turbo-script-convention meta', () => {
  it('carries the documented languages, docs and messages', () => {
    const { meta } = rule;
    if (meta === undefined) throw new Error('Unreachable: the rule always defines its own meta object literal.');
    expect(meta.type).toBe('problem');
    expect(meta.languages).toEqual(['json/json', 'json/jsonc']);
    expect(meta.docs?.recommended).toBe(false);
    expect(meta.docs?.description).toBe('Require each prefixed turbo task script to have a public script that delegates to turbo, and keep those public names out of non-root packages.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/turbo-script-convention.ts');
    expect(meta.messages).toEqual({
      missingPublicScript: 'Script "{{script}}" implements a turbo task but the package has no public script "{{expected}}". Add "{{expected}}" as "{{command}}".',
      notDelegating: 'Public script "{{script}}" must delegate to turbo as "{{expected}}" (flags may follow), but is "{{actual}}". Running the tool directly bypasses the turbo cache and task graph.',
      bareTaskScript:
        'Script "{{script}}" in a package other than the root shadows the turbo task "{{expected}}" that the root package orchestrates under that public name. Only the root package defines it.',
    });
  });

  it('is exported as a ready-made rule using the real filesystem', () => {
    expect(turboScriptConvention.meta?.docs?.url).toBe(rule.meta?.docs?.url);
  });
});

ruleTester.run('turbo-script-convention', rule, {
  valid: [
    // Root scripts that delegate, with trailing flags allowed.
    { code: manifest({ _lint: 'eslint .', lint: 'turbo run _lint', _test: 'vitest', test: 'turbo run _test --force' }), filename: ROOT },
    // A non-root package keeps its prefixed scripts without a public counterpart.
    { code: manifest({ _lint: 'eslint .', _test: 'vitest' }), filename: PACKAGE },
    // A non-root package may define scripts the root does not orchestrate.
    { code: manifest({ build: 'tsc' }), filename: PACKAGE },
    // A manifest with no scripts.
    { code: JSON.stringify({ name: 'pkg' }), filename: ROOT },
    // Not part of a turbo repository.
    { code: manifest({ _lint: 'eslint .' }), filename: '/lonely/package.json' },
    // A nested object is not the manifest.
    { code: JSON.stringify({ nested: { scripts: { _lint: 'x' } } }), filename: ROOT },
    // The turbo form option.
    { code: manifest({ _lint: 'eslint .', lint: 'turbo _lint' }), filename: ROOT, options: [{ delegate: 'turbo' }] },
    // A custom prefix leaves underscore scripts alone.
    { code: manifest({ _lint: 'eslint .', __lint: 'x', lint: 'turbo run __lint' }), filename: ROOT, options: [{ prefix: '__', exemptTasks: ['_lint'] }] },
    // An exempt task needs no public script.
    { code: manifest({ _lint: 'eslint .' }), filename: ROOT, options: [{ exemptTasks: ['_lint'] }] },
    // An exempt shadowed task.
    { code: manifest({ lint: 'eslint .' }), filename: PACKAGE, options: [{ exemptTasks: ['_lint'] }] },
    // The root option pins the repository root.
    { code: manifest({ _lint: 'eslint .', lint: 'turbo run _lint' }), filename: '/other/package.json', options: [{ root: '/other' }] },
    // A manifest outside the configured root belongs to no repository.
    { code: manifest({ _lint: 'eslint .' }), filename: '/lonely/package.json', options: [{ root: '/other' }] },
  ],
  invalid: [
    {
      code: manifest({ _lint: 'eslint .' }),
      filename: ROOT,
      errors: [{ message: 'Script "_lint" implements a turbo task but the package has no public script "lint". Add "lint" as "turbo run _lint".', line: FIRST_SCRIPT_LINE }],
    },
    {
      code: manifest({ _lint: 'eslint .', lint: 'eslint .' }),
      filename: ROOT,
      errors: [
        {
          message: 'Public script "lint" must delegate to turbo as "turbo run _lint" (flags may follow), but is "eslint .". Running the tool directly bypasses the turbo cache and task graph.',
          line: SECOND_SCRIPT_LINE,
        },
      ],
    },
    {
      code: manifest({ _typecheck: 'tsc', typecheck: 'tsc --noEmit && turbo run _typecheck' }),
      filename: ROOT,
      errors: [{ messageId: 'notDelegating', line: SECOND_SCRIPT_LINE, data: { script: 'typecheck', expected: 'turbo run _typecheck', actual: 'tsc --noEmit && turbo run _typecheck' } }],
    },
    {
      code: manifest({ _lint: 'eslint .', lint: 5 }),
      filename: ROOT,
      errors: [{ messageId: 'notDelegating', line: SECOND_SCRIPT_LINE, data: { script: 'lint', expected: 'turbo run _lint', actual: '' } }],
    },
    {
      code: manifest({ _lint: 'eslint .', lint: 'turbo run _lint' }),
      filename: ROOT,
      options: [{ delegate: 'turbo' }],
      errors: [{ messageId: 'notDelegating', line: SECOND_SCRIPT_LINE, data: { script: 'lint', expected: 'turbo _lint', actual: 'turbo run _lint' } }],
    },
    {
      code: manifest({ __lint: 'eslint .' }),
      filename: ROOT,
      options: [{ prefix: '__' }],
      errors: [{ messageId: 'missingPublicScript', line: FIRST_SCRIPT_LINE, data: { script: '__lint', expected: 'lint', command: 'turbo run __lint' } }],
    },
    {
      code: manifest({ lint: 'eslint .', build: 'tsc' }),
      filename: PACKAGE,
      errors: [
        {
          message:
            'Script "lint" in a package other than the root shadows the turbo task "_lint" that the root package orchestrates under that public name. Only the root package defines it.',
          line: FIRST_SCRIPT_LINE,
        },
      ],
    },
    {
      code: manifest({ test: 'vitest', lint: 'eslint .' }),
      filename: '/repo/packages/b/package.json',
      errors: [
        { messageId: 'bareTaskScript', line: FIRST_SCRIPT_LINE, data: { script: 'test', expected: '_test' } },
        { messageId: 'bareTaskScript', line: SECOND_SCRIPT_LINE, data: { script: 'lint', expected: '_lint' } },
      ],
    },
  ],
});

describe('turbo-script-convention options', () => {
  const linter = new Linter({ cwd: '/repo' });
  const verify = (options: unknown) =>
    linter.verify(manifest({}), [{ files: ['**'], language: 'json/json', plugins: { json, exadev: { rules: { rule } } }, rules: { 'exadev/rule': ['error', options] } }], ROOT);

  it('rejects an unknown option through the schema', () => {
    expect(() => verify({ prefx: '_' })).toThrow(/prefx/u);
  });

  it('rejects an invalid delegate through the schema', () => {
    expect(() => verify({ delegate: 'pnpm' })).toThrow(/allowed values/u);
  });

  it('accepts a valid option', () => {
    expect(verify({ prefix: '__' })).toEqual([]);
  });
});
