import { describe, expect, it } from 'vitest';
import { viaDefineConfig, viaDefineConfigSpread, viaTseslintConfig } from './consumer-compatibility';

// This file's only job is proving both legacy consumption patterns still resolve to real config arrays at runtime, not just typecheck — consumer-compatibility.ts is deliberately excluded from the published bundle (see its own comment), so nothing else in this package ever imports it.
describe('consumer compatibility patterns', () => {
  it('tseslint.config(...defaultConfig) produces a non-empty config array', () => {
    expect(Array.isArray(viaTseslintConfig)).toBe(true);
    expect(viaTseslintConfig.length).toBeGreaterThan(0);
  });

  it('defineConfig(defaultConfig) produces a non-empty config array', () => {
    expect(Array.isArray(viaDefineConfig)).toBe(true);
    expect(viaDefineConfig.length).toBeGreaterThan(0);
  });

  it('defineConfig(...exadevConfig()) produces a non-empty config array', () => {
    expect(Array.isArray(viaDefineConfigSpread)).toBe(true);
    expect(viaDefineConfigSpread.length).toBeGreaterThan(0);
  });
});
