import { AST_NODE_TYPES, AST_TOKEN_TYPES, ESLintUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';

import { TSDocParser } from '@microsoft/tsdoc';

import { firstAndLastOrThrow } from './prefer-options-object-param';

// This package's own convention (see jsdoc.ts's own header comment) already distinguishes a symbol with a real public contract, which gets a doc comment, from one that doesn't, which gets a plain comment or nothing at all. eslint-plugin-jsdoc's own `require-jsdoc` family is deliberately turned off (jsdoc.ts) rather than demanding a doc comment appear from nothing, since forcing every function everywhere to carry a JSDoc block is a different, much larger policy this package isn't making. This rule fills the one gap that leaves: a public symbol that already HAS a substantial leading comment, just not in the `/** ... */` shape eslint-plugin-jsdoc/eslint-plugin-tsdoc can actually validate. It never demands documentation that doesn't already exist in some form; it only upgrades the format of documentation that does, and only for a symbol this package's own convention already says warrants one (an exported declaration).
//
// Scope, deliberately bounded to exactly the shapes the task commissioning this rule enumerated: an exported function declaration, an exported function expression or arrow function assigned to an exported `const`, an exported class declaration, an exported class's public method, and an exported interface/type-alias declaration. Deliberately NOT covered: a name exported later via a separate `export { x }` statement (a genuinely different, harder detection problem, real scope/binding analysis across the whole module rather than a single parent-chain check; see no-pointless-reassignment.ts's own `isExportedAlias` for what that would take, and note it solves a narrower problem, a single alias `const`, not this rule's five different declaration shapes); an ambient/declare-only signature (`TSDeclareFunction`, ambient class members); and an individual interface/type-alias member (only the declaration as a whole is checked, not each of its properties/methods). Each is a real, if rare, gap, not an oversight: extending to any of them is a distinct, separately-scoped follow-up, not a silent partial implementation of this one.
//
// A `/*! ... */` exclamation-marked license/banner block is also not specially exempted the way it is in @stylistic/eslint-plugin's own `multiline-comment-style` (stylistic-comments.ts's own header comment on that rule): this rule's own "already a doc comment" check only recognises the `/**`-opening shape (`value.startsWith('*')`, the exact check jsdoc.ts's sibling prefer-options-object-param.ts already uses for the identical purpose in `getLeadingJSDocComment`), so a `/*!` block sitting directly above an exported declaration with no blank line would, in principle, be reported. In practice a license/banner comment sits at the very top of a file, before an import or a blank line, never immediately above the specific declaration it would need to be misattributed to here, so this is a theoretical rather than a real-world gap.

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`,
);

// A directive-shaped LINE (an eslint-disable family comment, a TypeScript suppression comment, or a TODO/FIXME marker) is never itself absorbed into a `/** ... */` doc comment: none of these is a symbol's documentation at all, so promoting one would misrepresent it as such, and merging it bodily into a bigger block comment destroys it as a directive regardless of where it sits (ESLint/TypeScript only ever recognise a directive comment as a whole, self-contained comment of its own, never a sentence buried inside a larger one). checkAnchor below splits the group's own extracted lines at the FIRST directive line found anywhere in the run, not only the last: the lines strictly above it are still real, independently judgeable documentation prose (still eligible for their own report/fix), while the directive line and everything from it onward is excluded from the fix range entirely and left completely untouched. Case-insensitive throughout: `TODO`/`FIXME`/`Todo`/`todo` are all common in the wild, and matching `eslint-disable`/`ts-expect-error` case-insensitively too is strictly more lenient, never a false negative risk.
const DIRECTIVE_COMMENT_PATTERN = /^(?:eslint-disable(?:-next-line|-line)?|ts-expect-error|ts-ignore|ts-nocheck|todo|fixme)\b/iu;

/**
 * A comment's own `type`/`value` fields are all extractCommentLines below actually reads. Narrowed to just those two (rather than the full `TSESTree.Comment`, which also carries `range`/`loc`) so the internal unit test can hand it plain, hand-written literal objects with no risk of drifting from the real parser's own Comment shape, since neither field's own meaning can drift: `type` is always exactly `'Block' | 'Line' | 'Shebang'` and `value` is always exactly the text between the comment's own delimiters, for any parser.
 */
export interface CommentLike {
  readonly type: TSESTree.Comment['type'];
  readonly value: string;
}

/**
 * The number of leading space characters every non-blank line in `lines` shares, the amount a shared left margin (a hand-written block's own body indentation, aligned however its author chose) can be stripped from every line at once while leaving any EXTRA indentation a particular line carries beyond that margin (a nested example, a sub-list) exactly as it was, relative to its neighbours. A blank line (all whitespace or empty) never lowers the shared amount: it carries no indentation of its own to compare, only whichever real content lines happen to surround it. Zero for an empty `lines`, or one all-blank: there is no real content to measure a margin from at all.
 */
function commonLeadingWhitespace(lines: readonly string[]): number {
  const contentLines = lines.filter((line) => line.trim().length > 0);
  if (contentLines.length === 0) return 0;

  return Math.min(...contentLines.map((line) => line.length - line.trimStart().length));
}

/**
 * Strips exactly the single conventional space between a `//`/`/*`-opening delimiter and the real content that follows it on the SAME physical line (turning `// text` into plain `text`, mirroring `@stylistic/spaced-comment`'s own `'always'` convention), leaving any further leading whitespace on `value` untouched: a second, third, ... leading space is the author's own deliberate content indentation (a code sample, a nested list item), not padding around the delimiter, so only ever the first is delimiter noise.
 */
function stripSingleLeadingSpace(value: string): string {
  return value.startsWith(' ') ? value.slice(1) : value;
}

/**
 * The comment group's own text, one array entry per ORIGINAL logical line, verbatim aside from stripping exactly the padding a bare-`/* `/`// ` delimiter itself adds (never the author's own further indentation, a real part of the content some lines may carry more of than others), regardless of whether the group is a run of `//` lines or a single already-consolidated bare block comment (both are real inputs this rule must handle identically: multiline-comment-style's own bare-block fixer, wired alongside this rule in stylistic-comments.ts, may already have converted a `//` run into a bare block by the time ESLint's multi-pass autofix reaches this rule). A `Line`-type group is one array entry per comment, each with its own single leading delimiter-space (see stripSingleLeadingSpace) stripped and trailing whitespace trimmed (never meaningful). A `Block`-type group's own `.value` is split on its internal linebreaks: the FIRST physical line sits on the same source line as the opening `/*` itself, so it gets the identical single-leading-space treatment as a `//` line; every line after it is a genuine physical line of the block's own body, sharing one left margin (see commonLeadingWhitespace) that is stripped from all of them together so their RELATIVE indentation survives. The opening and closing physical lines are each dropped entirely when they trim to nothing (the pure indentation/closing-delimiter padding a bare-block fixer's own template inserts around the real content, see stylistic-comments.ts's own trace through its `convertToBlock` helper), never when either carries real content of its own (a hand-written single-physical-line block never reaches this branch at all, since `split` on no internal linebreak yields exactly one segment, returned as-is); a blank line genuinely in the MIDDLE of the body (a paragraph separator) is kept, as an empty string, rather than dropped, since it is real structure the author put there, not delimiter padding.
 */
export function extractCommentLines(group: readonly CommentLike[]): string[] {
  const [firstComment] = group;
  if (firstComment === undefined) return [];
  if (firstComment.type === AST_TOKEN_TYPES.Line) {
    return group.map((comment) => stripSingleLeadingSpace(comment.value).trimEnd());
  }

  const rawLines = firstComment.value.split(/\r\n|\r|\n/u);
  if (rawLines.length <= 1) return rawLines.map((line) => line.trim());
  // firstAndLastOrThrow, not a plain `rawLines[0]`/`.at(-1)`: the length check just above already guarantees at least two elements, so both are always defined here, and reusing this already-tested helper (rather than a second, always-true `!== undefined` guard of its own) is exactly the same "caller already confirmed a minimum length" case its own doc comment describes.
  const [firstRaw, lastRaw] = firstAndLastOrThrow(rawLines);
  const middleRaw = rawLines.slice(1, -1);
  const firstKept = firstRaw.trim().length > 0;
  const lastKept = lastRaw.trim().length > 0;
  const ownBodyRaw = lastKept ? [...middleRaw, lastRaw] : middleRaw;
  const dedent = commonLeadingWhitespace(ownBodyRaw);
  const ownBodyLines = ownBodyRaw.map((line) => (line.trim().length === 0 ? '' : line.slice(dedent).trimEnd()));
  const lines = [...(firstKept ? [stripSingleLeadingSpace(firstRaw).trimEnd()] : []), ...ownBodyLines];

  return stripStarredBlockPrefix(lines);
}

// A hand-written block comment often pads every one of its own content lines with a leading `* ` purely for visual alignment under the `/*` that opens it (`/*\n * line one\n * line two\n *\/`), the same "delimiter decoration, not content" role a genuinely empty first/last physical line already plays above. Recognised only when EVERY non-blank line in the group carries it, never a partial match (which would instead be real content that happens to start with an asterisk, a markdown bullet, a multiplication example): a single line lacking it means the leading `*` elsewhere is real content too, and every line is left untouched.
const STARRED_BLOCK_LINE_PATTERN = /^\*\s?/u;

/**
 * Strips a shared leading `* `/`*` marker from every line in `lines` when the group as a whole has the hand-written "starred block" shape STARRED_BLOCK_LINE_PATTERN's own comment describes; returns `lines` completely unchanged otherwise (including when `lines` is empty, or contains only blank lines, since there is then no real content to test the shape against at all).
 */
export function stripStarredBlockPrefix(lines: readonly string[]): string[] {
  const contentLines = lines.filter((line) => line.length > 0);
  if (contentLines.length === 0 || !contentLines.every((line) => STARRED_BLOCK_LINE_PATTERN.test(line))) return [...lines];

  return lines.map((line) => line.replace(STARRED_BLOCK_LINE_PATTERN, ''));
}

/**
 * Whether `text` (already trimmed, the first extracted line) opens with one of the recognised directive markers.
 */
export function isDirectiveComment(text: string): boolean {
  return DIRECTIVE_COMMENT_PATTERN.test(text);
}

/**
 * Whether any line of the candidate doc-comment body already contains a literal closing-comment delimiter. This is checked independently of, and never overridden by, parsesAsValidTsDoc below: a `*\/` sitting inside what would become the new comment's own content ends that comment at the LEXICAL level the moment the file is re-read, the instant the JS/TS tokeniser reaches it, regardless of whether the surrounding text is otherwise valid TSDoc. Applying a fix here would not merely leave a bad doc comment, it would corrupt the file into a syntax error, so this check alone always withholds the fix, with no parser able to tell us otherwise.
 */
export function containsCommentTerminator(lines: readonly string[]): boolean {
  return lines.some((line) => line.includes('*/'));
}

// One parser instance, reused across every candidate this rule ever checks: TSDocParser carries no per-parse mutable state of its own (each call to parseString returns a fresh ParserContext), so there is nothing a second instance would buy over the one eslint-plugin-tsdoc's own `tsdoc/syntax` rule (wired unconditionally alongside this rule, jsdoc.ts) is already built on.
const tsdocParser = new TSDocParser();

/**
 * Whether `candidateText` (the exact `/**\n ... \n *\/` text this rule's own fixer would splice into the source) parses as valid TSDoc with zero warnings or errors. Delegates entirely to the real parser eslint-plugin-tsdoc's own `tsdoc/syntax` rule already validates every doc comment against, rather than hand-maintaining a second, narrower approximation of the same grammar: an unescaped `@`, `{`, `}`, `<`, `>`, backslash or unbalanced backtick, and any other genuine TSDoc syntax error, are all caught by this one real check, never a hand-picked character subset that is simultaneously too broad (banning an entirely safe generic type reference such as `Array<string>`, which this parser accepts with no messages at all) and too narrow (missing a backslash or a stray backtick, each of which trips a real tsdoc/syntax error once the comment already exists).
 */
export function parsesAsValidTsDoc(candidateText: string): boolean {
  return tsdocParser.parseString(candidateText).log.messages.length === 0;
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
 * Whether `comment` sits on the same physical line as a real token before it (a genuine trailing comment, `const before = 1; // note`), rather than starting its own line. `sourceCode.getTokenBefore` with `includeComments: false` skips past any earlier comment to the nearest real code token, so a run of several adjacent `//` lines is only ever flagged here on its very first member, the one that can actually share a line with preceding code; every later member in the same run is already known to start its own line (see getLeadingCommentGroup's own blank-line adjacency check, which guarantees each subsequent comment sits on its own physical line once the first is excluded).
 */
function isTrailingComment(sourceCode: TSESLint.SourceCode, comment: TSESTree.Comment): boolean {
  const tokenBefore = sourceCode.getTokenBefore(comment, { includeComments: false });

  return tokenBefore !== null && tokenBefore.loc.end.line === comment.loc.start.line;
}

/**
 * The maximal leading comment "group" directly attached to `anchor`: either a single already-consolidated `Block` comment, or the maximal run of consecutive `Line` comments, each immediately adjacent to the next (no blank line between any two) and each starting its own physical line, with the whole group sitting directly above `anchor` itself (no blank line separating the group from the declaration it documents). Returns `undefined` when `anchor` has no leading comment at all, when the nearest one is separated from `anchor` by a blank line (not really "attached" to it), or when the nearest one is itself a trailing comment on the code line above (`export const before = 1; // trailing note`, isTrailingComment above): that comment documents the PRECEDING statement, not `anchor`, so treating it as `anchor`'s own leading comment would misattribute code that happens to share a line with it as the comment's own text. The backward walk through an adjacent run of `//` lines stops at the same trailing-comment boundary for the identical reason: a trailing comment further up the run ends the group there rather than being absorbed into it, so only the genuine standalone-line comments immediately above `anchor` are ever included. `TSESTree.Comment['type']` also allows a third value, `'Shebang'`, for parser-agnostic compatibility, but confirmed directly that typescript-eslint's own parser (the only one this codebase's rules are ever run under) never actually produces one: a leading `#!` line is dropped before tokenizing rather than surfaced as a comment at all, so there is no real input on which `lastComment` here is ever anything but `'Block'` or `'Line'`, and no separate branch is written for the case that cannot occur.
 */
export function getLeadingCommentGroup(sourceCode: TSESLint.SourceCode, anchor: TSESTree.Node): readonly TSESTree.Comment[] | undefined {
  const comments = sourceCode.getCommentsBefore(anchor);
  const lastComment = comments.at(-1);
  if (lastComment === undefined) return undefined;
  if (anchor.loc.start.line - lastComment.loc.end.line > 1) return undefined;
  if (isTrailingComment(sourceCode, lastComment)) return undefined;
  if (lastComment.type === AST_TOKEN_TYPES.Block) return [lastComment];

  // `boundary` tracks the earliest comment added to the group so far (seeded with `lastComment` itself), compared against each older candidate walking backward. Tracking it in its own variable, rather than re-reading `group[0]` each iteration, sidesteps `noUncheckedIndexedAccess` entirely for a value that can never actually be empty (`group` only ever grows from its non-empty seed), so no unreachable `=== undefined` guard is needed for it.
  const group: TSESTree.Comment[] = [lastComment];
  let boundary = lastComment;
  for (const comment of comments.slice(0, -1).reverse()) {
    if (comment.type !== AST_TOKEN_TYPES.Line) break;
    if (boundary.loc.start.line - comment.loc.end.line > 1) break;
    if (isTrailingComment(sourceCode, comment)) break;
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
      const [groupFirstComment] = firstAndLastOrThrow(group);
      // Already a genuine `/** ... */` doc comment: left alone, whatever its length.
      if (groupFirstComment.type === AST_TOKEN_TYPES.Block && groupFirstComment.value.startsWith('*')) return;

      const lines = extractCommentLines(group);
      // A Line-comment run's own comments map one-to-one onto `lines` (one array entry per comment), so a directive line found anywhere in the run, whether first, in the middle, or immediately above `anchor`, can be sliced out of BOTH arrays together, in step, leaving only the genuine prose strictly above it eligible for its own report. A single already-consolidated Block comment has no such one-to-one mapping (one comment node can carry many extracted lines), so a directive found anywhere inside one is left alone entirely rather than risking a fix that touches only part of one physical comment node.
      const isLineRun = group.every((comment) => comment.type === AST_TOKEN_TYPES.Line);
      const directiveIndex = lines.findIndex((line) => isDirectiveComment(line));
      if (directiveIndex !== -1 && !isLineRun) return;
      const consideredLines = directiveIndex === -1 ? lines : lines.slice(0, directiveIndex);
      const consideredGroup = directiveIndex === -1 ? group : group.slice(0, directiveIndex);

      const [firstLine] = consideredLines;
      if (firstLine === undefined) return;

      const substantial = consideredLines.length >= 2 || firstLine.length > maxLineLength;
      if (!substantial) return;

      const [firstComment, lastComment] = firstAndLastOrThrow(consideredGroup);
      const indent = sourceCode.text.slice(firstComment.range[0] - firstComment.loc.start.column, firstComment.range[0]);
      const body = consideredLines.map((line) => (line.length > 0 ? `${indent} * ${line}` : `${indent} *`)).join('\n');
      const replacement = `/**\n${body}\n${indent} */`;
      // containsCommentTerminator is checked independently of, and never overridden by, parsesAsValidTsDoc: see its own doc comment for why a literal `*\/` withholds the fix regardless of what TSDoc itself thinks of the rest of the candidate text.
      const canAutofix = !containsCommentTerminator(consideredLines) && parsesAsValidTsDoc(replacement);

      context.report({
        loc: { start: firstComment.loc.start, end: lastComment.loc.end },
        messageId: 'preferDocComment',
        fix: canAutofix ? (fixer) => fixer.replaceTextRange([firstComment.range[0], lastComment.range[1]], replacement) : null,
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
      // Keyed on the VariableDeclaration itself, not each individual VariableDeclarator: a multi-declarator export (`export const h1 = () => {}, h2 = () => {};`) is still a single statement with a single leading comment group, so checking (and potentially reporting on) each declarator in turn would report the identical comment once per declarator. Reported once, on the declaration as a whole, whenever ANY of its declarators is a function/arrow-function init, matching the "an exported function expression or arrow function assigned to an exported const" shape this rule's own header comment enumerates.
      VariableDeclaration(node) {
        const hasFunctionInit = node.declarations.some(
          (declarator) => declarator.init?.type === AST_NODE_TYPES.ArrowFunctionExpression || declarator.init?.type === AST_NODE_TYPES.FunctionExpression,
        );
        if (!hasFunctionInit) return;
        checkAnchor(getExportWrapper(node));
      },
      MethodDefinition(node) {
        if (!isPublicMethod(node) || !isMethodOfExportedClass(node)) return;
        checkAnchor(node);
      },
    };
  },
});

export default preferDocComment;
