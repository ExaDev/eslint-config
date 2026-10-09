import { describe, expect, it } from 'vitest';
import { createIgnoreMatcher } from './ignore-patterns';

describe('createIgnoreMatcher', () => {
  it('ignores nothing without patterns', () => {
    expect(createIgnoreMatcher([])('dist', true)).toBe(false);
  });

  it('ignores a file or a directory a plain pattern selects, at any depth when it starts with **/', () => {
    const isIgnored = createIgnoreMatcher(['**/dist', 'out']);
    expect(isIgnored('dist', true)).toBe(true);
    expect(isIgnored('packages/a/dist', true)).toBe(true);
    expect(isIgnored('dist', false)).toBe(true);
    expect(isIgnored('out', true)).toBe(true);
    expect(isIgnored('src/out', true)).toBe(false);
    expect(isIgnored('distance', true)).toBe(false);
  });

  it('selects only directories for a pattern ending in a slash', () => {
    const isIgnored = createIgnoreMatcher(['**/build/']);
    expect(isIgnored('build', true)).toBe(true);
    expect(isIgnored('a/build', true)).toBe(true);
    expect(isIgnored('a/build', false)).toBe(false);
  });

  it('matches everything under a directory with a trailing **', () => {
    const isIgnored = createIgnoreMatcher(['generated/**']);
    expect(isIgnored('generated/a/SKILL.md', false)).toBe(true);
    expect(isIgnored('generated/a', true)).toBe(true);
    expect(isIgnored('handwritten/a/SKILL.md', false)).toBe(false);
  });

  it('matches dot-prefixed segments with a wildcard and **', () => {
    const isIgnored = createIgnoreMatcher(['**/*.log', 'cache/*']);
    expect(isIgnored('.state/run.log', false)).toBe(true);
    expect(isIgnored('cache/.entry', false)).toBe(true);
  });

  it('lets the last pattern that selects a path decide it, so a ! pattern brings a path back', () => {
    const isIgnored = createIgnoreMatcher(['**/*.log', '!**/keep.log']);
    expect(isIgnored('a/run.log', false)).toBe(true);
    expect(isIgnored('a/keep.log', false)).toBe(false);
    expect(createIgnoreMatcher(['!**/keep.log', '**/*.log'])('a/keep.log', false)).toBe(true);
  });

  it('ignores nothing outside the working directory', () => {
    expect(createIgnoreMatcher(['**'])('../x', false)).toBe(false);
  });

  it.each(['/dist/', '/dist', '/dist/**', '/**/dist', '/*'])('matches nothing for %s, as ESLint does for a pattern with a leading slash', (pattern) => {
    const isIgnored = createIgnoreMatcher([pattern]);
    expect(isIgnored('dist', true)).toBe(false);
    expect(isIgnored('dist/a.md', false)).toBe(false);
  });

  it('lets a leading-slash ! pattern bring nothing back', () => {
    expect(createIgnoreMatcher(['dist/**', '!/dist/keep.md'])('dist/keep.md', false)).toBe(true);
  });
});
