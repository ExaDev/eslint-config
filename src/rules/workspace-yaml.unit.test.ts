import { describe, expect, it } from 'vitest';
import { readWorkspacePackages, requireCapture, requireLine, requireMatch, unquote } from './workspace-yaml';

describe('requireLine', () => {
  it('returns the line at a genuinely in-bounds index', () => {
    expect(requireLine(['a', 'b'], 1)).toBe('b');
  });

  it('throws for an out-of-bounds index, a shape neither real call site (a findIndex result or a bounded loop) can produce', () => {
    const outOfBoundsIndex = 5;
    expect(() => requireLine(['a'], outOfBoundsIndex)).toThrow(/Unreachable/);
  });
});

describe('requireCapture', () => {
  it('returns a captured group, even an empty-string one', () => {
    // A real, deliberately-optional group left uncaptured by an empty match, exercising the ONE genuine "no capture" case this file's own two patterns never produce (neither has an optional group).
    const nonEmptyMatch = /(a)/u.exec('a');
    if (nonEmptyMatch === null) throw new Error('Unreachable: this fixture always matches.');
    expect(requireCapture(nonEmptyMatch, 1)).toBe('a');
  });

  it('throws when the group did not capture, a shape neither of this file\'s own two patterns (both plain, non-optional groups) can produce', () => {
    const optionalGroupMatch = /(a)?/u.exec('');
    if (optionalGroupMatch === null) throw new Error('Unreachable: this fixture always matches (the whole pattern is optional).');
    expect(() => requireCapture(optionalGroupMatch, 1)).toThrow(/Unreachable/);
  });
});

describe('requireMatch', () => {
  it('returns the match when the pattern matches the text', () => {
    expect(requireMatch(/^a$/u, 'a')[0]).toBe('a');
  });

  it('throws when the pattern does not match, a shape neither real call site (which only ever re-execs a pattern a prior .test() just confirmed) can produce', () => {
    expect(() => requireMatch(/^a$/u, 'b')).toThrow(/Unreachable/);
  });
});

describe('unquote', () => {
  it('strips a matching pair of single quotes', () => {
    expect(unquote("'core/*'")).toBe('core/*');
  });

  it('strips a matching pair of double quotes', () => {
    expect(unquote('"core/*"')).toBe('core/*');
  });

  it('leaves an unquoted value unchanged', () => {
    expect(unquote('core/*')).toBe('core/*');
  });

  it('leaves a value with mismatched quote characters unchanged, rather than stripping just one side', () => {
    expect(unquote(`'core/*"`)).toBe(`'core/*"`);
  });

  it('leaves a value that only starts with a quote character unchanged', () => {
    expect(unquote("'core/*")).toBe("'core/*");
  });

  it('leaves a value that only ends with a quote character unchanged', () => {
    expect(unquote("core/*'")).toBe("core/*'");
  });

  it('strips a genuinely empty quoted value down to the empty string', () => {
    expect(unquote("''")).toBe('');
  });

  it('leaves a single lone quote character unchanged: it both starts and ends with itself, but is unterminated, not an empty quoted value', () => {
    expect(unquote("'")).toBe("'");
  });

  it('strips a trailing comment before deciding whether the value is quoted', () => {
    expect(unquote("'core/*' # a comment")).toBe('core/*');
  });

  it('trims surrounding whitespace before deciding whether the value is quoted', () => {
    expect(unquote("  'core/*'  ")).toBe('core/*');
  });
});

