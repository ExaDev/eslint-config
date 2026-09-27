import { AST_TOKEN_TYPES, ESLintUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import {
  commonLeadingWhitespace,
  containsCommentTerminator,
  detectLineBreak,
  extractCommentLines,
  firstMatchOrEmpty,
  getExportWrapper,
  isBeforeByRange,
  isDirectiveComment,
  isTrailingComment,
  parsesAsValidTsDoc,
  stripStarredBlockPrefix,
} from './prefer-doc-comment';

function definedOrThrow<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Unreachable: expected the probe rule below to have captured this value.');
  }

  return value;
}

// getExportWrapper's own `parent === undefined` guard is unreachable through the rule itself (every real call site hands it a declaration/class-body-member node, never a Program), but the function's own general contract (it accepts any TSESTree.Node) still needs a real Program node to exercise it directly, the same "caller already confirmed" shape firstAndLastOrThrow's own direct empty-array test uses for its sibling helper. A real Program node's own `.parent` is only ever obtainable from a genuine parse (Program is the one node type with no parent at all), not safely hand-fabricated.
let capturedProgram: TSESTree.Program | undefined;
const probeCreateRule = ESLintUtils.RuleCreator((name) => name);
const probe = probeCreateRule({
  name: 'probe',
  meta: { type: 'problem', schema: [], docs: { description: 'probe' }, messages: { hit: 'hit' } },
  defaultOptions: [],
  create(context) {
    return {
      Program(node) {
        capturedProgram = node;
        context.report({ node, messageId: 'hit' });
      },
    };
  },
});

new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } }).run('probe', probe, {
  valid: [],
  invalid: [{ code: 'const x = 1;', errors: [{ messageId: 'hit' }] }],
});

// isTrailingComment needs a real SourceCode (for getTokenBefore) and real Comment nodes in a genuine positional relationship a hand-written CommentLike object cannot supply, captured via a second probe rule over one fixture carrying both shapes its own doc comment describes: a comment genuinely trailing real code on its own line, and a comment merely sharing ITS line with an EARLIER, unrelated comment rather than real code.
let capturedCommentsSourceCode: TSESLint.SourceCode | undefined;
const commentsProbe = probeCreateRule({
  name: 'comments-probe',
  meta: { type: 'problem', schema: [], docs: { description: 'probe' }, messages: { hit: 'hit' } },
  defaultOptions: [],
  create(context) {
    return {
      Program(node) {
        capturedCommentsSourceCode = context.sourceCode;
        context.report({ node, messageId: 'hit' });
      },
    };
  },
});

new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } }).run('comments-probe', commentsProbe, {
  valid: [],
  invalid: [
    {
      code: 'const a = 1; // real trailing\n\nconst b = 2;\n/* aside */ // note\nexport function foo() {}',
      errors: [{ messageId: 'hit' }],
    },
  ],
});

