import { isTypeReference } from 'ts-api-utils';
import * as ts from 'typescript';

// esTreeNodeToTSNodeMap's return type for the general TSESTree.Expression union is only ever known to be a ts.Node here, since a couple of TSESTree.Expression union members (bare meta-property keyword tokens among them) structurally fall outside TypeScript's own narrower ts.Expression type. Confirmed directly, though, that this never actually diverges for any node this codebase's own rules pass through it: both `import.meta` and `new.target` resolve to `ts.SyntaxKind.MetaProperty`, which itself DOES satisfy `ts.isExpression` — no real TSESTree traversal in this package has ever been found to reach the false branch. Exported so that guard is still checked directly, against a deliberately non-expression `ts.Node` no real parse produces at these call sites, rather than assumed away with a cast.
export function asExpression(tsNode: ts.Node): ts.Expression {
  if (!ts.isExpression(tsNode)) {
    throw new Error(`Unreachable: expected a ts.Expression, got ts.SyntaxKind.${ts.SyntaxKind[tsNode.kind]} instead.`);
  }
  return tsNode;
}

// 'Array<T>'/'ReadonlyArray<T>' are always generic type references once `checker.isArrayType` has confirmed the receiver is one of them, so `getTypeArguments` (which requires a `ts.TypeReference`) is safe to call on the result — ts-api-utils's `isTypeReference` narrows `ts.Type` down to `ts.TypeReference` by checking the `ObjectFlags.Reference` bit, the same check the TypeScript compiler's own internals use. Exported so that guarantee is checked directly against a deliberately non-reference array-flagged type, rather than assumed away with a cast.
export function asTypeReference(type: ts.Type): ts.TypeReference {
  if (!isTypeReference(type)) {
    throw new Error('Unreachable: expected an array/tuple type to be backed by a ts.TypeReference.');
  }
  return type;
}

interface LastTokenSource<TNode, TToken> {
  getLastToken: (node: TNode) => TToken | null;
}

// `getLastToken` only ever returns null for a node with genuinely no tokens at all — never true of a real, parsed AST node this codebase's own rules call it on. Exported so that guarantee is checked directly against a deliberately token-less fake source, rather than assumed away with a cast.
export function lastTokenOrThrow<TNode, TToken>(sourceCode: Readonly<LastTokenSource<TNode, TToken>>, node: TNode): TToken {
  const token = sourceCode.getLastToken(node);
  if (token === null) {
    throw new Error('Unreachable: getLastToken returned null for a node expected to always have at least one token.');
  }
  return token;
}

interface FirstTokenSource<TNode, TToken> {
  getFirstToken: (node: TNode) => TToken | null;
}

// The first-token mirror of lastTokenOrThrow above, for the identical reason: `getFirstToken` only ever returns null for a node with genuinely no tokens at all — never true of a real, parsed AST node this codebase's own rules call it on (e.g. a function's own BlockStatement body always has at least one token, its opening brace). Exported so that guarantee is checked directly against a deliberately token-less fake source, rather than assumed away with a cast.
export function firstTokenOrThrow<TNode, TToken>(sourceCode: Readonly<FirstTokenSource<TNode, TToken>>, node: TNode): TToken {
  const token = sourceCode.getFirstToken(node);
  if (token === null) {
    throw new Error('Unreachable: getFirstToken returned null for a node expected to always have at least one token.');
  }
  return token;
}
