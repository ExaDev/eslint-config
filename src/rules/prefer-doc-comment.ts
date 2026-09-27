import { AST_NODE_TYPES, AST_TOKEN_TYPES, ESLintUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { TSDocParser } from '@microsoft/tsdoc';
import { firstAndLastOrThrow } from './prefer-options-object-param';

// This package's own convention (see jsdoc.ts's own header comment) already distinguishes a symbol with a real public contract, which gets a doc comment, from one that doesn't, which gets a plain comment or nothing at all. eslint-plugin-jsdoc's own `require-jsdoc` family is deliberately turned off (jsdoc.ts) rather than demanding a doc comment appear from nothing, since forcing every function everywhere to carry a JSDoc block is a different, much larger policy this package isn't making. This rule fills the one gap that leaves: a public symbol that already HAS a substantial leading comment, just not in the `/** ... */` shape eslint-plugin-jsdoc/eslint-plugin-tsdoc can actually validate. It never demands documentation that doesn't already exist in some form; it only upgrades the format of documentation that does, and only for a symbol this package's own convention already says warrants one (an exported declaration).
//
// Scope, deliberately bounded to exactly these five declaration shapes: an exported function declaration, an exported function expression or arrow function assigned to an exported `const`, an exported class declaration, an exported class's public method, and an exported interface/type-alias declaration. Deliberately NOT covered: a name exported later via a separate `export { x }` statement (a genuinely different, harder detection problem, real scope/binding analysis across the whole module rather than a single parent-chain check; see no-pointless-reassignment.ts's own `isExportedAlias` for what that would take, and note it solves a narrower problem, a single alias `const`, not this rule's five different declaration shapes); an ambient/declare-only signature (`TSDeclareFunction`, ambient class members); and an individual interface/type-alias member (only the declaration as a whole is checked, not each of its properties/methods). Each is a real, if rare, gap, not an oversight: extending to any of them is a distinct, separately-scoped follow-up, not a silent partial implementation of this one.
//
// A `/*! ... */` exclamation-marked license/banner block is exempted the same way @stylistic/eslint-plugin's own `multiline-comment-style` recognises one via its own `isExclamationComment` check (not itself enabled in this package's config, see stylistic-comments.ts's own header comment on why): checkAnchor below returns for any Block comment whose own `value` starts with `!`, before this rule's own "already a doc comment" check (`value.startsWith('*')`) even runs, since a single-export file with a banner directly above its export is an ordinary shape, not the theoretical one this rule once assumed.

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`,
);

// A directive-shaped LINE (the full ESLint directive/config-comment family, a TypeScript suppression comment, a `prettier-ignore`/`c8 ignore`/`v8 ignore`/`istanbul ignore` coverage or formatting directive, or a TODO/FIXME marker) is never itself absorbed into a `/** ... */` doc comment: none of these is a symbol's documentation at all, so promoting one would misrepresent it as such, and merging it bodily into a bigger block comment destroys it as a directive regardless of where it sits (ESLint/TypeScript/Prettier/the coverage tools all only ever recognise a directive comment as a whole, self-contained comment of its own, never a sentence buried inside a larger one; a lost `prettier-ignore` in particular lets Prettier reformat the very code the directive existed to protect, confirmed directly by running Prettier against a fixture where this rule's own fixer had swallowed one). checkAnchor below splits the group's own extracted lines at the FIRST directive line found anywhere in the run, not only the last: the lines strictly above it are still real, independently judgeable documentation prose (still eligible for their own report/fix), while the directive line and everything from it onward is excluded from the fix range entirely and left completely untouched.
//
// The ESLint family alone is not just `eslint-disable`: the installed eslint's own `lib/shared/directives.js`, read directly rather than assumed, defines the full recognised keyword set as `eslint(-env|-enable|-disable(-next-line|-line)?)?`, `exported`, `global(s)?`, and every one of those is mirrored in ESLINT_FAMILY_PATTERN below, `eslint-enable` (re-enabling a suppressed rule, exactly as load-bearing as the `eslint-disable` that opened it) and the configuration keywords `eslint`/`eslint-env`/`global`/`globals`/`exported` alike (an inline `/* eslint no-console: "error" */`, a file-level `/* eslint-env node */`, or a `/* global foo, bar */`/`/* exported foo */` marking a variable ESLint should treat as intentionally global/exported). That whole group is followed by its own `(?=\s|$)` lookahead, not merely the generic trailing `\b` every other alternative below relies on, mirroring the identical requirement in eslint's own `directivesPattern`: every one of these keywords is itself a real English-word prefix of an entirely ordinary hyphenated compound (`eslint-plugin-x`, `eslint-config-x`, `global-scoped`, `exported-members`), so a bare word-boundary check (satisfied the instant a hyphen follows a word character) would wrongly flag ordinary prose starting with one of those compounds as directive-shaped; requiring real whitespace or end-of-string immediately after the keyword itself is what a genuine directive always has (`eslint-enable no-console`, a bare `eslint-enable`) and an ordinary compound word never does.
//
// ESLINT_FAMILY_PATTERN is NOT case-insensitive, unlike every other pattern below, because eslint's own `directivesPattern` (read directly, again) is not either: `ESLint-disable`, `Global foo`, and `Exported foo` are never themselves live ESLint directives, only their exact-lowercase spellings are, so matching them case-insensitively here would exempt ordinary capitalised prose that merely opens with one of those words ("ESLint plugins resolve their rules lazily, ...", "Global registry of handlers, ...", "Exported for the CLI entry point, ...") from ever being reported at all, a real false negative this rule used to have, not "strictly more lenient" as an earlier version of this comment claimed.
//
// Of the ESLint family, `source-code.js`'s own `getInlineConfigNodes`/`getDisableDirectives` (read directly, not assumed) honour a `//` LINE comment ONLY for the two labels ESLINT_LINE_HONOURED_LABELS names below; every other member of the family (bare `eslint`, `eslint-env`, `eslint-enable`, `eslint-disable`, `global(s)`, `exported`) is a live directive only when written as a Block comment. A `//` line spelling one of those (`// eslint-enable is what this helper emits ...`) is therefore not a real ESLint directive at all, and this rule folding it into its own doc comment costs ESLint nothing, since ESLint was already ignoring it; isDirectiveComment below takes the comment's own `type` specifically to draw this distinction, and getProseGroupBefore/checkAnchor each pass the real type of the comment being tested, never a fixed assumption.
//
// TODO/FIXME are matched case-insensitively (`TODO`/`FIXME`/`Todo`/`todo` are all common in the wild) but restricted to the real marker shape, across two separate patterns rather than one with an optional captured marker (see ESLINT_FAMILY_PATTERN's own doc comment for why a captured group is avoided): TODO_FIXME_UPPERCASE_PATTERN recognises the all-uppercase spelling on its own, since no ordinary sentence opens a word that way, and TODO_FIXME_MARKED_PATTERN recognises any other casing only when immediately followed by `:` or `(` (`todo: revisit`, `fixme(scope): message`), the shape a real marker/tag is always written in; a bare `Todo `/`Fixme ` opening ordinary prose ("Todo list items are rendered ...") matches neither. Case-insensitive matching without this shape restriction was a second real false negative an earlier version of this rule had.
//
// OTHER_DIRECTIVE_PATTERN covers the remainder of the family, none of which carries an ESLint-style Line/Block restriction of its own, so each is recognised identically regardless of the comment's own type, case-insensitively throughout: matching the `ts-expect-error`/`prettier-ignore` families case-insensitively too is strictly more lenient here, never a false negative risk, since neither carries the ESLint family's own Line/Block distinction. The `ts-*` alternatives each carry an optional leading `@`: a real TypeScript suppression directive is always written `// @ts-expect-error`/`// @ts-ignore`/`// @ts-nocheck`/`// @ts-check`, never the bare `ts-expect-error` form with no `@` at all, and extractCommentLines never strips that `@` (only the single conventional space after `//`), so a pattern anchored on the bare form alone would never match a single real TypeScript directive in practice. The coverage-tool alternatives (`c8`/`v8`/`istanbul`) are always followed by a further keyword of their own (`ignore next`, `ignore next 3`, `ignore file`, `ignore else`, ...), never bare `ignore` alone, so the pattern requires at least the `ignore` keyword after the tool name and a following word boundary, matching every real variant without having to enumerate each one. `#region`/`#endregion` (an editor folding marker, VS Code's and JetBrains' own shared convention, never a symbol's own documentation any more than a suppression comment is) is recognised the same way: a real fixture written as one is always a whole, self-contained `//` comment of its own (`// #region helpers`), never prose that happens to start with a literal `#`, so the shared trailing `\b` is exactly as safe here as it already is for `todo`/`fixme`.
// Non-capturing throughout: the whole match (`RegExpExecArray`'s own index 0, always a real string, never `noUncheckedIndexedAccess`-optional the way a numbered group beyond it would be) is exactly the label text on its own, since the trailing `(?=\s|$)` lookahead is zero-width and contributes nothing to the matched text. Reading the label off index 0 rather than a captured group 1 needs no destructured fallback default for a branch no real match can ever actually take (a mandatory, un-nested alternation always populates index 0 when the pattern matches at all), the exact dead, uncoverable code a fallback default would otherwise be.
const ESLINT_FAMILY_PATTERN = /^(?:eslint(?:-env|-enable|-disable(?:-next-line|-line)?)?|exported|globals?)(?=\s|$)/u;
const ESLINT_LINE_HONOURED_LABELS: ReadonlySet<string> = new Set(['eslint-disable-line', 'eslint-disable-next-line']);
// Split into two patterns, not one with an optional captured marker, for the identical reason ESLINT_FAMILY_PATTERN above reads its label off index 0 rather than a group: a captured, genuinely optional group still needs a destructured `undefined` fallback typed away, and testing each shape with its own `.test()` (a plain boolean, no captured text to extract at all) needs none.
const TODO_FIXME_UPPERCASE_PATTERN = /^(?:TODO|FIXME)\b/u;
const TODO_FIXME_MARKED_PATTERN = /^(?:todo|fixme)\b[:(]/iu;
const OTHER_DIRECTIVE_PATTERN = /^(?:@?ts-(?:expect-error|ignore|nocheck|check)|prettier-ignore|(?:c8|v8|istanbul)\s+ignore|#(?:end)?region)\b/iu;

/**
 * A comment's own `type`/`value` fields are all extractCommentLines below actually reads. Narrowed to just those two (rather than the full `TSESTree.Comment`, which also carries `range`/`loc`) so the internal unit test can hand it plain, hand-written literal objects with no risk of drifting from the real parser's own Comment shape, since neither field's own meaning can drift: `type` is always exactly `'Block' | 'Line' | 'Shebang'` and `value` is always exactly the text between the comment's own delimiters, for any parser.
 */
export interface CommentLike {
  readonly type: TSESTree.Comment['type'];
  readonly value: string;
}

/**
 * The number of leading space characters every non-blank line in `lines` shares, the amount a shared left margin (a hand-written block's own body indentation, aligned however its author chose) can be stripped from every line at once while leaving any EXTRA indentation a particular line carries beyond that margin (a nested example, a sub-list) exactly as it was, relative to its neighbours. A blank line (all whitespace or empty) never lowers the shared amount: it carries no indentation of its own to compare, only whichever real content lines happen to surround it. Zero for an empty `lines`, or one all-blank: there is no real content to measure a margin from at all (`Math.min` of an empty spread would otherwise return `Infinity`, a value extractCommentLines' own caller never actually observes, since a blank line is always reduced to `''` before this value could apply to it, but a real margin of `Infinity` would misrepresent this function's own general contract to any other, future caller).
 */
export function commonLeadingWhitespace(lines: readonly string[]): number {
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
 * The comment group's own text, one array entry per ORIGINAL logical line, verbatim aside from stripping exactly the padding a bare-`/* `/`// ` delimiter itself adds (never the author's own further indentation, a real part of the content some lines may carry more of than others), regardless of whether the group is a run of `//` lines or a single already-consolidated bare block comment (both are real inputs this rule must handle identically: a hand-written bare block is an ordinary source shape on its own, and a consumer who separately enables `@stylistic/eslint-plugin`'s own `multiline-comment-style` themselves may also have its bare-block fixer convert a `//` run into one by the time ESLint's multi-pass autofix reaches this rule, this package's own config no longer wires the two together, see stylistic-comments.ts's own header comment on why). A `Line`-type group is one array entry per comment, each with its own single leading delimiter-space (see stripSingleLeadingSpace) stripped and trailing whitespace trimmed (never meaningful). A `Block`-type group's own `.value` is split on its internal linebreaks: the FIRST physical line sits on the same source line as the opening `/*` itself, so it gets the identical single-leading-space treatment as a `//` line; every line after it is a genuine physical line of the block's own body, sharing one left margin (see commonLeadingWhitespace) that is stripped from all of them together so their RELATIVE indentation survives. The opening and closing physical lines are each dropped entirely when they trim to nothing (the pure indentation/closing-delimiter padding a bare-block fixer's own template inserts around the real content, see stylistic-comments.ts's own trace through its `convertToBlock` helper), never when either carries real content of its own (a hand-written single-physical-line block never reaches this branch at all, since `split` on no internal linebreak yields exactly one segment, returned as-is); a blank line genuinely in the MIDDLE of the body (a paragraph separator) is kept, as an empty string, rather than dropped, since it is real structure the author put there, not delimiter padding.
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
  // No separate blank-line branch: slicing any all-whitespace (or empty) line at `dedent` and trimming its end always yields '' on its own, for every reachable `dedent` (a substring of an all-whitespace string is itself all-whitespace or empty either way), so the ternary this once was would only ever restate what `.slice(dedent).trimEnd()` already computes.
  const ownBodyLines = ownBodyRaw.map((line) => line.slice(dedent).trimEnd());
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
  // No separate `contentLines.length === 0` disjunct: `[].every(...)` is vacuously true, so an empty `contentLines` already makes the lone `!every(...)` check below true on its own, and every one of `lines`' own entries is then, by this same filter's own definition, the literal empty string `''`, which `.replace(STARRED_BLOCK_LINE_PATTERN, '')` always leaves as `''` regardless (nothing in an empty string can match a pattern requiring at least one `*`), so falling through here and returning early both produce the identical result.
  if (!contentLines.every((line) => STARRED_BLOCK_LINE_PATTERN.test(line))) return [...lines];

  return lines.map((line) => line.replace(STARRED_BLOCK_LINE_PATTERN, ''));
}

/**
 * Whether `text` (the first extracted line, per extractCommentLines) opens with one of the recognised directive markers, given `commentType` (the real comment's own `type`, Line or Block): the ESLint family's own Line-restricted subset (ESLINT_LINE_HONOURED_LABELS) is applied only when `commentType` is Line, exactly matching what eslint's own `source-code.js` itself honours there. Matched against `text.trimStart()`, never the raw `text`: extractCommentLines' own stripSingleLeadingSpace deliberately strips only the single conventional space right after `//`/`/*`, leaving any FURTHER leading whitespace (a second space, a tab) on the line untouched, since that is the author's own deliberate content indentation for a real prose line. A live directive, though, is never indented that way by the tools that honour it: ESLint's own directive comments are matched with their value trimmed (`value.trim()` in `getDirectiveComment`), Prettier's `prettier-ignore` check is `comment.value.trim() === 'prettier-ignore'`, and TypeScript's own `commentDirectiveRegExSingleLine` allows arbitrary leading whitespace before the `@ts-*` marker, so `//   eslint-disable-next-line no-console`, `//\tprettier-ignore` and `//  @ts-expect-error` are all still live directives for their own tool, whatever whitespace sits between the `//` and the marker. Trimming here, rather than teaching extractCommentLines to strip more, keeps that deliberate indentation-preservation behaviour intact for genuine prose while still recognising every one of these as the directive it is.
 */
export function isDirectiveComment(text: string, commentType: TSESTree.Comment['type']): boolean {
  const trimmed = text.trimStart();
  const eslintMatch = ESLINT_FAMILY_PATTERN.exec(trimmed);
  // eslintMatch's own index 0 (see ESLINT_FAMILY_PATTERN's own doc comment for why that, not a captured group, is the label): always a real string whenever eslintMatch itself is non-null, by definition.
  if (eslintMatch !== null) return commentType !== AST_TOKEN_TYPES.Line || ESLINT_LINE_HONOURED_LABELS.has(eslintMatch[0]);
  if (TODO_FIXME_UPPERCASE_PATTERN.test(trimmed) || TODO_FIXME_MARKED_PATTERN.test(trimmed)) return true;

  return OTHER_DIRECTIVE_PATTERN.test(trimmed);
}

/**
 * Whether `comment` is a `///` triple-slash directive (`/// <reference types="..." />`, `/// <reference path="..." />`, `/// <reference lib="..." />`, `/// <amd-module name="..." />`, ...), TypeScript's own ambient-reference/AMD-module syntax, never itself the symbol's documentation, so it must never be folded into a doc comment any more than an `eslint-disable`/`@ts-expect-error`/`prettier-ignore` line is. Checked against `comment`'s own UN-stripped `value` specifically, never the extracted, delimiter-space-stripped line isDirectiveComment's own patterns are matched against: the tokeniser leaves a genuine `///` comment's `value` starting directly with the lone third slash and no space at all (`/ <reference ... />`), while an ordinary `//` comment that merely happens to start its own prose with a slash (`// / test`, `// /etc/passwd`) always carries the single conventional space between the `//` delimiter and that content, so its own `value` starts with a space, never a bare `/`. Testing the raw `value` is what tells the two apart; testing the already-stripped extracted line could not, since stripSingleLeadingSpace would have removed that one distinguishing space from the ordinary-prose case too.
 */
export function isTripleSlashDirective(comment: CommentLike): boolean {
  return comment.type === AST_TOKEN_TYPES.Line && comment.value.startsWith('/');
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
 * Whether `moduleDeclaration` (a namespace/module `node` sits inside, per isAtPublicSurface below) is itself exported, checked recursively so a doubly-nested namespace (`export namespace A { export namespace B { ... } }`) requires every enclosing namespace to be exported too, not merely the innermost one. A `declare global { ... }` augmentation is never itself wrapped in an export (there is no such syntax as `export declare global`), so its own TSModuleDeclaration always fails this check, exactly like a plain non-exported `namespace Internal { ... }`: neither ever reaches the `ExportNamedDeclaration` branch below, and anything inside either is correctly never treated as part of the module's public surface.
 */
function isNamespaceExported(moduleDeclaration: TSESTree.TSModuleDeclaration): boolean {
  const { parent } = moduleDeclaration;
  if (parent.type === AST_NODE_TYPES.ExportNamedDeclaration) return isAtPublicSurface(parent);

  return false;
}

/**
 * Whether `wrapper` (an export wrapper already found by getExportWrapper below) genuinely sits at the module's public surface, rather than inside a namespace that is not itself exported: either directly at Program level, or inside a `TSModuleBlock` whose own enclosing `TSModuleDeclaration` is itself exported (isNamespaceExported above, applied recursively for a nested namespace). `namespace Internal { export function hidden() {} }`'s own inner `export function hidden` has an immediate `ExportNamedDeclaration` wrapper exactly like a real top-level export does, but that wrapper's own parent is the namespace's `TSModuleBlock`, not `Program`, and `Internal` itself is never exported, so this returns `false` for it, matching the README's own promise that a non-exported declaration is never reported regardless of its comment.
 */
function isAtPublicSurface(wrapper: ExportWrapper): boolean {
  const { parent } = wrapper;
  // A single boolean expression, not a third `if`/`return false` branch: `export ...` is only ever legal directly at Program level or directly inside a namespace/module body (TSModuleBlock), never anywhere else, so a third, `neither`, branch is unreachable through any real parse and would be dead code no test could ever exercise.

  return parent.type === AST_NODE_TYPES.Program || (parent.type === AST_NODE_TYPES.TSModuleBlock && isNamespaceExported(parent.parent));
}

/**
 * `node`'s own immediate parent, narrowed to an export wrapper, when `node` is written as a direct/inline export (`export function f() {}`, `export default class {}`) AND that wrapper genuinely sits at the module's public surface (isAtPublicSurface above), never merely inside some enclosing namespace that is not itself exported. See this file's own header comment for why a name exported later via a separate `export { x }` statement is deliberately out of scope, rather than handled here too.
 */
export function getExportWrapper(node: TSESTree.Node): ExportWrapper | undefined {
  const { parent } = node;
  // `parent` is only ever nullish here for a Program node (the one node type with no parent at all), which this function is never called with in practice: every real caller below passes a declaration/class-body-member node, never the Program itself. A plain truthiness check, not `=== undefined`: `parent` is declared as `Node | undefined` in typescript-eslint's own types, but confirmed directly that ESLint's real traversal sets it to `null` at runtime for a genuine Program node, not `undefined` (a real type/runtime mismatch, the same class of lying field type no-enum-reverse-lookup-widening.ts's own comment on `Type.symbol` already documents elsewhere in this codebase); a direct `=== null` comparison against the declared type is flagged as impossible by this repo's own no-unnecessary-condition, where the equivalent truthiness check is not, since it reads as a check against the type's own `undefined` branch while still catching the real runtime `null` value too.
  if (!parent) return undefined;
  if ((parent.type === AST_NODE_TYPES.ExportNamedDeclaration || parent.type === AST_NODE_TYPES.ExportDefaultDeclaration) && isAtPublicSurface(parent)) return parent;

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
 * The `range` field isBeforeByRange below actually reads off each of its two arguments. Narrowed to just that (rather than the full `TSESTree.Decorator`/`ExportWrapper`, which also carry `type`/`loc`/`parent`, and, for a wrapper, `declaration`/`exportKind`) so the internal unit test can hand it plain, hand-written literal objects pinning the exact boundary a real parse can never reach, with no risk of drifting from the real parser's own shape: `range` alone can never itself drift, being always exactly `[start, end]` for any node, for any parser.
 */
export interface RangedNode {
  readonly range: readonly [number, number];
}

/**
 * Whether `a` starts strictly before `b`, by their own `range[0]`. A plain `<`, never `<=`: two distinct real tokens (a decorator and the export wrapper it may sit before, getDecoratedAnchor's own only real caller) can never share the identical start a real parse would produce, so this boundary is unreachable through the rule itself, but the function's own general contract still needs a real answer for it, confirmed directly rather than left to whichever `<`/`<=` happened to be written.
 */
export function isBeforeByRange(a: RangedNode, b: RangedNode): boolean {
  return a.range[0] < b.range[0];
}

/**
 * The node whose own leading comment actually documents an exported class. TypeScript itself accepts a decorated exported class declaration written either way around the `export` keyword, `@dec export class Foo {}` or `export @dec class Foo {}` (confirmed directly by compiling both with the installed `typescript`, `experimentalDecorators` on and off alike; neither is a syntax error), but only the FIRST places the decorator's own range strictly before `wrapper`'s own start (confirmed directly against the real parser's own node ranges, not assumed): in that shape, `sourceCode.getCommentsBefore(wrapper)` finds nothing at all, since the decorator is a real code token, not a comment, sitting immediately before `wrapper`'s own start, so any real comment further up is above the decorator, never "directly before" the wrapper in the sense getCommentsBefore actually checks. In the second shape the decorator instead sits INSIDE `wrapper`'s own range (after `export`), so `wrapper`'s own start is already the correct anchor and needs no adjustment at all. A class's own `decorators` array can hold more than one entry (`@a @b export class Foo {}`), but only the FIRST is ever compared here: it is always the syntactically leftmost, so it alone can ever sit before `wrapper`.
 */
export function getDecoratedAnchor(node: TSESTree.ClassDeclaration, wrapper: ExportWrapper): TSESTree.Node {
  const [firstDecorator] = node.decorators;
  if (firstDecorator !== undefined && isBeforeByRange(firstDecorator, wrapper)) return firstDecorator;

  return wrapper;
}

/**
 * Whether `comment` sits on the same physical line as a real CODE token before it (a genuine trailing comment, `const before = 1; // note`), rather than starting its own line. `sourceCode.getTokenBefore` is called with no options at all, deliberately: `includeComments` already defaults to `false` (confirmed directly against the installed eslint's own token-store source), so passing `{ includeComments: false }` explicitly would only restate that default, never change it, leaving no real difference for a test to ever observe. Left at its default, the search skips past any EARLIER comment, an unrelated one merely sharing `comment`'s own physical line (an aside block comment immediately followed by this one), to the nearest real code token specifically; without that skip, an unrelated comment sharing the line would be mistaken for real code and the check would wrongly say "trailing". A run of several adjacent `//` lines is only ever flagged here on its very first member, the one that can actually share a line with preceding code; every later member in the same run is already known to start its own line (see getLeadingCommentGroup's own blank-line adjacency check, which guarantees each subsequent comment sits on its own physical line once the first is excluded).
 */
export function isTrailingComment(sourceCode: TSESLint.SourceCode, comment: TSESTree.Comment): boolean {
  const tokenBefore = sourceCode.getTokenBefore(comment);

  return tokenBefore !== null && tokenBefore.loc.end.line === comment.loc.start.line;
}

/**
 * The maximal leading comment "group" directly attached to `anchor`: the real prose that documents it, never a self-contained directive sitting between the two. A directly-adjacent run of one or more directive-shaped `Line` comments (skipped by getProseGroupBefore below, whether that leaves a single already-consolidated `Block` comment or a further run of `Line` comments as the real group) is walked past entirely rather than included, so the genuine documentation is still found even when it sits in a DIFFERENT comment shape from the directive immediately below it. What getProseGroupBefore then returns is either a single `Block` comment, or the maximal run of consecutive `Line` comments, each immediately adjacent to the next (no blank line between any two) and each starting its own physical line, with the whole group sitting directly above whatever it was found beneath (no blank line separating the group from it). Returns `undefined` when `anchor` has no leading comment at all, when the nearest real one is separated by a blank line (not really "attached" to what is below it), or when the nearest one is itself a trailing comment on the code line above (`export const before = 1; // trailing note`, isTrailingComment above): that comment documents the PRECEDING statement, not `anchor`, so treating it as `anchor`'s own leading comment would misattribute code that happens to share a line with it as the comment's own text. The backward walk through an adjacent run of `//` lines stops at the same trailing-comment boundary for the identical reason: a trailing comment further up the run ends the group there rather than being absorbed into it, so only the genuine standalone-line comments immediately above are ever included. `TSESTree.Comment['type']` also allows a third value, `'Shebang'`, for parser-agnostic compatibility, but confirmed directly that typescript-eslint's own parser (the only one this codebase's rules are ever run under) never actually produces one: a leading `#!` line is dropped before tokenizing rather than surfaced as a comment at all, so there is no real input on which `lastComment` here is ever anything but `'Block'` or `'Line'`, and no separate branch is written for the case that cannot occur.
 */
export function getLeadingCommentGroup(sourceCode: TSESLint.SourceCode, anchor: TSESTree.Node): readonly TSESTree.Comment[] | undefined {
  return getProseGroupBefore(sourceCode, anchor.loc.start.line, sourceCode.getCommentsBefore(anchor));
}

/**
 * getLeadingCommentGroup's own worker, recursive so a directly-adjacent run of directive-shaped Line comments (an eslint-disable family comment, a TypeScript suppression comment, or a TODO/FIXME marker) sitting directly under `beforeLine` is skipped entirely, one comment per recursive step, until the real prose comment above it, if any, is reached: a self-contained directive is never itself the group's own prose, and skipping past it here (rather than merely slicing it back out again once it has already forced the SAME-type-only walk below to stop early) is what lets the prose above be found at all when it is a DIFFERENT comment shape from the directive sitting below it, a `Block` bare-block comment (a hand-written one, or one a consumer's own separately-enabled `@stylistic/eslint-plugin` `multiline-comment-style` produced; that rule's installed release does NOT reliably leave a directive out of the run it merges, only the narrow `eslint`/`jshint`/`jslint`/`istanbul`/`globals`/`exported`/`jscs` family, which is exactly why this package's own config no longer enables it, see stylistic-comments.ts's own header comment for the confirmed defect and its tracking issues) beneath a `Line` directive, or vice versa. `beforeLine` stands in for the real anchor's own `loc.start.line` on the initial call, and for the skipped directive's own `loc.start.line` on every recursive one, so the adjacency check below always measures against whatever genuinely sits directly below the comment currently being considered.
 */
function getProseGroupBefore(sourceCode: TSESLint.SourceCode, beforeLine: number, comments: readonly TSESTree.Comment[]): readonly TSESTree.Comment[] | undefined {
  const lastComment = comments.at(-1);
  if (lastComment === undefined) return undefined;
  if (beforeLine - lastComment.loc.end.line > 1) return undefined;
  if (isTrailingComment(sourceCode, lastComment)) return undefined;

  if (lastComment.type === AST_TOKEN_TYPES.Line) {
    if (isTripleSlashDirective(lastComment)) return getProseGroupBefore(sourceCode, lastComment.loc.start.line, comments.slice(0, -1));
    const [soleLine] = extractCommentLines([lastComment]);
    if (soleLine !== undefined && isDirectiveComment(soleLine, AST_TOKEN_TYPES.Line)) return getProseGroupBefore(sourceCode, lastComment.loc.start.line, comments.slice(0, -1));
  }

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

/**
 * `match`'s own index-0 element, or `''` for both a genuinely absent match (`match` itself `null`) and the type system's own `noUncheckedIndexedAccess` view of a real, non-null match's index 0 (never actually absent there: a real `RegExp#exec` result's own index 0 is always the whole match, by definition never a hole). Narrowed to a plain `readonly string[]` rather than the exact `RegExpExecArray` type, since nothing here reads any of that type's other fields: this is a small, directly testable helper specifically so its own "index 0 absent" fallback, unreachable through every real caller in this file (each already confirmed its own regex can never itself return a matchless `null`), still gets exercised directly, the same "caller already confirmed" shape firstAndLastOrThrow's own direct empty-array test uses for its sibling helper.
 */
export function firstMatchOrEmpty(match: readonly string[] | null): string {
  const [first = ''] = match ?? [];

  return first;
}

/**
 * The line-break sequence, `\n` or `\r\n`, actually used right after `fromIndex` in `text`: the file's own real convention, whichever it happens to be, so the fixer's own replacement (which needs a line break between the opening delimiter and the first body line, between every body line, and before the closing one) never introduces the OTHER convention into a file that consistently uses just one, corrupting a CRLF file with LF-only breaks the moment it splices in fresh text of its own. checkAnchor's own call site below passes `lastComment.range[1]` (the index right after the considered group's own closing delimiter), never `firstComment.range[0]` (the index right at its opening one): a bare block comment can itself already contain an internal `\n` that is NOT the file's own real convention (a hand-written one, or, more commonly, one `@stylistic/eslint-plugin`'s own `multiline-comment-style` bare-block fixer generated, which hard-codes `\n` inside its own replacement text regardless of the file's real line-break convention, confirmed directly against the installed rule's own source), and reading forward from the group's own START would find that internal break first, silently adopting the WRONG convention into this rule's own replacement in a CRLF file. Reading from right after the group's own END instead always lands in real, untouched source text (either the genuine break before `anchor`, or, when a trailing directive was sliced out of the group, the genuine break before that directive), never inside a comment's own internal body a previous pass may already have rewritten. Returns `'\n'` when no line break is found anywhere in `text` from `fromIndex` onward: unreachable through the rule itself (a comment group and whatever follows it, `anchor` or an excluded trailing directive, are always on different physical lines, per getLeadingCommentGroup's own adjacency check, which guarantees a real break sits between the group's own end and whatever follows), but this function's own general contract still needs an answer for that case.
 */
export function detectLineBreak(text: string, fromIndex: number): string {
  const match = /\r\n|\n/.exec(text.slice(fromIndex));

  return match === null ? '\n' : match[0];
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
      // A `/*!` license/banner block: left alone, whatever its length, the same as an already-consolidated `/**` doc comment below, and checked first since a banner's own `!` and a doc comment's own `*` are mutually exclusive first characters, never both worth testing for the same comment.
      if (groupFirstComment.type === AST_TOKEN_TYPES.Block && groupFirstComment.value.startsWith('!')) return;
      // Already a genuine `/** ... */` doc comment: left alone, whatever its length.
      if (groupFirstComment.type === AST_TOKEN_TYPES.Block && groupFirstComment.value.startsWith('*')) return;

      const lines = extractCommentLines(group);
      // A Line-comment run's own comments map one-to-one onto `lines` (one array entry per comment), so a directive line found anywhere in the run, whether first, in the middle, or immediately above `anchor`, can be sliced out of BOTH arrays together, in step, leaving only the genuine prose strictly above it eligible for its own report. A single already-consolidated Block comment has no such one-to-one mapping (one comment node can carry many extracted lines), so a directive found anywhere inside one is left alone entirely rather than risking a fix that touches only part of one physical comment node. getLeadingCommentGroup only ever returns one of two homogeneous shapes, a single-element Block group or an all-Line run, never a mix of the two, so `groupFirstComment`'s own type already tells us which one this is, with no need to check every element in step.
      const isLineRun = groupFirstComment.type === AST_TOKEN_TYPES.Line;
      // `group[index]` is checked for isTripleSlashDirective alongside the extracted-text isDirectiveComment check on `line` itself: a `///` triple-slash directive's raw, un-stripped comment value is what actually distinguishes it from ordinary prose (see isTripleSlashDirective's own doc comment), never the already delimiter-stripped `line` text isDirectiveComment's own patterns match against. No separate `isLineRun` guard: a Block group's own one comment node has no one-to-one mapping onto `lines` (per this file's own header comment on extractCommentLines), so `group[index]` is genuinely `undefined` for every `index` beyond that single element, already excluded by the `candidate !== undefined` check below; at `index` 0 the candidate is that Block comment itself, which isTripleSlashDirective's own type check already rejects (a `///` directive can only ever be tokenised as a Line comment). A separate `isLineRun &&` guard here would be provably redundant, never observably different for any real input, which is exactly why an earlier version of this check that added one left an equivalent, unkillable mutant behind. `isDirectiveComment` is passed `groupFirstComment.type`, not a fixed assumption: the group is always homogeneous (a single Block comment, or an all-Line run, per getLeadingCommentGroup's own contract), so that one type applies to every line in the group alike, and it is what lets a Line-only-honoured ESLint label (see ESLINT_LINE_HONOURED_LABELS's own doc comment) differ from the identical text sitting in a Block comment.
      const directiveIndex = lines.findIndex((line, index) => {
        if (isDirectiveComment(line, groupFirstComment.type)) return true;
        const candidate = group[index];

        return candidate !== undefined && isTripleSlashDirective(candidate);
      });
      if (directiveIndex !== -1 && !isLineRun) return;
      const consideredLines = directiveIndex === -1 ? lines : lines.slice(0, directiveIndex);
      const consideredGroup = directiveIndex === -1 ? group : group.slice(0, directiveIndex);

      const [firstLine] = consideredLines;
      if (firstLine === undefined) return;

      const substantial = consideredLines.length >= 2 || firstLine.length > maxLineLength;
      if (!substantial) return;

      const [firstComment, lastComment] = firstAndLastOrThrow(consideredGroup);
      const rawLinePrefix = sourceCode.text.slice(firstComment.range[0] - firstComment.loc.start.column, firstComment.range[0]);
      // Only the prefix's own leading run of whitespace, never the prefix verbatim: a genuine indentation prefix is all whitespace, but isTrailingComment only ever excludes a comment sharing its own line with real CODE, not with an EARLIER comment (`/* aside */ // real comment`), so `rawLinePrefix` can itself carry real, non-whitespace text here. Splicing that text onto every continuation line and the closing delimiter (the fixer's own previous behaviour) reproduces it there too, corrupting the file; taking only the leading whitespace run leaves the fixer's own continuation lines and closing `*/` at column zero instead, which is always valid, if visually unaligned with whatever precedes the comment's own opening `/**` on its first line.
      // No leading `^` anchor: a bare `\s*` still only ever matches starting at index 0 anyway, since `exec` always tries the earliest position first and a `*` quantifier always succeeds there with a zero-length match at worst, for every input including one with no leading whitespace at all; confirmed directly across every real shape this can be called with (empty, all-whitespace, no leading whitespace, and a non-whitespace prefix), an anchor genuinely changes nothing here, so keeping it would be dead syntax a mutation test could never distinguish from its own removal.
      const indent = firstMatchOrEmpty(/\s*/.exec(rawLinePrefix));
      // lastComment.range[1], never firstComment.range[0]: see detectLineBreak's own doc comment for why reading from the group's own END, not its START, is what keeps this immune to a bare block's own internal, possibly wrong-convention line break.
      const lineBreak = detectLineBreak(sourceCode.text, lastComment.range[1]);
      const body = consideredLines.map((line) => (line.length > 0 ? `${indent} * ${line}` : `${indent} *`)).join(lineBreak);
      const replacement = `/**${lineBreak}${body}${lineBreak}${indent} */`;
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
        const wrapper = getExportWrapper(node);
        checkAnchor(wrapper === undefined ? undefined : getDecoratedAnchor(node, wrapper));
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
