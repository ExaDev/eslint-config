import stylistic from '@stylistic/eslint-plugin';
import type { Linter } from 'eslint';
import { Linter as LinterClass } from 'eslint';
import { describe, expect, it } from 'vitest';
import { exadevConfig } from './create-config';
import { viaDefineConfig, viaDefineConfigSpread, viaSpreadOptionalConfigs, viaTseslintConfig } from './consumer-compatibility';
import { publicPlugin } from './plugin';

// This file's job is proving the documented consumer patterns keep working at runtime, not just typecheck — consumer-compatibility.ts is deliberately excluded from the published bundle (see its own comment), so nothing else in this package ever imports it.
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

  it('defineConfig(...plugin.configs.react, ...plugin.configs.nextjs) spreads the blocks both getters return', () => {
    // This repository installs the React and Next.js peers as dev dependencies, so both getters resolve and each contributes at least one block.
    expect(viaSpreadOptionalConfigs().length).toBeGreaterThanOrEqual(publicPlugin.configs.react.length + publicPlugin.configs.nextjs.length);
    expect(publicPlugin.configs.react.length).toBeGreaterThan(0);
    expect(publicPlugin.configs.nextjs.length).toBeGreaterThan(0);
  });

  it('types plugin.configs.recommended and plugin.configs.barrel as single config objects, as their getters return them', () => {
    expect(Array.isArray(publicPlugin.configs.recommended)).toBe(false);
    expect(Array.isArray(publicPlugin.configs.barrel)).toBe(false);
    expect(() => {
      // @ts-expect-error: a single config object is not iterable, so the type must reject spreading it.
      const spread: unknown[] = [...publicPlugin.configs.recommended];

      return spread;
    }).toThrow(TypeError);
  });
});

// The README's own @stylistic migration note, pinned by a real Linter run: the bundled config registers @stylistic/eslint-plugin under the '@stylistic' key itself (stylistic-comments.ts), so a consumer appending a block that registers a DIFFERENT copy of the plugin (a separate install of another version resolving its own module instance; a shallow copy of the real one reproduces exactly that distinct identity) hard-crashes ESLint's flat-config plugin normalisation, the identical "Cannot redefine plugin" restriction the README's typescript-eslint note documents. The identical instance is accepted, which is what makes "configure further @stylistic/* rules directly in your own rules block" a real migration path rather than a workaround. A spread-out copy of a plugin object is the standard stand-in for a second install: flat config compares plugin identity by reference, so only the reference differs, exactly as it does for a duplicated package.
describe('consumer compatibility: the bundled @stylistic registration', () => {
  const linter = new LinterClass();
  const baseConfig = [...exadevConfig()] as Linter.Config[];

  it('throws when a trailing consumer block registers a different @stylistic/eslint-plugin instance, the documented migration hazard', () => {
    expect(() => {
      linter.verify('const word = 1;\n', [...baseConfig, { plugins: { '@stylistic': { ...stylistic } } }], 'consumer.ts');
    }).toThrow(/Cannot redefine plugin "@stylistic"/u);
  });

  it('accepts a trailing consumer block registering the identical instance, so further @stylistic/* rules need no registration of their own', () => {
    // not.toThrow on the specific message, not a plain not.toThrow(): this minimal harness supplies no parserOptions.project of its own, so with plugin normalisation passed, rule loading for a .ts file still fails afterwards with an unrelated "rule which requires type information" error. Plugin normalisation happens before any rule loads, which is exactly what the different-instance case above pins; what this case asserts is that that phase accepts the identical instance, so anything it throws must never be the redefine error.
    expect(() => {
      linter.verify('const word = 1;\n', [...baseConfig, { plugins: { '@stylistic': stylistic } }], 'consumer.ts');
    }).not.toThrow(/Cannot redefine plugin "@stylistic"/u);
  });
});
