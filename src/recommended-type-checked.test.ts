import type { Linter } from 'eslint';
import { Linter as LinterClass } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import recommendedTypeChecked from './recommended-type-checked';

// Exercises this package's own test-file relaxation directly against the real exported array (the last two entries: the outright-strictness rules, then the test-file override), rather than a re-implementation -- proving the shipped config, not a description of intent. This test's own parser registration carries no project/projectService, so a genuinely type-aware rule (no-enum-number-widening) throws the moment it fires under this setup -- it has its own dedicated test with a real project service, and is explicitly turned off below since it plays no part in what THIS test verifies (the test-file relaxation of ban-ts-comment/consistent-type-assertions, neither of which needs type information). No runtime Array.isArray narrowing needed here -- recommendedTypeChecked's own ConfigArrayValue type (Extract<ConfigValue, unknown[]>) already proves this at compile time.
const linter = new LinterClass();
const strictnessConfigs = recommendedTypeChecked.slice(-2);

// strictnessConfigs is typed via @typescript-eslint/utils's own FlatConfig.Config (see recommended-type-checked.ts's own comment on why), which eslint's own Linter.verify() does not accept directly: the two packages each declare their own independent `languageOptions` type for the exact same JSON-serializable runtime shape, differing only in a missing index signature -- a declaration-file gap between the two type sources, not a real difference in the values passed. Widening through Linter.Config[] here documents that boundary at the one place this package's own test needs to cross it directly; production consumers never hit this, since a flat config file is never itself type-checked against Linter.verify's signature.
function lint(code: string, filename: string) {
  const config: Linter.Config[] = [
    { files: ['**'], languageOptions: { sourceType: 'module', parser: tseslint.parser }, plugins: { '@typescript-eslint': tseslint.plugin } },
    ...strictnessConfigs,
    { rules: { 'exadev/no-enum-number-widening': 'off' } },
  ] as Linter.Config[];
  return linter.verify(code, config, filename).map((message) => message.ruleId);
}

describe('recommended-type-checked test-file relaxation', () => {
  it('bans @ts-expect-error outright outside test files, even with a description', () => {
    expect(lint('// @ts-expect-error a genuine reason\nconst x = 1;\n', 'src/foo.ts')).toContain('@typescript-eslint/ban-ts-comment');
  });

  it('allows @ts-expect-error in a .test.ts file when it carries a description', () => {
    expect(lint('// @ts-expect-error a genuine reason\nconst x = 1;\n', 'src/foo.test.ts')).not.toContain('@typescript-eslint/ban-ts-comment');
  });

  it('allows @ts-expect-error in a .spec.ts file too, proving the brace-expansion glob covers both', () => {
    expect(lint('// @ts-expect-error a genuine reason\nconst x = 1;\n', 'src/foo.spec.ts')).not.toContain('@typescript-eslint/ban-ts-comment');
  });

  it('still bans a description-less @ts-expect-error in a test file', () => {
    expect(lint('// @ts-expect-error\nconst x = 1;\n', 'src/foo.test.ts')).toContain('@typescript-eslint/ban-ts-comment');
  });

  it('still bans @ts-ignore in a test file -- no exemption for it', () => {
    expect(lint('// @ts-ignore\nconst x = 1;\n', 'src/foo.test.ts')).toContain('@typescript-eslint/ban-ts-comment');
  });

  it('bans an `as` type assertion outside test files', () => {
    expect(lint('const x = 1 as number;\n', 'src/foo.ts')).toContain('@typescript-eslint/consistent-type-assertions');
  });

  it('allows an `as` type assertion in a test file', () => {
    expect(lint('const x = 1 as number;\n', 'src/foo.test.ts')).not.toContain('@typescript-eslint/consistent-type-assertions');
  });

  it('still bans the legacy angle-bracket assertion in a test file', () => {
    expect(lint('const x = <number>1;\n', 'src/foo.test.ts')).toContain('@typescript-eslint/consistent-type-assertions');
  });
});
