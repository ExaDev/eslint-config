import json from '@eslint/json';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createPackageNameMirrorsPathRule } from './package-name-mirrors-path';
import type { WorkspaceGraph, WorkspacePackageInfo } from './workspace-graph';

function pkg(name: string, relativeDir: string, group: string): WorkspacePackageInfo {
  return { name, relativeDir, group, rank: 0, slice: undefined };
}

const FIXED_GRAPH: WorkspaceGraph = {
  root: '/fixture',
  packagesByName: new Map(
    [
      pkg('@acme/clock-contract', 'core/clock/contract', 'core'),
      pkg('clock-system', 'core/clock/system', 'core'),
      pkg('@acme/test-database', 'test/database', 'test'),
      pkg('orphan-package', 'orphan/one', 'orphan-group'),
    ].map((entry) => [entry.name, entry]),
  ),
  dependencyNamesByName: new Map(),
};

const rule = createPackageNameMirrorsPathRule(() => FIXED_GRAPH);
const ruleTester = new RuleTester({ language: 'json/json', plugins: { json } });

const GROUPS_AND_NAMING = { groups: [{ name: 'core' }, { name: 'test', naming: 'keep-group' as const }], naming: { scope: '@acme' } };

describe('createPackageNameMirrorsPathRule meta', () => {
  it('declares its own single message id', () => {
    expect(Object.keys(rule.meta?.messages ?? {})).toEqual(['mismatch']);
  });
});

ruleTester.run('package-name-mirrors-path', rule, {
  valid: [
    // A correctly scoped, drop-group-derived name. Also carries a nested object (an empty "dependencies") so the Object visitor fires a second time for a genuinely non-top-level object, exercising the parent.type !== 'Document' early return, not just the top-level Document case every other fixture here only ever reaches.
    { code: JSON.stringify({ name: '@acme/clock-contract', dependencies: {} }), options: [GROUPS_AND_NAMING] },
    // A correctly scoped, keep-group-derived name.
    { code: JSON.stringify({ name: '@acme/test-database' }), options: [GROUPS_AND_NAMING] },
    // A manifest whose declared name is not a workspace member at all is skipped.
    { code: JSON.stringify({ name: 'not-a-workspace-package' }), options: [GROUPS_AND_NAMING] },
    // A manifest with no "name" field at all is skipped.
    { code: JSON.stringify({ version: '1.0.0' }), options: [GROUPS_AND_NAMING] },
    // A workspace member whose own group is not one of the configured groups (an option/graph mismatch) is skipped rather than crashing.
    { code: JSON.stringify({ name: 'orphan-package' }), options: [GROUPS_AND_NAMING] },
    // Opt-in: with the shared "naming" option omitted entirely, the rule is a no-op even for a name that would otherwise mismatch.
    { code: JSON.stringify({ name: 'clock-system' }), options: [{ groups: [{ name: 'core' }] }] },
  ],
  invalid: [
    {
      code: JSON.stringify({ name: 'clock-system' }),
      options: [GROUPS_AND_NAMING],
      errors: [{ messageId: 'mismatch', data: { dir: 'core/clock/system', actual: 'clock-system', expected: '@acme/clock-system' } }],
    },
  ],
});
