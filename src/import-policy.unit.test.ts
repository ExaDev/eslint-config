import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { exadevConfig } from './create-config';
import { buildImportPolicyConfig, importPolicyConfig } from './import-policy';
import plugin from './plugin';
import { SOURCE_FILE_GLOBS } from './turbo-config';

const POLICIES = [{ files: ['src/worker/**'], deny: [{ specifiers: ['fs'], message: 'worker code must not use Node builtins' }] }] as const;

describe('importPolicyConfig', () => {
  it('wires one block carrying every policy onto the source files, registering the plugin', () => {
    const [block, ...rest] = importPolicyConfig(POLICIES);
    expect(rest).toHaveLength(0);
    expect(block?.files).toStrictEqual([...SOURCE_FILE_GLOBS]);
    expect(block?.plugins?.['exadev']).toBe(plugin);
    expect(block?.rules).toStrictEqual({ 'exadev/import-policy': ['error', POLICIES] });
  });

  it('validates at call time, naming the field', () => {
    expect(() => importPolicyConfig([{ files: ['src/**'] }])).toThrow(/at least one "deny" or "confine"/u);
    expect(() => buildImportPolicyConfig([{ files: ['src/**'], deny: [{ specifiers: ['fs'], message: '' }] }])).toThrow(/non-empty string "message"/u);
  });

  it('reports a violation through a real linter run', () => {
    const linter = new Linter({ configType: 'flat', cwd: '/repo' });
    const config = [{ languageOptions: { parser: tseslint.parser, sourceType: 'module' as const } }, ...importPolicyConfig(POLICIES)];
    const messages = linter.verify("import fs from 'node:fs';\nconst dynamic = await import('fs/promises');", config, { filename: '/repo/src/worker/main.ts' });
    expect(messages.map((message) => [message.ruleId, message.line, message.message])).toStrictEqual([
      ['exadev/import-policy', 1, '"node:fs" cannot be imported here: worker code must not use Node builtins'],
      ['exadev/import-policy', 2, '"fs/promises" cannot be imported here: worker code must not use Node builtins'],
    ]);
    expect(linter.verify("import fs from 'fs';", config, { filename: '/repo/src/server/main.ts' })).toStrictEqual([]);
  });
});

describe('exadevConfig importPolicies', () => {
  const base = { react: false, nextjs: false, turboEnv: false, packageJsonKeyOrder: false, gitignore: false } as const;
  const hasPolicyRule = (blocks: ReturnType<typeof exadevConfig>) => blocks.some((block) => block.rules !== undefined && 'exadev/import-policy' in block.rules);

  it('adds the policy block only when policies are given, before any trailing user config', () => {
    expect(hasPolicyRule(exadevConfig(base))).toBe(false);
    const extra = { name: 'user' };
    const withPolicies = exadevConfig({ ...base, importPolicies: POLICIES }, extra);
    expect(hasPolicyRule(withPolicies)).toBe(true);
    expect(withPolicies.at(-1)).toBe(extra);
    expect(hasPolicyRule(withPolicies.slice(0, -1))).toBe(true);
  });
});
