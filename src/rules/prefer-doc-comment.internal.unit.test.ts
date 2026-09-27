import { AST_TOKEN_TYPES, ESLintUtils, type TSESLint } from '@typescript-eslint/utils';
import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import {
  commonLeadingWhitespace,
  containsCommentTerminator,
  detectLineBreak,
  extractCommentLines,
  isBeforeByRange,
  isDirectiveComment,
  isTrailingComment,
  isTripleSlashDirective,
  parsesAsValidTsDoc,
  stripStarredBlockPrefix,
} from './prefer-doc-comment';

function definedOrThrow<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Unreachable: expected the probe rule below to have captured this value.');
  }

  return value;
}

const probeCreateRule = ESLintUtils.RuleCreator((name) => name);

// isTrailingComment needs a real SourceCode (for getTokenBefore) and real Comment nodes in a genuine positional relationship a hand-written CommentLike object cannot supply, captured via a probe rule over one fixture carrying both shapes its own doc comment describes: a comment genuinely trailing real code on its own line, and a comment merely sharing ITS line with an EARLIER, unrelated comment rather than real code.
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
  it('throws for an empty group', () => {
    // Never reached through the rule itself (getLeadingCommentGroup always returns a non-empty group); reuses firstAndLastOrThrow's own "caller already confirmed a minimum length" guarantee, so an empty group fails loudly rather than silently returning an empty array.
    expect(() => extractCommentLines([])).toThrow(/Unreachable/u);
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
  // The two ESLint labels source-code.js's own getInlineConfigNodes/getDisableDirectives honour on a `//` Line comment, verified directly against the installed eslint's own source: recognised as directives in Line form too, not only Block.
  it.each(['eslint-disable-next-line no-console', 'eslint-disable-line no-console'])('recognises %s as a directive in Line form, one of the two labels ESLint itself honours there', (text) => {
    expect(isDirectiveComment(text, AST_TOKEN_TYPES.Line)).toBe(true);
  });

  // The rest of the ESLint family, verified directly against the installed eslint's own `lib/shared/directives.js`: a live directive only in Block form, so recognised here with Block, not Line.
  it.each(['eslint-disable', 'eslint-enable', 'eslint-enable no-console', 'eslint no-console: off', 'eslint-env node', 'global foo, bar', 'globals foo, bar', 'exported foo'])(
    'recognises %s as a directive in Block form',
    (text) => {
      expect(isDirectiveComment(text, AST_TOKEN_TYPES.Block)).toBe(true);
    },
  );

  // The identical text as the Block-form cases just above, but as a Line comment: source-code.js's own getInlineConfigNodes filters every one of these labels out for a Line comment (only the two `eslint-disable-line`/`eslint-disable-next-line` labels survive that filter), so ESLint itself never treats a `//` spelling of any of these as a live directive, and this rule must not either. This is the exact fix for the confirmed regression: `// eslint-enable is what this helper emits ...`, an ordinary Line comment merely opening with the word `eslint-enable`, was wrongly exempted before this distinction existed.
  it.each(['eslint-disable', 'eslint-enable', 'eslint-enable no-console', 'eslint no-console: off', 'eslint-env node', 'global foo, bar', 'globals foo, bar', 'exported foo'])(
    'does not recognise %s as a directive in Line form, since ESLint itself only honours eslint-disable-line/eslint-disable-next-line there',
    (text) => {
      expect(isDirectiveComment(text, AST_TOKEN_TYPES.Line)).toBe(false);
    },
  );

  // Case-sensitivity: eslint's own directivesPattern is not case-insensitive, so a capitalised spelling of an otherwise-recognised ESLint-family word is never itself a directive, in Block form or Line, unlike the lowercase spelling tested above. Each of these is the exact confirmed regression fixture (only the first word's own case changed from the real directive already covered above), pinning the false-negative this rule used to have when the whole pattern carried the `i` flag.
  it.each(['Global foo, bar', 'Exported foo', 'ESLint no-console: off'])('does not recognise %s as a directive in Block form, unlike its lowercase spelling', (text) => {
    expect(isDirectiveComment(text, AST_TOKEN_TYPES.Block)).toBe(false);
  });

  // The bare (`@`-less) form: never how a real TypeScript directive is written, but still recognised, since the alternative's own leading `@` is optional, not required. Type-agnostic (no ESLint-style Line/Block restriction of its own), so tested with Line, the shape it always appears in for real.
  it.each(['ts-expect-error', 'ts-ignore', 'ts-nocheck', 'ts-check', '@ts-expect-error', '@ts-ignore', '@ts-nocheck', '@ts-check', 'prettier-ignore'])('recognises %s as a directive', (text) => {
    expect(isDirectiveComment(text, AST_TOKEN_TYPES.Line)).toBe(true);
  });

  // Each coverage tool's own `ignore` keyword, always separated from the tool name by real whitespace: `c8 ignore next`, `v8 ignore next`, `istanbul ignore next`, plus one further istanbul variant (`ignore if`) proving the pattern matches on the tool name and the `ignore` keyword alone, never the specific word after it. Type-agnostic, tested with Line.
  it.each(['c8 ignore next', 'v8 ignore next', 'istanbul ignore next', 'istanbul ignore if', 'c8  ignore next', '#region', '#region helpers', '#endregion', '#endregion helpers'])(
    'recognises %s as a directive',
    (text) => {
      expect(isDirectiveComment(text, AST_TOKEN_TYPES.Line)).toBe(true);
    },
  );

  // The all-uppercase marker spelling is recognised on its own, regardless of what follows it, since no ordinary sentence opens a word that way.
  it.each(['TODO: revisit', 'FIXME: revisit', 'TODO', 'FIXME'])('recognises the all-uppercase marker %s as a directive regardless of what follows', (text) => {
    expect(isDirectiveComment(text, AST_TOKEN_TYPES.Line)).toBe(true);
  });

  // Any other casing is a directive only when immediately followed by `:` or `(`, the shape a real marker/tag is always written in.
  it.each(['todo: revisit', 'fixme: revisit', 'todo(scope): message', 'fixme(scope): message'])('recognises %s as a directive, the real marker shape for a lowercase spelling', (text) => {
    expect(isDirectiveComment(text, AST_TOKEN_TYPES.Line)).toBe(true);
  });

  // The exact confirmed regression fixture: a lowercase or mixed-case spelling with nothing but ordinary prose after it (no `:`/`(`) is never a directive, only ordinary text that happens to open with the word.
  it.each(['todo now', 'Todo list items are rendered directly from the shared store'])(
    'does not recognise %s as a directive, since a lowercase/mixed-case marker needs a following `:`/`(` and this one has neither',
    (text) => {
      expect(isDirectiveComment(text, AST_TOKEN_TYPES.Line)).toBe(false);
    },
  );

  it('does not recognise ordinary prose as a directive', () => {
    expect(isDirectiveComment('an ordinary explanatory comment', AST_TOKEN_TYPES.Line)).toBe(false);
  });

  it('does not recognise a marker word only when it is not at the very start of the comment', () => {
    // Pins the leading `^` anchor: a mutant removing it would wrongly match a directive marker appearing mid-sentence.
    expect(isDirectiveComment('this mentions todo later in the sentence', AST_TOKEN_TYPES.Line)).toBe(false);
  });

  it('does not match a marker word without its own word boundary immediately after it', () => {
    // Pins the trailing `\b`: "todoist" is not the "todo" marker, just a longer word that happens to start with it.
    expect(isDirectiveComment('todoist is not a real marker', AST_TOKEN_TYPES.Line)).toBe(false);
  });

  it('does not recognise "prettier-ignored", a longer word sharing the marker\'s own prefix, as the bare prettier-ignore directive', () => {
    // Pins the same trailing `\b` for the new prettier-ignore alternative specifically, the identical "todoist" reasoning above.
    expect(isDirectiveComment('prettier-ignored is not a real marker', AST_TOKEN_TYPES.Line)).toBe(false);
  });

  it('does not recognise a coverage-tool name directly followed by "ignore" with no separating whitespace at all', () => {
    // Pins the `\s+` between the tool name and "ignore": a mutant weakening it to `\s*` would still match this input via its own zero-width case, silently accepting a shape no real coverage tool ever writes.
    expect(isDirectiveComment('c8ignore next', AST_TOKEN_TYPES.Line)).toBe(false);
  });

  it.each(['eslint-config-prettier is a real dependency of this package', 'eslint-plugin-jsdoc ships its own recommended config', 'global-scoped state is avoided here', 'exported-members are documented above'])(
    'does not recognise ordinary prose starting with an ESLint-keyword-shaped compound word as a directive: %s',
    (text) => {
      // Pins the ESLint family's own `(?=\s|$)` lookahead over the generic trailing `\b`: a mutant weakening it back to a bare `\b` would wrongly match every one of these, since a hyphen immediately satisfies a word boundary too.
      expect(isDirectiveComment(text, AST_TOKEN_TYPES.Line)).toBe(false);
    },
  );

  // Each pattern's own leading `^` anchor, pinned directly: a real marker shape sitting NOT at the very start of the comment (mid-sentence) is never itself a directive, only ever the comment's own opening word. A mutant removing any of these anchors would still match, since `RegExp#exec` searches the whole string, not only its start.
  it('does not recognise an ESLint-family marker appearing mid-sentence, only ever at the very start', () => {
    expect(isDirectiveComment('An aside mentions eslint-disable mid sentence', AST_TOKEN_TYPES.Block)).toBe(false);
  });

  it('does not recognise the coverage/ts-directive/prettier-ignore/region family appearing mid-sentence', () => {
    expect(isDirectiveComment('A note that mentions ts-expect-error later on', AST_TOKEN_TYPES.Line)).toBe(false);
  });

  it('does not recognise the all-uppercase TODO/FIXME marker appearing mid-sentence', () => {
    expect(isDirectiveComment('A note mentions TODO later on', AST_TOKEN_TYPES.Line)).toBe(false);
  });

  it('does not recognise a marked lowercase todo/fixme appearing mid-sentence', () => {
    expect(isDirectiveComment('A note mentions todo: later on', AST_TOKEN_TYPES.Line)).toBe(false);
  });

  // extractCommentLines' own stripSingleLeadingSpace deliberately strips only the single conventional space right after `//`, leaving a second space or a tab (real indentation for a genuine prose line) on the extracted text; a live directive written with that extra whitespace is still live for its own tool regardless (ESLint's own directive value is matched trimmed, Prettier's `prettier-ignore` check is `value.trim() === 'prettier-ignore'`, TypeScript's own single-line directive regex allows leading whitespace), so isDirectiveComment must recognise it too, not only the exact zero-extra-whitespace spelling every other case above uses.
  it.each(['  eslint-disable-next-line no-console', '\teslint-disable-next-line no-console'])(
    'recognises an ESLint-family directive with extra leading whitespace: %j',
    (text) => {
      expect(isDirectiveComment(text, AST_TOKEN_TYPES.Line)).toBe(true);
    },
  );

  it.each(['  prettier-ignore', '\tprettier-ignore', '   @ts-expect-error'])('recognises a coverage/ts/prettier-ignore directive with extra leading whitespace: %j', (text) => {
    expect(isDirectiveComment(text, AST_TOKEN_TYPES.Line)).toBe(true);
  });

  it.each(['  TODO: revisit', '\tTODO', '  todo: revisit'])('recognises a TODO/FIXME marker with extra leading whitespace: %j', (text) => {
    expect(isDirectiveComment(text, AST_TOKEN_TYPES.Line)).toBe(true);
  });

  it('still requires the marker at the true start once leading whitespace is stripped, not merely somewhere in the whitespace run', () => {
    // Pins that trimStart, not a bare test-anywhere search, is what closes this gap: a mutant replacing trimStart with a no-op would fail every case above, and one replacing it with a full trim (also stripping trailing content) would still pass every case above without this one, since trailing text is never whitespace-only here.
    expect(isDirectiveComment('   an ordinary comment that happens to have leading spaces', AST_TOKEN_TYPES.Line)).toBe(false);
  });
});

