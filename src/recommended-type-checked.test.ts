import type { Linter } from 'eslint';
import { Linter as LinterClass } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import recommendedTypeChecked from './recommended-type-checked';

// Exercises this package's own test-file relaxation directly against the real exported array (the last two entries: the outright-strictness rules, then the test-file override), rather than a re-implementation -- proving the shipped config, not a description of intent. `projectService.allowDefaultProject` below gives every inline snippet a genuine ad hoc single-file TS project (the same pattern this repo's own type-aware rule tests use), so every rule in the shared block -- type-aware or not -- runs exactly as it would in production, with no rules turned off to work around a missing project service. No runtime Array.isArray narrowing needed here -- recommendedTypeChecked's own ConfigArrayValue type (Extract<ConfigValue, unknown[]>) already proves this at compile time.
const linter = new LinterClass();
// The exported array's final two entries: the outright-strictness rules block, then the test-file relaxation block (see the comment above) -- named here since a bare '-2' would itself trip @typescript-eslint/no-magic-numbers with nothing explaining what it denotes.
const FINAL_CONFIG_ENTRY_COUNT = 2;
const strictnessConfigs = recommendedTypeChecked.slice(-FINAL_CONFIG_ENTRY_COUNT);

// strictnessConfigs is typed via @typescript-eslint/utils's own FlatConfig.Config (see recommended-type-checked.ts's own comment on why), which eslint's own Linter.verify() does not accept directly: the two packages each declare their own independent `languageOptions` type for the exact same JSON-serializable runtime shape, differing only in a missing index signature -- a declaration-file gap between the two type sources, not a real difference in the values passed. Widening through Linter.Config[] here documents that boundary at the one place this package's own test needs to cross it directly; production consumers never hit this, since a flat config file is never itself type-checked against Linter.verify's signature.
function lint(code: string, filename: string) {
  const config: Linter.Config[] = [
    {
      files: ['**'],
      languageOptions: {
        sourceType: 'module',
        parser: tseslint.parser,
        parserOptions: {
          // A literal filename list rather than a glob: allowDefaultProject rejects a directory-spanning glob like '**/*.ts*' outright ("known to cause performance issues"), and a bare '*.ts*' (the pattern this repo's own single-file rule tests use, which pass bare filenames with no directory prefix) doesn't match these paths' own 'src/' prefix -- confirmed directly, both produce a parsing error rather than linting the snippet. These three are the exact, fixed set of filenames every test case below actually passes.
          projectService: { allowDefaultProject: ['src/foo.ts', 'src/foo.test.ts', 'src/foo.spec.ts'] },
          tsconfigRootDir: import.meta.dirname,
        },
      },
      plugins: { '@typescript-eslint': tseslint.plugin },
    },
    ...strictnessConfigs,
  ] as Linter.Config[];
  return linter.verify(code, config, filename).map((message) => message.ruleId);
}

// Exercises the FULL exported array (unlike strictnessConfigs above, which deliberately slices to just the last two entries) -- this is what actually proves js.configs.recommended is both present and composed in the correct position ahead of strictTypeChecked/stylisticTypeChecked, not merely described as such in a comment.
function lintFull(code: string, filename: string) {
  const config: Linter.Config[] = [
    {
      files: ['**'],
      languageOptions: {
        sourceType: 'module',
        parser: tseslint.parser,
        parserOptions: {
          projectService: { allowDefaultProject: ['src/foo.ts', 'src/foo.test.ts', 'src/foo.spec.ts'] },
          tsconfigRootDir: import.meta.dirname,
        },
      },
    },
    ...recommendedTypeChecked,
  ] as Linter.Config[];
  return linter.verify(code, config, filename).map((message) => message.ruleId);
}

describe('js.configs.recommended composition', () => {
  it('genuinely includes a js.configs.recommended-only rule (no-debugger), not merely claimed in a comment', () => {
    expect(lintFull('debugger;\n', 'src/foo.ts')).toContain('no-debugger');
  });

  it('does not flag an interface method-signature parameter as unused under the base no-unused-vars rule', () => {
    // This is the exact regression this test guards against: js.configs.recommended sets the base no-unused-vars, which has no TypeScript awareness and treats an interface method signature's parameter names as real bindings that must be "used" -- they are type positions, not bindings. strictTypeChecked deliberately turns the base rule off in favour of the TS-aware
    // @typescript-eslint/no-unused-vars, but only if it is composed AFTER js.configs.recommended in
    // the array; composed in the wrong order (or omitted entirely and left to the consumer), the base rule wins and fires here. Confirmed as a real, not merely theoretical, failure against a live consumer (json-operators) before this fix.
    const diagnostics = lintFull(
      'export interface Resolvers {\n  resolveValue: (key: string, context: unknown) => Promise<string>;\n}\n',
      'src/foo.ts',
    );
    expect(diagnostics).not.toContain('no-unused-vars');
    expect(diagnostics).not.toContain('@typescript-eslint/no-unused-vars');
  });
});

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
