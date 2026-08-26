import { RuleTester } from 'eslint';
import { RuleTester as TypeAwareRuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

// RuleTester.run() calls describe/it itself rather than returning anything a test runner can hook into, so it needs a real describe/it wired in -- Vitest's own, not globals, so this stays opt-in per test file rather than requiring `test.globals: true` project-wide.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

// @typescript-eslint/rule-tester ships its own RuleTester (needed for rules built with
// ESLintUtils.RuleCreator, which plain eslint's RuleTester cannot type-check against) with the same static test-framework hook shape, wired identically. Unlike plain eslint's RuleTester, this one requires afterAll explicitly (it uses it to clean up dependency-constraint bookkeeping between files) -- omitting it throws at RuleTester construction time. Wrapped rather than assigned directly: this hook slot is typed void-returning (any test framework's describe can be dropped in, regardless of what that framework's own describe returns), but Vitest's describe returns a real SuiteCollector -- @typescript-eslint/strict-void-return correctly flags the direct assignment as a value silently discarded. The `void` operator discards it explicitly instead of relying on the slot's own leniency to do it implicitly.
TypeAwareRuleTester.describe = (text, callback) => void describe(text, callback);
TypeAwareRuleTester.it = it;
TypeAwareRuleTester.itOnly = it.only;
TypeAwareRuleTester.afterAll = afterAll;
