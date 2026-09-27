// The one place every workspace-architecture module splits a "/"-joined path into segments, dropping empty ones: a leading, trailing or doubled separator (a workspace root given with a trailing slash, a Windows-style path normalised loosely, or an accidental "//" in an option) must never surface as a spurious empty segment shifting every later index-based slice. Shared by findOwningGroup/sliceBySegment (workspace-graph.ts), expandGlob (workspace-glob.ts), and expectedPackageName (workspace-checks.ts), which each need the identical rule and previously duplicated it three times over.
export function splitPathSegments(path: string): readonly string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

/** Reads `text[index]`, throwing rather than reading past the end: every real call site in workspace-yaml.ts and workspace-glob.ts derives `index` from a `for` loop whose own condition already guarantees it in range, so an out-of-bounds read here would mean that loop's own invariant broke, not a case to handle quietly. Shared by both modules, which previously each carried a byte-identical copy. Exported so this throw (unreachable through every real call site) can be tested directly, the same "Unreachable, tested directly rather than trusted on a comment" shape workspace-yaml.ts's own `requireLine` establishes. */
export function requireChar(text: string, index: number): string {
  const char = text[index];
  if (char === undefined) {
    throw new Error(`Unreachable: index ${String(index)} is out of bounds for a string of length ${String(text.length)}.`);
  }
  return char;
}
