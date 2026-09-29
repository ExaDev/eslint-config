import { describe, expect, it } from 'vitest';
import { containsTokenRun, tokenizeCommand } from './command-tokens';

describe('tokenizeCommand', () => {
  it('splits on runs of whitespace and drops empty tokens', () => {
    expect(tokenizeCommand('  eslint   . \t --fix ')).toEqual(['eslint', '.', '--fix']);
  });

  it('returns no tokens for an empty or blank command', () => {
    expect(tokenizeCommand('')).toEqual([]);
    expect(tokenizeCommand('   ')).toEqual([]);
  });

  it('removes one layer of matching surrounding quotes', () => {
    expect(tokenizeCommand(`--max-warnings "0" 'x'`)).toEqual(['--max-warnings', '0', 'x']);
  });

  it('keeps quotes that do not surround the whole token', () => {
    expect(tokenizeCommand(`a"b" "c 'd`)).toEqual([`a"b"`, '"c', `'d`]);
  });

  it('keeps a mismatched quote pair', () => {
    expect(tokenizeCommand(`"a'`)).toEqual([`"a'`]);
  });

  it('splits an option written --flag=value at its first equals sign', () => {
    expect(tokenizeCommand('--max-warnings=0')).toEqual(['--max-warnings', '0']);
    expect(tokenizeCommand('--define=a=b')).toEqual(['--define', 'a=b']);
  });

  it('splits a short option written -f=value too', () => {
    expect(tokenizeCommand('-c=x')).toEqual(['-c', 'x']);
  });

  it('leaves an equals sign inside a non-option token alone', () => {
    expect(tokenizeCommand('NODE_ENV=production')).toEqual(['NODE_ENV=production']);
  });

  it('splits an option whose value is quoted after unquoting the token', () => {
    expect(tokenizeCommand('"--flag=x"')).toEqual(['--flag', 'x']);
  });
});

describe('containsTokenRun', () => {
  const haystack = ['turbo', 'run', 'a', '&&', 'eslint', '--max-warnings', '0'];

  it('finds a run at the start, in the middle and at the end', () => {
    expect(containsTokenRun(haystack, ['turbo', 'run'])).toBe(true);
    expect(containsTokenRun(haystack, ['a', '&&', 'eslint'])).toBe(true);
    expect(containsTokenRun(haystack, ['--max-warnings', '0'])).toBe(true);
  });

  it('finds the whole haystack as the run', () => {
    expect(containsTokenRun(haystack, haystack)).toBe(true);
  });

  it('does not find tokens that are present but not adjacent or not in order', () => {
    expect(containsTokenRun(haystack, ['turbo', 'a'])).toBe(false);
    expect(containsTokenRun(haystack, ['0', '--max-warnings'])).toBe(false);
  });

  it('does not find a run that would extend past the end', () => {
    expect(containsTokenRun(haystack, ['0', 'extra'])).toBe(false);
  });

  it('does not treat a longer token as containing a shorter one', () => {
    expect(containsTokenRun(['--passWithNoTestsFoo'], ['--passWithNoTests'])).toBe(false);
  });

  it('never matches an empty needle, not even in an empty haystack', () => {
    expect(containsTokenRun(haystack, [])).toBe(false);
    expect(containsTokenRun([], [])).toBe(false);
  });

  it('finds nothing in an empty haystack', () => {
    expect(containsTokenRun([], ['a'])).toBe(false);
  });
});
