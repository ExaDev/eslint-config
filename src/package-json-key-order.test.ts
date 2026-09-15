import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPackageJsonKeyOrderConfig, hasSyncpackConfig } from './package-json-key-order';

const throwingRequireFn = () => {
  throw new Error('simulated missing package');
};

describe('hasSyncpackConfig', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'exadev-eslint-config-syncpack-'));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'scratch' }));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('is false when nothing suggests syncpack is configured', () => {
    expect(hasSyncpackConfig(cwd)).toBe(false);
  });

  it('is true when a .syncpackrc.json file is present', () => {
    writeFileSync(join(cwd, '.syncpackrc.json'), '{}');
    expect(hasSyncpackConfig(cwd)).toBe(true);
  });

  it('is true when syncpack.config.ts is present', () => {
    writeFileSync(join(cwd, 'syncpack.config.ts'), 'export default {};');
    expect(hasSyncpackConfig(cwd)).toBe(true);
  });

  it('is true when package.json itself carries a "syncpack" key', () => {
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'scratch', syncpack: { sortFirst: ['name'] } }));
    expect(hasSyncpackConfig(cwd)).toBe(true);
  });

  it('is false (fails closed) when package.json is missing entirely', () => {
    rmSync(join(cwd, 'package.json'));
    expect(hasSyncpackConfig(cwd)).toBe(false);
  });
});

describe('buildPackageJsonKeyOrderConfig', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'exadev-eslint-config-syncpack-'));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'scratch' }));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('enabled: false wins over everything — always []', () => {
    writeFileSync(join(cwd, '.syncpackrc.json'), '{}');
    expect(buildPackageJsonKeyOrderConfig({ enabled: false, cwd })).toEqual([]);
  });

  it('auto-detect: [] when the project already has syncpack configured', () => {
    writeFileSync(join(cwd, '.syncpackrc.json'), '{}');
    expect(buildPackageJsonKeyOrderConfig({ cwd })).toEqual([]);
  });

  it('auto-detect: [] when @eslint/json is not resolvable, even without syncpack', () => {
    expect(buildPackageJsonKeyOrderConfig({ cwd, requireFn: throwingRequireFn })).toEqual([]);
  });

  it('enabled: true and @eslint/json is missing — throws an actionable error naming the real install command', () => {
    expect(() => buildPackageJsonKeyOrderConfig({ cwd, enabled: true, requireFn: throwingRequireFn })).toThrow(/pnpm add -D @eslint\/json/);
  });

  it('auto-detect: a real config block when no syncpack config exists and @eslint/json genuinely resolves', () => {
    // No requireFn override — this repo's own real devDependency resolves for real.
    const result = buildPackageJsonKeyOrderConfig({ cwd });
    expect(result).toHaveLength(1);
    expect(result[0]?.language).toBe('json/json');
    expect(result[0]?.files).toStrictEqual(['**/package.json']);
    expect(result[0]?.rules?.['exadev/package-json-key-order']).toStrictEqual(['error', {}]);
  });

  it('enabled: true overrides a present syncpack config — still enables', () => {
    writeFileSync(join(cwd, '.syncpackrc.json'), '{}');
    const result = buildPackageJsonKeyOrderConfig({ cwd, enabled: true });
    expect(result).toHaveLength(1);
  });

  it('threads sortFirst/sortAz through into the rule options', () => {
    const result = buildPackageJsonKeyOrderConfig({ cwd, sortFirst: ['name'], sortAz: ['scripts'] });
    expect(result[0]?.rules?.['exadev/package-json-key-order']).toStrictEqual(['error', { sortFirst: ['name'], sortAz: ['scripts'] }]);
  });

  it('resolves a json-language plugin that is its own default export directly, not nested under .default', () => {
    const directPlugin = { languages: { json: {} } };
    const result = buildPackageJsonKeyOrderConfig({ cwd, requireFn: () => directPlugin });
    expect(result).toHaveLength(1);
    expect(result[0]?.plugins?.['json']).toBe(directPlugin);
  });

  it('auto-detect: [] when the resolved module is neither a default-wrapped nor a direct json-language plugin', () => {
    expect(buildPackageJsonKeyOrderConfig({ cwd, requireFn: () => ({ notAPlugin: true }) })).toEqual([]);
  });

  it('auto-detect: [] when the resolved module is null rather than an object — typeof null is "object", so this only holds if null is checked for explicitly', () => {
    expect(buildPackageJsonKeyOrderConfig({ cwd, requireFn: () => null })).toEqual([]);
  });
});
