/**
 * Whether the file under lint was parsed to an ESTree `Program`, the tree every rule that reads JavaScript or TypeScript syntax is written against. A rule that is wired onto a block with no `files` (the documented unscoped override placed after the shared config) is also handed the JSON, JSONC and Markdown files the shared config lints, whose source code objects have a different root and no scope manager or parser services; such a rule starts with `if (!isEstreeSource(context.sourceCode)) return {};` after reading its options, so a file of another language is left alone instead of crashing the run.
 */
export function isEstreeSource(sourceCode: { readonly ast: { readonly type: string } }): boolean {
  return sourceCode.ast.type === 'Program';
}
