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

// Horizontal whitespace before a line end. Never significant inside a comment, and `git diff --check` reports it.
const TRAILING_WHITESPACE_PATTERN = /[ \t]+$/gmu;

// Every `RuleFixer` method that writes caller-supplied text, each taking the text as its second argument. `remove` and `removeRange` write none.
const TEXT_WRITING_FIXER_METHODS: ReadonlySet<string | symbol> = new Set(['insertTextAfter', 'insertTextAfterRange', 'insertTextBefore', 'insertTextBeforeRange', 'replaceText', 'replaceTextRange']);

/**
 * `fixer` with trailing whitespace removed from the text of every edit made through it.
 *
 * The upstream fixer builds a rewritten comment line by line and leaves the padding it puts after the comment prefix on a blank line (`" * "`, `"// "`, or the indent under a bare block), plus any padding the source carried before a closing delimiter. Only the text written is touched, never the file, so no line outside the rewritten comment changes.
 */
function withoutTrailingWhitespaceFixer(fixer: Rule.RuleFixer): Rule.RuleFixer {
  return new Proxy(fixer, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== 'function' || !TEXT_WRITING_FIXER_METHODS.has(property)) return value;

      return (range: unknown, text: string): unknown => {
        const written: unknown = Reflect.apply(value, target, [range, text.replace(TRAILING_WHITESPACE_PATTERN, '')]);

        return written;
      };
    },
  });
}

/**
 * `fix` run against a fixer that strips trailing whitespace from the text it writes, or `fix` itself when a report carries none (`undefined` or `null`).
 *
 * Exported for direct testing: the upstream rule always supplies a fix and may return `null` from it, so neither of those two branches is reachable through a lint run.
 */
export function withoutTrailingWhitespace(fix: Rule.ReportFixer | null | undefined): Rule.ReportFixer | null | undefined {
  if (fix === undefined || fix === null) return fix;

  return (fixer) => fix(withoutTrailingWhitespaceFixer(fixer));
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
      // The proxy's target is a shallow copy of `context`, not `context` itself: ESLint defines `report` on the context as a read-only, non-configurable property, and a `get` trap may not return a different value for one of those. Every read is still answered from `context`.
      new Proxy({ ...context }, {
        get(_target, property, receiver) {
          if (property === 'sourceCode') return sourceCode;
          if (property === 'report') return (descriptor: Rule.ReportDescriptor): void => {
            context.report({ ...descriptor, fix: withoutTrailingWhitespace(descriptor.fix) });
          };
          const value: unknown = Reflect.get(context, property, receiver);

          return value;
        },
      }),
    );
  },
};

export default multilineCommentStyle;
