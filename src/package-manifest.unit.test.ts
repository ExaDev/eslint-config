import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest: unknown = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field(name: string): Record<string, unknown> {
  if (!isRecord(manifest)) throw new Error('package.json is not an object');
  const value = manifest[name];
  if (!isRecord(value)) throw new Error(`package.json has no "${name}" object`);

  return value;
}

// Plugins this package resolves at runtime through tryRequire from its own dist/index.js location. Resolution walks up from there, so a package declared only as a devDependency here is never installed for a consumer and only resolves by accident of the consumer's own hoisting.
const RUNTIME_RESOLVED_OPTIONAL_PEERS = ['@eslint/json', '@eslint/markdown', 'eslint-plugin-turbo'];

describe('package.json optional peers resolved at runtime', () => {
  it.each(RUNTIME_RESOLVED_OPTIONAL_PEERS)('%s is declared as an optional peer dependency', (name) => {
    expect(field('peerDependencies')).toHaveProperty([name]);
    expect(field('peerDependenciesMeta')[name]).toStrictEqual({ optional: true });
  });

  it.each(RUNTIME_RESOLVED_OPTIONAL_PEERS)('%s is also a devDependency, so this repo\'s own tests resolve it for real', (name) => {
    expect(field('devDependencies')).toHaveProperty([name]);
  });
});
