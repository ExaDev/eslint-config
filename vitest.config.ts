import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // @typescript-eslint/rule-tester spins up a real TypeScript program (parse + type-check) per test case for every type-aware custom rule in src/rules/, and each test FILE pays a large, mostly-fixed startup cost the first time it does this (loading the ES2024 lib and @types/node), confirmed directly: a file's first rule-tester case routinely took several seconds while its later cases, reusing the now-warm project service, ran in tens of milliseconds. `fileParallelism: false` was tried specifically to remove file-to-file CPU contention as the suspected cause, on the theory that several files paying that startup cost at once was what pushed individual cases over a short timeout -- it was not: serializing the suite made it roughly 6x slower (~180s vs ~30s) and STILL left two cases failing even with a 10000ms ceiling, since each file's fixed startup cost doesn't shrink by removing overlap, it just stops overlapping. The real, load-bearing fix is the larger timeout below; parallelism stays at vitest's default.
    testTimeout: 30_000,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});
