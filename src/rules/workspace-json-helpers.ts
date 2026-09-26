import type { MemberNode, ObjectNode, StringNode } from '@humanwhocodes/momoa';

// Shared momoa-shaped reading for every workspace-architecture rule: identifying package.json's own top-level "name" and "dependencies"-style fields. This is the actual fix for the hive original's own never-firing top-level guard: its `Member` visitor checked `parent === undefined`, but @eslint/json's own JSONRuleVisitor types a Member's parent as the ObjectNode that contains it, never undefined (only the traversal root, which is never a Member, has an undefined parent), so that guard passed unconditionally and never actually restricted anything to the manifest's own top level. The real check has to happen one level up, on the Object visitor, confirming its own parent is the Document node (see package-json-key-order.ts's identical objectParentOrThrow/`parent.type === 'Document'` pattern); every rule below is written as `Object(node, parent) { if (parent?.type !== 'Document') return; ... }` for exactly this reason, never as a `Member` visitor.

function isStringNode(node: { readonly type: string }): node is StringNode {
  return node.type === 'String';
}

/** package.json's own declared "name" field, read directly off a confirmed-top-level Object node. Returns undefined for a manifest with no "name" at all, or one whose value is not a plain string (a shape other JSON tooling would already flag elsewhere, not this rule's concern). */
export function readDeclaredName(rootObject: ObjectNode): { readonly name: string; readonly node: StringNode } | undefined {
  for (const member of rootObject.members) {
    if (!isStringNode(member.name) || member.name.value !== 'name') continue;
    if (!isStringNode(member.value)) return undefined;
    return { name: member.value.value, node: member.value };
  }
  return undefined;
}

export interface NamedDependency {
  readonly name: string;
  // The dependency's own name-to-range member, for context.report's own loc.
  readonly node: MemberNode;
}

/**
 * Every dependency declared directly under one of `dependencyFields` (default just "dependencies"), each field itself read directly off a confirmed-top-level Object node. A dependency name appearing under more than one configured field (`dependencyFields: ['dependencies', 'devDependencies']`, say) is included once per field it appears under, deliberately: no-dependency-cycle reports at each occurrence's own node, since a genuinely different field's own line is worth its own diagnostic location. A caller that instead checks by name alone, not by field (no-uphill-dependency, via checkDependencies), de-duplicates this list itself before checking, so a name shared across fields is not double-reported at whichever occurrence happens to resolve first.
 */
export function collectTopLevelDependencies(rootObject: ObjectNode, dependencyFields: readonly string[]): readonly NamedDependency[] {
  const fields = new Set(dependencyFields);
  const results: NamedDependency[] = [];

  for (const member of rootObject.members) {
    if (!isStringNode(member.name) || !fields.has(member.name.value)) continue;
    if (member.value.type !== 'Object') continue;
    for (const dependency of member.value.members) {
      if (!isStringNode(dependency.name)) continue;
      results.push({ name: dependency.name.value, node: dependency });
    }
  }

  return results;
}
