import { describe, expect, it } from 'vitest';
import { resolveJsonPlugin } from './json-plugin';

describe('resolveJsonPlugin', () => {
  it('resolves a genuine ES module namespace, preferring its own .default', () => {
    const realPlugin = { languages: { json: {} } };
    const namespace = { __esModule: true, default: realPlugin };
    expect(resolveJsonPlugin(namespace)).toBe(realPlugin);
  });

  it('resolves a plugin that is its own default export directly, with no .default wrapper', () => {
    const directPlugin = { languages: { json: {} } };
    expect(resolveJsonPlugin(directPlugin)).toBe(directPlugin);
  });

  it('returns undefined for an object whose .default is not itself a json-language plugin', () => {
    expect(resolveJsonPlugin({ default: { notAPlugin: true } })).toBeUndefined();
  });

  it('returns undefined for a value that is neither record-shaped nor a plugin', () => {
    expect(resolveJsonPlugin('a string')).toBeUndefined();
    expect(resolveJsonPlugin(undefined)).toBeUndefined();
  });

  it('returns undefined for null, without throwing, since typeof null === "object"', () => {
    expect(() => resolveJsonPlugin(null)).not.toThrow();
    expect(resolveJsonPlugin(null)).toBeUndefined();
  });

  it('returns undefined when "languages" is present but has no "json" key', () => {
    expect(resolveJsonPlugin({ languages: { yaml: {} } })).toBeUndefined();
  });

  it('returns undefined when "languages" itself is not object-shaped', () => {
    expect(resolveJsonPlugin({ languages: 'not-an-object' })).toBeUndefined();
  });
});
