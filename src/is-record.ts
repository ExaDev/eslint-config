// The one shared "is this a genuine plain object, not an array" guard, used everywhere an `unknown` JSON or JS value is narrowed before being indexed into as a record: json-plugin.ts and optional-plugin.ts (resolving an optional peer's own exported shape), and workspace-options.ts, workspace-graph.ts and rules/barrel-auto-detect.ts (reading package.json/rule-option data). Previously five near-identical copies, one of which (workspace-graph.ts's own readDeclaredManifest) omitted the `!Array.isArray` check, so an array-shaped package.json manifest passed as a usable record and had its numeric indices collected as "dependency names".
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
