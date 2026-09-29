import { assertIsError, jsonParseContext } from './workspace-errors';
import { requireChar } from './workspace-path';

/**
 * Index just past the string literal opening at `start` (which must be a `"`), honouring backslash escapes. An unterminated string runs to the end of the text, leaving the resulting syntax error to `JSON.parse`.
 */
function endOfString(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length && text[index] !== '"') {
    index += text[index] === '\\' ? 2 : 1;
  }

  return index + 1;
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
 * Turns JSONC text into plain JSON text: `//` and block comments are removed and a comma directly before a closing `}` or `]` (with only whitespace or comments between) is dropped. String contents are copied verbatim, so a comment marker or comma inside a string is untouched. This is the grammar TypeScript (tsconfig) and Turborepo (turbo.json) accept, not full JSON5.
 */
export function stripJsonc(text: string): string {
  let output = '';
  // Index in `output` of a comma with nothing but whitespace emitted since, or -1; a following closing bracket makes it a trailing comma.
  let pendingComma = -1;
  let index = 0;
  while (index < text.length) {
    const char = requireChar(text, index);
    const next = text[index + 1];
    if (char === '"') {
      const end = endOfString(text, index);
      output += text.slice(index, end);
      pendingComma = -1;
      index = end;
    } else if (char === '/' && next === '/') {
      index = endOfLineComment(text, index);
    } else if (char === '/' && next === '*') {
      index = endOfBlockComment(text, index);
    } else {
      if (char === ',') {
        pendingComma = output.length;
      } else if (char === '}' || char === ']') {
        if (pendingComma !== -1) output = output.slice(0, pendingComma) + output.slice(pendingComma + 1);
        pendingComma = -1;
      } else if (!/\s/u.test(char)) {
        pendingComma = -1;
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