// extractCommentLines only ever reads a comment's own `type`/`value` fields (see CommentLike's own doc comment), so a plain hand-written literal object is a safe, drift-free stand-in for a real TSESTree.Comment here, unlike the node/scope fabrication this codebase's own similarly-shaped internal tests (prefer-options-object-param.internal.unit.test.ts) deliberately avoid.
describe('extractCommentLines', () => {
  it('returns an empty array for an empty group', () => {
    // Never reached through the rule itself (getLeadingCommentGroup always returns a non-empty group), but extractCommentLines's own general contract still answers this the same way firstAndLastOrThrow's own direct empty-array test does for its sibling helper.
    expect(extractCommentLines([])).toEqual([]);
  });

  it('returns one entry per Line comment, each with its own single leading space trimmed', () => {
    expect(
      extractCommentLines([
        { type: AST_TOKEN_TYPES.Line, value: ' first' },
        { type: AST_TOKEN_TYPES.Line, value: ' second' },
      ]),
    ).toEqual(['first', 'second']);
  });

  it('returns a single entry, trimmed, for a single-physical-line Block comment', () => {
    expect(extractCommentLines([{ type: AST_TOKEN_TYPES.Block, value: ' short ' }])).toEqual(['short']);
  });

  it('splits a multi-physical-line Block comment on its own linebreaks, dropping only a genuinely empty first/last segment', () => {
    expect(extractCommentLines([{ type: AST_TOKEN_TYPES.Block, value: ' one\n   two\n   three ' }])).toEqual(['one', 'two', 'three']);
  });

  it('keeps a non-empty first segment (does not assume it is always pure padding)', () => {
    expect(extractCommentLines([{ type: AST_TOKEN_TYPES.Block, value: 'one\ntwo\nthree' }])).toEqual(['one', 'two', 'three']);
  });

  it('returns an empty array for a Block comment containing nothing but blank lines', () => {
    expect(extractCommentLines([{ type: AST_TOKEN_TYPES.Block, value: '\n' }])).toEqual([]);
  });

  it('strips only the single conventional space after `//`, preserving further leading whitespace as real content indentation', () => {
    expect(extractCommentLines([{ type: AST_TOKEN_TYPES.Line, value: '   indented example line' }])).toEqual(['  indented example line']);
  });

  it('dedents every own-body physical line of a multi-line Block by their SHARED leading margin, preserving one indented further than its neighbours relative to them', () => {
    expect(extractCommentLines([{ type: AST_TOKEN_TYPES.Block, value: ' one\n   two\n     three\n   four ' }])).toEqual(['one', 'two', '  three', 'four']);
  });

  it('keeps a genuinely blank MIDDLE physical line of a Block as an empty string (a paragraph separator), distinct from a blank first/last line, which is dropped', () => {
    expect(extractCommentLines([{ type: AST_TOKEN_TYPES.Block, value: ' one\n\n   two ' }])).toEqual(['one', '', 'two']);
  });

  it('drops a blank first AND last physical line while dedenting the real body lines between them by their own shared margin', () => {
    expect(extractCommentLines([{ type: AST_TOKEN_TYPES.Block, value: '\n   alpha\n   beta\n' }])).toEqual(['alpha', 'beta']);
  });

  it('strips a hand-written starred block\'s own leading marker after dedenting, converging on the same lines a bare block would produce', () => {
    expect(extractCommentLines([{ type: AST_TOKEN_TYPES.Block, value: '\n * A starred block\n * second line\n ' }])).toEqual(['A starred block', 'second line']);
  });

  it('excludes a whitespace-only (not merely empty) own-body line from the shared dedent margin, distinct from a real content line', () => {
    // Pins commonLeadingWhitespace's own `.trim()` check specifically: a mutant weakening it to a bare `.length > 0` would wrongly fold the all-space line's own 3-space indent into the margin, dedenting 'two' by 3 instead of the real body's own 5, leaving '  two' rather than 'two'.
    expect(extractCommentLines([{ type: AST_TOKEN_TYPES.Block, value: ' one\n   \n     two ' }])).toEqual(['one', '', 'two']);
  });

  it('drops a whitespace-only (not merely empty) FIRST physical line as delimiter padding, not real content', () => {
    // Pins firstKept's own `.trim()` check: a mutant weakening it to a bare `.length > 0` would keep this all-space line as a spurious leading empty entry.
    expect(extractCommentLines([{ type: AST_TOKEN_TYPES.Block, value: '   \n   real content\n   more ' }])).toEqual(['real content', 'more']);
  });

  it('trims trailing whitespace off the FIRST physical line after stripping its own single leading space', () => {
    // Pins the `.trimEnd()` specifically (not `.trimStart()`, which would leave this line's own trailing spaces in place): the first line carries no further leading indentation of its own to preserve here, only trailing padding before the next physical line begins.
    expect(extractCommentLines([{ type: AST_TOKEN_TYPES.Block, value: ' first line   \n   second' }])).toEqual(['first line', 'second']);
  });
});

