// The narrow shape a member's own key name is actually read through: a String node's runtime-relevant fields (its type discriminant and its value), not momoa's full StringNode (which also carries loc and range). Deliberately narrower than StringNode so a test fixture can satisfy it with a plain object literal, and honest about what isStringNamed's own `.type` check can actually prove: a full StringNode claim from a check that only reads `.type` would be false.
export interface StringNamed {
  readonly type: 'String';
  readonly value: string;
}

function isStringNamed(name: { readonly type: string }): name is StringNamed {
  return name.type === 'String';
}

/**
 * Shared by package-json-key-order.ts and workspace-json-helpers.ts: momoa's own MemberNode.name is typed StringNode | IdentifierNode because momoa's grammar also covers JSON5 (unquoted identifier keys), but every rule that calls this only ever sets meta.languages to json/json or json/jsonc, where an unquoted key is a genuine parse error, never a value this function is asked to name. Exported so that guarantee is checked directly against a deliberately IdentifierNode-shaped input, rather than trusted on the strength of this comment alone.
 */
export function getMemberKeyName(member: { readonly name: { readonly type: string } }): string {
  const { name } = member;
  if (!isStringNamed(name)) {
    throw new Error(`Unreachable: JSON member names are only read under json/json or json/jsonc, where an unquoted (Identifier) member name is a parse error, got a "${name.type}" name instead.`);
  }
  return name.value;
}
