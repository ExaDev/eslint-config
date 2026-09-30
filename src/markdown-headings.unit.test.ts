import markdown from '@eslint/markdown';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { exadevConfig } from './create-config';
import { assembleMarkdownHeadingsConfig, buildMarkdownHeadingsConfig, markdownHeadingsConfig } from './markdown-headings';
import plugin from './plugin';

const options = { files: ['docs/**/*.md'], headings: [{ depth: 2, text: 'Usage' }] };

describe('markdownHeadingsConfig', () => {
  it('wires the rule under markdown/gfm with frontmatter parsed as yaml by default', () => {
    const [block, ...rest] = markdownHeadingsConfig(options);
    expect(rest).toStrictEqual([]);
    expect(block?.files).toStrictEqual(['docs/**/*.md']);
    expect(block?.language).toBe('markdown/gfm');
    expect(block?.languageOptions).toStrictEqual({ frontmatter: 'yaml' });
    expect(block?.rules).toStrictEqual({ 'exadev/markdown-required-heading': ['error', [{ depth: 2, text: 'Usage' }]] });
  });

  it('registers this plugin and the resolved @eslint/markdown', () => {
    const [block] = buildMarkdownHeadingsConfig(options);
    expect(block?.plugins?.['exadev']).toBe(plugin);
    expect(block?.plugins?.['markdown']).toBe(markdown);
  });

  it.each(['yaml', 'toml', 'json'] as const)('parses %s frontmatter when asked to', (frontmatter) => {
    expect(markdownHeadingsConfig({ ...options, frontmatter })[0]?.languageOptions).toStrictEqual({ frontmatter });
  });

  it('turns a leading ! glob into an ignore', () => {
    const [block] = markdownHeadingsConfig({ ...options, files: ['**/*.md', '!node_modules/**'] });
    expect(block?.files).toStrictEqual(['**/*.md']);
    expect(block?.ignores).toStrictEqual(['node_modules/**']);
  });

  it('is what exadevConfig({ markdownHeadings }) adds', () => {
    const block = exadevConfig({ markdownHeadings: options }).find((candidate) => candidate.language === 'markdown/gfm');
    expect(block?.rules).toStrictEqual({ 'exadev/markdown-required-heading': ['error', [{ depth: 2, text: 'Usage' }]] });
  });

  it('adds nothing to exadevConfig() unless given', () => {
    expect(exadevConfig().some((candidate) => candidate.language === 'markdown/gfm')).toBe(false);
  });
});

describe('option validation', () => {
  const load = () => markdown;

  it.each([
    ['a non-object', 'x', /"markdownHeadings" must be an object/u],
    ['an unknown key', { ...options, heading: [] }, /unknown key "heading"/u],
    ['no files', { headings: options.headings }, /"markdownHeadings.files" must be an array/u],
    ['an exclude-only file list', { ...options, files: ['!a.md'] }, /at least one glob that does not start with "!"/u],
    ['no headings', { files: options.files }, /"markdownHeadings.headings" must be a non-empty array/u],
    ['an empty heading list', { ...options, headings: [] }, /"markdownHeadings.headings" must be a non-empty array/u],
    ['a non-object heading', { ...options, headings: ['Usage'] }, /"markdownHeadings.headings" must be a non-empty array/u],
    ['an unknown heading key', { ...options, headings: [{ depth: 2, text: 'Usage', level: 1 }] }, /unknown key "level"/u],
    ['a depth of 0', { ...options, headings: [{ depth: 0, text: 'Usage' }] }, /"depth" to be an integer from 1 to 6/u],
    ['a depth of 7', { ...options, headings: [{ depth: 7, text: 'Usage' }] }, /"depth" to be an integer from 1 to 6/u],
    ['a fractional depth', { ...options, headings: [{ depth: 2.5, text: 'Usage' }] }, /"depth" to be an integer from 1 to 6/u],
    ['a string depth', { ...options, headings: [{ depth: '2', text: 'Usage' }] }, /"depth" to be an integer from 1 to 6/u],
    ['blank text', { ...options, headings: [{ depth: 2, text: '  ' }] }, /"text" to be a non-blank string/u],
    ['non-string text', { ...options, headings: [{ depth: 2, text: 2 }] }, /"text" to be a non-blank string/u],
    ['an unknown frontmatter format', { ...options, frontmatter: 'xml' }, /"markdownHeadings.frontmatter" must be one of yaml, toml, json/u],
  ])('rejects %s', (_label, given, message) => {
    // The options are deliberately malformed, which the declared option type would reject at compile time.
    expect(() => assembleMarkdownHeadingsConfig(JSON.parse(JSON.stringify(given)) as never, load)).toThrow(message);
  });

  it('reports an option error before a missing package', () => {
    expect(() =>
      assembleMarkdownHeadingsConfig({ ...options, headings: [] }, () => {
        throw new Error('package missing');
      }),
    ).toThrow(/"markdownHeadings.headings"/u);
  });

  it('propagates a missing package once the options are valid', () => {
    expect(() =>
      assembleMarkdownHeadingsConfig(options, () => {
        throw new Error('package missing');
      }),
    ).toThrow('package missing');
  });
});

describe('linting a real document', () => {
  const lint = (text: string): string[] => new Linter({ cwd: '/repo' }).verify(text, markdownHeadingsConfig(options), { filename: '/repo/docs/guide.md' }).map((message) => message.message);

  it('passes a document with the heading, after frontmatter', () => {
    expect(lint('---\ntitle: Guide\n---\n\n## Usage\n')).toStrictEqual([]);
  });

  it('reports a document without it', () => {
    expect(lint('---\ntitle: Usage\n---\n\n## Install\n')).toStrictEqual(['This document must contain a level 2 heading "Usage".']);
  });

  it('leaves a Markdown file outside the globs alone', () => {
    const messages = new Linter({ cwd: '/repo' }).verify('text', markdownHeadingsConfig(options), { filename: '/repo/README.md' });
    expect(messages.map((message) => message.message)).toStrictEqual(['No matching configuration found for /repo/README.md.']);
  });
});
