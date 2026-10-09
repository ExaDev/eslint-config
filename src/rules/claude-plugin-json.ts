import { dirname, join } from 'node:path';
import type { MemberNode, ObjectNode, StringNode, ValueNode } from '@humanwhocodes/momoa';
import { tryParseJsonc } from './jsonc';
import { getMemberKeyName } from './json-member-key';
import type { WorkspaceFs } from './workspace-fs';

/**
 * The directory a Claude Code plugin or marketplace keeps its manifest in, relative to the plugin or marketplace root.
 */
export const CLAUDE_PLUGIN_DIR = '.claude-plugin';

/**
 * The name of a marketplace manifest inside `CLAUDE_PLUGIN_DIR`.
 */
export const MARKETPLACE_FILE_NAME = 'marketplace.json';

/**
 * The directory a manifest file belongs to, the one holding the `.claude-plugin` directory it sits in: a marketplace's root (the directory its local sources are relative to) or a plugin's directory. Both manifest rules resolve it through this function, so they agree on where a marketplace or a plugin is.
 */
export function claudeRootOf(manifestFile: string): string {
  return dirname(dirname(manifestFile));
}

/**
 * Whether `directory` is a marketplace root, that is whether it holds a marketplace manifest. A plugin in such a directory is the one a marketplace entry with source `./` names, so its directory is the checkout or marketplace folder and not a name chosen for the plugin.
 */
export function isMarketplaceRoot(fs: WorkspaceFs, directory: string): boolean {
  return fs.existsSync(join(directory, CLAUDE_PLUGIN_DIR, MARKETPLACE_FILE_NAME));
}

/**
 * The name of a plugin's own manifest inside `CLAUDE_PLUGIN_DIR`.
 */
export const PLUGIN_MANIFEST_FILE = 'plugin.json';

/**
 * The first member of `object` named `key`, or `undefined` when it has none. JSON permits a repeated key; the first one is the one read.
 */
export function findMember(object: ObjectNode, key: string): MemberNode | undefined {
  return object.members.find((member) => getMemberKeyName(member) === key);
}

/**
 * Whether `node` is a string with at least one character.
 */
export function isNonEmptyString(node: ValueNode): node is StringNode {
  return node.type === 'String' && node.value.length > 0;
}

/**
 * The outcome of `readJsonFile`: the parsed value, or why the file is not JSON.
 */
export type JsonFileResult = { readonly kind: 'parsed'; readonly value: unknown } | { readonly kind: 'invalid'; readonly reason: string };

/**
 * Reads and parses a sibling JSON file through `fs` with the repository's tolerant JSONC reader, so a byte order mark or a trailing comma, which editors and the file's own lint treat separately, does not make this read fail. A syntax error comes back as the `invalid` result for the calling rule to report on the file that points here, since throwing would abort the whole ESLint run and hide every other finding. A read error (a file that cannot be read) is not a finding about the file's content and propagates.
 */
export function readJsonFile(fs: WorkspaceFs, path: string): JsonFileResult {
  const result = tryParseJsonc(fs.readFileSync(path), path);

  return result.kind === 'parsed' ? result : { kind: 'invalid', reason: result.error.message };
}
