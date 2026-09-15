import type { StrykerOptions } from '@stryker-mutator/api/core';

const config: Partial<StrykerOptions> = {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  // Explicit, not Stryker's own default auto-discovery, which resolves `@stryker-mutator/*` plugins relative to wherever `@stryker-mutator/core` itself physically lives — under pnpm's isolated node_modules that's a different resolution root than this config's own directory, a confirmed real failure mode elsewhere in this same ecosystem (see eslint-plugin-json-canonical's own stryker.config.ts).
  plugins: ['@stryker-mutator/typescript-checker', '@stryker-mutator/vitest-runner'],
  checkers: ['typescript'],
  coverageAnalysis: 'perTest',
  mutate: ['src/**/*.ts', '!src/**/*.test.ts'],
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  thresholds: { high: 100, low: 100, break: 100 },
};

export default config;
