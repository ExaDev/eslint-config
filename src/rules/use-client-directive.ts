import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

const DIRECTIVE = 'use client';

/**
 * Whether a module opens with a `"use client"` directive, which marks it and everything it imports as client code. The parser sets `directive` (the text without its quotes, so both quote styles match) only on the string-literal statements of the directive prologue, the run at the very start of the file that `"use strict"` may also belong to; the same string later in the file, in a function body or in parentheses is an ordinary expression with no `directive` and marks nothing.
 */
export function hasUseClientDirective(program: TSESTree.Program): boolean {
  return program.body.some((statement) => statement.type === AST_NODE_TYPES.ExpressionStatement && statement.directive === DIRECTIVE);
}
