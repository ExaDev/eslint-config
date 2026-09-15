import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

// A Parameter/Variable Definition's own `.name` is typed as the wider TSESTree.BindingName (which structurally includes ArrayPattern/ObjectPattern) only because that field's declared type is shared across every definition kind eslint-scope has — for these two kinds specifically it is always the one Identifier a given Variable is actually bound to (destructuring creates one Definition per bound name, each pointing at its own Identifier, never at the enclosing pattern as a whole). Exported so that guarantee is checked directly against a deliberately pattern-shaped fake definition name, rather than assumed away with a cast.
export function asIdentifierName(name: TSESTree.BindingName): TSESTree.Identifier {
  if (name.type !== AST_NODE_TYPES.Identifier) {
    throw new Error(`Unreachable: expected a Parameter/Variable Definition's own name to be an Identifier, got ${name.type} instead.`);
  }
  return name;
}
