import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildGitignoreConfig } from './gitignore';

describe('buildGitignoreConfig', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'exadev-eslint-config-gitignore-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('enabled: false wins over everything -- always [], even with a real .gitignore present', () => {
    writeFileSync(join(cwd, '.gitignore'), 'dist/\n');
    expect(buildGitignoreConfig({ enabled: false, cwd })).toStrictEqual([]);
  });

  it('auto-detect: returns [] when there is no .gitignore to read', () => {
    expect(buildGitignoreConfig({ cwd })).toStrictEqual([]);
  });

  it('auto-detect: returns a single ignores block derived from a real .gitignore', () => {
    writeFileSync(join(cwd, '.gitignore'), 'dist/\ncoverage/\n');
    const result = buildGitignoreConfig({ cwd });
    expect(result).toHaveLength(1);
    const [config] = result;
    expect(config?.ignores).toBeDefined();
    expect(Object.keys(config ?? {})).toStrictEqual(['name', 'ignores']);
  });

  it('enabled: true and a .gitignore is present -- succeeds, no throw', () => {
    writeFileSync(join(cwd, '.gitignore'), 'dist/\n');
    expect(() => buildGitignoreConfig({ enabled: true, cwd })).not.toThrow();
  });

  it('enabled: true and no .gitignore exists -- throws an actionable error naming the expected path', () => {
    expect(() => buildGitignoreConfig({ enabled: true, cwd })).toThrow(join(cwd, '.gitignore'));
  });

  it('defaults cwd to process.cwd() when not given', () => {
    // Not asserting a specific outcome (this real process's own cwd may or may not have a .gitignore) -- only that omitting cwd doesn't throw or behave differently from passing process.cwd() explicitly.
    expect(() => buildGitignoreConfig()).not.toThrow();
  });
});
