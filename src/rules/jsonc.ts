import { assertIsError, jsonParseContext } from './workspace-errors';
import { requireChar } from './workspace-path';

/**
 * Index just past the string literal opening at `start` (which must be a `"`), honouring backslash escapes. Exported so its unreachable throw (a `start` that is not a `"`) is tested directly. An unterminated string runs to the end of the text, leaving the resulting syntax error to `JSON.parse`.
 */
export function endOfString(text: string, start: number): number {
  // A string literal from its opening quote: a backslash (which only ever protects a following quote or backslash; any other escaped character is ordinary text to this scan) and ordinary characters, then the closing quote if there is one. Sticky, so it only ever matches at `lastIndex`. Built per call rather than held in a module constant: a module-level value is evaluated once at import, which Stryker treats as a static mutant it cannot attribute to individual tests.
  const stringLiteral = /"(?:\\["\\]?|[^"\\])*"?/uy;
  stringLiteral.lastIndex = start;
  const match = stringLiteral.exec(text);
  // The pattern is anchored (sticky) at `start`, which the caller guarantees is a `"`, and every part after the opening quote is optional, so it always matches.
  if (match === null) {
    throw new Error('Unreachable: a string literal always matches from its opening quote.');
  }

  return start + match[0].length;
}

/**
 * Index just past the line comment starting at `start`, stopping before its newline so line structure survives in the stripped text.
 */
function endOfLineComment(text: string, start: number): number {
  const newline = text.indexOf('\n', start);

  return newline === -1 ? text.length : newline;
}

/**
 * Index just past the block comment starting at `start`; an unterminated one runs to the end of the text.
 */
function endOfBlockComment(text: string, start: number): number {
  const close = text.indexOf('*/', start + 2);

  return close === -1 ? text.length : close + 2;
}

/**
 * Turns JSONC text into plain JSON text: `//` comments are removed, each block comment becomes one space (so the tokens either side of it stay separate, as they do to a JSONC parser), and a comma directly before a closing `}` or `]` (with only whitespace or comments between) is dropped when a value precedes it. A comma with no value before it (`[,]`, `{,}`, `[1,,]`) is kept so `JSON.parse` rejects it. String contents are copied verbatim, so a comment marker or comma inside a string is untouched. This is the grammar TypeScript (tsconfig) and Turborepo (turbo.json) accept, not full JSON5.
 */
export function stripJsonc(text: string): string {
  let output = '';
  // Index in `output` of a comma that followed a value with nothing but whitespace emitted since, or -1; a following closing bracket makes it a trailing comma.
  let pendingComma = -1;
  // Whether the last token emitted was a value (or the end of one) rather than an opening bracket, a comma or nothing; only a comma after a value can be a trailing comma.
  let afterValue = false;
  let index = 0;
  while (index < text.length) {
    const char = requireChar(text, index);
    const next = text[index + 1];
    if (char === '"') {
      const end = endOfString(text, index);
      output += text.slice(index, end);
      pendingComma = -1;
      afterValue = true;
      index = end;
    } else if (char === '/' && next === '/') {
      index = endOfLineComment(text, index);
    } else if (char === '/' && next === '*') {
      output += ' ';
      index = endOfBlockComment(text, index);
    } else {
      if (char === ',') {
        pendingComma = afterValue ? output.length : -1;
        afterValue = false;
      } else if (char === '[' || char === '{') {
        pendingComma = -1;
        afterValue = false;
      } else if (char === '}' || char === ']') {
        if (pendingComma !== -1) output = output.slice(0, pendingComma) + output.slice(pendingComma + 1);
        pendingComma = -1;
        afterValue = true;
      } else if (!/\s/u.test(char)) {
        pendingComma = -1;
        afterValue = true;
      }
      output += char;
      index += 1;
    }
  }

  return output;
}

/**
 * Parses JSONC text (comments and trailing commas allowed) to an `unknown` value the caller must narrow. A syntax error is rethrown naming `sourcePath`, with the original error as its cause.
 */
export function parseJsonc(text: string, sourcePath: string): unknown {
  try {
    const parsed: unknown = JSON.parse(stripJsonc(text));

    return parsed;
  } catch (error) {
    assertIsError(error, jsonParseContext(sourcePath));
    throw new Error(`@exadev/eslint-config: could not parse "${sourcePath}" as JSON with comments: ${error.message}`, { cause: error });
  }
}