describe('commonLeadingWhitespace', () => {
  it('returns 0 for an empty array', () => {
    expect(commonLeadingWhitespace([])).toBe(0);
  });

  it('returns 0 when every line is blank (whitespace-only), rather than the Infinity a bare Math.min of an empty spread would otherwise produce', () => {
    expect(commonLeadingWhitespace(['   ', '  '])).toBe(0);
  });

  it('returns the shared margin across every non-blank line, ignoring a blank line\'s own lack of indentation', () => {
    const sharedMargin = '   ';
    expect(commonLeadingWhitespace([`${sharedMargin}a`, '', `${sharedMargin}  b`])).toBe(sharedMargin.length);
  });
});

describe('stripStarredBlockPrefix', () => {
  it('returns an empty array unchanged', () => {
    expect(stripStarredBlockPrefix([])).toEqual([]);
  });

  it('returns the lines unchanged when every line is blank (nothing to test the shape against)', () => {
    expect(stripStarredBlockPrefix([''])).toEqual(['']);
  });

  it('returns the lines completely unchanged when only SOME non-blank lines carry the marker', () => {
    // Pins the whole-group `.every`, not a per-line `.some`: a mutant weakening this to a per-line check would still strip the one line that does carry the marker.
    expect(stripStarredBlockPrefix(['* starred', 'not starred'])).toEqual(['* starred', 'not starred']);
  });

  it('strips a shared "* " marker from every non-blank line, keeping a blank line exactly as it was', () => {
    expect(stripStarredBlockPrefix(['* first', '', '* second'])).toEqual(['first', '', 'second']);
  });

  it('strips a bare "*" with no trailing space too, the marker\'s own optional-space branch', () => {
    expect(stripStarredBlockPrefix(['*first'])).toEqual(['first']);
  });

  it('leaves a line with a `*` NOT at its own start completely unchanged, pinning the pattern\'s own leading anchor', () => {
    // A mutant dropping the `^` anchor would match this line's mid-sentence `*` too, wrongly treating it as starred-block shape and corrupting it via replace.
    expect(stripStarredBlockPrefix(['not * starred'])).toEqual(['not * starred']);
  });
});

describe('isTrailingComment', () => {
  it('returns true for a comment that genuinely trails real code on its own physical line', () => {
    const sourceCode = definedOrThrow(capturedCommentsSourceCode);
    const [realTrailing] = sourceCode.getAllComments();
    expect(isTrailingComment(sourceCode, definedOrThrow(realTrailing))).toBe(true);
  });

  it('returns false for a comment sharing its own line with an EARLIER, unrelated comment rather than real code, pinning the default includeComments: false skip past that earlier comment', () => {
    // A mutant flipping this default to `true` (or dropping it for the equivalent `{}`, resolved instead by omitting the options object entirely) would have getTokenBefore stop at the earlier `/* aside */` comment, which shares this comment's own line, and wrongly call it trailing too.
    const sourceCode = definedOrThrow(capturedCommentsSourceCode);
    const note = sourceCode.getAllComments().at(-1);
    expect(isTrailingComment(sourceCode, definedOrThrow(note))).toBe(false);
  });
});

describe('getExportWrapper', () => {
  it('returns undefined for a Program node (the one node type with no parent at all)', () => {
    expect(getExportWrapper(definedOrThrow(capturedProgram))).toBeUndefined();
  });
});

describe('isBeforeByRange', () => {
  // Every range boundary below is 0, 1 or 2 (this repo's own no-magic-numbers already exempts exactly those), never a value picked to be realistic: only each pair's own relative order matters to the function under test, not the numbers themselves.
  it('returns true when a starts strictly before b', () => {
    expect(isBeforeByRange({ range: [0, 0] }, { range: [2, 2] })).toBe(true);
  });

  it('returns false when a starts strictly after b', () => {
    expect(isBeforeByRange({ range: [2, 2] }, { range: [0, 0] })).toBe(false);
  });

  it('returns false when a and b share the identical start, the one boundary getDecoratedAnchor\'s own real caller can never reach (a decorator and its export wrapper are always distinct tokens with distinct starts), pinning the plain `<` over `<=`', () => {
    // A mutant widening this to `<=` would wrongly return true here instead.
    expect(isBeforeByRange({ range: [0, 0] }, { range: [0, 1] })).toBe(false);
  });
});

