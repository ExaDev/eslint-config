import type { FieldPath, FileRequirement, PackageCondition, PackageRequirement } from './package-requirements-options';
import type { ScriptRequirement } from './workspace-constraint-options';
import type { WorkspaceFs } from './workspace-fs';
import { anyPathMatchesGlob, expandBraces } from './workspace-glob';

// The pure decisions behind package-requirements, independent of ESLint and momoa so each can be unit-tested against plain facts and a fabricated tree.

/**
 * What the rule reads from a manifest and its location before deciding which requirements apply and whether they hold.
 */
export interface ManifestFacts {
  readonly isPrivate: boolean;
  // Whether the manifest sits at the repository root (see findRepositoryRoot).
  readonly isRoot: boolean;
  readonly name: string | undefined;
  // Every dependency name under dependencies, devDependencies, peerDependencies and optionalDependencies.
  readonly declared: ReadonlySet<string>;
  // The top-level fields that are set: present and not null, an empty string, an empty object or an empty array.
  readonly setFields: ReadonlySet<string>;
  // Every property that is set, at any depth through nested objects, each as `fieldPathKey` of its path.
  readonly setPaths: ReadonlySet<string>;
}

/**
 * The one spelling of a property path that `ManifestFacts.setPaths` holds it under, unambiguous even for a key containing a dot.
 */
export function fieldPathKey(path: FieldPath): string {
  return JSON.stringify(typeof path === 'string' ? [path] : path);
}

/**
 * Whether every condition `when` states holds for the manifest. An absent `when` holds for every manifest.
 */
export function appliesTo(when: PackageCondition | undefined, facts: ManifestFacts): boolean {
  if (when === undefined) return true;
  const { private: isPrivate, root, namePattern, declares } = when;
  if (isPrivate !== undefined && isPrivate !== facts.isPrivate) return false;
  if (root !== undefined && root !== facts.isRoot) return false;
  if (namePattern !== undefined && !(facts.name !== undefined && new RegExp(namePattern, 'u').test(facts.name))) return false;

  return declares === undefined || declares.some((name) => facts.declared.has(name));
}

/**
 * The requirements whose `when` holds for the manifest, in declaration order.
 */
export function applicableRequirements(requirements: readonly PackageRequirement[], facts: ManifestFacts): readonly PackageRequirement[] {
  return requirements.filter((requirement) => appliesTo(requirement.when, facts));
}

function unique<Item>(items: readonly Item[]): readonly Item[] {
  return [...new Set(items)];
}

/**
 * Every script requirement of the given requirements, in declaration order.
 */
export function collectScripts(requirements: readonly PackageRequirement[]): readonly ScriptRequirement[] {
  return requirements.flatMap((requirement) => requirement.scripts ?? []);
}

/**
 * The required fields the manifest does not set, across the given requirements, in declaration order without repeats.
 */
export function unsetFields(requirements: readonly PackageRequirement[], facts: ManifestFacts): readonly string[] {
  return unique(requirements.flatMap((requirement) => requirement.fields ?? [])).filter((field) => !facts.setFields.has(field));
}

function describeFieldPath(path: FieldPath): string {
  return typeof path === 'string' ? path : path.join('.');
}

function describeFile(requirement: FileRequirement): string {
  return typeof requirement === 'string' ? requirement : `one of ${expandBraces(requirement.glob).join(', ')} (or a ${requirement.orFields.map((path) => `"${describeFieldPath(path)}"`).join(' or ')} property)`;
}

// Two requirements naming the same path or the same glob and property are one requirement, whichever object literal they came from.
function fileKey(requirement: FileRequirement): string {
  return typeof requirement === 'string' ? requirement : JSON.stringify([requirement.glob, requirement.orFields.map(fieldPathKey)]);
}

function fileIsMissing(requirement: FileRequirement, fs: WorkspaceFs, packageDir: string, facts: ManifestFacts): boolean {
  if (typeof requirement === 'string') return !anyPathMatchesGlob(fs, packageDir, requirement);

  return !requirement.orFields.some((path) => facts.setPaths.has(fieldPathKey(path))) && !anyPathMatchesGlob(fs, packageDir, requirement.glob);
}

/**
 * The required paths the package directory `packageDir` lacks, across the given requirements, in declaration order without repeats. An entry that also accepts a manifest field counts as present when that field is set.
 */
export function missingFiles(requirements: readonly PackageRequirement[], fs: WorkspaceFs, packageDir: string, facts: ManifestFacts): readonly string[] {
  const files = new Map(requirements.flatMap((requirement) => requirement.files ?? []).map((requirement) => [fileKey(requirement), requirement]));

  return [...files.values()]
    .filter((requirement) => fileIsMissing(requirement, fs, packageDir, facts))
    .map(describeFile);
}
