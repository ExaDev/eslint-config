import { basename, dirname, relative } from 'node:path';
import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode } from '@humanwhocodes/momoa';
import { getMemberKeyName } from './json-member-key';
import { readScripts, requireScriptEntry } from './manifest-scripts';
import { applicableRequirements, collectScripts, missingFiles, unsetFields, type ManifestFacts } from './package-requirements-checks';
import { packageRequirementsOptionsSchema, readPackageRequirementsOptions, type PackageRequirementsOptions } from './package-requirements-options';
import { findRepositoryRoot } from './repository-root';
import { readDeclaredName } from './workspace-json-helpers';
import { realWorkspaceFs, type WorkspaceFs } from './workspace-fs';
import { checkScriptRequirements, type ScriptProblemKind } from './workspace-requirements';

export type PackageRequirementsMessageIds = 'unsetFields' | 'missingFiles' | 'missingScripts' | ScriptProblemKind;

export type PackageRequirementsRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [PackageRequirementsOptions];
  MessageIds: PackageRequirementsMessageIds;
}>;

const DEPENDENCY_FIELDS: ReadonlySet<string> = new Set(['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']);

/**
 * Whether a manifest value counts as set: not null, an empty string, an empty object or an empty array. Booleans and numbers always count.
 */
function isSetValue(value: ObjectNode['members'][number]['value']): boolean {
  if (value.type === 'Null') return false;
  if (value.type === 'String') return value.value.length > 0;
  if (value.type === 'Object') return value.members.length > 0;
  if (value.type === 'Array') return value.elements.length > 0;

  return true;
}

function readFacts(fs: WorkspaceFs, node: ObjectNode, location: { readonly filename: string; readonly cwd: string }): ManifestFacts {
  const declared = new Set<string>();
  const setFields = new Set<string>();
  const packageDir = dirname(location.filename);
  let isPrivate = false;
  for (const member of node.members) {
    const key = getMemberKeyName(member);
    if (isSetValue(member.value)) setFields.add(key);
    if (key === 'private') isPrivate = member.value.type === 'Boolean' && member.value.value;
    if (DEPENDENCY_FIELDS.has(key) && member.value.type === 'Object') {
      for (const dependency of member.value.members) declared.add(getMemberKeyName(dependency));
    }
  }

  return {
    isPrivate,
    isRoot: fs.realpathSync(packageDir) === fs.realpathSync(findRepositoryRoot(fs, packageDir, location.cwd)),
    name: readDeclaredName(node)?.name,
    declared,
    setFields,
  };
}

/**
 * Requires fields, files and scripts of the `package.json` it lints, for the packages each requirement's `when` condition selects (private or publishable, the repository root, a name pattern, a declared dependency). It is the graph-free counterpart of `required-scripts` and `package-has-files`, which select workspace packages by group and so need a `pnpm-workspace.yaml`: this rule reads only the manifest and its directory, so it applies to a single-package repository and to the root manifest, which no workspace group owns. Fields must be set (not null, empty string, empty object or empty array); a file entry is a path or glob that must exist, optionally satisfied by a manifest field instead for a tool whose configuration may live in `package.json`; scripts are checked as for `requiredScripts`, on the command as written. A missing field, file or script is reported once per package, on the manifest or its `scripts` entry; a script content problem is reported on the script itself. The filesystem is injectable so a test drives it from an in-memory tree.
 */
export function createPackageRequirementsRule(fs: WorkspaceFs = realWorkspaceFs): PackageRequirementsRuleDefinition {
  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [packageRequirementsOptionsSchema],
      docs: {
        recommended: false,
        description: 'Require the configured fields, files and scripts in each package.json the configured condition selects (private or publishable, repository root, name pattern, declared dependency).',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/package-requirements.ts',
      },
      messages: {
        unsetFields: 'Package "{{name}}" must set: {{fields}}.',
        missingFiles: 'Package "{{name}}" is missing required file(s): {{files}}.',
        missingScripts: 'Package "{{name}}" is missing required script(s): {{scripts}}.',
        notEqual: 'Script "{{script}}" in "{{name}}" must be exactly "{{expected}}", but is "{{actual}}".',
        missingFlag: 'Script "{{script}}" in "{{name}}" must contain "{{expected}}", but is "{{actual}}".',
        forbiddenFlag: 'Script "{{script}}" in "{{name}}" must not contain "{{expected}}", but is "{{actual}}".',
      },
    },
    create(context) {
      const { requirements } = readPackageRequirementsOptions(context.options[0]);

      return {
        Object(node: ObjectNode, parent) {
          if (parent?.type !== 'Document') return;

          const facts = readFacts(fs, node, context);
          const applicable = applicableRequirements(requirements, facts);
          if (applicable.length === 0) return;

          const packageDir = dirname(context.filename);
          const name = facts.name ?? (relative(context.cwd, packageDir) || basename(context.cwd));

          const fields = unsetFields(applicable, facts);
          if (fields.length > 0) context.report({ loc: node.loc, messageId: 'unsetFields', data: { name, fields: fields.join(', ') } });

          const files = missingFiles(applicable, fs, packageDir, facts);
          if (files.length > 0) context.report({ loc: node.loc, messageId: 'missingFiles', data: { name, files: files.join(', ') } });

          const scripts = readScripts(node);
          const commands = new Map([...scripts.entries].map(([script, entry]) => [script, entry.command]));
          const { missing, problems } = checkScriptRequirements(commands, collectScripts(applicable));
          if (missing.length > 0) context.report({ loc: scripts.loc, messageId: 'missingScripts', data: { name, scripts: missing.join(', ') } });
          for (const problem of problems) {
            context.report({
              loc: requireScriptEntry(scripts.entries, problem.script).member.loc,
              messageId: problem.kind,
              data: { name, script: problem.script, expected: problem.expected, actual: problem.actual },
            });
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createPackageRequirementsRule();