describe('isDirectiveComment', () => {
  // Each recognised marker gets its own case, isolated from ESLint's own core directive-comment handling (which the main RuleTester suite's own comment explains would otherwise misreport an `eslint-disable` fixture as an unused directive): a mutant deleting any single alternative from the rule's own regex is only caught by exercising that exact alternative directly.
  it.each([
    'eslint-disable',
    'eslint-disable-next-line no-console',
    'eslint-disable-line no-console',
    // The bare (`@`-less) form: never how a real TypeScript directive is written, but still recognised, since the alternative's own leading `@` is optional, not required.
    'ts-expect-error',
    'ts-ignore',
    'ts-nocheck',
    'ts-check',
    // The real, `@`-prefixed form every TypeScript directive actually appears as once extractCommentLines has stripped only the single conventional space after `//` (never the `@` itself): pins the whole reason this rule exists to recognise `ts-*` markers at all, since the bare form above is never what a real fixture's own extracted line looks like.
    '@ts-expect-error',
    '@ts-ignore',
    '@ts-nocheck',
    '@ts-check',
    'todo: revisit',
    'fixme: revisit',
    'TODO: revisit',
    'FIXME: revisit',
    // A bare `prettier-ignore` directive, the shape Prettier itself only ever recognises as a whole, self-contained comment.
    'prettier-ignore',
    // Each coverage tool's own `ignore` keyword, always separated from the tool name by real whitespace: `c8 ignore next`, `v8 ignore next`, `istanbul ignore next`, plus one further istanbul variant (`ignore if`) proving the pattern matches on the tool name and the `ignore` keyword alone, never the specific word after it.
    'c8 ignore next',
    'v8 ignore next',
    'istanbul ignore next',
    'istanbul ignore if',
    // Two spaces between the tool name and "ignore", not one: pins the `+` quantifier on `\s+` specifically (a mutant weakening it to a bare `\s`, exactly one whitespace character, would fail to match this input, unlike the zero-or-more-vs-one-or-more distinction the "c8ignore" case below already pins).
    'c8  ignore next',
  ])('recognises %s as a directive', (text) => {
    expect(isDirectiveComment(text)).toBe(true);
  });

  it('does not recognise ordinary prose as a directive', () => {
    expect(isDirectiveComment('an ordinary explanatory comment')).toBe(false);
  });

  it('does not recognise a marker word only when it is not at the very start of the comment', () => {
    // Pins the leading `^` anchor: a mutant removing it would wrongly match a directive marker appearing mid-sentence.
    expect(isDirectiveComment('this mentions todo later in the sentence')).toBe(false);
  });

  it('does not match a marker word without its own word boundary immediately after it', () => {
    // Pins the trailing `\b`: "todoist" is not the "todo" marker, just a longer word that happens to start with it.
    expect(isDirectiveComment('todoist is not a real marker')).toBe(false);
  });

  it('does not recognise "prettier-ignored", a longer word sharing the marker\'s own prefix, as the bare prettier-ignore directive', () => {
    // Pins the same trailing `\b` for the new prettier-ignore alternative specifically, the identical "todoist" reasoning above.
    expect(isDirectiveComment('prettier-ignored is not a real marker')).toBe(false);
  });

  it('does not recognise a coverage-tool name directly followed by "ignore" with no separating whitespace at all', () => {
    // Pins the `\s+` between the tool name and "ignore": a mutant weakening it to `\s*` would still match this input via its own zero-width case, silently accepting a shape no real coverage tool ever writes.
    expect(isDirectiveComment('c8ignore next')).toBe(false);
  });
});

