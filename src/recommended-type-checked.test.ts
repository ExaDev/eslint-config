import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import recommendedTypeChecked from './recommended-type-checked';

// Exercises this package's own test-file relaxation directly against the real exported array (the last two entries: the outright-strictness rules, then the test-file override), rather than a re-implementation -- proving the shipped config, not a description of intent. Neither rule under test needs type information, so a bare parser registration (no project/projectService) is enough; recommendedTypeChecked's own type-aware rules (await-thenable etc.) are deliberately excluded from this slice, since testing them would need a real tsconfig project this unit test has no reason to depend on.
if (!Array.isArray(recommendedTypeChecked)) {
  throw new TypeError('recommended-type-checked is expected to export a config array, not a single object or legacy config.');
}
const linter = new Linter();
const strictnessConfigs = recommendedTypeChecked.slice(-2);

function lint(code: string, filename: string) {
  return linter
    .verify(
      code,
      [{ files: ['**'], languageOptions: { sourceType: 'module', parser: tseslint.parser }, plugins: { '@typescript-eslint': tseslint.plugin } }, ...strictnessConfigs],
      filename,
    )
    .map((message) => message.ruleId);
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
