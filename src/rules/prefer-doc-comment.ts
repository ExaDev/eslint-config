import { AST_NODE_TYPES, AST_TOKEN_TYPES, ESLintUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';

import { firstAndLastOrThrow } from './prefer-options-object-param';

// This package's own convention (see jsdoc.ts's own header comment) already distinguishes a symbol with a real public contract, which gets a doc comment, from one that doesn't, which gets a plain comment or nothing at all. eslint-plugin-jsdoc's own `require-jsdoc` family is deliberately turned off (jsdoc.ts) rather than demanding a doc comment appear from nothing, since forcing every function everywhere to carry a JSDoc block is a different, much larger policy this package isn't making. This rule fills the one gap that leaves: a public symbol that already HAS a substantial leading comment, just not in the `/** ... */` shape eslint-plugin-jsdoc/eslint-plugin-tsdoc can actually validate. It never demands documentation that doesn't already exist in some form; it only upgrades the format of documentation that does, and only for a symbol this package's own convention already says warrants one (an exported declaration).
//
// Scope, deliberately bounded to exactly the shapes the task commissioning this rule enumerated: an exported function declaration, an exported function expression or arrow function assigned to an exported `const`, an exported class declaration, an exported class's public method, and an exported interface/type-alias declaration. Deliberately NOT covered: a name exported later via a separate `export { x }` statement (a genuinely different, harder detection problem, real scope/binding analysis across the whole module rather than a single parent-chain check; see no-pointless-reassignment.ts's own `isExportedAlias` for what that would take, and note it solves a narrower problem, a single alias `const`, not this rule's five different declaration shapes); an ambient/declare-only signature (`TSDeclareFunction`, ambient class members); and an individual interface/type-alias member (only the declaration as a whole is checked, not each of its properties/methods). Each is a real, if rare, gap, not an oversight: extending to any of them is a distinct, separately-scoped follow-up, not a silent partial implementation of this one.
//
// A `/*! ... */` exclamation-marked license/banner block is also not specially exempted the way it is in @stylistic/eslint-plugin's own `multiline-comment-style` (stylistic-comments.ts's own header comment on that rule): this rule's own "already a doc comment" check only recognises the `/**`-opening shape (`value.startsWith('*')`, the exact check jsdoc.ts's sibling prefer-options-object-param.ts already uses for the identical purpose in `getLeadingJSDocComment`), so a `/*!` block sitting directly above an exported declaration with no blank line would, in principle, be reported. In practice a license/banner comment sits at the very top of a file, before an import or a blank line, never immediately above the specific declaration it would need to be misattributed to here, so this is a theoretical rather than a real-world gap.

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`,
);

// A directive-shaped comment (an eslint-disable family comment, a TypeScript suppression comment, or a TODO/FIXME marker) is never reported regardless of length or line count: none of these is a symbol's documentation at all, so promoting one to a `/** ... */` doc comment would misrepresent it as such. Tested against the FIRST extracted line only (see extractCommentLines below): a genuine directive is, in practice, always a single, self-contained line, and a leading directive line on an otherwise-substantial multi-line comment already signals "this whole leading comment is a suppression/marker, not documentation prose", matching the singular "a comment that is a directive" framing this rule's own commissioning task used. Case-insensitive throughout: `TODO`/`FIXME`/`Todo`/`todo` are all common in the wild, and matching `eslint-disable`/`ts-expect-error` case-insensitively too is strictly more lenient, never a false negative risk.
const DIRECTIVE_COMMENT_PATTERN = /^(?:eslint-disable(?:-next-line|-line)?|ts-expect-error|ts-ignore|ts-nocheck|todo|fixme)\b/iu;

/**
 * A comment's own `type`/`value` fields are all extractCommentLines below actually reads. Narrowed to just those two (rather than the full `TSESTree.Comment`, which also carries `range`/`loc`) so the internal unit test can hand it plain, hand-written literal objects with no risk of drifting from the real parser's own Comment shape, since neither field's own meaning can drift: `type` is always exactly `'Block' | 'Line' | 'Shebang'` and `value` is always exactly the text between the comment's own delimiters, for any parser.
 */
export interface CommentLike {
  readonly type: TSESTree.Comment['type'];
  readonly value: string;
}

/**
 * The comment group's own text, one array entry per ORIGINAL logical line, verbatim (whitespace-trimmed at each line's own boundary only, never reworded), regardless of whether the group is a run of `//` lines or a single already-consolidated bare block comment (both are real inputs this rule must handle identically: multiline-comment-style's own bare-block fixer, wired alongside this rule in stylistic-comments.ts, may already have converted a `//` run into a bare block by the time ESLint's multi-pass autofix reaches this rule). A `Line`-type group is one array entry per comment, each with its own single leading space (if the whole group has one uniformly) trimmed. A `Block`-type group's own `.value` is split on its internal linebreaks; for a genuinely multi-physical-line block, the first and last split segments are the pure indentation/closing-delimiter padding a bare-block fixer's own template inserts around the real content (see stylistic-comments.ts's own trace through its `convertToBlock` helper), so each is dropped only when it trims to nothing, never when it carries real leading/trailing content of its own (a hand-written single-physical-line block never reaches this branch at all, since `split` on no internal linebreak yields exactly one segment, returned as-is).
 */
export function extractCommentLines(group: readonly CommentLike[]): string[] {
  const [firstComment] = group;
  if (firstComment === undefined) return [];
  if (firstComment.type === AST_TOKEN_TYPES.Line) {
    return group.map((comment) => comment.value.trim());
  }
  const rawLines = firstComment.value.split(/\r\n|\r|\n/u).map((line) => line.trim());
  if (rawLines.length <= 1) return rawLines;
  // firstAndLastOrThrow, not a plain `rawLines[0]`/`.at(-1)`: the length check just above already guarantees at least two elements, so both are always defined here, and reusing this already-tested helper (rather than a second, always-true `!== undefined` guard of its own) is exactly the same "caller already confirmed a minimum length" case its own doc comment describes.
  const [first, last] = firstAndLastOrThrow(rawLines);
  const middle = rawLines.slice(1, -1);

  return [...(first.length > 0 ? [first] : []), ...middle, ...(last.length > 0 ? [last] : [])];
}

/**
 * Whether `text` (already trimmed, the first extracted line) opens with one of the recognised directive markers.
 */
export function isDirectiveComment(text: string): boolean {
  return DIRECTIVE_COMMENT_PATTERN.test(text);
}

// A character TSDoc/JSDoc gives special meaning to once the same text sits inside a doc comment: `@` opens a tag, `{`/`}` bracket an inline tag, `<`/`>` open or close what tsdoc/syntax (wired unconditionally alongside this rule, jsdoc.ts) reads as an HTML element; a literal closing comment delimiter would additionally end the new doc comment prematurely, mid-content. None of these is unusual in ordinary prose (a scoped package name, a generic type parameter, a destructured object literal, a comparison), so a comment containing any of them is withheld from BOTH the report and the fix, not merely the fix: correctly escaping each occurrence without misrepresenting the original text is a real judgement call, and this rule's own "verbatim, no rewording" contract deliberately stays out of making it. Confirmed directly against this repository's own pre-existing "why" comments, several of which already reference a scoped rule id, a generic type parameter, or a destructured object literal in ordinary prose: wrapping any of those verbatim in a doc comment trips `tsdoc/syntax`/`jsdoc/escape-inline-tags` immediately, so reporting them at all, even fix-withheld, would leave a permanent, unresolvable lint failure rather than a genuine choice for a caller to make.
const UNSAFE_CHARACTER_PATTERN = /[@{}<>]/u;
export function hasUnsafeDocCommentContent(lines: readonly string[]): boolean {
  return lines.some((line) => line.includes('*/') || UNSAFE_CHARACTER_PATTERN.test(line));
}

type ExportWrapper = TSESTree.ExportDefaultDeclaration | TSESTree.ExportNamedDeclaration;

/**
 * `node`'s own immediate parent, narrowed to an export wrapper, when `node` is written as a direct/inline export (`export function f() {}`, `export default class {}`). See this file's own header comment for why a name exported later via a separate `export { x }` statement is deliberately out of scope, rather than handled here too.
 */
export function getExportWrapper(node: TSESTree.Node): ExportWrapper | undefined {
  const { parent } = node;
  // `parent` is only ever nullish here for a Program node (the one node type with no parent at all), which this function is never called with in practice: every real caller below passes a declaration/class-body-member node, never the Program itself. A plain truthiness check, not `=== undefined`: `parent` is declared as `Node | undefined` in typescript-eslint's own types, but confirmed directly that ESLint's real traversal sets it to `null` at runtime for a genuine Program node, not `undefined` (a real type/runtime mismatch, the same class of lying field type no-enum-reverse-lookup-widening.ts's own comment on `Type.symbol` already documents elsewhere in this codebase); a direct `=== null` comparison against the declared type is flagged as impossible by this repo's own no-unnecessary-condition, where the equivalent truthiness check is not, since it reads as a check against the type's own `undefined` branch while still catching the real runtime `null` value too.
  if (!parent) return undefined;
  if (parent.type === AST_NODE_TYPES.ExportNamedDeclaration || parent.type === AST_NODE_TYPES.ExportDefaultDeclaration) return parent;

  return undefined;
}

/**
 * A class member is "public" exactly when it carries no `private`/`protected` accessibility modifier of its own AND its key is not a genuine `#`-private field (a `PrivateIdentifier` key is always private regardless of any `accessibility` value, which the parser never even sets alongside one).
 */
export function isPublicMethod(node: TSESTree.MethodDefinition): boolean {
  if (node.key.type === AST_NODE_TYPES.PrivateIdentifier) return false;

  return node.accessibility === undefined || node.accessibility === 'public';
}

/**
 * Whether `node` (already confirmed public by isPublicMethod above) is a direct member of a class declaration that is itself exported (directly/inline, per getExportWrapper's own scope). A method of a non-exported class, or of a class EXPRESSION (`const C = class { m() {} }`, which this rule's own enumerated target list never names), is never reported here.
 */
export function isMethodOfExportedClass(node: TSESTree.MethodDefinition): boolean {
  // A MethodDefinition's own `.parent` is typed (and, by the grammar, always) exactly ClassBody, so no runtime narrowing check is needed for that first hop; confirmed directly, since typescript-eslint's own no-unnecessary-condition (this repo's own lint config) flags a redundant `!== ClassBody` comparison here as always false.
  const classDeclaration = node.parent.parent;
  if (classDeclaration.type !== AST_NODE_TYPES.ClassDeclaration) return false;

  return getExportWrapper(classDeclaration) !== undefined;
}

/**
 * The maximal leading comment "group" directly attached to `anchor`: either a single already-consolidated `Block` comment, or the maximal run of consecutive `Line` comments, each immediately adjacent to the next (no blank line between any two), with the whole group sitting directly above `anchor` itself (no blank line separating the group from the declaration it documents). Returns `undefined` when `anchor` has no leading comment at all, or when the nearest one is separated from `anchor` by a blank line (not really "attached" to it). `TSESTree.Comment['type']` also allows a third value, `'Shebang'`, for parser-agnostic compatibility, but confirmed directly that typescript-eslint's own parser (the only one this codebase's rules are ever run under) never actually produces one: a leading `#!` line is dropped before tokenizing rather than surfaced as a comment at all, so there is no real input on which `lastComment` here is ever anything but `'Block'` or `'Line'`, and no separate branch is written for the case that cannot occur.
 */
export function getLeadingCommentGroup(sourceCode: TSESLint.SourceCode, anchor: TSESTree.Node): readonly TSESTree.Comment[] | undefined {
  const comments = sourceCode.getCommentsBefore(anchor);
  const lastComment = comments.at(-1);
  if (lastComment === undefined) return undefined;
  if (anchor.loc.start.line - lastComment.loc.end.line > 1) return undefined;
  if (lastComment.type === AST_TOKEN_TYPES.Block) return [lastComment];

  // `boundary` tracks the earliest comment added to the group so far (seeded with `lastComment` itself), compared against each older candidate walking backward. Tracking it in its own variable, rather than re-reading `group[0]` each iteration, sidesteps `noUncheckedIndexedAccess` entirely for a value that can never actually be empty (`group` only ever grows from its non-empty seed), so no unreachable `=== undefined` guard is needed for it.
  const group: TSESTree.Comment[] = [lastComment];
  let boundary = lastComment;
  for (const comment of comments.slice(0, -1).reverse()) {
    if (comment.type !== AST_TOKEN_TYPES.Line) break;
    if (boundary.loc.start.line - comment.loc.end.line > 1) break;
    group.unshift(comment);
    boundary = comment;
  }

  return group;
}

type MessageIds = 'preferDocComment';
type Options = readonly [{ readonly maxLineLength: number }];

const preferDocComment = createRule<Options, MessageIds>({
  name: 'prefer-doc-comment',
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description:
        'Require a substantial leading comment on an exported declaration to be written as a doc comment (/** ... */) rather than a plain // or /* */ comment, so eslint-plugin-jsdoc/eslint-plugin-tsdoc can actually validate it.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxLineLength: { type: 'integer', minimum: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferDocComment: "A public symbol's contract belongs in a doc comment (/** ... */), not a plain comment.",
    },
    defaultOptions: [{ maxLineLength: 80 }],
  },
  create(context, [{ maxLineLength }]) {
    const { sourceCode } = context;

    function checkAnchor(anchor: TSESTree.Node | undefined): void {
      if (anchor === undefined) return;
      const group = getLeadingCommentGroup(sourceCode, anchor);
      if (group === undefined) return;
      // getLeadingCommentGroup always returns a non-empty array (a single Block comment, or a Line-comment run seeded with at least one element), so firstAndLastOrThrow's own throw branch is genuinely unreachable here; reusing it (rather than a second, redundant `=== undefined` guard) is exactly the "caller already confirmed a minimum length" case its own doc comment describes.
      const [firstComment, lastComment] = firstAndLastOrThrow(group);
      // Already a genuine `/** ... */` doc comment: left alone, whatever its length.
      if (firstComment.type === AST_TOKEN_TYPES.Block && firstComment.value.startsWith('*')) return;

      const lines = extractCommentLines(group);
      const [firstLine] = lines;
      if (firstLine === undefined) return;
      if (isDirectiveComment(firstLine)) return;

      const substantial = lines.length >= 2 || firstLine.length > maxLineLength;
      if (!substantial) return;
      // See hasUnsafeDocCommentContent's own doc comment for why this withholds the REPORT too, not merely the fix.
      if (hasUnsafeDocCommentContent(lines)) return;

      context.report({
        loc: { start: firstComment.loc.start, end: lastComment.loc.end },
        messageId: 'preferDocComment',
        fix(fixer) {
          const indent = sourceCode.text.slice(firstComment.range[0] - firstComment.loc.start.column, firstComment.range[0]);
          const body = lines.map((line) => (line.length > 0 ? `${indent} * ${line}` : `${indent} *`)).join('\n');

          return fixer.replaceTextRange([firstComment.range[0], lastComment.range[1]], `/**\n${body}\n${indent} */`);
        },
      });
    }

    return {
      FunctionDeclaration(node) {
        checkAnchor(getExportWrapper(node));
      },
      ClassDeclaration(node) {
        checkAnchor(getExportWrapper(node));
      },
      TSInterfaceDeclaration(node) {
        checkAnchor(getExportWrapper(node));
      },
      TSTypeAliasDeclaration(node) {
        checkAnchor(getExportWrapper(node));
      },
      VariableDeclarator(node) {
        if (node.init?.type !== AST_NODE_TYPES.ArrowFunctionExpression && node.init?.type !== AST_NODE_TYPES.FunctionExpression) return;
        // A VariableDeclarator's own `.parent` is typed (and, by the grammar, always) exactly VariableDeclaration, so no runtime narrowing check is needed here either, for the identical reason as isMethodOfExportedClass's own comment above.
        checkAnchor(getExportWrapper(node.parent));
      },
      MethodDefinition(node) {
        if (!isPublicMethod(node) || !isMethodOfExportedClass(node)) return;
        checkAnchor(node);
      },
    };
  },
});

export default preferDocComment;
