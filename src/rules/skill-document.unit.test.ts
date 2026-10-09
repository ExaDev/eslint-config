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

// Each level lists the previous level's anchor ten times, so the expansion grows tenfold per level, past the alias limit of the YAML library.
function aliasBomb(): string {
  const levels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const lines = ['a: &a [x, x, x, x, x, x, x, x, x, x]'];
  levels.forEach((level, index) => {
    const next = levels[index + 1];
    if (next !== undefined) lines.push(`${next}: &${next} [${Array.from({ length: 10 }, () => `*${level}`).join(', ')}]`);
  });

  return `${lines.join('\n')}\n`;
}

describe('parseFrontmatter', () => {
  it.each([
    ['an alias whose anchor is never set', 'description: *Required*\n'],
    ['an alias used as the name', 'name: *x\n'],
    ['an alias used as a merge key', '<<: *x\nname: a\n'],
    ['an alias explosion', aliasBomb()],
  ])('reports %s as invalid frontmatter instead of throwing', (_label, yamlText) => {
    const parsed = parseFrontmatter(yamlText);
    expect(parsed.kind).toBe('invalid');
  });

  it('resolves an alias whose anchor is set', () => {
    expect(parseFrontmatter('name: &n a\ndescription: *n\n')).toStrictEqual({ kind: 'mapping', value: { name: 'a', description: 'a' } });
  });

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

describe('readSkillName with surrounding whitespace', () => {
  it.each([
    ['a space', '" a"', 'a'],
    ['a trailing space', '"a "', 'a'],
    ['a tab and a newline', '"\\ta\\n"', 'a'],
  ])('returns the trimmed name for %s', (_label, scalar, expected) => {
    expect(readSkillName(`---\nname: ${scalar}\n---\n`)).toBe(expected);
  });

  it('returns undefined for a name of only whitespace', () => {
    expect(readSkillName('---\nname: "  "\n---\n')).toBeUndefined();
  });

  it('does not normalise: fullwidth and decomposed names stay distinct', () => {
    expect(readSkillName('---\nname: "\uff41"\n---\n')).toBe('\uff41');
    expect(readSkillName('---\nname: "cafe\u0301"\n---\n')).toBe('cafe\u0301');
  });
});

describe('readSkillName', () => {
  it('returns undefined for frontmatter with an unresolvable alias', () => {
    expect(readSkillName('---\nname: *x\n---\n')).toBeUndefined();
  });

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
