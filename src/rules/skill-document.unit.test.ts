import { describe, expect, it } from 'vitest';
import { extractFrontmatter, parseFrontmatter, readSkillName, SKILL_FILE_NAME } from './skill-document';

describe('SKILL_FILE_NAME', () => {
  it('is the name the Agent Skills specification gives a skill entry point', () => {
    expect(SKILL_FILE_NAME).toBe('SKILL.md');
  });
});

describe('extractFrontmatter', () => {
  it('returns the lines between the delimiters', () => {
    expect(extractFrontmatter('---\nname: a\ndescription: b\n---\n\n# A\n')).toBe('name: a\ndescription: b\n');
  });

  it('returns an empty body for an empty block', () => {
    expect(extractFrontmatter('---\n---\n')).toBe('');
  });

  it('accepts a closing delimiter at the end of the text', () => {
    expect(extractFrontmatter('---\nname: a\n---')).toBe('name: a\n');
  });

  it('accepts carriage-return line breaks and trailing spaces on a delimiter', () => {
    expect(extractFrontmatter('--- \r\nname: a\r\n---  \r\n')).toBe('name: a\r\n');
  });

  it('ignores a leading byte order mark', () => {
    expect(extractFrontmatter('﻿---\nname: a\n---\n')).toBe('name: a\n');
  });

  it('does not close the block on a body line that merely ends in three hyphens', () => {
    expect(extractFrontmatter('---\nname: a---\ndescription: b\n---\n')).toBe('name: a---\ndescription: b\n');
  });

  it('does not close the block on a line that only starts with three hyphens', () => {
    expect(extractFrontmatter('---\nname: a\n---b\n---\n')).toBe('name: a\n---b\n');
  });

  it('returns undefined when the text does not start with a block', () => {
    expect(extractFrontmatter('# A\n\n---\nname: a\n---\n')).toBeUndefined();
  });

  it('returns undefined when the block is never closed', () => {
    expect(extractFrontmatter('---\nname: a\n')).toBeUndefined();
  });
});

describe('parseFrontmatter', () => {
  it('reads a mapping', () => {
    expect(parseFrontmatter('name: a\nmetadata:\n  internal: true\n')).toStrictEqual({ kind: 'mapping', value: { name: 'a', metadata: { internal: true } } });
  });

  it('reports a syntax error with its message', () => {
    const parsed = parseFrontmatter('name: [unclosed\n');
    expect(parsed.kind).toBe('invalid');
    expect(parsed.kind === 'invalid' && parsed.message.length > 0).toBe(true);
  });

  it.each([['a scalar', 'just text\n'], ['a sequence', '- a\n- b\n'], ['an empty document', '']])('treats %s as another value', (_label, yamlText) => {
    expect(parseFrontmatter(yamlText)).toStrictEqual({ kind: 'other' });
  });
});

describe('readSkillName', () => {
  it('reads the declared name', () => {
    expect(readSkillName('---\nname: word-count\ndescription: d\n---\n')).toBe('word-count');
  });

  it.each([
    ['no frontmatter', '# Title\n'],
    ['invalid yaml', '---\nname: [x\n---\n'],
    ['a non-mapping', '---\n- a\n---\n'],
    ['no name', '---\ndescription: d\n---\n'],
    ['an empty name', '---\nname: ""\n---\n'],
    ['a non-string name', '---\nname: 12\n---\n'],
  ])('is undefined for %s', (_label, text) => {
    expect(readSkillName(text)).toBeUndefined();
  });
});
