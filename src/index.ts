export { defaultConfig as default, exadevConfig } from './create-config';
export { publicPlugin as plugin } from './plugin';
export { workspaceArchitectureConfig } from './workspace-architecture';
export type { GroupSpec, NamingOptions, RankRule, RankSkipOptions, SliceSpec, WorkspaceArchitectureOptions } from './rules/workspace-options';
export type {
  AllowedEdge,
  ExemptTargetGroup,
  PackageSelector,
  PackageSelectorFields,
  RequiredFiles,
  RequiredScripts,
  ScriptContent,
  ScriptRequirement,
} from './rules/workspace-constraint-options';
