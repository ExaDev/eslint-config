import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type LayoutConfig, layoutSection, loadSection } from '@exadev/config';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import { exadevConfig, type WorkspaceArchitectureOptions } from './index';

// The recipe in README.md ("Reading the shared layout from @exadev/config") hands the value `loadSection(layoutSection)` returns to `exadevConfig({ workspaceArchitecture })`. @exadev/config is a devDependency here, never a dependency: this file is the only place the two packages meet, so a change on either side that breaks the route fails here.

const LAYOUT_FILE = `export default {
  layout: {
    groups: [
      { name: 'core', rank: 0 },
      { name: 'features', rank: 1, slice: { segment: 0 } },
      { name: 'targets', rank: 2, slice: { namePrefix: true }, naming: 'basename' },
    ],
    nameRanks: [{ pattern: '-contract$', rank: 0 }],
    defaultRank: 1,
    rankSkip: { maxDistance: 1, exemptRanks: [0] },
    isolatedGroups: [['features', 'targets']],
    naming: { scope: '@acme', separator: '-' },
    dependencyFields: ['dependencies', 'peerDependencies'],
    packages: ['core/*', 'features/**', '!**/fixtures'],
  },
};
`;

const projects: string[] = [];

function makeProject(file: string): string {
  const cwd = mkdtempSync(join(tmpdir(), 'eslint-config-shared-layout-'));
  projects.push(cwd);
  writeFileSync(join(cwd, 'exadev.config.ts'), file);

  return cwd;
}

afterEach(() => {
  for (const cwd of projects.splice(0)) rmSync(cwd, { force: true, recursive: true });
});

describe('the shared layout read through @exadev/config', () => {
  it('has a type assignable to workspaceArchitecture', () => {
    expectTypeOf<LayoutConfig>().toExtend<WorkspaceArchitectureOptions>();
    const assign = (layout: LayoutConfig): WorkspaceArchitectureOptions => layout;
    expect(assign).toBeTypeOf('function');
  });

  it('loads from exadev.config.ts and reaches no-uphill-dependency with every field intact', async () => {
    const layout = await loadSection(layoutSection, { cwd: makeProject(LAYOUT_FILE) });
    if (layout === undefined) throw new Error('Unreachable: the project file defines a layout section.');

    const config = exadevConfig({ react: false, nextjs: false, workspaceArchitecture: layout });
    const entry = config.find((block) => block.rules?.['exadev/no-uphill-dependency'] !== undefined);
    const setting = entry?.rules?.['exadev/no-uphill-dependency'];
    expect(setting).toEqual(['error', layout]);
    expect(layout.groups.map((group) => group.name)).toEqual(['core', 'features', 'targets']);
  });
});
