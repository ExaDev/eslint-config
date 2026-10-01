import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule from './vitest-coverage-config';

describe('vitest-coverage-config meta', () => {
  it('names its docs page after the rule file and says what an incomplete block lacks', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/vitest-coverage-config.ts');
    expect(rule.meta.messages.incompleteCoverage).toBe(
      'This `coverage` block does not set {{ missing }}. Coverage with no thresholds cannot fail, and without `provider` and `include` the measured files depend on defaults. Set them in the shared base config that per-package configs merge.',
    );
  });
});

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });

const BASE = 'vitest.base.config.ts';
const options = [{ files: [BASE] }] as const;
const complete = "{ provider: 'v8', include: ['src/**/*.ts'], thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 } }";
const missing = (list: string) => ({ messageId: 'incompleteCoverage' as const, data: { missing: list } });

ruleTester.run('vitest-coverage-config', rule, {
  valid: [
    { code: `export default defineConfig({ test: { coverage: ${complete} } });`, filename: BASE, options },
    // Without a coverage block there is nothing to complete.
    { code: 'export default defineConfig({ test: { include: [] } });', filename: BASE, options },
    // A per-package config that merges the base is not the base: it is out of scope.
    { code: "export default mergeConfig(base, defineConfig({ test: { coverage: { exclude: ['x'] } } }));", filename: 'packages/a/vitest.config.ts', options },
    // Without the files option the rule does nothing, even in a file that would be incomplete.
    { code: "export default defineConfig({ test: { coverage: { provider: 'v8' } } });", filename: BASE },
    // Values that are not visible are not judged.
    { code: 'export default defineConfig({ test: { coverage: base } });', filename: BASE, options },
    { code: "export default defineConfig({ test: { coverage: { provider: 'v8', include: [], thresholds: shared } } });", filename: BASE, options },
    { code: "export default defineConfig({ test: { coverage: { ...shared } } });", filename: BASE, options },
    { code: "export default defineConfig({ test: { coverage: { provider: 'v8', include: [], thresholds: { ...shared } } } });", filename: BASE, options },
    // A threshold set to a computed value is still a spelled key.
    { code: "export default defineConfig({ test: { coverage: { provider: 'v8', include: [], thresholds: { statements: a, branches: a, functions: a, lines: a } } } });", filename: BASE, options },
  ],
  invalid: [
    { code: "export default defineConfig({ test: { coverage: {} } });", filename: BASE, options, errors: [{ ...missing('provider, include, thresholds'), line: 1, column: 39 }] },
    { code: "export default defineConfig({ test: { coverage: { provider: 'v8', include: ['src/**'] } } });", filename: BASE, options, errors: [missing('thresholds')] },
    { code: "export default defineConfig({ test: { coverage: { include: ['src/**'], thresholds: { statements: 80, lines: 80 } } } });", filename: BASE, options, errors: [missing('provider, thresholds.branches, thresholds.functions')] },
    // A coverage block named through a const, and an inline project, are followed.
    { code: "const coverage = { provider: 'v8', include: [] }; export default defineConfig({ test: { coverage } });", filename: BASE, options, errors: [missing('thresholds')] },
    { code: "export default defineConfig({ test: { projects: [{ test: { coverage: { provider: 'v8' } } }] } });", filename: BASE, options, errors: [missing('include, thresholds')] },
    // A custom base path is matched at any depth when it is a bare name.
    { code: 'export default defineConfig({ test: { coverage: {} } });', filename: 'config/shared.ts', options: [{ files: ['shared.ts'] }], errors: [missing('provider, include, thresholds')] },
  ],
});
