import type { MemberNode, ObjectNode } from '@humanwhocodes/momoa';
import { getMemberKeyName } from './json-member-key';

export interface ScriptEntry {
  readonly command: string | undefined;
  readonly member: MemberNode;
}

export interface ManifestScripts {
  // Where a missing-script diagnostic goes: the "scripts" entry itself, or the whole manifest when it has none.
  readonly loc: MemberNode['loc'];
  readonly entries: ReadonlyMap<string, ScriptEntry>;
}

/**
 * The package's own top-level `scripts` object members keyed by script name, with each command (undefined when the value is not a string) and the diagnostic location for a problem with the scripts as a whole.
 */
export function readScripts(rootObject: ObjectNode): ManifestScripts {
  const scriptsMember = rootObject.members.find((member) => getMemberKeyName(member) === 'scripts');
  if (scriptsMember?.value.type !== 'Object') return { loc: rootObject.loc, entries: new Map() };

  const entries = new Map<string, ScriptEntry>();
  for (const member of scriptsMember.value.members) {
    entries.set(getMemberKeyName(member), { command: member.value.type === 'String' ? member.value.value : undefined, member });
  }

  return { loc: scriptsMember.loc, entries };
}

/**
 * The entry a content problem refers to. checkScripts only produces a problem for a script present in the map it was given, which is built from these same entries, so a miss means that invariant broke. Exported so the throw, unreachable through the visitor, is tested directly.
 */
export function requireScriptEntry(entries: ReadonlyMap<string, ScriptEntry>, name: string): ScriptEntry {
  const entry = entries.get(name);
  if (entry === undefined) throw new Error(`Unreachable: no script entry named "${name}" among this manifest's own scripts.`);

  return entry;
}

