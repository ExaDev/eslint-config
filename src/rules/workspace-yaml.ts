// A minimal reader for pnpm-workspace.yaml's own "packages:" key, deliberately supporting only the one form pnpm's own documentation and every real pnpm-workspace.yaml this package has seen actually uses: a block sequence of quoted or bare glob strings, one per line, indented under the key. A full YAML parser is not a dependency worth taking for a single list of strings; flow style ("packages: ['a', 'b']" or a bare scalar) is rejected outright rather than silently misparsed, naming the "packages" rule option as the escape hatch for a workspace file this reader cannot handle.

// The key itself, bare or wrapped in either quote style ("packages"/'packages'): YAML accepts a quoted mapping key wherever a bare one is valid, and real pnpm-workspace.yaml files are seen in the wild both ways.
const PACKAGES_KEY_PATTERN = /^(?:packages|"packages"|'packages'):\s*(.*)$/u;
// Indentation is optional: a block sequence written at the key's own column ("packages:\n- 'core/*'") is as valid YAML as an indented one, and pnpm accepts both.
const SEQUENCE_ITEM_PATTERN = /^(\s*)-\s*(.*)$/u;

/** Reads lines[index], throwing rather than silently returning undefined for an index this file only ever derives from Array.prototype.findIndex or a bounded for-loop, both of which already prove it in range. Exported so this throw (unreachable through either real call site below) can be tested directly, the same "Unreachable, tested directly rather than trusted on a comment" shape package-json-key-order.ts's own `at()` helper establishes. */
export function requireLine(lines: readonly string[], index: number): string {
  const line = lines[index];
  if (line === undefined) {
    throw new Error(`Unreachable: index ${String(index)} is out of bounds for an array of length ${String(lines.length)}.`);
  }
  return line;
}

/** Reads a regex match's own capture group, throwing rather than silently returning undefined: both patterns in this file use only plain (non-optional) capturing groups, so whenever the overall match succeeds each one is always a real string, even an empty one. Exported for the same direct-test reason as requireLine above. */
export function requireCapture(match: RegExpExecArray, groupIndex: number): string {
  const value = match[groupIndex];
  if (value === undefined) {
    throw new Error(`Unreachable: regex group ${String(groupIndex)} did not capture, even though the overall match succeeded.`);
  }
  return value;
}

/** Re-runs `pattern` against `text`, throwing rather than returning null: every call site here only ever re-execs a pattern that a prior `.test()` against this exact same text already confirmed matches (neither pattern carries the "g" flag, so exec is stateless and deterministic). Exported for the same direct-test reason as requireLine above. */
export function requireMatch(pattern: Readonly<RegExp>, text: string): RegExpExecArray {
  const match = pattern.exec(text);
  if (match === null) {
    throw new Error(`Unreachable: /${pattern.source}/ was already confirmed to match "${text}".`);
  }
  return match;
}

function quoteCharAt(value: string, index: number): string | undefined {
  const char = value.charAt(index);
  return char === "'" || char === '"' ? char : undefined;
}

// The index one past `quote`'s own matching close, starting the search at `openIndex + 1`: a single-quoted YAML scalar escapes a literal quote by doubling it (`''`), so a doubled pair is skipped over rather than read as the close. Returns -1 for an unterminated quote (nothing here to close it), the same "no legitimate finish, so the whole rest of the string is still inside it" reading commentSearchStart below relies on.
function findMatchingQuoteEnd(value: string, openIndex: number, quote: string): number {
  for (let index = openIndex + 1; index < value.length; index += 1) {
    if (value.charAt(index) !== quote) continue;
    if (quote === "'" && value.charAt(index + 1) === "'") {
      index += 1;
      continue;
    }
    return index;
  }
  return -1;
}

// Where stripComment may start looking for a genuine comment-opening "#": position 0 when `value` does not open (after its own leading whitespace) with a quote character, or just past that leading quoted scalar's own matching close, so a "#" written anywhere inside a quoted glob (however placed) is never mistaken for a comment: YAML never treats "#" as special inside quotes at all. An unterminated leading quote pushes the start past the whole string, so nothing after it is ever treated as a comment either.
function commentSearchStart(value: string): number {
  const contentStart = value.length - value.trimStart().length;
  const quote = quoteCharAt(value, contentStart);
  if (quote === undefined) return 0;
  const closeIndex = findMatchingQuoteEnd(value, contentStart, quote);
  return closeIndex === -1 ? value.length : closeIndex + 1;
}

