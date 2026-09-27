// The one shared "is this a genuine plain object, not an array" guard: true only for a non-null value that is not an array. Used everywhere an `unknown` JSON or JS value is narrowed before being indexed into as a record: json-plugin.ts and optional-plugin.ts (resolving an optional peer's own exported shape), and workspace-options.ts, workspace-graph.ts and rules/barrel-auto-detect.ts (reading package.json/rule-option data).
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
