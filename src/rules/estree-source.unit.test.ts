import { describe, expect, it } from 'vitest';
import { isEstreeSource } from './estree-source';

describe('isEstreeSource', () => {
  it('accepts a source whose tree is rooted at a Program', () => {
    expect(isEstreeSource({ ast: { type: 'Program' } })).toBe(true);
  });

  it.each(['Document', 'root'])('rejects a %s, the root of a JSON or Markdown source', (type) => {
    expect(isEstreeSource({ ast: { type } })).toBe(false);
  });
});