describe('isTripleSlashDirective', () => {
  it('recognises a genuine `///` reference directive by its own un-stripped value starting directly with a slash', () => {
    expect(isTripleSlashDirective({ type: AST_TOKEN_TYPES.Line, value: '/ <reference types="vite/client" />' })).toBe(true);
  });

  it('does not recognise an ordinary `//` comment whose own prose happens to start with a slash, distinguished by the single conventional space stripSingleLeadingSpace would otherwise remove', () => {
    // Pins the raw, un-stripped `value` check specifically: a mutant reading the already-stripped extracted line instead would wrongly match this too, since stripping that one leading space leaves an identical leading slash.
    expect(isTripleSlashDirective({ type: AST_TOKEN_TYPES.Line, value: ' / test' })).toBe(false);
  });

  it('does not recognise a Block comment whose own value starts with a slash, since a `///` directive can only ever be tokenised as a Line comment', () => {
    expect(isTripleSlashDirective({ type: AST_TOKEN_TYPES.Block, value: '/ not a real directive' })).toBe(false);
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

  it('throws when there is no line break anywhere in the searched text', () => {
    // Never reached through the rule itself (a leading comment group and its anchor are always on different physical lines, per getLeadingCommentGroup's own adjacency guarantee); pins that this genuinely unreachable case fails loudly rather than silently defaulting to a guessed line break.
    expect(() => detectLineBreak('no break here at all', 0)).toThrow(/Unreachable/u);
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