describe('containsCommentTerminator', () => {
  it('returns false when no line contains a closing comment delimiter', () => {
    expect(containsCommentTerminator(['an ordinary line', 'a second ordinary line'])).toBe(false);
  });

  it('returns true when a line contains a literal closing comment delimiter', () => {
    expect(containsCommentTerminator(['a line containing a close like this: */ right here'])).toBe(true);
  });

  it('checks every line, not only the first', () => {
    // Pins `.some` over the array (a mutant weakening it to check only `lines[0]` would miss a delimiter on a later line).
    expect(containsCommentTerminator(['a safe first line', 'a second line with */ in it'])).toBe(true);
  });
});

describe('firstMatchOrEmpty', () => {
  it('returns the real match text when one is present', () => {
    expect(firstMatchOrEmpty(['  '])).toBe('  ');
  });

  it('returns an empty string for a genuinely absent match (null)', () => {
    expect(firstMatchOrEmpty(null)).toBe('');
  });

  it('returns an empty string when a real, non-null match array has no index-0 element of its own', () => {
    // Never reached through any real caller in this file (a real RegExp#exec result's own index 0 is always the whole match), but this function's own general contract still needs an answer for it, pinning the destructured default distinctly from the `?? []` fallback the case above already covers.
    expect(firstMatchOrEmpty([])).toBe('');
  });
});

describe('detectLineBreak', () => {
  it('returns a bare LF when that is the break found', () => {
    expect(detectLineBreak('first\nsecond', 0)).toBe('\n');
  });

  it('returns a CRLF pair when that is the break found, not just its own trailing LF half', () => {
    // Pins the full `\r\n` alternative over the bare `\n` one: a mutant reordering the alternation, or dropping the `\r\n` branch entirely, would still match here on the LF half alone, silently discarding the `\r` and leaving mixed line endings in the fixer's own replacement.
    expect(detectLineBreak('first\r\nsecond', 0)).toBe('\r\n');
  });

  it('searches only from fromIndex onward, ignoring a break that sits before it', () => {
    // Pins the `.slice(fromIndex)`: a mutant dropping it (or using the whole string regardless of `fromIndex`) would instead find the earlier LF, before the real comment text this call cares about even starts.
    expect(detectLineBreak('before\nfirst\r\nsecond', 'before\n'.length)).toBe('\r\n');
  });

  it('returns a bare LF fallback when there is no line break anywhere in the searched text', () => {
    // Never reached through the rule itself (a leading comment group and its anchor are always on different physical lines), but this function's own general contract still needs an answer for it, the same "caller already confirmed" shape this file's own definedOrThrow helper documents for its own unreachable branch.
    expect(detectLineBreak('no break here at all', 0)).toBe('\n');
  });
});

// Exercises the real @microsoft/tsdoc parser eslint-plugin-tsdoc's own `tsdoc/syntax` rule is itself built on, not a hand-picked character-class stand-in for it (see this function's own doc comment on the rule module for why the old approach was both too broad and too narrow). Every case here was confirmed directly against the installed parser before being pinned as a test, not assumed from its own documentation.
describe('parsesAsValidTsDoc', () => {
  it('returns true for an ordinary sentence with no TSDoc syntax of any kind', () => {
    expect(parsesAsValidTsDoc('/**\n * an ordinary sentence\n */')).toBe(true);
  });

  it('returns true for a generic type reference, the exact shape the old character-class gate wrongly banned outright', () => {
    expect(parsesAsValidTsDoc('/**\n * Returns an Array<string> of matches.\n */')).toBe(true);
  });

  it('returns true for a balanced backtick code span', () => {
    expect(parsesAsValidTsDoc('/**\n * has a `balanced` backtick\n */')).toBe(true);
  });

  it('returns false for a bare at-sign not shaped like a real TSDoc tag', () => {
    expect(parsesAsValidTsDoc('/**\n * uses @ right here\n */')).toBe(false);
  });

  it('returns false for an unbalanced backtick code span', () => {
    expect(parsesAsValidTsDoc('/**\n * an unbalanced ` backtick\n */')).toBe(false);
  });

  it('returns false for an unescaped backslash, the exact shape a Windows path breaks on', () => {
    expect(parsesAsValidTsDoc('/**\n * C:\\Users\\joe\n */')).toBe(false);
  });
});
