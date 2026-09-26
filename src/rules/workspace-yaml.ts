// A minimal reader for pnpm-workspace.yaml's own "packages:" key, deliberately supporting only the one form pnpm's own documentation and every real pnpm-workspace.yaml this package has seen actually uses: a block sequence of quoted or bare glob strings, one per line, indented under the key. A full YAML parser is not a dependency worth taking for a single list of strings; flow style ("packages: ['a', 'b']" or a bare scalar) is rejected outright rather than silently misparsed, naming the "packages" rule option as the escape hatch for a workspace file this reader cannot handle.

const PACKAGES_KEY_PATTERN = /^packages:\s*(.*)$/u;
const SEQUENCE_ITEM_PATTERN = /^(\s+)-\s*(.*)$/u;

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

function stripComment(value: string): string {
  const hashIndex = value.indexOf('#');
  return (hashIndex === -1 ? value : value.slice(0, hashIndex)).trimEnd();
}

function unquote(value: string): string {
  const trimmed = stripComment(value).trim();
  const isSingleQuoted = trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2;
  const isDoubleQuoted = trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2;
  if (isSingleQuoted || isDoubleQuoted) return trimmed.slice(1, -1);
  return trimmed;
}

/**
 * Reads the glob list under pnpm-workspace.yaml's own top-level "packages:" key. Returns an empty array when the key is absent (an empty workspace file, or one that declares packages only through a "packages" rule option override). Throws when the key is present but not written as a block sequence (flow style, or a bare scalar on the same line), since that is a real pnpm-workspace.yaml shape this minimal reader cannot parse, not merely an empty result.
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
    if (itemMatch === null) break;
    const indent = requireCapture(itemMatch, 1);
    const rest = requireCapture(itemMatch, 2);
    sequenceIndent ??= indent;
    if (indent !== sequenceIndent) break;

    const value = unquote(rest);
    if (value.length > 0) items.push(value);
  }

  return items;
}
