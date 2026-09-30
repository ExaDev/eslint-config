import type { ConfigArrayValue, PublicConfigArray } from './config-types';
import plugin from './plugin';
import { readImportPolicies, type ImportPolicy } from './rules/import-policy-options';
import { SOURCE_FILE_GLOBS } from './turbo-config';
import { toPublicConfigArray } from './to-public-config-array';

/**
 * Wires `exadev/import-policy` onto every JavaScript and TypeScript source file from a list of policies. Each policy scopes itself through its own `files` and `ignores`, so one block carries them all: a file several policies select is held to every one of them, which separate `no-restricted-imports` blocks could not do because a later block's option list replaces an earlier one's. Internal: consumed by create-config.ts as one more `ConfigArrayValue` entry.
 */
export function buildImportPolicyConfig(policies: readonly ImportPolicy[]): ConfigArrayValue {
  return [{ files: [...SOURCE_FILE_GLOBS], plugins: { exadev: plugin }, rules: { 'exadev/import-policy': ['error', readImportPolicies(policies)] } }];
}

/**
 * Wires `exadev/import-policy` from a list of `ImportPolicy` objects, returning ESLint core's own `Config[]` so the result spreads directly into `defineConfig(...)` (`...importPolicyConfig(policies)`). Throws at call time for a malformed policy, including an exception edge that could never apply. See the README's "Import policy" section.
 */
export function importPolicyConfig(policies: readonly ImportPolicy[]): PublicConfigArray {
  return toPublicConfigArray(buildImportPolicyConfig(policies));
}
