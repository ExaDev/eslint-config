import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
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

// The version of `minimatch` that code at `from` resolves.
function minimatchMajor(from: string): string {
  const entry = createRequire(from).resolve('minimatch');
  const root = entry.slice(0, entry.lastIndexOf(join('minimatch', 'dist')));
  const found: unknown = JSON.parse(readFileSync(join(root, 'minimatch', 'package.json'), 'utf8'));
  if (!isRecord(found) || typeof found['version'] !== 'string') throw new Error(`no minimatch version for ${from}`);

  return found['version'].slice(0, found['version'].indexOf('.'));
}

// Every file-glob option promises to select what ESLint selects, which holds only while both compile globs with the same minimatch.
describe('minimatch shared with ESLint', () => {
  it('is the same major as the one ESLint\'s config array resolves', () => {
    const eslint = realpathSync(createRequire(import.meta.url).resolve('eslint'));
    const configArray = createRequire(eslint).resolve('@eslint/config-array');
    expect(minimatchMajor(configArray)).toBe(minimatchMajor(import.meta.url));
  });

  it('is required of a consumer by an eslint peer range that starts at the first release resolving it', () => {
    expect(field('peerDependencies')['eslint']).toBe('>=10.15.0');
  });
});
