import stylistic from '@stylistic/eslint-plugin';
import { AST_TOKEN_TYPES } from '@typescript-eslint/utils';
import type { Rule, SourceCode } from 'eslint';
import { isDirectiveComment } from './prefer-doc-comment';

// The installed @stylistic/eslint-plugin's own `multiline-comment-style`, which this rule delegates to unchanged.
const upstreamRule = stylistic.rules['multiline-comment-style'];

// eslint's own comment `type` strings mapped to the typescript-eslint token types `isDirectiveComment` takes.
const COMMENT_TOKEN_TYPES = { Line: AST_TOKEN_TYPES.Line, Block: AST_TOKEN_TYPES.Block } as const satisfies Record<ReturnType<SourceCode['getAllComments']>[number]['type'], AST_TOKEN_TYPES>;

/**
 * A view of `sourceCode` whose `getAllComments()` omits every comment `exadev/prefer-doc-comment` treats as a directive; every other member is the original's, with methods bound to the original so its private fields stay reachable.
 *
 * The upstream rule's `Program` handler picks the comments it groups from `getAllComments()`, dropping each one its own `isDirectiveComment` matches, and only joins a comment to the previous group when `getTokenBefore(comment, { includeComments: true })` is that group's last comment. `getTokenBefore` still sees an omitted comment, so the line after it starts a new group: the omitted comment breaks the run exactly as an upstream-recognised directive does, and is never reported or rewritten itself.
 */
function withoutDirectives(sourceCode: SourceCode): SourceCode {
  return new Proxy(sourceCode, {
    get(target, property) {
      if (property === 'getAllComments') return () => target.getAllComments().filter((comment) => !isDirectiveComment(comment.value, COMMENT_TOKEN_TYPES[comment.type]));
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      const bound: unknown = value.bind(target);

      return bound;
    },
  });
}

/**
 * `@stylistic/eslint-plugin`'s `multiline-comment-style`, never merging a comment `exadev/prefer-doc-comment` treats as a directive into a block: the upstream rule's own `create()`, `meta` (options schema, defaults, messages, fixability) and fixer, run against a context whose source code hides those comments from the rule's grouping.
 *
 * Upstream already leaves its own directive list alone (the ESLint family, `@ts-*`, `prettier-ignore`, the coverage-tool ignores, webpack magic comments, triple-slash directives) but not `TODO`/`FIXME` task markers (https://github.com/eslint-stylistic/eslint-stylistic/issues/1287), nor `cspell:*`, `biome-ignore` or `#region`/`#endregion`. Folding one of those into the merged block destroys it as a standalone marker, and `exadev/prefer-doc-comment` leaves a block containing a directive alone rather than splitting it, so the declaration below it silently loses its doc comment.
 */
const multilineCommentStyle: Rule.RuleModule = {
  ...upstreamRule,
  create(context) {
    const sourceCode = withoutDirectives(context.sourceCode);

    return upstreamRule.create(
      new Proxy(context, {
        get(target, property, receiver) {
          if (property === 'sourceCode') return sourceCode;
          const value: unknown = Reflect.get(target, property, receiver);

          return value;
        },
      }),
    );
  },
};

export default multilineCommentStyle;
