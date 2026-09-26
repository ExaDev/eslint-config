// The one place every workspace-architecture module splits a "/"-joined path into segments, dropping empty ones: a leading, trailing or doubled separator (a workspace root given with a trailing slash, a Windows-style path normalised loosely, or an accidental "//" in an option) must never surface as a spurious empty segment shifting every later index-based slice. Shared by findOwningGroup/sliceBySegment (workspace-graph.ts), expandGlob (workspace-glob.ts), and expectedPackageName (workspace-checks.ts), which each need the identical rule and previously duplicated it three times over.
export function splitPathSegments(path: string): readonly string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}