describe('readWorkspacePackages', () => {
  it('returns an empty array when the file has no "packages:" key at all', () => {
    expect(readWorkspacePackages('onlyIgnores:\n  - "**/dist"\n')).toEqual([]);
  });

  it('does not match a "packages:" key that is indented (not a genuine top-level key)', () => {
    expect(readWorkspacePackages('config:\n  packages:\n    - "a"\n')).toEqual([]);
  });

  it('does not match a different key that merely starts with "packages"', () => {
    expect(readWorkspacePackages('packagesFoo: bar\n')).toEqual([]);
  });

  it('reads a "packages:" key written with a double-quoted key, valid YAML pnpm itself accepts', () => {
    const yaml = '"packages":\n  - \'core/*\'\n';
    expect(readWorkspacePackages(yaml)).toEqual(['core/*']);
  });

  it("reads a 'packages:' key written with a single-quoted key", () => {
    const yaml = "'packages':\n  - 'core/*'\n";
    expect(readWorkspacePackages(yaml)).toEqual(['core/*']);
  });

  it('does not match a quoted key that merely starts with "packages" ("packagesFoo")', () => {
    expect(readWorkspacePackages('"packagesFoo": bar\n')).toEqual([]);
  });

  it('reads a simple single-quoted block sequence', () => {
    const yaml = "packages:\n  - 'core/*/*'\n  - 'features/*/*'\n";
    expect(readWorkspacePackages(yaml)).toEqual(['core/*/*', 'features/*/*']);
  });

  it('reads a double-quoted block sequence', () => {
    const yaml = 'packages:\n  - "core/*/*"\n  - "targets/*"\n';
    expect(readWorkspacePackages(yaml)).toEqual(['core/*/*', 'targets/*']);
  });

  it("reads a block sequence written at the key's own zero indentation (no leading whitespace before the dash)", () => {
    const yaml = "packages:\n- 'core/*/*'\n- 'targets/*'\n";
    expect(readWorkspacePackages(yaml)).toEqual(['core/*/*', 'targets/*']);
  });

  it('reads a bare (unquoted) block sequence', () => {
    const yaml = 'packages:\n  - core/*/*\n  - targets/*\n';
    expect(readWorkspacePackages(yaml)).toEqual(['core/*/*', 'targets/*']);
  });

  it('reads an exclude pattern alongside includes', () => {
    const yaml = "packages:\n  - 'core/*/*'\n  - '!**/test/**'\n";
    expect(readWorkspacePackages(yaml)).toEqual(['core/*/*', '!**/test/**']);
  });

  it('skips blank lines and comment lines inside the sequence', () => {
    const yaml = "packages:\n  - 'core/*/*'\n\n  # a comment on its own line\n  - 'features/*/*'\n";
    expect(readWorkspacePackages(yaml)).toEqual(['core/*/*', 'features/*/*']);
  });

  it('strips a trailing comment from an item', () => {
    const yaml = "packages:\n  - 'core/*/*' # core packages\n";
    expect(readWorkspacePackages(yaml)).toEqual(['core/*/*']);
  });

  it('stops the sequence at the first line that is not a same-indent item (a dedent back to the next top-level key)', () => {
    const yaml = "packages:\n  - 'core/*/*'\nignoredPaths:\n  - 'dist'\n";
    expect(readWorkspacePackages(yaml)).toEqual(['core/*/*']);
  });

  it('stops the sequence at an item whose own indent differs from the first item', () => {
    const yaml = "packages:\n  - 'core/*/*'\n    - 'features/*/*'\n";
    expect(readWorkspacePackages(yaml)).toEqual(['core/*/*']);
  });

  it('ignores a blank item value (a "- " with nothing after it)', () => {
    const yaml = "packages:\n  - 'core/*/*'\n  -   \n  - 'targets/*'\n";
    expect(readWorkspacePackages(yaml)).toEqual(['core/*/*', 'targets/*']);
  });

  it('throws for flow-style array syntax, naming the "packages" option as the escape hatch', () => {
    expect(() => readWorkspacePackages("packages: ['core/*/*', 'targets/*']\n")).toThrow(/flow style/);
    expect(() => readWorkspacePackages("packages: ['core/*/*', 'targets/*']\n")).toThrow(/"packages" rule option/);
  });

  it('throws for a bare scalar on the "packages:" line', () => {
    expect(() => readWorkspacePackages('packages: core\n')).toThrow(/flow style/);
  });

  it('throws, rather than silently returning an empty list, when "packages:" is present but its first real line is neither blank/comment nor a sequence item at all (a block mapping, say)', () => {
    expect(() => readWorkspacePackages('packages:\n  foo: bar\n')).toThrow(/is not a block-sequence item/);
    expect(() => readWorkspacePackages('packages:\n  foo: bar\n')).toThrow(/"packages" rule option/);
  });

  it("reports the offending line's own content trimmed of its surrounding whitespace, not the raw padded line", () => {
    expect(() => readWorkspacePackages('packages:\n   foo: bar   \n')).toThrow('("foo: bar")');
  });

  it('does not throw when the flow-style line only carries a trailing comment', () => {
    expect(readWorkspacePackages('packages: # configured below\n  - core\n')).toEqual(['core']);
  });

  it('reads an item with no space at all between the dash and its value', () => {
    expect(readWorkspacePackages('packages:\n  -bareword\n')).toEqual(['bareword']);
  });

  it('skips a genuinely blank (whitespace-only, not zero-length) line inside the sequence, continuing past it rather than stopping', () => {
    const yaml = "packages:\n  - 'core/*'\n   \n  - 'targets/*'\n";
    expect(readWorkspacePackages(yaml)).toEqual(['core/*', 'targets/*']);
  });

  it('never treats an un-indented line as a sequence item, even one that happens to contain " - " partway through and could otherwise look like one if the pattern were not anchored to the line\'s own start', () => {
    // The first real item establishes a one-space sequenceIndent; "xy - b" is not indented at all, but does contain a " - " substring at the same one-space indent partway through it, which an unanchored match could mistake for a genuine same-indent item.
    const yaml = 'packages:\n - a\nxy - b\n';
    expect(readWorkspacePackages(yaml)).toEqual(['a']);
  });

  it('never treats a "packages:" line that cannot reach the true end of the string (a U+2028 line separator embedded partway through it, which "." cannot cross and no "m" flag makes "$" settle for less) as a genuine top-level key', () => {
    // Splitting only on \r?\n leaves a U+2028 embedded inside a single array element rather than starting a new one, so PACKAGES_KEY_PATTERN's own trailing "$" (anchored to the true end of that element, not merely a line boundary) is what decides this never matches at all.
    expect(readWorkspacePackages('packages: foo bar\n')).toEqual([]);
  });

  it('never treats a sequence item line that cannot reach the true end of the string (an embedded U+2028) as a genuine item, stopping the sequence instead', () => {
    const yaml = "packages:\n  - 'core/*'\n  - foo bar\n  - 'targets/*'\n";
    expect(readWorkspacePackages(yaml)).toEqual(['core/*']);
  });

  it('reports the exact flow-style value with trailing whitespace before a comment removed, not merely leading whitespace', () => {
    expect(() => readWorkspacePackages('packages:   foo   # comment\n')).toThrow(/\("foo"\)/);
  });

  it('never cuts a quoted item\'s own "#" character, even one preceded by whitespace, as if it opened a comment', () => {
    const yaml = "packages:\n  - 'core/# not a comment/*'\n";
    expect(readWorkspacePackages(yaml)).toEqual(['core/# not a comment/*']);
  });

  it('still strips a genuine trailing comment that follows a quoted item', () => {
    const yaml = "packages:\n  - 'core/*' # a real trailing comment, with its own \"#\" too\n";
    expect(readWorkspacePackages(yaml)).toEqual(['core/*']);
  });

  it('never treats a "#" inside an unterminated quote as a comment opener either', () => {
    const yaml = "packages:\n  - 'core/#odd\n";
    expect(readWorkspacePackages(yaml)).toEqual(["'core/#odd"]);
  });

  it('skips a doubled "\'\'" (a single-quoted scalar\'s own literal-quote escape) rather than reading it as the closing quote, so a "#" after it is still inside the quoted value, not read as a comment', () => {
    // unquote() does not itself unescape a doubled "''" back to a literal single quote (this reader is deliberately minimal, not a full YAML parser); the point under test here is only that commentSearchStart keeps scanning past the doubled pair to the REAL closing quote, rather than mistaking the first half of it for one and treating everything after (the "#") as outside the quoted value.
    const yaml = "packages:\n  - 'it''s-a-package/#not-a-comment'\n";
    expect(readWorkspacePackages(yaml)).toEqual(["it''s-a-package/#not-a-comment"]);
  });
});