// A "#" opens a comment only when it starts `value` outright or is preceded by whitespace, YAML's own "a comment must be separated from other tokens by white space" rule (a bare "core/#special" is a literal package glob, not "core/" followed by a comment). commentSearchStart above additionally protects a leading quoted scalar's own interior in full, regardless of what precedes a "#" found there.
function stripComment(value: string): string {
  for (let index = commentSearchStart(value); index < value.length; index += 1) {
    if (value.charAt(index) !== '#') continue;
    const precededByWhitespace = index === 0 || value.charAt(index - 1) === ' ' || value.charAt(index - 1) === '\t';
    if (precededByWhitespace) return value.slice(0, index).trimEnd();
  }
  return value.trimEnd();
}

// The one place this file decides "is this value wrapped in a matching pair of quote characters": both the single- and double-quote cases share this exact logic, so it is written and tested once rather than twice over. `length >= 2` rules out a lone quote character on its own ("'" alone starts and ends with itself, but is not a quoted EMPTY string, it is an unterminated one).
function isQuotedWith(value: string, quote: string): boolean {
  return value.length >= 2 && value.startsWith(quote) && value.endsWith(quote);
}

/** Exported for direct testing of its own quote-stripping decision, independent of readWorkspacePackages' own block-sequence parsing. */
export function unquote(value: string): string {
  const trimmed = stripComment(value).trim();
  if (isQuotedWith(trimmed, "'") || isQuotedWith(trimmed, '"')) return trimmed.slice(1, -1);
  return trimmed;
}

/**
 * Reads the glob list under pnpm-workspace.yaml's own top-level "packages:" key. Returns an empty array when the key is absent (an empty workspace file, or one that declares packages only through a "packages" rule option override), or when it is present but followed only by blank lines, comments, or nothing at all (a genuinely empty sequence). Throws when the key is present but written in flow style (or as a bare scalar on the same line), or when it is present but the first real line under it is neither blank/comment nor a recognisable "- 'glob'" sequence item (indented or not), since either is a real pnpm-workspace.yaml shape this minimal reader cannot parse, not merely an empty result.
 */
export function readWorkspacePackages(yamlText: string): readonly string[] {
  const lines = yamlText.split(/\r?\n/u);
  const keyLineIndex = lines.findIndex((line) => PACKAGES_KEY_PATTERN.test(line));
  if (keyLineIndex === -1) return [];

  const keyLine = requireLine(lines, keyLineIndex);
  const inlineMatch = requireMatch(PACKAGES_KEY_PATTERN, keyLine);
  const inline = requireCapture(inlineMatch, 1);
  const inlineWithoutComment = stripComment(inline);
  if (inlineWithoutComment.length > 0) {
    throw new Error(
      `pnpm-workspace.yaml's "packages:" key is written in flow style ("${inlineWithoutComment}"), which this package's minimal reader does not support. Rewrite it as a block sequence (one "- 'glob'" per line), or pass the "packages" rule option explicitly.`,
    );
  }

  const items: string[] = [];
  let sequenceIndent: string | undefined;
  for (let index = keyLineIndex + 1; index < lines.length; index += 1) {
    const line = requireLine(lines, index);
    if (line.trim().length === 0 || line.trim().startsWith('#')) continue;

    const itemMatch = SEQUENCE_ITEM_PATTERN.exec(line);
    if (itemMatch === null) {
      // A present "packages:" key whose own sequence has already yielded at least one item legitimately ends here (the next line belongs to a different top-level key, or is genuinely unindented content outside this block). One that has yielded nothing at all yet, by contrast, means the very shape under the key is not a block sequence this reader supports (a mapping, say): silently returning an empty list here would make every package in the workspace invisible to every rule rather than surfacing the real problem.
      if (items.length === 0) {
        throw new Error(
          `pnpm-workspace.yaml's "packages:" key is present but its next line ("${line.trim()}") is not a block-sequence item ("- 'glob'"). This package's minimal reader only supports a block sequence; rewrite it, or pass the "packages" rule option explicitly.`,
        );
      }
      break;
    }
    const indent = requireCapture(itemMatch, 1);
    const rest = requireCapture(itemMatch, 2);
    sequenceIndent ??= indent;
    if (indent !== sequenceIndent) break;

    const value = unquote(rest);
    if (value.length > 0) items.push(value);
  }

  return items;
}
