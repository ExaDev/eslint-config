import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule, { createFilenamePatternRule, readFilenamePatternEntries } from './filename-pattern';
import type { WorkspaceFs } from './workspace-fs';

// The rule tester resolves a relative test filename itself, so the fake filesystem answers by path suffix rather than by an absolute path this file would have to guess.
const EXISTING = ['ui/Button.tsx', 'ui/Button.module.css', 'ui/Card.tsx', 'ui/Card.module.scss', 'ui/Solo.tsx', 'ui/Two.parts.tsx', 'ui/Two.parts.module.css', 'ui/styles/Nested.css'];
const fakeFs: WorkspaceFs = {
  existsSync: (path) => EXISTING.some((suffix) => path.endsWith(`/${suffix}`)),
  readFileSync: () => '',
  readdirSync: () => [],
  realpathSync: (path) => path,
};

const languageOptions = { parser: tseslint.parser, sourceType: 'module' } as const;
const withSiblings = createFilenamePatternRule(fakeFs);

describe('filename-pattern options', () => {
  it('names its docs page after the rule file', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/filename-pattern.ts');
  });

  it('rejects malformed entries', () => {
    const read = (entry: unknown) => () => readFilenamePatternEntries([entry]);
    expect(() => readFilenamePatternEntries({})).toThrow(/must be an array of objects/u);
    expect(read({ files: 'a.ts' })).toThrow(/"pattern" or a "sibling"/u);
    expect(read({ files: 'a.ts', pattern: '' })).toThrow(/"pattern" to be a non-empty regular expression/u);
    expect(read({ files: 'a.ts', pattern: 3 })).toThrow(/"pattern" to be a non-empty regular expression/u);
    expect(read({ files: 'a.ts', pattern: '(' })).toThrow(SyntaxError);
    expect(read({ files: 'a.ts', sibling: [] })).toThrow(/"sibling"/u);
    expect(read({ files: 'a.ts', sibling: [''] })).toThrow(/"sibling"/u);
    expect(read({ files: 'a.ts', sibling: 3 })).toThrow(/"sibling"/u);
    expect(read({ files: 'a.ts', pattern: 'x', overLines: -1 })).toThrow(/"overLines" to be a non-negative integer/u);
    expect(read({ files: 'a.ts', pattern: 'x', overLines: 1.5 })).toThrow(/"overLines" to be a non-negative integer/u);
    expect(read({ files: 'a.ts', pattern: 'x', overLines: '5' })).toThrow(/"overLines" to be a non-negative integer/u);
    expect(read({ files: 'a.ts', pattern: 'x', nope: 1 })).toThrow(/unknown key "nope"/u);
    expect(read({ pattern: 'x' })).toThrow(/glob strings/u);
  });

  it('anchors the pattern to the whole file name', () => {
    const [entry] = readFilenamePatternEntries([{ files: 'a.ts', pattern: 'a|b' }]);
    expect(entry?.pattern?.regexp.test('a')).toBe(true);
    expect(entry?.pattern?.regexp.test('b')).toBe(true);
    expect(entry?.pattern?.regexp.test('ab')).toBe(false);
    expect(entry?.pattern?.regexp.test('xa')).toBe(false);
  });
});

const ruleTester = new RuleTester({ languageOptions });

const STORIES = [[{ files: ['**/*.stories.tsx'], pattern: '[A-Z][A-Za-z0-9]*\\.stories\\.tsx' }]] as const;
const SPLIT = [[{ files: ['src/**/*.ts'], overLines: 3, pattern: '.+\\.part-\\d{2}\\.ts' }]] as const;

