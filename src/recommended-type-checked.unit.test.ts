import type { Linter } from 'eslint';
import { Linter as LinterClass } from 'eslint';
import json from '@eslint/json';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import recommendedTypeChecked from './recommended-type-checked';

// Exercises this package's own test-file relaxation directly against the real exported array (the last two entries: the outright-strictness rules, then the test-file override), rather than a re-implementation — proving the shipped config, not a description of intent. `projectService.allowDefaultProject` below gives every inline snippet a genuine ad hoc single-file TS project (the same pattern this repo's own type-aware rule tests use), so every rule in the shared block — type-aware or not — runs exactly as it would in production, with no rules turned off to work around a missing project service. No runtime Array.isArray narrowing needed here — recommendedTypeChecked's own ConfigArrayValue type (Extract<ConfigValue, unknown[]>) already proves this at compile time.
const linter = new LinterClass();
// The exported array's final two entries: the outright-strictness rules block, then the test-file relaxation block (see the comment above) — named here since a bare '-2' would itself trip @typescript-eslint/no-magic-numbers with nothing explaining what it denotes.
const FINAL_CONFIG_ENTRY_COUNT = 2;
const strictnessConfigs = recommendedTypeChecked.slice(-FINAL_CONFIG_ENTRY_COUNT);

// strictnessConfigs is typed via @typescript-eslint/utils's own FlatConfig.Config (see recommended-type-checked.ts's own comment on why), which eslint's own Linter.verify() does not accept directly: the two packages each declare their own independent `languageOptions` type for the exact same JSON-serializable runtime shape, differing only in a missing index signature — a declaration-file gap between the two type sources, not a real difference in the values passed. Widening through Linter.Config[] here documents that boundary at the one place this package's own test needs to cross it directly; production consumers never hit this, since a flat config file is never itself type-checked against Linter.verify's signature.
function lint(code: string, filename: string) {
  const config: Linter.Config[] = [
    {
      files: ['**'],
      languageOptions: {
        sourceType: 'module',
        parser: tseslint.parser,
        parserOptions: {
          // A literal filename list rather than a glob: allowDefaultProject rejects a directory-spanning glob like '**/*.ts*' outright ("known to cause performance issues"), and a bare '*.ts*' (the pattern this repo's own single-file rule tests use, which pass bare filenames with no directory prefix) doesn't match these paths' own 'src/' prefix — confirmed directly, both produce a parsing error rather than linting the snippet. These three are the exact, fixed set of filenames every test case below actually passes.
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

// Exercises the FULL exported array (unlike strictnessConfigs above, which deliberately slices to just the last two entries) — this is what actually proves js.configs.recommended is both present and composed in the correct position ahead of strictTypeChecked/stylisticTypeChecked, not merely described as such in a comment.
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
    // This is the exact regression this test guards against: js.configs.recommended sets the base no-unused-vars, which has no TypeScript awareness and treats an interface method signature's parameter names as real bindings that must be "used" — they are type positions, not bindings. strictTypeChecked deliberately turns the base rule off in favour of the TS-aware
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

  it('still bans @ts-ignore in a test file — no exemption for it', () => {
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

describe('linterOptions.noInlineConfig', () => {
  it('genuinely disables inline eslint-disable comments — a disable-next-line does not suppress the violation it targets', () => {
    const code = '// eslint-disable-next-line no-warning-comments\n// Stryker disable all\nconst x = 1;\n';
    expect(lint(code, 'src/foo.ts')).toContain('no-warning-comments');
  });
});

describe('recommended-type-checked test-file relaxation — structural (the object literal is explicit, not a value that merely happens to match the rule\'s own default)', () => {
  it('sets the exact ban-ts-comment and consistent-type-assertions options for test files', () => {
    const testFileBlock = recommendedTypeChecked.at(-1);
    expect(testFileBlock?.rules?.['@typescript-eslint/ban-ts-comment']).toStrictEqual(['error', { 'ts-expect-error': 'allow-with-description' }]);
    expect(testFileBlock?.rules?.['@typescript-eslint/consistent-type-assertions']).toStrictEqual(['error', { assertionStyle: 'as' }]);
  });
});

describe('no-magic-numbers options', () => {
  it('ignores -1, 0, 1, and 2 as literal values outside any of the other ignore categories', () => {
    const code = 'function f(x: number): number {\n  return x * -1 + 0 + 1 + 2;\n}\n';
    expect(lint(code, 'src/foo.ts')).not.toContain('@typescript-eslint/no-magic-numbers');
  });

  it('still flags a magic number outside the ignore list', () => {
    const code = 'function f(x: number): number {\n  return x * 7;\n}\n';
    expect(lint(code, 'src/foo.ts')).toContain('@typescript-eslint/no-magic-numbers');
  });

  it('does not flag a numeric array index (ignoreArrayIndexes)', () => {
    const code = 'declare const arr: number[];\nconst y = arr[5];\n';
    expect(lint(code, 'src/foo.ts')).not.toContain('@typescript-eslint/no-magic-numbers');
  });

  it('does not flag a numeric enum member\'s own declared value (ignoreEnums)', () => {
    const code = 'enum Direction {\n  Up = 5,\n}\n';
    expect(lint(code, 'src/foo.ts')).not.toContain('@typescript-eslint/no-magic-numbers');
  });

  it('does not flag a readonly class property\'s numeric initializer (ignoreReadonlyClassProperties)', () => {
    const code = 'class Foo {\n  readonly max = 5;\n}\n';
    expect(lint(code, 'src/foo.ts')).not.toContain('@typescript-eslint/no-magic-numbers');
  });

  it('still flags a non-readonly class property\'s numeric initializer', () => {
    const code = 'class Foo {\n  max = 5;\n}\n';
    expect(lint(code, 'src/foo.ts')).toContain('@typescript-eslint/no-magic-numbers');
  });

  it('does not flag a default parameter value (ignoreDefaultValues)', () => {
    const code = 'function f(x: number = 5): number {\n  return x;\n}\n';
    expect(lint(code, 'src/foo.ts')).not.toContain('@typescript-eslint/no-magic-numbers');
  });

  it('does not flag a numeric literal type (ignoreNumericLiteralTypes)', () => {
    const code = 'type Indent = 2 | 4;\n';
    expect(lint(code, 'src/foo.ts')).not.toContain('@typescript-eslint/no-magic-numbers');
  });
});

describe('no-use-before-define functions: false', () => {
  it('allows calling a function declaration before its own textual declaration (fully hoisted, runtime-safe)', () => {
    const code = 'f();\nfunction f(): void {}\n';
    expect(lint(code, 'src/foo.ts')).not.toContain('@typescript-eslint/no-use-before-define');
  });

  it('still flags using a const binding before its own declaration (a genuine temporal-dead-zone crash risk)', () => {
    const code = 'console.log(x);\nconst x = 1;\n';
    expect(lint(code, 'src/foo.ts')).toContain('@typescript-eslint/no-use-before-define');
  });
});

describe('no-warning-comments (Stryker suppression comments)', () => {
  it('bans a Stryker disable-next-line comment', () => {
    expect(lint('// Stryker disable next-line all\nconst x = 1;\n', 'src/foo.ts')).toContain('no-warning-comments');
  });

  it('bans a Stryker disable comment scoped to a mutator list', () => {
    expect(lint('// Stryker disable all: reason\nconst x = 1;\n', 'src/foo.ts')).toContain('no-warning-comments');
  });

  it('matches case-insensitively', () => {
    expect(lint('// stryker DISABLE all\nconst x = 1;\n', 'src/foo.ts')).toContain('no-warning-comments');
  });

  it('does not flag an unrelated comment', () => {
    expect(lint('// a perfectly ordinary comment\nconst x = 1;\n', 'src/foo.ts')).not.toContain('no-warning-comments');
  });
});

// Matches the `max: 800` configured on the rule under test above.
const MAX_LINES = 800;
// Comfortably more blank/comment lines than MAX_LINES, to prove they are never counted no matter how many pile up.
const NON_CODE_LINE_COUNT = MAX_LINES * 2;

// Each generated line declares a uniquely-named const — a repeated `const x = 1;` would itself be a parse error (redeclaration in the same scope), which would mask what these tests actually check.
function generateLinesOfCode(count: number): string {
  return Array.from({ length: count }, (_, index) => `const generatedLine${String(index)} = ${String(index)};`).join('\n');
}

describe('max-lines', () => {
  it('bans a file over 800 real lines of code', () => {
    expect(lint(generateLinesOfCode(MAX_LINES + 1), 'src/foo.ts')).toContain('max-lines');
  });

  it('allows a file at or under 800 real lines of code', () => {
    expect(lint(generateLinesOfCode(MAX_LINES), 'src/foo.ts')).not.toContain('max-lines');
  });

  it('does not count blank lines or comment-only lines toward the limit', () => {
    const code = `${'\n// a comment\n'.repeat(NON_CODE_LINE_COUNT)}${generateLinesOfCode(1)}\n`;
    expect(lint(code, 'src/foo.ts')).not.toContain('max-lines');
  });
});

// A consumer commonly lints other languages (JSON, Markdown) alongside this package's default export in the same flat-config array, each under its own `language` plugin. Every block in recommendedTypeChecked must therefore be scoped to JS/TS files specifically — an unscoped block (js.configs.recommended shipped with none at all, confirmed directly) is matched against every file ESLint lints regardless of language, and at least one of its rules doesn't merely misfire against a non-ESTree source, it throws: no-irregular-whitespace calls sourceCode.getAllComments(), a method the JSON language's own source-code object doesn't implement. Reproduces the real consumer failure (agent-comms, linting **/*.json via @eslint/json alongside this package) rather than asserting scoping as an implementation detail.
describe('file scoping against a non-JS/TS language in the same config array', () => {
  function lintJsonAlongsideRecommended(code: string): Linter.LintMessage[] {
    const config: Linter.Config[] = [
      ...recommendedTypeChecked,
      {
        files: ['**/*.json'],
        language: 'json/json',
        plugins: { json },
      },
    ] as Linter.Config[];
    return linter.verify(code, config, 'src/foo.json');
  }

  it('does not throw when linting a JSON file alongside this package\'s default export', () => {
    expect(() => lintJsonAlongsideRecommended('{"a": 1}')).not.toThrow();
  });

  it('reports no JS/TS-scoped rule violations against JSON content', () => {
    // A trailing comma and a duplicate key are genuine JSON-language violations (of json/json's own rules, not this package's) — present only to confirm the linter actually ran and produced messages, not that it silently skipped the file. None of the message ruleIds may belong to this package's JS/TS-only rule set (@typescript-eslint/*, exadev/*, jsdoc/*, tsdoc/*, or unprefixed core rules like no-irregular-whitespace/max-lines/no-warning-comments), since none of those describe anything a JSON document could ever violate.
    const messages = lintJsonAlongsideRecommended('{"a": 1, "a": 2}');
    const jsScopedRuleId = messages.find((message) => {
      const ruleId = message.ruleId ?? '';
      return (
        ruleId.startsWith('@typescript-eslint/')
        || ruleId.startsWith('exadev/')
        || ruleId.startsWith('jsdoc/')
        || ruleId.startsWith('tsdoc/')
        || ruleId === 'no-irregular-whitespace'
        || ruleId === 'max-lines'
        || ruleId === 'no-warning-comments'
      );
    });
    expect(jsScopedRuleId).toBeUndefined();
  });
});
