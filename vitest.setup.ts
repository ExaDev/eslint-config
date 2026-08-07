import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

// RuleTester.run() calls describe/it itself rather than returning anything a test runner can hook into, so it needs a real describe/it wired in -- Vitest's own, not globals, so this stays opt-in per test file rather than requiring `test.globals: true` project-wide.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