ruleTester.run('filename-pattern', rule, {
  valid: [
    // Out of scope.
    { code: 'export {};', filename: 'ui/button.tsx', options: STORIES },
    { code: 'export {};', filename: 'ui/button.stories.ts', options: STORIES },
    { code: 'export {};', filename: 'ui/x.ts', options: [[]] },
    // In scope and matching.
    { code: 'export {};', filename: 'ui/Button.stories.tsx', options: STORIES },
    { code: 'export {};', filename: 'a/b/c/Card2.stories.tsx', options: STORIES },
    // Suffix by glob with a module stylesheet requirement expressed as a name pattern.
    { code: 'export {};', filename: 'ui/Button.module.css.ts', options: [[{ files: '*.module.css.ts', pattern: '.+\\.module\\.css\\.ts' }]] },
    // Under the line threshold, any name is fine; at the threshold too (over means strictly more).
    { code: 'a;\nb;\nc;\n', filename: 'src/big.ts', options: SPLIT },
    { code: 'a;\nb;\nc;', filename: 'src/big.ts', options: SPLIT },
    // Over the threshold and split-named.
    { code: 'a;\nb;\nc;\nd;\n', filename: 'src/big.part-01.ts', options: SPLIT },
    // Outside the scope of the split entry.
    { code: 'a;\nb;\nc;\nd;\ne;\n', filename: 'lib/big.ts', options: SPLIT },
  ],
  invalid: [
    {
      code: 'export {};',
      filename: 'ui/button.stories.tsx',
      options: STORIES,
      errors: [{ messageId: 'nameMismatch', data: { name: 'button.stories.tsx', pattern: '[A-Z][A-Za-z0-9]*\\.stories\\.tsx' }, line: 1 }],
    },
    // A partial match is not a match.
    { code: 'export {};', filename: 'ui/Button.stories.tsx.bak.stories.tsx', options: [[{ files: '*.tsx', pattern: 'Button' }]], errors: [{ messageId: 'nameMismatch' }] },
    // Two entries both apply.
    {
      code: 'export {};',
      filename: 'ui/x.stories.tsx',
      options: [
        [
          { files: '*.stories.tsx', pattern: '[A-Z].*' },
          { files: 'ui/*.tsx', pattern: '.*\\.view\\.tsx' },
        ],
      ],
      errors: [{ messageId: 'nameMismatch', data: { name: 'x.stories.tsx', pattern: '[A-Z].*' } }, { messageId: 'nameMismatch', data: { name: 'x.stories.tsx', pattern: '.*\\.view\\.tsx' } }],
    },
    // Over the threshold and not split-named: the message carries the count and the limit; a trailing newline is not a line.
    {
      code: 'a;\nb;\nc;\nd;\n',
      filename: 'src/big.ts',
      options: SPLIT,
      errors: [{ messageId: 'oversizedNameMismatch', data: { name: 'big.ts', pattern: '.+\\.part-\\d{2}\\.ts', lines: '4', limit: '3' } }],
    },
    {
      code: 'a;\nb;\nc;\nd;',
      filename: 'src/big.ts',
      options: SPLIT,
      errors: [{ messageId: 'oversizedNameMismatch', data: { name: 'big.ts', pattern: '.+\\.part-\\d{2}\\.ts', lines: '4', limit: '3' } }],
    },
  ],
});

const siblingTester = new RuleTester({ languageOptions });
const SIBLING = [[{ files: ['ui/*.tsx', '!ui/*.parts.tsx'], sibling: ['{name}.module.css', '{name}.module.scss'] }]] as const;

siblingTester.run('filename-pattern siblings', withSiblings, {
  valid: [
    // Either accepted stylesheet satisfies it.
    { code: 'export {};', filename: 'ui/Button.tsx', options: SIBLING },
    { code: 'export {};', filename: 'ui/Card.tsx', options: SIBLING },
    // Excluded from the entry.
    { code: 'export {};', filename: 'ui/Solo.parts.tsx', options: SIBLING },
    // Out of scope entirely.
    { code: 'export {};', filename: 'lib/Solo.tsx', options: SIBLING },
    // A subdirectory template, and the name is the stem up to the final extension only.
    { code: 'export {};', filename: 'ui/Nested.tsx', options: [[{ files: 'ui/*.tsx', sibling: 'styles/{name}.css' }]] },
    { code: 'export {};', filename: 'ui/Two.parts.tsx', options: [[{ files: 'ui/*.tsx', sibling: '{name}.module.css' }]] },
  ],
  invalid: [
    { code: 'export {};', filename: 'ui/Solo.tsx', options: SIBLING, errors: [{ messageId: 'missingSibling', data: { name: 'Solo.tsx', siblings: 'Solo.module.css or Solo.module.scss' }, line: 1 }] },
    { code: 'export {};', filename: 'ui/Solo.tsx', options: [[{ files: 'ui/*.tsx', sibling: '{name}.stories.tsx' }]], errors: [{ messageId: 'missingSibling', data: { name: 'Solo.tsx', siblings: 'Solo.stories.tsx' } }] },
    // A name without an extension keeps its whole name, and a template may repeat the placeholder.
    { code: 'export {};', filename: 'ui/Makefile', options: [[{ files: 'Makefile', sibling: '{name}/{name}.md' }]], errors: [{ messageId: 'missingSibling', data: { name: 'Makefile', siblings: 'Makefile/Makefile.md' } }] },
    // The pattern and the sibling checks report independently.
    {
      code: 'export {};',
      filename: 'ui/solo.tsx',
      options: [[{ files: 'ui/*.tsx', pattern: '[A-Z].*', sibling: '{name}.css' }]],
      errors: [{ messageId: 'nameMismatch' }, { messageId: 'missingSibling' }],
    },
    // The sibling requirement can also depend on size.
    { code: 'a;\nb;\n', filename: 'ui/Solo.tsx', options: [[{ files: 'ui/*.tsx', sibling: '{name}.css', overLines: 1 }]], errors: [{ messageId: 'missingSibling' }] },
  ],
});

siblingTester.run('filename-pattern siblings under the size threshold', withSiblings, {
  valid: [{ code: 'a;\n', filename: 'ui/Solo.tsx', options: [[{ files: 'ui/*.tsx', sibling: '{name}.css', overLines: 1 }]] }],
  invalid: [],
});
