import markdown from '@eslint/markdown';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import rule, { checkSkillFrontmatter, MAX_SKILL_DESCRIPTION_LENGTH, MAX_SKILL_NAME_LENGTH } from './skill-frontmatter';

describe('limits', () => {
  it('are the Agent Skills specification limits', () => {
    expect(String(MAX_SKILL_NAME_LENGTH)).toBe('64');
    expect(String(MAX_SKILL_DESCRIPTION_LENGTH)).toBe('1024');
  });
});

describe('rule metadata', () => {
  it('carries the docs url and the languages it runs under', () => {
    expect(rule.meta?.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/skill-frontmatter.ts');
    expect(rule.meta?.languages).toStrictEqual(['markdown/commonmark', 'markdown/gfm']);
    expect(rule.meta?.schema).toStrictEqual([]);
  });
});

describe('a description with only whitespace', () => {
  it.each([
    ['spaces', '   '],
    ['a tab', '\t'],
    ['a newline', '\n'],
    ['mixed whitespace', ' \t\n '],
  ])('is reported as empty for %s', (_label, description) => {
    expect(checkSkillFrontmatter({ name: 'a', description }, 'a')).toStrictEqual([{ messageId: 'invalidDescription', data: {} }]);
  });

  it('is accepted when it has text, whatever surrounds it, and the length limit counts the value as written', () => {
    expect(checkSkillFrontmatter({ name: 'a', description: '  Counts words.\n' }, 'a')).toStrictEqual([]);
    expect(checkSkillFrontmatter({ name: 'a', description: `${'d'.repeat(MAX_SKILL_DESCRIPTION_LENGTH)}\n` }, 'a')).toStrictEqual([{ messageId: 'descriptionTooLong', data: { max: String(MAX_SKILL_DESCRIPTION_LENGTH) } }]);
  });
});

describe('checkSkillFrontmatter', () => {
  it('reports nothing for a skill that meets every requirement', () => {
    expect(checkSkillFrontmatter({ name: 'word-count', description: 'Counts words.' }, 'word-count')).toStrictEqual([]);
  });

  it('names the offending values in the data of each problem', () => {
    expect(checkSkillFrontmatter({ name: 'Bad', description: 'd' }, 'good')).toStrictEqual([
      { messageId: 'nameFormat', data: { name: 'Bad' } },
      { messageId: 'nameMismatch', data: { name: 'Bad', directory: 'good' } },
    ]);
    expect(checkSkillFrontmatter({ name: 'a'.repeat(MAX_SKILL_NAME_LENGTH + 1), description: 'd'.repeat(MAX_SKILL_DESCRIPTION_LENGTH + 1) }, 'a'.repeat(MAX_SKILL_NAME_LENGTH + 1))).toStrictEqual([
      { messageId: 'nameTooLong', data: { max: '64' } },
      { messageId: 'descriptionTooLong', data: { max: '1024' } },
    ]);
  });

  it('reports a missing name once, without the checks that need one', () => {
    expect(checkSkillFrontmatter({ description: 'd' }, 'x')).toStrictEqual([{ messageId: 'invalidName', data: {} }]);
  });

  it('tolerates keys it does not know and a metadata value that is not a mapping', () => {
    expect(checkSkillFrontmatter({ name: 'x', description: 'd', 'argument-hint': '[a]', 'disable-model-invocation': true, 'allowed-tools': 'Read', model: 'm', future: 1, metadata: 'text' }, 'x')).toStrictEqual([]);
  });
});

const ruleTester = new RuleTester({ plugins: { markdown, exadev: { rules: { 'skill-frontmatter': rule } } }, language: 'markdown/gfm', languageOptions: { frontmatter: 'yaml' } });

const longName = 'a'.repeat(MAX_SKILL_NAME_LENGTH);

function skill(frontmatter: string, name = 'word-count'): { readonly code: string; readonly filename: string } {
  return { code: `---\n${frontmatter}\n---\n\n# Skill\n`, filename: `skills/${name}/SKILL.md` };
}

ruleTester.run('skill-frontmatter', rule, {
  valid: [
    skill('name: word-count\ndescription: Counts the words in a file.'),
    // The directory is the one holding the SKILL.md, wherever it sits.
    skill('name: word-count\ndescription: d', 'word-count'),
    { code: '---\nname: x\ndescription: d\n---\n', filename: 'plugins/p/skills/x/SKILL.md' },
    // Keys the specification adds over time are not rejected.
    skill('name: word-count\ndescription: d\nargument-hint: "[file]"\ndisable-model-invocation: true\nallowed-tools: Read Grep\nmodel: sonnet\nsomething-new: 1'),
    skill('name: word-count\ndescription: d\nmetadata:\n  internal: true\n  author: someone'),
    skill('name: word-count\ndescription: d\nmetadata:\n  internal: false'),
    skill('name: word-count\ndescription: d\nmetadata:\n  author: someone'),
    // A name and description exactly at their limits, the description counted in characters rather than UTF-16 units.
    skill(`name: ${longName}\ndescription: d`, longName),
    skill(`name: word-count\ndescription: ${'d'.repeat(MAX_SKILL_DESCRIPTION_LENGTH)}`),
    skill(`name: word-count\ndescription: "${'\u{1F600}'.repeat(MAX_SKILL_DESCRIPTION_LENGTH)}"`),
    // Digits and single hyphens are part of the name shape.
    skill('name: a1-b2-c3\ndescription: d', 'a1-b2-c3'),
    skill('name: "7"\ndescription: d', '7'),
  ],
  invalid: [
    { code: '# Skill\n', filename: 'skills/word-count/SKILL.md', errors: [{ messageId: 'missingFrontmatter', line: 1, column: 1 }] },
    { code: '---\nname: [unclosed\n---\n', filename: 'skills/word-count/SKILL.md', errors: [{ messageId: 'invalidYaml', line: 1 }] },
    { code: '---\njust text\n---\n', filename: 'skills/word-count/SKILL.md', errors: [{ messageId: 'notMapping' }] },
    { code: '---\n---\n', filename: 'skills/word-count/SKILL.md', errors: [{ messageId: 'notMapping' }] },
    { ...skill('- a\n- b'), errors: [{ messageId: 'notMapping' }] },
    { ...skill('description: d'), errors: [{ messageId: 'invalidName' }] },
    { ...skill('name: ""\ndescription: d'), errors: [{ messageId: 'invalidName' }] },
    { ...skill('name: 12\ndescription: d'), errors: [{ messageId: 'invalidName' }] },
    { ...skill('name: [a]\ndescription: d'), errors: [{ messageId: 'invalidName' }] },
    { ...skill('name: other\ndescription: d'), errors: [{ messageId: 'nameMismatch', data: { name: 'other', directory: 'word-count' } }] },
    { code: '---\nname: x\ndescription: d\n---\n', filename: 'plugins/p/skills/y/SKILL.md', errors: [{ messageId: 'nameMismatch', data: { name: 'x', directory: 'y' } }] },
    { ...skill('name: Word-Count\ndescription: d', 'Word-Count'), errors: [{ messageId: 'nameFormat' }] },
    { ...skill('name: word--count\ndescription: d', 'word--count'), errors: [{ messageId: 'nameFormat' }] },
    { ...skill('name: -word\ndescription: d', '-word'), errors: [{ messageId: 'nameFormat' }] },
    { ...skill('name: word-\ndescription: d', 'word-'), errors: [{ messageId: 'nameFormat' }] },
    { ...skill('name: word_count\ndescription: d', 'word_count'), errors: [{ messageId: 'nameFormat' }] },
    { ...skill(`name: ${longName}a\ndescription: d`, `${longName}a`), errors: [{ messageId: 'nameTooLong', data: { max: '64' } }] },
    { ...skill('name: Bad\ndescription: d'), errors: [{ messageId: 'nameFormat' }, { messageId: 'nameMismatch' }] },
    { ...skill('name: word-count'), errors: [{ messageId: 'invalidDescription' }] },
    { ...skill('name: word-count\ndescription: ""'), errors: [{ messageId: 'invalidDescription' }] },
    { ...skill('name: word-count\ndescription: 12'), errors: [{ messageId: 'invalidDescription' }] },
    { ...skill(`name: word-count\ndescription: ${'d'.repeat(MAX_SKILL_DESCRIPTION_LENGTH + 1)}`), errors: [{ messageId: 'descriptionTooLong', data: { max: '1024' } }] },
    { ...skill(`name: word-count\ndescription: "${'\u{1F600}'.repeat(MAX_SKILL_DESCRIPTION_LENGTH + 1)}"`), errors: [{ messageId: 'descriptionTooLong' }] },
    { ...skill('name: word-count\ndescription: d\nmetadata:\n  internal: "yes"'), errors: [{ messageId: 'invalidInternal' }] },
    { ...skill('name: word-count\ndescription: d\nmetadata:\n  internal: 1'), errors: [{ messageId: 'invalidInternal' }] },
    // Every problem is reported, not only the first.
    { ...skill('name: other\ndescription: ""\nmetadata:\n  internal: x'), errors: [{ messageId: 'nameMismatch' }, { messageId: 'invalidDescription' }, { messageId: 'invalidInternal' }] },
  ],
});
