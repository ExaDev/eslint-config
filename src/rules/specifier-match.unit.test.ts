import { describe, expect, it } from 'vitest';
import { createSpecifierMatcher } from './specifier-match';

const CWD = '/repo';

function matches(patterns: readonly string[], specifier: string, file = 'src/routes/a.ts'): boolean {
  return createSpecifierMatcher(patterns)(specifier, `${CWD}/${file}`, CWD);
}

describe('createSpecifierMatcher and a trailing globstar', () => {
  it.each([
    ['lod**', 'lodash', true],
    ['lod**', 'lodash/fp', true],
    ['lod**', 'lodash/fp/get', true],
    ['lod**', 'underscore', false],
    ['lod*', 'lodash', true],
    ['lod*', 'lodash/fp', true],
    ['lod*', 'underscore/fp', false],
    ['**', 'lodash/fp', true],
    ['**', 'fs', true],
    ['a/**', 'a', true],
    ['a/**', 'a/b/c', true],
    ['a/**', 'ab', false],
    ['a/b**', 'a/bc', true],
    ['a/b**', 'a/bc/d', true],
    ['a/b**', 'a', false],
  ])('pattern %s selects %s: %s', (pattern, specifier, expected) => {
    expect(matches([pattern], specifier)).toBe(expected);
  });
});

describe('createSpecifierMatcher', () => {
  it('matches a bare specifier exactly, and everything beneath it', () => {
    expect(matches(['fs'], 'fs')).toBe(true);
    expect(matches(['fs'], 'fs/promises')).toBe(true);
    expect(matches(['fs'], 'fsevents')).toBe(false);
    expect(matches(['@scope/pkg'], '@scope/pkg/sub/path')).toBe(true);
    expect(matches(['@scope/pkg'], '@scope/other')).toBe(false);
  });

  it('ignores a node: prefix on either side', () => {
    expect(matches(['fs'], 'node:fs')).toBe(true);
    expect(matches(['fs'], 'node:fs/promises')).toBe(true);
    expect(matches(['node:fs'], 'fs')).toBe(true);
    expect(matches(['!node:fs', 'fs/*'], 'fs')).toBe(false);
  });

  it('supports wildcards and excludes in the file-glob dialect', () => {
    expect(matches(['@anthropic-ai/*'], '@anthropic-ai/sdk')).toBe(true);
    expect(matches(['@anthropic-ai/*'], '@openai/sdk')).toBe(false);
    expect(matches(['@anthropic-ai/**', '!@anthropic-ai/tokenizer'], '@anthropic-ai/tokenizer')).toBe(false);
    expect(matches(['@anthropic-ai/**', '!@anthropic-ai/tokenizer'], '@anthropic-ai/tokenizer/deep')).toBe(false);
    expect(matches(['@anthropic-ai/**', '!@anthropic-ai/tokenizer'], '@anthropic-ai/sdk')).toBe(true);
  });

  it('matches nothing when the list has only excludes', () => {
    expect(matches(['!fs'], 'path')).toBe(false);
  });

  it('resolves a relative specifier against the linted file before matching a path pattern', () => {
    expect(matches(['src/db'], '../db/client')).toBe(true);
    expect(matches(['src/db/**'], '../db')).toBe(true);
    expect(matches(['src/db/**'], './db/client', 'src/index.ts')).toBe(true);
    expect(matches(['src/db/**'], '../other/client')).toBe(false);
    expect(matches(['**/contract/src/*conformance*'], '../../contract/src/run-conformance', 'packages/a/src/x.test.ts')).toBe(true);
    expect(matches(['**/contract/src/*conformance*'], '../../contract/src/run', 'packages/a/src/x.test.ts')).toBe(false);
    expect(matches(['**/contract/src/*conformance*'], '../other/run-conformance', 'packages/a/src/x.test.ts')).toBe(false);
  });

  it('never selects a relative specifier with a pattern that cannot name a path', () => {
    expect(matches(['fs'], './fs', 'index.ts')).toBe(false);
    expect(matches(['!x'], './x', 'index.ts')).toBe(false);
  });

  it('matches nothing for a relative specifier that leaves the working directory', () => {
    expect(matches(['**/secret'], '../../secret', 'src/a.ts')).toBe(false);
  });

  it('does not let a bare specifier match a path pattern by accident of shape', () => {
    expect(matches(['src/db/**'], 'src/db/client')).toBe(true);
    expect(matches(['src/db/**'], 'zod')).toBe(false);
  });
});
