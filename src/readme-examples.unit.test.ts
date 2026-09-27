import { describe, expect, it } from 'vitest';
import { plugin } from './index';
import { viaManualRules, viaStringExtends, viaWorkspaceArchitecture } from './readme-examples';

// This file's only job is proving README.md's own defineConfig() examples still resolve to the exact real config content they document, not just typecheck, mirroring consumer-compatibility.unit.test.ts's own role for the default export. Every assertion below checks a value this file's own literal supplies, not the shared bundles (exadev/recommended, workspaceArchitectureConfig's own wiring) those literals pull in, which already have their own dedicated tests.
describe('README defineConfig examples', () => {
  it('the "lighter option" manual-rules example is passed through unchanged', () => {
    expect(viaManualRules).toEqual([
      {
        files: ['src/**/*.ts'],
        ignores: ['src/index.ts'],
        plugins: { exadev: plugin },
        rules: {
          'exadev/no-non-barrel-reexport': 'error',
        },
      },
    ]);
  });

  it('the "lighter option" string-extends example wires its own file glob and plugin, and pulls in exadev/recommended', () => {
    expect(viaStringExtends).toHaveLength(2);
    const ownEntry = viaStringExtends.find((entry) => entry.rules === undefined);
    expect(ownEntry?.files).toEqual(['**/*.ts']);
    expect(ownEntry?.plugins?.['exadev']).toBe(plugin);
    const recommendedEntry = viaStringExtends.find((entry) => entry.rules !== undefined);
    expect(recommendedEntry?.rules?.['exadev/barrel-policy']).toEqual(['error', { mode: 'banned' }]);
  });

  it('the group-ranked workspace architecture example passes its exact groups and naming through to no-uphill-dependency', () => {
    const workspaceEntry = viaWorkspaceArchitecture.find((entry) => entry.rules?.['exadev/no-uphill-dependency'] !== undefined);
    expect(workspaceEntry?.rules?.['exadev/no-uphill-dependency']).toEqual([
      'error',
      {
        groups: [
          { name: 'core', rank: 0 },
          { name: 'features', rank: 1 },
          { name: 'product', rank: 2 },
          { name: 'targets', rank: 3 },
          { name: 'test', rank: 4, naming: 'keep-group' },
        ],
        naming: { scope: '@novus' },
      },
    ]);
  });

  it('the group-ranked workspace architecture example keeps react and nextjs off, as its trailing exadevConfig() call states', () => {
    const pluginKeys = new Set(viaWorkspaceArchitecture.flatMap((entry) => Object.keys(entry.plugins ?? {})));
    expect(pluginKeys.has('react')).toBe(false);
    expect(pluginKeys.has('@next/next')).toBe(false);
  });
});
