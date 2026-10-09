import type { MemberNode, ObjectNode, StringNode, ValueNode } from '@humanwhocodes/momoa';
import { getMemberKeyName } from './json-member-key';
import type { WorkspaceFs } from './workspace-fs';

/**
 * The directory a Claude Code plugin or marketplace keeps its manifest in, relative to the plugin or marketplace root.
 */
export const CLAUDE_PLUGIN_DIR = '.claude-plugin';

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
 * Reads and parses a JSON file through `fs`, throwing an error that names the file when it is not valid JSON, so a manifest another file points at fails loudly instead of being read as absent.
 */
export function readJsonFile(fs: WorkspaceFs, path: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path));
  } catch (error) {
    throw new Error(`@exadev/eslint-config: cannot read "${path}" as JSON: ${String(error)}`, { cause: error });
  }
}
