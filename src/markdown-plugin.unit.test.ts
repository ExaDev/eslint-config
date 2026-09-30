import markdown from '@eslint/markdown';
import { describe, expect, it } from 'vitest';
import { requireMarkdownPlugin, resolveMarkdownPlugin } from './markdown-plugin';

describe('resolveMarkdownPlugin', () => {
  it('finds the plugin under .default of a namespace, the shape require() gives an ES module', () => {
    expect(resolveMarkdownPlugin({ default: markdown, other: 1 })).toBe(markdown);
  });

  it('accepts a build that is its own default export', () => {
    expect(resolveMarkdownPlugin(markdown)).toBe(markdown);
  });

  it('rejects a value without a gfm language', () => {
    expect(resolveMarkdownPlugin({ languages: { commonmark: {} } })).toBeUndefined();
    expect(resolveMarkdownPlugin({ default: { languages: {} } })).toBeUndefined();
  });

  it.each([undefined, null, 'markdown', true, []])('rejects %j', (value) => {
    expect(resolveMarkdownPlugin(value)).toBeUndefined();
  });
});

describe('requireMarkdownPlugin', () => {
  it('resolves the installed package', () => {
    expect(requireMarkdownPlugin('Feature')).toBe(markdown);
  });

  it('throws naming the feature and the install command when the package cannot be resolved', () => {
    expect(() =>
      requireMarkdownPlugin('Required Markdown headings', () => {
        throw new Error('not found');
      }),
    ).toThrow("@exadev/eslint-config: Required Markdown headings needs '@eslint/markdown' but it could not be resolved. Install it with: pnpm add -D @eslint/markdown");
  });

  it('throws when the module resolves to something that is not the plugin', () => {
    expect(() => requireMarkdownPlugin('Feature', () => ({ rules: {} }))).toThrow(/could not be resolved/u);
  });
});
